# Subsystem 16 — Promotions & Discounts

## Purpose
Coupon codes and percentage/fixed discounts, cart-level (whole-order) and product-level
(specific SKUs). Owns the `Promotion` domain model and the pricing-adjustment computation
that checkout-orders (09) consults synchronously before creating a payment session. This is
the first "order total" concept the repo has — no cart/checkout-orders total calculator
existed before this subsystem.

## Depends on
`@mercatus-liber/core` only. Never imports `@mercatus-liber/cart`, `@mercatus-liber/checkout-orders`,
or `@mercatus-liber/catalog` — SKU-scoped promotions store bare `skuId` strings, not catalog
references, and are validated against a cart's own line items (also bare `skuId`s) at
evaluation time. checkout-orders (09) depends on this subsystem via the narrow
`PricingAdjuster` structural interface declared in *its own* `types.ts` — promotions never
imports checkout-orders either. Publishes `promotions.redeemed`; subscribes to
`checkout.order.paid` (from 09) to increment redemption counts on completed purchases only,
never on merely-started checkouts.

## Responsibilities
- `Promotion` entity: code (nullable — null means auto-applied, no code needed), kind
  (percentage | fixed), scope (cart | product + target SKU ids), eligibility window
  (starts/ends at, min cart amount), usage limit + redemption count, active/inactive status.
- `PromotionRepository` (adapter pattern, as everywhere else) + in-memory reference
  implementation.
- `PromotionsService.evaluate(input)`: given cart line items + an optional coupon code,
  returns adjusted per-line unit amounts, a discount total, and either the applied code or a
  rejection reason (unknown/expired/not-yet-active/usage-limit-reached/below-minimum) — never
  throws for an invalid code, since "coupon didn't apply" is expected shopper-facing UX, not
  an error state.
- Satisfies checkout-orders' `PricingAdjuster` interface (see doc 09 and
  `packages/checkout-orders/src/types.ts`) when wired in at `services.ts` DI time.
- Admin CRUD for promotions (`/admin/promotions` — see epic `promotions-discounts` stories
  `promo-04`).

## Explicitly NOT this subsystem's job
- Cart-side state or a `CartService` method — cart (07) stays untouched; see
  `docs/subsystems/07-cart.md`'s own explicit non-goal. Discounted totals are read via
  checkout-orders' `previewCheckout`, never via cart.
- Payment execution or Stripe line-item construction — checkout-orders (09) still owns that;
  promotions only returns adjusted amounts, never talks to the payments interface.
- Multi-promotion stacking — one promotion per checkout for this version (a coupon code if
  present, else the single highest-value auto-applied promotion). Stacking is a documented
  future extension, not a silent gap.
- Recommending which promotion to offer a shopper, or any merchandising/targeting logic — that
  is upsell/cross-sell (22) and advertising (23)'s territory, both distinct subsystems.

## Decoupling notes
`PricingAdjuster` is optional on `CheckoutOrdersService` — when unwired, checkout-orders falls
through to a built-in pass-through adjustment (zero discount), so every deployment that
hasn't adopted promotions sees zero behavior change. This mirrors the `CartLookup`/
`PaymentSessionCreator` pattern exactly: checkout-orders' `types.ts` declares the shape it
needs; `apps/reference-storefront/lib/services.ts` is the only file that wires the concrete
`@mercatus-liber/promotions` package in. Verify via `grep -rn "@mercatus-liber/promotions"
packages/cart packages/checkout-orders/src` before merge — the only checkout-orders hit should
be in `types.ts`'s comment (English prose, not an import), and cart should have zero hits.

## Open questions
1. Redemption-count race under concurrent checkouts against the same usage-limited coupon —
   accepted as an open item for the in-memory reference repository (no locking), same posture
   as every other in-memory reference repo in this codebase; a real adapter (sqlite/postgres)
   gets transactional guarantees.
2. Should product-level discounts surface on the PDP (04) directly, or only at cart/checkout
   preview time? Deferred to story `promo-03`'s own scoping — this doc only commits to the
   checkout-time computation being correct regardless of where else it's displayed.
