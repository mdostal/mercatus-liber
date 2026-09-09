# Subsystem 22 — Fulfillment Routing

## Purpose
Per-order-line fulfillment routing and status — which provider fulfills a given SKU on an
order, and where that line currently stands (unfulfilled/submitted/shipped/delivered).
Before this subsystem, every shop built on this framework implicitly assumed 100%
self-fulfillment: `checkout-orders`' `Order.status` (`pending_payment -> paid -> fulfilled ->
cancelled`) has no notion of a fulfillment provider or per-line routing at all. This subsystem
makes that implicit "an operator fulfills by hand" reality explicit and visible, and is the
foundation epics 42-43 build real dropship/print-on-demand (Printful, Printify) provider
adapters on top of.

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
  permanent fallback for self-fulfilled SKUs even once a real POD adapter exists (epics 42-43).
- `createFulfillmentService(deps)`: the orchestration layer tying the routing repository,
  per-provider adapters, and `OrderLookup` together — `listForOrder` (every provider's current
  records for an order's lines, aggregated), `submitOrder` (groups an order's lines by routed
  provider and submits each group to that provider's adapter), and `markLineShipped`
  (structurally delegates to an adapter's `markShipped` when it exposes one, otherwise throws
  `ManualStatusUpdateNotSupportedError` — a webhook-driven provider updates status via
  `handleWebhookEvent` instead).
- Wired into `apps/reference-storefront/lib/services.ts`: `checkout` structurally satisfies
  `OrderLookup` already (no adapter object needed), and only the manual adapter is registered
  (`{ manual: createManualFulfillmentAdapter() }`) — no real POD provider adapter exists yet, so
  there is no env-var branch here yet (epics 42-43 add one, same "env var truthy picks the real
  thing, else a harmless local default" shape as every other adapter in that file).
- Surfaced as a real extension of `/demo/<demoSlug>/admin/orders` (not a separate
  `/admin/fulfillment` page — see that page's own doc comment for the reasoning): each order's
  line items show their routed provider (defaulting to `"manual"`), their current status
  (a real record's status, or a synthesized `"unfulfilled"` when no record exists yet), and
  tracking info once shipped. Two admin mutations (`lib/actions.ts`), both gated by
  `requireAdminPermission("mutate")` like every other admin mutation in this repo:
  `submitOrderForFulfillmentAction` (routes and submits an order's lines — idempotent, a no-op
  if the order already has any fulfillment records) and `markFulfillmentLineShippedAction` (the
  operator "mark shipped by hand" action, with optional tracking number/URL fields).

## Explicitly NOT this subsystem's job
- **A real POD/dropship provider adapter** (Printful, Printify) — disclosed future work (epics
  42-43), not built here. The manual adapter is the only registered provider today.
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
- **Webhook signature verification for a real provider** — `FulfillmentAdapter.handleWebhookEvent`
  is contract-only; the manual adapter (the only one wired) has no external system to receive
  webhooks from, so it doesn't implement this method at all.

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
2. A real POD/dropship provider adapter (Printful vs. Printify vs. both) is disclosed future
   work — no live credentials/decision exist in this environment; the `FulfillmentAdapter`
   contract itself is the proof of swappability for v1, same posture as `internal-bi`'s
   external-BI-tool adapter and `admin-auth`'s non-Clerk identity providers.
