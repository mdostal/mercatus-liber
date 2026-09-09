# Design Discussion: fulfillment-routing

## 0. Context

Backlog epic 41, foundational for epics 42-44 (Printful/Printify/Shippo adapters). Source: a
real, API-verified research pass from a concurrent session (`.pHive/planning/backlog-addendum-
merch-fulfillment-2026-09-09.md`), triggered by a real shop.mdostal.com request to add
dropship/print-on-demand merch. That research is the grounding for this design, not re-derived
here.

**Confirmed by direct inspection:** `checkout-orders`' `Order.status` (`pending_payment -> paid
-> fulfilled -> cancelled`) has zero notion of a fulfillment provider or per-line routing.
`OrderLineItem` already carries `customizationNote` (added by epic 36, additive/optional,
carried through from cart) but nothing about who fulfills that line. Every shop built on this
framework so far implicitly assumes 100% self-fulfillment.

## 1. Design questions

**(a) Where do fulfillment records live -- a new field on Order, or a new subsystem?**
Resolved (adopting the addendum's own recommendation, confirmed sound against the real
`Order`/`OrderLineItem` shapes read directly): a **new subsystem**, `@mercatus-liber/fulfillment`,
owning its own per-order-line fulfillment records (`{ orderId, skuId, provider, externalOrderId,
status, trackingNumber, trackingUrl }`), read *alongside* orders via a narrow
`OrderLookup`-shaped structural interface -- the same non-forking relationship `internal-bi`
already has with `Order` (confirmed by reading `internal-bi`'s `OrderMetricsSource`). `Order.status`
stays the coarse/aggregate status, unchanged. This avoids forking `checkout-orders`' own types
for a concern (who/how a line ships) that a payments-and-orders package shouldn't own.

**(b) FulfillmentAdapter contract shape -- mirror which existing adapter?**
Resolved: mirrors `packages/payments`' `PaymentAdapter` (`createPaymentSession`/
`confirmPayment`-style shape, confirmed by reading `packages/payments/src/types.ts` directly) --
`submitOrder(...)`, `getOrderStatus(...)`, optional `handleWebhookEvent(...)`. Same
narrow-interface, real-third-party-implementation-in-a-sibling-package pattern as every other
adapter in this repo.

**(c) SKU-to-provider routing -- how is it configured?**
Resolved (per the addendum): a `FulfillmentRoutingRepository` (skuId -> provider-key mapping),
owned by this subsystem itself, referencing SKUs by id only -- the same "adapters reference
catalog by id, never fork its types" discipline `bundles`/`promotions`/`recommendations` already
follow. Default: every SKU implicitly routes to a `"manual"` provider unless explicitly mapped
otherwise.

**(d) Zero-infra default.**
`createManualFulfillmentAdapter()` -- models exactly today's *implicit* behavior (an operator
fulfills by hand, marks it shipped). Needed regardless of whether any real POD adapter ever
gets built (epics 42-43), and the permanent fallback for self-fulfilled SKUs even after one
does (e.g. Northline's services, self-3D-printed dragon-merch-era items, most of Broadleaf's
handmade goods).

## 2. Scope assessment

**Medium.** New subsystem (core-only dependency, per the addendum), narrow adapter contract,
one new admin UI surface. No dependency on any specific POD provider -- ships before Printful
vs. Printify vs. both is decided.

## 3. Stories

1. **subsystem-and-manual-adapter** -- `@mercatus-liber/fulfillment` package: the
   `FulfillmentAdapter` contract, `FulfillmentRoutingRepository`, the per-order-line record
   shape, `createManualFulfillmentAdapter()`, and the `OrderLookup`-shaped structural interface
   this subsystem reads orders through (mirroring internal-bi's own pattern exactly).
2. **admin-surface-and-wiring** -- `/admin/fulfillment` (or a real extension of today's
   list-only `/admin/orders`) showing per-line routing/status, a manual "mark shipped" action;
   wire the subsystem into `lib/services.ts` per this repo's standard composition pattern; a
   new `docs/subsystems/22-fulfillment.md`.
3. **verification-and-closeout** -- live-verify a real order's lines show up with the correct
   default manual routing, a real "mark shipped" action works end to end, update the backlog,
   merge.

## 4. Risks

- **Low.** New, additive subsystem -- no existing behavior changes (every SKU's implicit
  "manual" routing today becomes an explicit, visible default, not a behavior change).

## 5. Open questions

None blocking.
