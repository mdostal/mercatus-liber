# Design Discussion — Epic 20: `promotions-discounts`

## 0. Prelude

**Source:** backlog epic 20 (`.pHive/planning/epic-backlog.md`), identified by epic 17's
commerce-gap audit, backlogged 2026-09-08, planned 2026-09-08. No `.pHive/CONTEXT.md` /
`kg_why` prior-decision hits for "promotions" or "discounts" — clean slate. No
`north_star` block conflicts.

**Prior-decision constraint found in an existing subsystem doc** (binding, not a proposal):
`docs/subsystems/07-cart.md` lines 25-29, "Explicitly NOT this subsystem's job": *"Pricing
rules/discounts beyond price snapshotting — if/when a promotions concept exists, it's either
part of checkout (09) or its own subsystem, not bolted onto cart."* This pre-decides half of
this epic's central design question before any research began: cart is off the table as a
host for discount logic. The only real question is checkout-orders extension vs. new peer
subsystem.

## 1. Goal

Ship coupon codes and percentage/fixed discounts, both cart-level (whole-order) and
product-level (specific SKUs), consulted synchronously at checkout time (and previewable
before checkout, for display), plus an admin UI to create and manage them — without touching
cart at all and without weakening checkout-orders' `@mercatus-liber/core`-only dependency
contract.

## 2. Research findings (grounding)

- **No total/discount concept exists anywhere today.** Cart has no `getTotal()`; `Order` has
  no `subtotal`/`total`/`discountTotal` field; the one place a total is computed is inline in
  `apps/reference-storefront/app/cart/page.tsx` per-line, with no grand total ever displayed.
  This epic is the first thing in the repo that needs an "order total" concept at all.
- **The exact seam:** `packages/checkout-orders/src/service.ts` `startCheckout()`, between the
  cart snapshot (`cart.getCart(input.cartId)`, line 70) and payment-session creation
  (`payments.createPaymentSession(...)`, line 93). Both `order.items[].priceAtPurchase` and
  Stripe's `lineItems[].unitAmount` are built directly from `item.priceSnapshot` today, with no
  adjustment step. This is where a pricing adjustment must be inserted.
- **No generic synchronous extension point exists.** Doc 12 (plugins) is explicit: every
  adapter interface a subsystem declares in its own `types.ts` *is* the plugin point by
  construction; there is no second, parallel "consult all handlers, get a value back"
  mechanism. The event bus is async pub/sub only (fire-and-forget side effects) — unusable for
  a computation that must return an adjusted total before Stripe is called. So a discount
  mechanism can only be wired in the same way `CartLookup` / `SkuLookup` /
  `PaymentSessionCreator` are today: a **named structural interface declared in the consuming
  subsystem's own `types.ts`, satisfied by a service wired in at `services.ts` DI time.**
- **Admin UI convention:** every existing `/admin/*` page (catalog, cms, orders, plugins) is a
  read-only `<table>` with zero create/edit forms anywhere in the app. A promotions admin CRUD
  UI is a **new precedent** (first admin-side mutation), not a copy of an existing pattern —
  it follows the one existing form-mutation convention in the app instead: a `"use server"`
  action in `lib/actions.ts` + `revalidatePath`, currently only used shopper-side
  (`addToCartAction`, `startCheckoutAction`).
- **Contrast with epic 22 (upsell/cross-sell):** marketing-catalog's `SuggestionRule`
  (`packages/marketing-catalog/src/types.ts:43-47`) is a category-suggestion rule
  ("if SKU has attribute X, suggest category Y"), explicitly "assistive... never
  auto-applied." Unrelated to pricing; confirms this epic's scope doesn't overlap 22's.

## 3. The design question, resolved: own subsystem, not a checkout-orders extension

**Decision: new subsystem, `promotions` (package `@mercatus-liber/promotions`), subsystem 16
in `docs/subsystems/`.** checkout-orders gains a *narrow, optional* structural interface
(`PricingAdjuster`) in its own `types.ts` that promotions' service satisfies — the same pattern
`CartLookup`/`PaymentSessionCreator` already use. checkout-orders never imports
`@mercatus-liber/promotions`.

**Why own-subsystem over checkout-extension:**

1. **State ownership.** A promotion is a durable, independently-manageable business entity
   (code, type, scope, target SKUs, date range, usage limit, redemption count) with its own
   admin CRUD lifecycle, wholly independent of any single order. That's a repository +
   service + adapter-pattern subsystem in this codebase's own vocabulary, not a stateless
   computation checkout-orders would have to own and persist itself. Bolting a
   `PromotionRepository` into checkout-orders would violate checkout-orders' documented
   `@mercatus-liber/core`-only dependency contract by growing its own scope, not by importing
   another package — but it would also break subsystem 09's single responsibility ("cart
   snapshot → shipping info → payment session → confirmation") the same way stock-decrementing
   was deliberately kept out of it (09's own "Explicitly NOT this subsystem's job" list) in
   favor of a sibling subsystem.
2. **Reusability beyond checkout.** Product-level discounts need to be visible on the PDP and
   cart-preview surfaces too (not just at the final checkout step), and the eventual
   internal-BI epic (promotion redemption rates, per the wider backlog) needs a promotions
   read surface independent of any single order. A subsystem with its own repository serves
   all of those; a checkout-orders-internal feature would serve only checkout.
3. **Precedent.** Every prior "new business concept" in this repo (inventory, analytics,
   service-areas, plugins) became its own subsystem behind a narrow structural interface
   consulted by whichever subsystem needed it, never grew inside an existing one. Promotions
   fits the same shape exactly: a `Promotion`/`Coupon` domain model + `PromotionsService`.
4. **Cost is genuinely small.** The "extension point" checkout-orders needs either way is one
   new optional interface (`PricingAdjuster`) in its `types.ts` — identical amount of
   checkout-orders code change under either design. Own-subsystem doesn't cost more at the
   integration seam; it only adds the (necessary, real) promotions package itself.

**What checkout-orders gains, concretely:**

```ts
// packages/checkout-orders/src/types.ts (new)
export interface PricingAdjustment {
  items: { skuId: string; quantity: number; unitAmount: Money }[]; // post-discount unit price
  discountTotal: Money;
  total: Money; // sum(items[].unitAmount * quantity)
  appliedCode: string | null;
}

/**
 * The narrowest dependency checkout-orders has on pricing adjustments -- a
 * structural interface, not an import of @mercatus-liber/promotions.
 * @mercatus-liber/promotions's PromotionsService satisfies this shape.
 * Optional: when no PricingAdjuster is wired at services.ts DI time,
 * startCheckout/previewCheckout fall through to a pass-through adjustment
 * (zero discount, unitAmount === priceSnapshot) -- zero behavior change for
 * any deployment that hasn't adopted promotions yet.
 */
export interface PricingAdjuster {
  computeAdjustment(input: {
    items: { skuId: string; quantity: number; priceSnapshot: Money }[];
    couponCode?: string | null;
  }): Promise<PricingAdjustment>;
}
```

`createCheckoutOrdersService(deps)` gains an **optional** `pricing?: PricingAdjuster` dep. A
built-in pass-through (`{ items: items.map(i => ({...i, unitAmount: i.priceSnapshot})),
discountTotal: {amount:0,...}, total: sum, appliedCode: null }`) is used when `deps.pricing`
is undefined, so every existing test/deployment keeps working byte-identically. `Order` gains
`discountTotal: Money` (default `{amount:0,currency:...}`) and `appliedPromotionCode: string |
null` fields — additive, same backward-compatibility posture as `customerId` was added in
`acct-01`. A new `previewCheckout(input)` read method returns a `PricingAdjustment` without
creating an order, for cart/checkout-summary display.

**Cart stays untouched** — no new method, no new dependency, no import of promotions. The
"discounted total before you pay" experience is served by checkout-orders'
`previewCheckout`, called from the storefront's cart/checkout page the same way `catalog` is
already called from `CartPage` today (a second async service call in the same Server
Component), not by extending `CartService` itself.

## 4. What a `Promotion` looks like

```ts
// packages/promotions/src/types.ts
export type PromotionKind = "percentage" | "fixed";
export type PromotionScope = "cart" | "product";

export interface Promotion {
  id: string;
  code: string | null; // null = automatically applied to every eligible cart, no code needed
  kind: PromotionKind;
  scope: PromotionScope;
  value: number; // percentage: 0-100; fixed: minor-unit amount in `currency`
  currency: string; // only meaningful when kind === "fixed"
  targetSkuIds: string[]; // only meaningful when scope === "product"; empty = cart scope
  minCartAmount: Money | null; // eligibility floor, cart scope only
  startsAt: string | null; // ISO 8601; null = active immediately
  endsAt: string | null; // ISO 8601; null = no expiry
  usageLimit: number | null; // null = unlimited
  redemptionCount: number;
  status: "active" | "inactive";
}
```

`PromotionRepository` (adapter pattern, in-memory reference impl matching
`createInMemoryCartRepository`'s shape). `PromotionsService.evaluate(input)` is the function
`PricingAdjuster.computeAdjustment` delegates to; it also publishes `promotions.redeemed` on
a successful, code-bearing evaluation reaching checkout completion (see open question 2) for
future BI consumption — fire-and-forget, checkout-orders never awaits or depends on this
event existing.

Validation cases `evaluate()` must reject cleanly (no throw — return the pass-through
adjustment plus a reason so the storefront can show "coupon code invalid"): unknown code,
inactive/expired/not-yet-started, usage limit reached, cart below `minCartAmount`. Stacking:
**one promotion per checkout** for this epic (either a coupon code, or the single
highest-value auto-applied non-coded promotion if none was entered) — multi-stacking is
flagged as an explicit non-goal, not a gap, mirroring how doc 09 scopes shipping/refunds out.

## 5. Risks / open questions

1. **Redemption-count race.** Two concurrent checkouts both using the last unit of a
   usage-limited coupon. Reference in-memory repository does a read-modify-write with no
   locking (same posture as every other in-memory reference repo in this codebase — sqlite/
   postgres adapters get real transactional guarantees, tracked as an adapter concern, not a
   blocker for the reference implementation). Documented as an open item, not silently
   ignored.
2. **When is `promotions.redeemed` actually published — at `startCheckout` (a payment session
   was merely *started*) or at `checkout.order.paid` (payment actually succeeded)?**
   Resolved: **at `checkout.order.paid`**, mirroring how `redemptionCount` should only reflect
   completed purchases, not abandoned checkouts. checkout-orders' existing
   `payments.payment.succeeded` subscriber (service.ts lines 46-58) is the natural place to
   also publish `checkout.order.paid`'s existing downstream — promotions subscribes to
   `checkout.order.paid` itself (event-driven, same pattern inventory uses) rather than
   checkout-orders calling back into promotions synchronously a second time. This keeps
   checkout-orders' only synchronous promotions dependency at the one `PricingAdjuster` call.
3. **Price re-validation at checkout** (doc 07 open question 2, stale cart price snapshot) is
   explicitly out of scope for this epic — unchanged pre-existing behavior, not something
   promotions needs to solve first.

## 6. Scale assessment

**Medium.** Multi-file (new package + checkout-orders types/service + storefront UI + admin
UI), multiple layers (domain/service, integration seam, two UI surfaces), single new
subsystem — not a migration, not multi-system. Proceeding directly to story decomposition
(no separate H/V planning phase) given the seam is already fully pinned down above; the four
stories below are effectively the vertical slices.

## 7. Version bump

`minor` — new package, new optional capability, zero breaking change to any existing
subsystem's public contract (`Order`'s two new fields are additive with safe defaults;
`CheckoutOrdersService`'s new `pricing` dep is optional).
