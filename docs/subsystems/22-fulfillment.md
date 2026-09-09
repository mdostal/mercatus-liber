# Subsystem 22 — Fulfillment Routing

## Purpose
Per-order-line fulfillment routing and status — which provider fulfills a given SKU on an
order, and where that line currently stands (unfulfilled/submitted/shipped/delivered).
Before this subsystem, every shop built on this framework implicitly assumed 100%
self-fulfillment: `checkout-orders`' `Order.status` (`pending_payment -> paid -> fulfilled ->
cancelled`) has no notion of a fulfillment provider or per-line routing at all. This subsystem
makes that implicit "an operator fulfills by hand" reality explicit and visible, and is the
foundation epic 42's real Printful print-on-demand adapter (see below) is built on top of, with
epic 43 (Printify) as disclosed future work.

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
  under the `"printful"` provider key — see "The Printful adapter" section below for the full
  wiring and its disclosed design gaps.
- Surfaced as a real extension of `/demo/<demoSlug>/admin/orders` (not a separate
  `/admin/fulfillment` page — see that page's own doc comment for the reasoning): each order's
  line items show their routed provider (defaulting to `"manual"`), their current status
  (a real record's status, or a synthesized `"unfulfilled"` when no record exists yet), and
  tracking info once shipped. Two admin mutations (`lib/actions.ts`), both gated by
  `requireAdminPermission("mutate")` like every other admin mutation in this repo:
  `submitOrderForFulfillmentAction` (routes and submits an order's lines — idempotent, a no-op
  if the order already has any fulfillment records) and `markFulfillmentLineShippedAction` (the
  operator "mark shipped by hand" action, with optional tracking number/URL fields).

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

## Explicitly NOT this subsystem's job
- **A real Printify adapter** — disclosed future work (epic 43), not built here. Printful is the
  only real third-party provider registered today, alongside the permanent manual fallback.
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
- **A live-verified Printful webhook receiver route** — `handleWebhookEvent` is implemented and
  fails closed on an unconfirmed signature scheme (see above), but no route in
  `apps/reference-storefront` calls it yet and no real Printful account exists in this
  environment to send a real webhook from; the manual adapter has no external system to receive
  webhooks from at all, so it doesn't implement this method.

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
2. A real Printify adapter (epic 43) is disclosed future work, a deliberate *second*, later,
   optional POD provider — no live Printful credential exists in this environment either (see
   "The Printful adapter" section's disclosure above), so the Printful adapter itself stands as
   the proof of swappability for v1, same posture as `internal-bi`'s external-BI-tool adapter and
   `admin-auth`'s non-Clerk identity providers.
