# Design discussion: outbound-webhook-event-delivery

## 1. Why this epic, and why now

Recorded as a new-epic-candidate by `integrations-catalog-and-ecosystem-audit`
(epic-backlog row 77, added 2026-10-07): *"the event bus is purely in-process -- zero outbound
HTTP delivery, signing, retry, or subscribe/unsubscribe contract exists for an external consumer
like Zapier/Make/n8n"*. Re-verified directly rather than taken on faith -- read
`packages/core/src/event-bus.ts` in full before writing a line of code. It's real and exactly as
described: `EventBus.publish`/`subscribe` only reach handlers registered inside the same
process; there is no HTTP server, no subscription-registration API, no outbound request of any
kind anywhere in `@mercatus-liber/core`.

Also re-verified rather than assumed: which real events already fire today. Grepped every
`events.publish(...)` call site across `packages/` (not copied from a doc that could have
drifted) --
`packages/payments/src/{stripe,sandbox}-adapter.ts` (`payments.payment.succeeded`/`.failed`),
`packages/catalog/src/service.ts` (`catalog.product.{created,updated,archived}`,
`catalog.sku.created`, `catalog.attribute.{updated,removed}`),
`packages/promotions/src/service.ts` (`promotions.redeemed`),
`packages/cart/src/service.ts` (`cart.item.{added,removed,updated}`, `cart.cleared`),
`packages/checkout-orders/src/service.ts` (`checkout.order.{placed,paid}`), and
`packages/reviews/src/service.ts` (`reviews.review.{submitted,published}`) -- 17 real event
names across 6 subsystems, none of them fulfillment-related (`packages/fulfillment` and
`packages/inventory` react to events, via `@mercatus-liber/inventory`'s `registerInventorySync`,
but neither one itself publishes anything new). This list is `KNOWN_EVENT_TYPES` in the new
package's `src/types.ts`, with its own doc comment disclosing the real, confirmed limitation
this produces (§4 below).

## 2. Recommendation: new package, not an extension of core

**New package: `@mercatus-liber/webhooks`.** Considered extending `@mercatus-liber/core`
directly instead (the brief explicitly left this open), but core's own `package.json` describes
itself as "Types and interfaces only -- no storage, no business logic, no framework code," and a
real delivery service needs all three (a `WebhookSubscriptionStore`/`WebhookDeliveryLogStore`
pair -- storage; retry/backoff/signing logic -- business logic; a real `fetch` call -- framework
code touching the outside world). Folding that into `core` would be the one package every other
subsystem depends on suddenly also depending transitively on an HTTP-delivery concern it has
zero need for. A new leaf package consuming `core`'s `EventBus` structurally, the same relationship
`@mercatus-liber/inventory` and `@mercatus-liber/plugins` already have to `core`, is consistent
with every other cross-cutting-but-optional subsystem in this repo.

**Signing convention: mirror Printify's `verifyPrintifySignature`, not Printful's
`verifyPrintfulSignature`.** Both already exist in this repo for *inbound* verification
(`packages/adapter-printify/src/webhook.ts`, `packages/adapter-printful/src/webhook.ts`, both
read in full before writing `src/signer.ts`). Printify's scheme: HMAC-SHA256 over the raw body,
keyed directly by the webhook secret (no encoding step), rendered `sha256={hexdigest}`.
Printful's scheme: the same HMAC-SHA256-over-raw-body construction, but the secret is returned
hex-encoded by Printful's own API and has to be hex-*decoded* into raw bytes before use as the
HMAC key. Printful's extra decode step exists only because Printful's own dashboard hands back
the secret in that encoding -- there's no equivalent constraint here, since this package
generates its own secrets (`generateWebhookSecret`, 32 bytes of `node:crypto`'s CSPRNG,
hex-encoded for storage/display only). Mirroring Printify's simpler, equally-real convention
avoids inventing an unnecessary decode step, and it's the one of the two adapter-webhook schemes
this repo's own code already calls "genuinely confirmed" rather than "re-confirmed against a
section a previous research pass missed" (Printify's own doc comment's wording) -- not a
material difference for an outbound scheme this package designed itself either way, but a
reasonable tie-breaker. Header name: `x-mercatus-liber-signature` (per the brief's own
suggestion), alongside `x-mercatus-liber-event` and `x-mercatus-liber-delivery-id` for a
receiver's own dispatch/de-duplication convenience -- real third-party schemes (Printful's own
`x-pf-webhook-public-key` disambiguation header) establish that shipping more than the bare
minimum signature header is normal practice, not over-engineering.

## 3. Scope

**In scope:**
1. `@mercatus-liber/webhooks`: `WebhookSubscription`/`WebhookDeliveryLogEntry` types,
   `WebhookSubscriptionStore`/`WebhookDeliveryLogStore` persistence interfaces (mirroring
   `@mercatus-liber/advertising`'s `CampaignRepository` and `@mercatus-liber/inventory`'s
   `InventoryAdapter` shape per the brief), in-memory default implementations of both,
   `createWebhookSubscription`/`deactivateWebhookSubscription`, `signWebhookPayload`/
   `verifyWebhookSignature`/`generateWebhookSecret`, and `createWebhookDeliveryService` (the real
   bus-subscriber that performs signed HTTP delivery with bounded retry/backoff and writes the
   delivery log).
2. Real tests against a real local `node:http` server (`test/fake-webhook-receiver.ts`) -- never
   a live external endpoint -- proving: correct signature (verifiable with the subscription's
   own secret over the exact raw bytes sent), correct payload shape, retry-on-failure behavior
   with a receiver that fails N times then recovers, a bounded-not-infinite retry ceiling against
   a receiver that always fails, a network-error attempt logged distinctly from a non-2xx
   response, and that an unrelated event type (and an inactive subscription) never triggers a
   delivery to a subscription that didn't ask for it.
3. A second, Postgres-backed implementation of both store interfaces in
   `@mercatus-liber/adapter-postgres` (`src/webhooks.ts`,
   `createPostgresWebhookSubscriptionStore`/`createPostgresWebhookDeliveryLogStore`), following
   that package's own established per-subsystem-file/self-contained-DDL convention
   (`fulfillment-routing.ts`/`advertising.ts` were read in full as the precedent), tested against
   that package's own local fake-`pg.Pool`-double convention (`test/webhooks.test.ts`, mirroring
   `test/advertising.test.ts`'s structure) -- not a live Postgres instance, the same disclosed gap
   every other subsystem in that package already carries.
4. `packages/webhooks/README.md` disclosing exactly what's tested vs. what would need a real
   external endpoint (or a real Postgres instance) to fully prove end-to-end.

**Explicitly out of scope, disclosed rather than silently dropped:**
- Wiring `createWebhookDeliveryService` into `apps/reference-storefront`'s actual running
  services (`lib/services.ts`) or exposing a real admin UI/API route to create subscriptions.
  This epic ships the subsystem; wiring a live demo to it (if ever wanted) is separate follow-on
  work, the same posture `dropship-merch-address-wiring` took toward `shop.mdostal.com`'s own
  vendoring.
- An unsubscribe/management HTTP API of its own (e.g. a REST endpoint a third party calls to
  self-register). The brief asks for "lets a consumer register a webhook subscription" as a
  programmatic capability (`createWebhookSubscription`), not a hosted self-serve API surface --
  building one would be a real, separate product decision (auth, rate limits, abuse prevention)
  this epic doesn't make.
- Backoff jitter, a dead-letter queue, and delivery-failure alerting -- see the package README's
  own "What's tested vs. what isn't" section for the honest disclosure of each.
- Delivering to a **real** external endpoint or against a **real** Postgres instance -- see §4.

## 4. Risks

| Risk | Mitigation / disclosure |
|---|---|
| `EventBus.subscribe` has no wildcard -- a new real event type this repo adds later is silently invisible to webhook delivery unless someone updates `KNOWN_EVENT_TYPES` (or passes a wider `eventTypes` list) | Disclosed explicitly in both `src/types.ts`'s doc comment and the package README's own "A real, disclosed limitation" section, not hidden. `eventTypes` is a `createWebhookDeliveryService` option precisely so a deployer isn't stuck with this repo's own list. |
| Core's `EventBus` awaits every handler before `publish()` resolves (`packages/core/src/event-bus.ts`'s own "synchronous-per-publish" doc comment) -- a webhook handler performing real network I/O with multi-second backoff can measurably delay the code path that triggered the original event (e.g. checkout) | Disclosed in the README rather than silently working around it with an un-asked-for fire-and-forget mechanism, which would also make the delivery tests non-deterministic. Mitigation path named (conservative `maxAttempts`/`backoffMs`, or a queue-backed `EventBus` implementation -- already named as a future adapter in core's own doc comment, not something this package should solve). |
| A deployment aggregating all webhook delivery onto one event-bus subscriber without per-receiver isolation means one slow/down receiver's retries delay delivery to every OTHER subscription waiting behind it in the same `for` loop | Real, same root cause as the row above -- not separately mitigated here. Flagged as the same tradeoff, not a second hidden one. |
| Picking Printify's signing convention over Printful's is this epic's own judgment call, not a standard either real provider dictates for an outbound scheme this package invented | Documented plainly in §2 above as a reasoned choice with a stated tie-breaker, not presented as the only possible answer. |
| No live external endpoint or live Postgres instance exists in this environment to prove delivery end-to-end for real | Disclosed in the package README's "What's tested vs. what isn't" section, same posture this repo already takes toward Printful/Printify/Shopify/MongoDB Atlas credential gaps. |

## 5. Scale assessment

**Medium.** One new package (`@mercatus-liber/webhooks`), one new file in an existing package
(`@mercatus-liber/adapter-postgres`'s `src/webhooks.ts` + its own test file), no change to any
existing subsystem's publish call sites (every real event this epic reacts to already fires
exactly as before -- this is purely a new subscriber, same posture `@mercatus-liber/inventory`'s
`registerInventorySync` already established). Proceeding directly to stories.
