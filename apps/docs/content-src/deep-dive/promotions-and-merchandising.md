# Promotions & Merchandising

Four subsystems sit under this one heading: **promotions** (coupon codes and percentage/fixed
discounts), **bundles** (multi-product tiered packages), **recommendations** (admin-curated
"customers also bought" shelves), and **advertising** (campaign/creative rotation for CMS ad
slots). None of them are one big "merchandising" package — they're four small, independent
`@mercatus-liber/core`-only packages that a shopper experiences as one coherent layer on top of
catalog and cart, without any of catalog or cart's own types ever being forked or extended to
know about them.

## Why four packages instead of one

Each of these capabilities could have been bolted onto catalog or cart directly — a `discount`
field on `Product`, a `bundleTierId` on `CartItem`, and so on. That's the shape most commerce
platforms end up with, and it's why their core data models accrete special cases for every
merchandising feature anyone ever asked for. Mercatus Liber's core prime directive (see
[Architecture](/architecture)) is that no subsystem imports another subsystem's internals, and
these four packages are the clearest proof that discipline actually pays off:

- **Promotions** never imports cart, checkout-orders, or catalog. Product-scope discounts store
  bare `skuId` strings and match them against a cart's own line items (also bare strings) at
  evaluation time — no catalog reference, no join.
- **Bundles** declares its own narrow `SkuPriceLookup` interface (just `getSku(id)`) rather than
  importing `@mercatus-liber/catalog`. Catalog's real `CatalogService` happens to satisfy that
  shape already, so no adapter object is needed — this is the same *structural* typing pattern
  used everywhere else in the codebase (see [Adapters & Portability](/deep-dive/adapters-and-portability)).
- **Recommendations** and **advertising** are thinner still: they store plain product ids /
  targeting strings and never validate or resolve them against catalog, CMS, or service-areas at
  all. A stale id just silently drops off the rendered shelf at read time — the app-composition
  layer (`apps/reference-storefront`) is the one place that resolves ids into real products.

The payoff: any one of these four packages can be deleted from a deployment and nothing else
breaks. A store that doesn't want bundles just never wires `@mercatus-liber/bundles` into its
`services.ts` — catalog, cart, and checkout behave identically either way.

## Promotions: coupon codes and auto-applied discounts

A `Promotion` is either a coupon code the shopper types in, or an auto-applied discount (`code:
null`) that's live whenever its eligibility window and minimum-cart-amount are satisfied. Scope
is either `cart` (whole-order percentage or fixed amount) or `product` (targeting specific
`skuId`s). The interesting design decision is in how `evaluate()` behaves — it never throws for
an invalid, expired, or exhausted code, because "this coupon didn't work" is expected
shopper-facing UX, not an error state:

```ts
// packages/promotions/src/types.ts
export type RejectionReason =
  | "unknown_code"
  | "expired"
  | "not_yet_active"
  | "usage_limit_reached"
  | "below_minimum"
  | "none";
```

`PromotionsService.evaluate()` (`packages/promotions/src/service.ts`) is a pure computation over
cart line items plus an optional coupon code — it returns adjusted per-line amounts, a discount
total, and either the applied code or a rejection reason. It doesn't know what an "order" is;
bookkeeping (crediting a redemption count) happens separately, through
`recordAppliedPromotion()`, called only once checkout-orders actually creates an order from that
evaluation.

Checkout-orders never imports promotions directly. Instead, it declares its own narrow
`PricingAdjuster` interface in `packages/checkout-orders/src/types.ts`, and
`apps/reference-storefront/lib/services.ts` is the one place that wires the two together — a
small adapter bridging the two services' slightly different field shapes:

```ts
// apps/reference-storefront/lib/services.ts
const checkout = createCheckoutOrdersService({
  repository: createInMemoryOrderRepository(),
  cart,
  payments,
  events,
  pricing: {
    async computeAdjustment(input) {
      const evaluation = await promotions.evaluate(input);
      if (evaluation.appliedCode && evaluation.appliedPromotionId) {
        promotionIdByAppliedCode.set(evaluation.appliedCode, evaluation.appliedPromotionId);
      }
      return {
        items: evaluation.items,
        discountTotal: evaluation.discountTotal,
        total: evaluation.total,
        appliedCode: evaluation.appliedCode,
      };
    },
    async recordApplication(input) {
      const promotionId = promotionIdByAppliedCode.get(input.appliedCode);
      if (!promotionId) return;
      await promotions.recordAppliedPromotion({
        orderId: input.orderId,
        promotionId,
        discountAmount: input.discountAmount,
      });
    },
  },
});
```

Because `PricingAdjuster` is optional on `CheckoutOrdersService`, a deployment that never wires
promotions in gets a built-in zero-discount pass-through — no behavior change, no crash.
Redemption counts only increment on `checkout.order.paid` (a completed purchase), never on
`checkout.order.placed` (a merely-started checkout), so an abandoned cart never burns a
limited-use coupon's usage slot.

## Bundles: tiered multi-product packages

A `Bundle` attaches to one base product and defines an ordered list of `BundleTier`s — free-text
labels like "Product Only" / "+ Pro Setup" / "Complete Overhaul" — each an explicit list of
constituent `skuId`s. Selecting a tier doesn't create a new kind of cart line; it becomes N
ordinary `cart.addItem()` calls, one per constituent SKU, orchestrated by the reference
storefront's app layer. Bundles never becomes a new line-item shape that cart, checkout-orders,
promotions, or inventory has to learn.

The other notable decision is that a tier's price is never cached. `computeTierPricing()`
recomputes the sum of the tier's constituent SKUs' *current* catalog prices on every call:

```ts
// packages/bundles/src/service.ts
async computeTierPricing(bundleId: string, tierId: string): Promise<TierPricing | null> {
  const bundle = await repository.get(bundleId);
  if (!bundle) return null;
  const tier = bundle.tiers.find((t) => t.id === tierId);
  if (!tier) return null;

  const lines = [];
  for (const skuId of tier.skuIds) {
    const sku = await skuLookup.getSku(skuId);
    if (!sku) throw new BundleSkuNotFoundError(skuId);
    lines.push({ skuId: sku.id, title: sku.title ?? sku.id, unitAmount: sku.price });
  }
  // ... currency-mismatch guard, then sum lines into a single Money total
}
```

That "always live, never snapshotted" choice guarantees the PDP's displayed tier price and the
cart's actual line-item total can never drift apart — both read the exact same catalog SKU
prices, just at slightly different moments. Want a discounted bundle price? That's not a second
discount mechanism inside bundles — it's a product-scope **promotion** targeting the tier's
`skuIds`, reusing the machinery described above instead of duplicating it.

## Recommendations: admin-curated cross-sell

`RecommendationRule` is deliberately the thinnest of the four: an admin maps one
`sourceProductId` to an ordered list of `targetProductIds`, with a free-text `label` ("Customers
also bought", "Frequently bought together") and a `placement` (`pdp` | `cart` | `both`). Unlike
promotions and bundles, this package never validates that those ids currently resolve in
catalog — a stale id just silently drops off the shelf at render time, which keeps
`RecommendationsService.getRecommendationsForProduct()` genuinely dependency-free:

```ts
// packages/recommendations/src/types.ts
export interface RecommendationRule {
  id: string;
  sourceProductId: string;
  label: string;
  placement: RecommendationPlacement;
  targetProductIds: string[];
  status: RecommendationRuleStatus;
}
```

This is admin-curated, not inferred. There's no co-purchase or co-view scoring — analytics
(subsystem 13) has no queryable read side today (see
[Business Intelligence & Analytics](/deep-dive/business-intelligence-and-analytics)), so a
same-category fallback for products with no curated rule is naive, app-composed orchestration
in `apps/reference-storefront`, not a signal this package computes itself.

## Advertising: campaign and creative rotation

Advertising fills CMS's `ad-slot` component (subsystem 05) with real content. A `Campaign` has
an ordered list of `Creative`s, an optional `startsAt`/`endsAt` date range, and optional
`serviceAreaId`/`pageSlug` targeting (either dimension `null` means "matches anything").
`getActiveCreativeForSlot()` resolves every currently-eligible campaign, flattens their
creatives into one list, and does a **stateless weighted-random pick** — no persisted rotation
state, recomputed fresh on every call:

```ts
// packages/advertising/src/service.ts
async getActiveCreativeForSlot(input: GetActiveCreativeForSlotInput): Promise<ActiveCreativeResult | null> {
  const now = input.now ?? new Date();
  const random = input.random ?? Math.random;

  const campaigns = await repository.list();
  const eligibleCampaigns = campaigns.filter((campaign) =>
    isEligible(campaign, { pageSlug: input.pageSlug, serviceAreaId: input.serviceAreaId, now }),
  );

  const entries = eligibleCampaigns.flatMap((campaign) =>
    campaign.creatives.map((creative) => ({ campaign, creative })),
  );
  if (entries.length === 0) return null;

  const weights = entries.map((entry) => effectiveWeight(entry.creative));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const point = random() * totalWeight;
  // ... walk the cumulative-weight table and return the winning entry
}
```

`now` and `random` are both injectable, which is what makes both the date-range eligibility and
the weighted pick itself deterministically testable — a real production call just omits both and
gets `new Date()` / `Math.random`. This is intentionally *not* a real ad-serving system: no
bidding, no budget pacing, no click-through-optimized rotation. It's an in-house promotional
placement manager for a store's own campaigns, matching the actual size of the problem a small
store has.

## Further reading

- [Subsystem 16 — Promotions & Discounts](/subsystems/16-promotions)
- [Subsystem 17 — Bundles](/subsystems/17-bundles)
- [Subsystem 18 — Recommendations (Upsell / Cross-sell)](/subsystems/18-recommendations)
- [Subsystem 19 — Advertising](/subsystems/19-advertising)
- Planning corpus: [promotions-discounts](/planning/promotions-discounts),
  [bundles](/planning/bundles), [upsell-cross-sell](/planning/upsell-cross-sell),
  [advertising](/planning/advertising)
