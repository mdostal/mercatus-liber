# @mercatus-liber/webhooks

Outbound webhook delivery for `@mercatus-liber/core`'s `EventBus`.

## The gap this closes

`packages/core/src/event-bus.ts`'s `EventBus` is purely in-process: `publish`/`subscribe` only
reach handlers running inside the same process. Every subsystem in this repo already publishes
real semantic events (`checkout.order.placed`, `checkout.order.paid`, `payments.payment.succeeded`,
`catalog.product.created`, `cart.item.added`, `reviews.review.published`, and more -- see
`src/types.ts`'s `KNOWN_EVENT_TYPES` for the exact current list, grepped from real `events.publish`
call sites, not assumed), but until this package existed there was zero mechanism for an
*external* system (Zapier, Make, n8n, a merchant's own backend) to register a URL and receive
those events as real outbound HTTP requests. This was recorded as a new-epic-candidate,
`outbound-webhook-event-delivery`, by the `integrations-catalog-and-ecosystem-audit` epic
(epic-backlog row 77).

This package extends the bus; it does not replace or fork it. It is a real `EventBus` subscriber,
same shape as `@mercatus-liber/inventory`'s `registerInventorySync` or `@mercatus-liber/plugins`'
`PluginContext` -- it just fans a real event out over HTTP instead of reacting to it locally.

## What it does

1. **Subscriptions.** `createWebhookSubscription(store, { url, eventTypes, secret?, active? })`
   registers a target URL plus which real event type(s) it wants. Persistence is the same
   adapter-interface pattern as everywhere else in this repo (`WebhookSubscriptionStore`/
   `WebhookDeliveryLogStore` mirror `@mercatus-liber/advertising`'s `CampaignRepository` and
   `@mercatus-liber/inventory`'s `InventoryAdapter` shape): `createInMemoryWebhookSubscriptionStore`/
   `createInMemoryWebhookDeliveryLogStore` ship here as the zero-infra default; a real second,
   Postgres-backed implementation of both ships in `@mercatus-liber/adapter-postgres`
   (`src/webhooks.ts`, `createPostgresWebhookSubscriptionStore`/`createPostgresWebhookDeliveryLogStore`).
2. **Delivery.** `createWebhookDeliveryService({ events, subscriptions, deliveryLog })` subscribes
   to every event type in `KNOWN_EVENT_TYPES` (overridable via the `eventTypes` option) on the
   injected `EventBus`. When a matching event fires, every **active** subscription that asked for
   that **exact** event type gets a real `POST` to its URL with:
   - Body: `{"deliveryId","eventType","payload","deliveredAt"}` as raw JSON (the exact bytes sent are the exact bytes signed).
   - Header `x-mercatus-liber-signature`: `sha256={hex HMAC-SHA256 of the raw body, keyed by the subscription's own secret}` -- this is **the exact format** `@mercatus-liber/adapter-printify`'s `verifyPrintifySignature` already uses to verify an *inbound* Printify webhook, applied outbound (see `src/signer.ts`'s doc comment for why Printify's convention was mirrored over Printful's hex-decode-first one). `verifyWebhookSignature(secret, rawBody, header)` is exported for a receiver (or this package's own tests) to check it the same way.
   - Header `x-mercatus-liber-event`: the event type string.
   - Header `x-mercatus-liber-delivery-id`: correlates every retry attempt for the same logical delivery.
3. **Retry/backoff.** A non-2xx response or a network error is retried with exponential backoff
   (`defaultBackoffMs`: 250ms/500ms/1000ms between attempts) up to `maxAttempts` (default 4 --
   1 initial + 3 retries). **Bounded, never infinite.** Both knobs are overridable per
   `createWebhookDeliveryService` call.
4. **Delivery log / audit trail.** Every single HTTP attempt (not just the final outcome) is
   recorded via `WebhookDeliveryLogStore.record` -- what was sent (`requestBody`, the real raw
   JSON), when (`attemptedAt`), and what came back (`responseStatus`, `status`, `error`).
   `listForSubscription(subscriptionId)` returns the full history in order, so a consumer
   debugging a missed webhook can see exactly what this package tried and what the receiver
   said back.

## What's tested vs. what isn't (honest disclosure)

**Tested, against a real local HTTP server** (`test/fake-webhook-receiver.ts` spins up a real
`node:http` `createServer` on a real socket -- not a mocked `fetch`/`axios` client, and never a
live network call to an actual external endpoint):
- The exact signature delivered is verifiable with the subscription's own secret, over the exact
  raw body bytes that were sent (`test/delivery.test.ts`, first test).
- The exact payload shape (`deliveryId`/`eventType`/`payload`/`deliveredAt`) and that `payload`
  is exactly what was published on the bus.
- Retry behavior on a simulated failure: a receiver that returns `500`, then `503`, then `200`
  is retried exactly as many times as needed, with the configured backoff delays actually
  invoked between attempts, and the delivery log shows every attempt (`failed`, `failed`,
  `success`).
- The retry bound is real and finite: a receiver that always fails is attempted exactly
  `maxAttempts` times, never more.
- A network-level failure (nothing listening on the target port at all) is logged distinctly
  from a non-2xx HTTP response (`responseStatus: null` vs. a real status code).
- An unrelated event type does **not** trigger a delivery to a subscription that never asked for
  it -- proven by publishing a real, different, known event type and asserting zero HTTP
  requests reached a subscription scoped to a different event type, and that two subscriptions
  with different `eventTypes` each only receive their own matching events.
- An inactive (deactivated) subscription receives no deliveries.
- `deliverNow` (manual redelivery, e.g. an admin "retry" button) produces the same real HTTP
  request shape as the bus-triggered path, without re-publishing on the bus.
- The Postgres-backed `WebhookSubscriptionStore`/`WebhookDeliveryLogStore` (`@mercatus-liber/adapter-postgres`'s `test/webhooks.test.ts`) against that package's own local fake `pg.Pool` double -- same disclosed posture as every other `adapter-postgres` subsystem test in this repo (no live Postgres server exists in this environment; this proves query-construction/row-mapping logic, not real Postgres wire behavior).

**NOT tested here, and genuinely can't be without one** (disclosed, not silently assumed away):
- Delivery to a **real external** endpoint on the public internet (a real Zapier/Make/n8n
  webhook URL, a real merchant backend) -- every test target is a local fake receiver on
  `127.0.0.1`. TLS behavior, a real receiver's own timeout/retry semantics, and real-world
  network partition behavior are unverified.
- Delivery against a **real Postgres instance** -- `adapter-postgres`'s own tests (this
  package's included) all run against an in-repo fake `pg.Pool` double, the same disclosed gap
  every other subsystem in that package already carries.
- Backoff **jitter**. `defaultBackoffMs` is deliberately simple exponential backoff with no
  randomization -- a production deployment fronting many subscriptions to the same flaky
  receiver would want jitter to avoid a thundering-herd retry wave across subscriptions. Not
  implemented; `backoffMs` is injectable if a deployer wants to supply their own.
- A dead-letter queue or alerting for a subscription that exhausts all retries. The delivery log
  records the final failed attempt; nothing proactively notifies anyone. A real deployment
  wanting that would poll/query `listForSubscription` or wrap this package's `deliverNow`/log
  reads in its own alerting.

## A real, disclosed limitation of this design (not a bug)

`EventBus.subscribe` (`packages/core/src/event-bus.ts`) takes an exact event name -- there is no
wildcard/glob "subscribe to everything" primitive on the bus. `createWebhookDeliveryService`
therefore has to subscribe individually to a known, fixed list of event names
(`KNOWN_EVENT_TYPES`) rather than intercepting every `publish()` call generically. A deployer
whose own app publishes real events beyond what this repo ships today must pass a wider
`eventTypes` list explicitly -- this package cannot discover new event names on its own.

Separately: core's `EventBus` awaits every handler (in registration order) before `publish()`
resolves (see that file's own doc comment, "synchronous-per-publish"). Because this package's
bus handler awaits the full retry/backoff sequence for every matching subscription, a webhook
delivery to a slow or down receiver can measurably delay whatever code path published the
triggering event (e.g. checkout) until all attempts/backoff for that event have finished. This
is the same synchronous posture every other real subscriber in this repo already has (e.g.
`@mercatus-liber/inventory`'s `registerInventorySync`), not something this package invented, but
it is a materially bigger risk here specifically because delivery involves real network I/O and
multi-second backoff, not a fast local in-memory mutation. A deployment sensitive to this should
either widen `maxAttempts`/`backoffMs` conservatively, or front `EventBus` itself with the
queue-backed implementation core's own doc comment already names as a documented future adapter
for multi-instance deploys (`packages/core/src/event-bus.ts`), not something this package
attempts to solve.
