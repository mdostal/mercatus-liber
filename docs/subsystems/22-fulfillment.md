# Subsystem 22 — Fulfillment Routing

## Purpose
Per-order-line fulfillment routing and status — which provider fulfills a given SKU on an
order, and where that line currently stands (unfulfilled/submitted/shipped/delivered).
Before this subsystem, every shop built on this framework implicitly assumed 100%
self-fulfillment: `checkout-orders`' `Order.status` (`pending_payment -> paid -> fulfilled ->
cancelled`) has no notion of a fulfillment provider or per-line routing at all. This subsystem
makes that implicit "an operator fulfills by hand" reality explicit and visible, and is the
foundation both epic 42's real Printful print-on-demand adapter and epic 43's real Printify
print-on-demand adapter (see below) are built on top of.

## Depends on
`@mercatus-liber/core` only. Declares its own narrow structural interface — `OrderLookup`
(`getOrder(id) -> { id, items: { skuId, quantity }[] }`) — satisfied structurally by
checkout-orders' `CheckoutOrdersService` at the app-composition layer, never imported directly
at runtime (`@mercatus-liber/checkout-orders` is a `devDependency` only, used solely by a
compile-time type-compatibility proof — see `src/order-lookup-compat.ts`). Mirrors
`internal-bi`'s own `OrderMetricsSource` pattern exactly.

## Responsibilities
- `FulfillmentAdapter`: the swappable per-provider contract (mirrors `@mercatus-liber/payments`'
  `PaymentAdapter` shape) — `submitOrder(...)`, `getOrderStatus(...)`, optional
  `handleWebhookEvent(...)` for providers with an external system that pushes async status
  changes.
- `FulfillmentLineRecord`: one provider's fulfillment record for one order line (`orderId +
  skuId` pair) — `{ orderId, skuId, provider, externalOrderId, status, trackingNumber,
  trackingUrl }`. Owned entirely by this subsystem, never a field bolted onto checkout-orders'
  `Order`/`OrderLineItem` — `Order.status` stays the coarse/aggregate status; this is the
  fine-grained, per-line, per-provider view.
- `FulfillmentRoutingRepository`: `skuId -> provider-key` mapping, owned by this subsystem
  itself (references SKUs by id only, same "adapters reference catalog by id, never fork its
  types" discipline `bundles`/`promotions`/`recommendations` already follow). Every SKU
  implicitly routes to `"manual"` (`MANUAL_FULFILLMENT_PROVIDER`) unless explicitly mapped
  otherwise — `getProviderForSku` never throws or returns undefined.
- `createManualFulfillmentAdapter()`: the zero-infra default, modeling exactly today's real
  *implicit* behavior across every shop built on this framework — an operator fulfills a line
  by hand. `submitOrder` creates one record per line with status `"submitted"` (awaiting manual
  fulfillment, no `externalOrderId` — there is nothing external to submit to);
  `markShipped(orderId, skuId, tracking?)` is this adapter's own extra capability (not part of
  the generic `FulfillmentAdapter` contract) letting an operator mark a line shipped with
  optional tracking info, since no external system exists to push a webhook for it. The
  permanent fallback for self-fulfilled SKUs even now that a real POD adapter exists (epic 42,
  see below).
- `createFulfillmentService(deps)`: the orchestration layer tying the routing repository,
  per-provider adapters, and `OrderLookup` together — `listForOrder` (every provider's current
  records for an order's lines, aggregated), `submitOrder` (groups an order's lines by routed
  provider and submits each group to that provider's adapter), and `markLineShipped`
  (structurally delegates to an adapter's `markShipped` when it exposes one, otherwise throws
  `ManualStatusUpdateNotSupportedError` — a webhook-driven provider updates status via
  `handleWebhookEvent` instead).
- Wired into `apps/reference-storefront/lib/services.ts`: `checkout` structurally satisfies
  `OrderLookup` already (no adapter object needed); the manual adapter is always registered, and
  `PRINTFUL_API_TOKEN` set and truthy additionally registers the real Printful adapter (epic 42)
  under the `"printful"` provider key, and `PRINTIFY_API_TOKEN` + `PRINTIFY_SHOP_ID` both set and
  truthy additionally (and independently) registers the real Printify adapter (epic 43) under the
  `"printify"` provider key — see "The Printful adapter" and "The Printify adapter" sections below
  for the full wiring and each adapter's disclosed design gaps.
- Surfaced as a real extension of `/demo/<demoSlug>/admin/orders` (not a separate
  `/admin/fulfillment` page — see that page's own doc comment for the reasoning): each order's
  line items show their routed provider (defaulting to `"manual"`), their current status
  (a real record's status, or a synthesized `"unfulfilled"` when no record exists yet), and
  tracking info once shipped. Two admin mutations (`lib/actions.ts`), both gated by
  `requireAdminPermission("mutate")` like every other admin mutation in this repo:
  `submitOrderForFulfillmentAction` (routes and submits an order's lines — idempotent, a no-op
  if the order already has any fulfillment records) and `markFulfillmentLineShippedAction` (the
  operator "mark shipped by hand" action, with optional tracking number/URL fields).

## Provider catalog mappings
`ProviderCatalogMappingRepository` stores which provider product each SKU is made from, per provider,
as a provider-shaped `target`. It's implemented in memory and on Postgres, SQLite, MongoDB, and
Convex, all running one contract (`packages/fulfillment/test/catalog-mapping-contract.ts`).
`printifyCatalogTargetsFrom(repo)` and `printfulCatalogTargetsFrom(repo)` turn it into each adapter's
`resolveCatalogTarget`, refusing an unmapped or malformed SKU before anything is sent. The reference
storefront uses Postgres where it has it. For Printful, `planPrintfulProduct` and `applyPrintfulProduct` create SKUs and their mappings from a
product described as data; see `packages/adapter-printful/README.md`. Printify has no equivalent yet.

`FulfillmentLineStatus` includes `"held"`: sent to the provider but waiting there to be released.
Both adapters take `holdOrders: true` (in the storefront, `PRINTFUL_HOLD_ORDERS=true` or
`PRINTIFY_HOLD_ORDERS=true`), which leaves new orders as Printful drafts or Printify on-hold orders, so
nothing is made or charged until someone releases them. Without it, both send orders straight to
production, so use it for any test against a real account.

## The Printful adapter (epic 42, `@mercatus-liber/adapter-printful`)
A real, deployed `FulfillmentAdapter` implementation wrapping Printful's real v2 order API,
grounded in Printful's own OpenAPI-generated TS client (not training-data recall) — same
sibling-package shape as `adapter-shopify`/`adapter-clerk`/`adapter-sanity`. `submitOrder`
implements the real draft-then-confirm flow (`POST /v2/orders`, then
`POST /v2/orders/{id}/confirmation`); `getOrderStatus` polls `GET /v2/orders/@{orderId}` plus
its shipments.

**Wiring** (`apps/reference-storefront/lib/services.ts`, adapter-printful-02): `manual` is always
registered as the permanent self-fulfillment fallback; `PRINTFUL_API_TOKEN` set and truthy
additionally registers `createPrintfulFulfillmentAdapter()` under the `"printful"` provider key
— an *additive* two-state branch (env var truthy adds a provider, rather than swapping one), the
same "env var truthy picks the real thing, else a harmless local default" shape as every other
optional adapter in that file. Registering the provider does not itself route any SKU to it —
every SKU still defaults to `"manual"` until `fulfillmentRouting.setProviderForSku` is called for
it. `lib/adapter-info.ts`'s `getAdapterInfo()` reports a `Fulfillment` row: `"Manual
(self-fulfillment)"` when `PRINTFUL_API_TOKEN` is unset, `"Manual + Printful (registered)"` when
it's set, visible on `/demo/<demoSlug>/admin/settings`.

**Two real, disclosed design gaps this adapter bridges via injected config callbacks** (not
implementation oversights — see `packages/adapter-printful/src/mapping.ts`'s own doc comments and
this epic's `design-discussion.md`):
- `resolveRecipient(orderId)`: `SubmitFulfillmentOrderInput` (this subsystem's own contract)
  carries no shipping address at all, and `checkout-orders`' `Order.shippingInfo` is only
  `{ name, email, address }` — one free-text address line (Stripe Checkout, the only real payment
  adapter wired today, collects/verifies its own address at its hosted page and never returns a
  structured one back to this app). Printful's real v2 `recipient` schema wants structured
  `address1`/`city`/`state_code`/`zip`/`country_code` fields this reference app genuinely doesn't
  have. `services.ts`'s wiring is a best-effort bridge (the whole free-text line into `address1`),
  not a fabricated structured address — a real deployment would need to collect a structured
  address at checkout to do better.
- `resolveCatalogTarget(skuId)`: Printful's confirmed v2 `order_items` schema addresses a line by
  a Printful-assigned `catalog_variant_id` (integer), not an arbitrary caller-assigned SKU string.
  This reference app's catalog (`@mercatus-liber/core`'s `Sku`) has no notion of Printful's
  catalog surface at all, so `services.ts`'s wiring throws a clear, honest error here rather than
  inventing a mapping — a real deployment needs an explicit SKU → `catalog_variant_id` mapping
  (e.g. a small config table or a SKU metadata field) before routing any SKU to `"printful"`.

**`trackingNumber` is always `null`** from this adapter — confirmed absent from Printful's real
v2 `Shipment` schema (`tracking_url` + a `tracking_events` timeline only, no `tracking_number`
field). A genuine, disclosed schema gap between Printful's real API and this subsystem's
`FulfillmentLineRecord.trackingNumber` field, not a bug or a placeholder.

**Webhook signatures fail closed.** Printful's real v2 webhook signature/HMAC format is genuinely
unconfirmable from public docs — Printful's own OpenAPI webhook models are empty stubs, the docs
name "request signing" as a v2 feature without ever documenting the header/algorithm, and three
independent third-party clients checked implement none of it. `handleWebhookEvent` throws
`PrintfulWebhookSignatureUnconfirmedError` unless the caller supplies its own
`verifyWebhookSignature`, rather than guessing at a scheme and silently trusting an unverified
payload.

**Honest credential-gap disclosure:** no real Printful account or API token exists in this
environment (checked directly: no `PRINTFUL_API_TOKEN` in the shell environment or
`.env.local`, which carries only `VERCEL_OIDC_TOKEN`) — same disclosed gap as
`admin-auth-clerk` (epic 27) and the PostHog/GA4 insights adapters (epic 46). This adapter is
built and unit-tested (21 tests, `packages/adapter-printful/test/`) for real correctness against
Printful's actual, current API shape, not exercised against a live Printful API. What *is*
genuinely verified without a live credential: the `services.ts` env-var branch itself (both
states — manual-only vs. manual+Printful-registered, including with a fake/test token for
wiring-verification purposes only, never a live call), the adapter's own unit test suite, and
`/admin/settings` accurately reporting which provider is active.

## The Printify adapter (epic 43, `@mercatus-liber/adapter-printify`)
A real, deployed `FulfillmentAdapter` implementation wrapping Printify's real, current v1 order
API, grounded in developers.printify.com's own raw HTML (fetched directly, not a lossy summarized
render — the research pass found that a summarized render truncated before the docs' Webhooks
section) — same sibling-package shape as `adapter-printful`/`adapter-shopify`/`adapter-clerk`.
`submitOrder` implements the real create-then-send-to-production flow (`POST
/v1/shops/{shop_id}/orders.json` creates the order UNCHARGED, then `POST
/v1/shops/{shop_id}/orders/{order_id}/send_to_production.json` is the real point Printify charges
the merchant — mirroring Printful's own draft-then-confirm shape for the analogous reason);
`getOrderStatus` polls `GET /v1/shops/{shop_id}/orders/{order_id}.json` for the real, current
per-line status and shipment/tracking facts.

**Wiring** (`apps/reference-storefront/lib/services.ts`, adapter-printify-02): `manual` is always
registered as the permanent self-fulfillment fallback; `PRINTFUL_API_TOKEN` and
`PRINTIFY_API_TOKEN` + `PRINTIFY_SHOP_ID` are each independent, additive branches — any
combination of none/either/both can be registered side by side, the same "env var truthy adds a
provider, rather than swapping one" shape as the Printful branch above. Printify additionally
requires a real shop id (`PRINTIFY_SHOP_ID`), unlike Printful's single-token gate, because real
Printify accounts can have multiple shops with no auto-discovery endpoint (confirmed in
research — see `PrintifyFulfillmentAdapterConfig`'s own doc comment,
`packages/adapter-printify/src/index.ts`). Registering the provider does not itself route any SKU
to it — every SKU still defaults to `"manual"` until `fulfillmentRouting.setProviderForSku` is
called for it. `lib/adapter-info.ts`'s `getAdapterInfo()` reports the `Fulfillment` row additively
across both providers, e.g. `"Manual + Printful + Printify (registered)"` when both are configured,
`"Manual + Printify (registered)"` when only Printify is, and `"Manual (self-fulfillment)"` when
neither is — visible on `/demo/<demoSlug>/admin/settings`.

**Three real, disclosed design gaps this adapter bridges via injected config callbacks** (not
implementation oversights — see `packages/adapter-printify/src/index.ts` and `src/mapping.ts`'s
own doc comments and this epic's `design-discussion.md`):
- `resolveRecipient(orderId)`: the same real gap as Printful's `resolveRecipient` — this reference
  app's `checkout-orders`' `Order.shippingInfo` is only `{ name, email, address }`, but Printify's
  real `address_to` schema wants structured `first_name`/`last_name`/`address1`/`city`/`zip`/
  `country` fields. `services.ts`'s wiring is a best-effort bridge (the whole free-text name into
  `first_name`, leaving `last_name` unset, and the whole free-text address line into `address1`),
  not a fabricated structured name/address.
- `resolveCatalogTarget(skuId)`: Printify's confirmed v1 "order an existing product" line-item
  shape addresses a line by a Printify-assigned `product_id` (string) + `variant_id` (integer),
  not an arbitrary caller-assigned SKU string. This reference app's catalog has no notion of
  Printify's catalog surface at all, so `services.ts`'s wiring throws a clear, honest error here
  rather than inventing a mapping — a real deployment needs an explicit SKU → Printify
  product/variant mapping (e.g. a small config table or a SKU metadata field) before routing any
  SKU to `"printify"`.
- `resolveExternalOrderId(orderId)`: **Printify-specific — Printful needs no equivalent.**
  Printify's `GET /v1/shops/{shop_id}/orders/{order_id}.json` addresses an order by Printify's own
  id, with no confirmed lookup by external id (unlike Printful's `@external_id`). `services.ts`
  wraps the adapter with `withProviderOrderLinks`, which stores the `externalOrderId` each
  `submitOrder` returns, and `resolveExternalOrderId` reads it back (see "Provider order links"
  below). On Postgres the link survives a restart; on the other backends it is still in memory.

**Tracking only attaches when an order has exactly one shipment** — a real, disclosed limit
confirmed during research: unlike Printful's real v2 `Shipment` schema (which carries
`shipment_items[].order_item_id`), Printify's real, confirmed `Order.shipments[]` shape
(`carrier`/`number`/`url`/`delivered_at`) carries no per-line-item linkage at all — no field on a
shipment names which line item(s) it covers. When an order has exactly one real shipment,
attributing it to every line item is a safe, unambiguous read (the common case for a small
single-item-per-order shop); when an order has zero or two-or-more real shipments, this adapter
cannot honestly attribute a specific shipment to a specific line item from Printify's own response
shape alone, so it returns `null` tracking rather than guessing (`findTrackingForLineItem`,
`packages/adapter-printify/src/mapping.ts`).

**Webhook signatures are genuinely confirmed and verified by default** — a different posture than
Printful's fail-closed-with-no-default. Printify's docs' own "Securing your Webhooks" section
confirms a real envelope (`{ id, type, created_at, resource: { id, type, data } }`) and a real
HMAC-SHA256 `X-Pfy-Signature: sha256={digest}` scheme. Because this is confirmed rather than
guessed, `handleWebhookEvent` implements it as a real default verifier (`webhookSecret` config) —
still fails closed with `PrintifyWebhookSignatureNotConfiguredError` if no secret/override is
configured at all.

**Honest credential-gap disclosure:** no real Printify account, API token, or shop id exists in
this environment (checked directly: no `PRINTIFY_API_TOKEN`/`PRINTIFY_SHOP_ID` in the shell
environment or `.env.local`, which carries only `VERCEL_OIDC_TOKEN`) — same disclosed gap as
`admin-auth-clerk` (epic 27), the PostHog/GA4 insights adapters (epic 46), and this same epic's own
Printful adapter (epic 42) above. This adapter is built and unit-tested (30 tests,
`packages/adapter-printify/test/`) for real correctness against Printify's actual, current API
shape, not exercised against a live Printify API. What *is* genuinely verified without a live
credential: the `services.ts` env-var branch itself across every combination of Printful/Printify
configured (including with fake/test credentials for wiring-verification purposes only, never a
live call), the adapter's own unit test suite, and `/admin/settings` accurately reporting which
providers are registered.

**Marketplace routing is out of scope.** Printify is a marketplace where the same product can be
fulfilled by multiple independent print providers with different base cost/quality/ship time,
either auto-routed via "Printify Choice" or picked per product listing — that provider selection
happens entirely in Printify's own dashboard/catalog setup, upstream of this adapter. This
subsystem's `FulfillmentRoutingRepository` only ever routes a SKU to the `"printify"` *provider
key* (i.e., "submit this line to Printify at all"), never to a specific print provider within
Printify — the same boundary Printful's `resolveCatalogTarget` gap already draws (which
Printify-catalog product/variant a SKU maps to, and therefore which underlying print provider
fulfills it, is Printify-dashboard setup, not something this adapter or this reference app's
catalog has any notion of).

## States and provinces

A recipient's `stateCode` may hold a code ("NE") or, from a free-text form, a name ("Nebraska");
`stateName` holds the name when the source gave one. Each adapter converts the region to what its
provider wants, using `resolveRegion`/`regionForProvider` from `@mercatus-liber/core` (lists for
US with DC, territories and military codes; CA; AU; BR; JP, from Printful's `/countries`):

| Adapter | Sends a code for | Field |
|---|---|---|
| Printful | US, CA, AU, BR, JP (the countries Printful keeps state lists for) | `state_code` |
| X3D | US, CA, AU | `state` |
| Printify | US, CA, AU | `region` |
| Shippo | US, CA, AU | `state` |

Elsewhere the region is sent as given. A region that can't be matched in a country that needs a
code throws `UnresolvedRegionError` (with `countryCode`, `region` and `provider`) before the
provider is called. Printful answered "Nebraska" sent as `state_code` with `HTTP 400: Recipient:
Shipping address state and ZIP code don't match` on a real order on 2026-11-20.

## Explicitly NOT this subsystem's job
- **Automatically routing/submitting an order for fulfillment when it's placed or paid** — no
  event-bus subscription exists yet (unlike `inventory`/`internal-bi`'s
  `registerInventorySync`/`registerBiEventLogSync`). An operator explicitly triggers
  "Route & submit for fulfillment" from the admin surface for now; wiring this to
  `checkout.order.paid` automatically is a reasonable later addition, not required for this
  story's scope.
- **An admin UI for setting explicit SKU -> provider routing overrides** —
  `FulfillmentRoutingRepository.setProviderForSku`/`listMappings` exist on the contract (for a
  future real multi-provider setup, e.g. some SKUs to Printful, others self-fulfilled), but no
  admin page calls them yet; every SKU in this reference app routes to `"manual"` today.
- **Changing `Order.status`** — `checkout-orders`' own coarse order status is untouched by this
  subsystem entirely; fulfillment status is a separate, finer-grained, per-line concern (see
  design-discussion.md §1a).
- **A live-verified Printful or Printify webhook receiver route** — both adapters implement
  `handleWebhookEvent` (Printful fails closed on an unconfirmed signature scheme; Printify verifies
  a real, confirmed HMAC-SHA256 scheme by default), but no route in `apps/reference-storefront`
  calls either yet and no real Printful or Printify account exists in this environment to send a
  real webhook from; the manual adapter has no external system to receive webhooks from at all, so
  it doesn't implement this method.
- **Printify marketplace/print-provider routing** — which of Printify's own independent print
  providers actually fulfills a given Printify-catalog product/variant (auto-routed via "Printify
  Choice" or picked per listing) is Printify-dashboard setup, entirely upstream of this adapter and
  this subsystem — see "The Printify adapter" section's marketplace-routing note above.

## Decoupling notes
`packages/fulfillment`'s only runtime dependency is `@mercatus-liber/core`.
`@mercatus-liber/checkout-orders` is a `devDependency` only (type-only import, erased under
`isolatedModules`) — used exclusively by `src/order-lookup-compat.ts`'s compile-time proof that
a real `CheckoutOrdersService` satisfies `OrderLookup` with zero adapter/glue code, checked by
`tsc` on every build (never re-exported from the package's public surface, so consumers never
need that type resolvable). Verify via
`grep -rn "@mercatus-liber/fulfillment" packages/cart packages/checkout-orders/src
packages/catalog/src packages/promotions/src packages/bundles/src packages/recommendations/src
packages/inventory/src packages/pdp/src packages/cms/src packages/analytics/src
packages/advertising/src packages/internal-bi/src packages/account/src` before merge — every
one of those must return zero hits; `fulfillment` is consumed only by
`apps/reference-storefront`.

## Open questions
1. Should submitting an order for fulfillment become event-driven (subscribing to
   `checkout.order.paid`, mirroring `registerInventorySync`) instead of the operator-triggered
   admin action this story ships? Deferred — the explicit action is a real, working default
   and doesn't block epics 42-43's real provider adapters.
2. Both Printful (epic 42) and Printify (epic 43) are now real, wired, unit-tested adapters, but
   no live Printful or Printify credential exists in this environment (see each adapter's own
   disclosure section above) — the two adapters' own unit test suites, plus the `services.ts`
   env-var branch verified across every registration combination, stand as the proof of
   swappability for v1, same posture as `internal-bi`'s external-BI-tool adapter and `admin-auth`'s
   non-Clerk identity providers. Live account verification for either provider is disclosed future
   work, not required for this epic's scope.

## Provider order links and status events

`packages/fulfillment/src/provider-orders.ts` stores which provider order was placed for which
store order, and turns provider status updates into one store event.

- `ProviderOrderLinkRepository` holds `{ orderId, provider, externalOrderId }` plus the last status,
  tracking number and carrier the provider reported. In-memory (`createInMemoryProviderOrderLinkRepository`)
  and Postgres (`createPostgresProviderOrderLinkRepository`, table `provider_order_links`) versions
  exist; SQLite, MongoDB and Convex do not have one yet.
- `withProviderOrderLinks(adapter, provider, links)` stores the link after each `submitOrder`.
  `externalOrderIdsFrom(links, provider)` is a ready-made `resolveExternalOrderId`.
- `createProviderOrderStatusRecorder({ links, events }).record(provider, update)` finds the store
  order through the link and publishes `fulfillment.order.status_changed` with
  `{ orderId, provider, externalOrderId, status, trackingNumber, carrier, previousStatus }`. It
  publishes only when something changed, so a provider retrying a delivery publishes once. An update
  for a provider order with no link publishes nothing. A "shipped" that arrives after "delivered"
  does not move the order back.
- Each webhook-capable adapter exports a mapper from its own event to that update:
  `slant3dOrderStatusUpdateFrom`, `dapiOrderStatusUpdateFrom` and `printfulOrderStatusUpdateFrom`.
  Printify has none yet.

### Printful

`printfulOrderStatusUpdateFrom(event)` (`packages/adapter-printful/src/webhook.ts`) reads both of
Printful's webhook generations:

| Event | Status | Notes |
| --- | --- | --- |
| `shipment_sent` (v2), `package_shipped` (v1) | `shipped` | Tracking number from `data.shipment.tracking_number`. Carrier only from v1; the v2 webhook shipment documents none. |
| `shipment_delivered` (v2) | `delivered` | |
| `order_failed`, `order_canceled` | `unfulfilled` | |
| `shipment_returned` (v2), `package_returned` (v1) | `shipped` | There is no "returned" line status. For an order already recorded as shipped this publishes nothing. Read the raw `fulfillment.provider_event` to act on returns. |
| `order_created`, `order_updated`, anything else | none | |

`externalOrderId` is Printful's order id; `orderId` is the order's `external_id`, which this adapter
sets to the store's order id at submit. An order sent in two parcels publishes two "shipped" changes
with different tracking numbers.

The storefront wraps the Printful adapter with `withProviderOrderLinks` and lists a `printful`
webhook receiver when `PRINTFUL_WEBHOOK_SECRET_KEY` (the hex `secret_key` from `POST /v2/webhooks`)
is set. The signature is read from `x-pf-webhook-signature`; a bad or missing one answers 401, and
without the secret the adapter refuses every delivery. That signature scheme is v2's. Printful's v1
docs describe no signature, so v1 events only reach the mapper through a custom
`verifyWebhookSignature`.

### Lines the store ships itself

`packages/fulfillment/src/self-shipments.ts` makes self-shipped lines publish the same event, so one
subscriber can send every "your order shipped" email.

- `recordSelfShipment({ links, recorder, orderId, skuIds, trackingNumber, carrier, labelId })`
  publishes `fulfillment.order.status_changed` with provider `"manual"`, status `shipped`, the
  tracking number, the carrier and the lines' `skuIds`.
- The manual provider has no order id of its own, so the parcel is linked under a made-up one
  (`selfShipmentLinkId`): the label id when given, otherwise the tracking number, otherwise
  `order:<orderId>:<skuIds>`. That is the event's `externalOrderId`.
- Recording the same parcel twice publishes once. Lines marked one at a time under one tracking
  number (no label id) share a link: the first call publishes, later calls add their lines to it.
- `recordSelfShipmentVoided({ recorder, labelId })` publishes a change back to `submitted` for the
  lines that label covered. It needs the shipment to have been recorded with that label id. The
  event still carries the voided label's tracking number, so read `status`. The manual adapter's own
  line record stays "shipped"; it has no way back. A voided link stays in `listOpen("manual")`.
- `@mercatus-liber/shipping` and this package still do not depend on each other. A store calls
  these from the `labelRecorded` and `labelVoided` hooks of shipping's `createOrderLabelService`
  (see `docs/subsystems/23-shipping.md`).
- The reference storefront calls `recordSelfShipment` from its "mark shipped" admin action (one line,
  no carrier field on that form). It has no label-buying page, so the label hooks are exercised only
  in `apps/reference-storefront/test/self-shipment-events.test.ts`.
- A later "delivered" comes from the shipping provider's tracking webhook: see
  `shippoTrackingUpdateFrom` in `docs/subsystems/23-shipping.md`.

`fulfillment.order.status_changed` is in `@mercatus-liber/webhooks`' `KNOWN_EVENT_TYPES`, so a Store
API webhook subscription can ask for it. Nothing in the reference storefront sends the customer an
email on it; that is a subscriber a store adds.

The reference storefront wires all of this for Printful, Slant 3D, 3DAPI and Printify.

**What is verified live: nothing in this section.** No webhook delivery from a real Printful, Slant
3D, 3DAPI or Shippo account has been received by this repo. The Printful and Shippo payload shapes
are field names taken from the providers' published docs on 2026-11-15 (the fixture files in
`packages/adapter-printful/test/webhook-fixtures.ts` and `packages/adapter-shippo/test/webhook-fixtures.ts`
say exactly which pages); every value in them is made up. Two things in particular are unconfirmed:
which bytes Printful signs (the adapter signs the raw body), and whether Shippo's `track_updated`
body carries the `transaction` id for labels bought through the API.

## Submitting again, and what survives a restart

- **`submitOrder` is safe to call again.** Before sending a provider its lines, the service reads that provider's existing records for the order and leaves out any line that has one, unless its status is `unfulfilled` (the provider cancelled or rejected it). If one provider fails, the others are still submitted and `PartialFulfillmentSubmitError` is thrown at the end with the placed `records` and the `failures` by provider. A provider whose existing records cannot be read is not submitted to.
- **Self-shipped lines are stored.** `createManualFulfillmentAdapter({ store })` keeps its line records, including the tracking number written when a label is bought, in a `ManualFulfillmentRecordStore`. The default is in memory. `createPostgresManualFulfillmentRecordStore` (table `manual_fulfillment_records`, created on first use) is the durable one; the reference storefront uses it whenever it runs on Postgres. SQLite, MongoDB and Convex do not have one yet.
- **Printful order ids.** Printful refuses an `external_id` over 32 characters (confirmed by a real `POST /v2/orders` from a store on 2026-11-15: HTTP 400). A UUID order id is therefore sent without its dashes, and 32 hex characters read back from Printful, in an order or a webhook, get their dashes back. A longer id that is not a UUID is refused before anything is sent.

### Using the status event

- The payload also carries `trackingUrl` (null when no tracking page is known). Printful's shipment and a bought label give one; Slant 3D, 3DAPI and X3D give a number only. It is not part of `changeId`, and a page learned after the status was announced is stored for the next event without publishing one.
- `changeId` is a JSON array as a string, for example `["printful","880011","shipped","TRK1",null]`. It works as a database key as it is. Hash it before using it as an HTTP header value such as an email service's idempotency key.
- A route that maps an adapter's error classes to HTTP statuses should compare by `error.name` as well as `instanceof`. In a production Next.js build a route can hold its own bundled copy of a package, which makes `instanceof` false for the adapter's own error. The reference storefront's webhook route answered a bad signature with 500 for that reason until 2026-11-15.

### Line ids

An order's lines can carry an optional `lineId`. When the `OrderLookup` returns one on an item, `submitOrder` passes it to the adapter, an adapter that reports it sets `lineId` on its records, stored provider order links keep `lineIds` aligned with `skuIds`, and `fulfillment.order.status_changed` carries `lineIds` (empty when there are none). This is what lets two lines of one order share a SKU and still be made, retried and reported separately, which personalised products need. Only `@mercatus-liber/adapter-x3d` reports line ids so far; with any other adapter a record covers every line of its SKU, as before. Postgres adds `line_ids` with `ADD COLUMN IF NOT EXISTS`.
