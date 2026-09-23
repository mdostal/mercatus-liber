# Design discussion: bundle-tier vs. variant-picker resolution

Resolves `commerce-gap-audit-3` §13 (`audit-findings.md`), the one finding that pass
explicitly left undecided: "does a bundle tier reference a product + let the variant
picker resolve the SKU at add-to-cart time, or does it stay SKU-pinned by design?"

## The gap, restated

`BundleTier.skuIds` is a fixed array of SKU ids chosen when a bundle is authored
(`packages/bundles/src/types.ts`). `apps/reference-storefront/lib/actions.ts`'
`addBundleTierToCartAction` used to add exactly those SKUs to cart, unconditionally.
Meanwhile the PDP (`app/demo/[demoSlug]/products/[slug]/page.tsx`) independently
resolves a *different* live SKU per request via `pdp.resolveSelection` (epic 63/
`pc-01`), driven by the shopper's variant-picker query params. The two never talked to
each other. Today this is unreachable (no live product combines a bundle with 2+
variant SKUs), but it's a real correctness bug waiting to happen: an admin bundling a
multi-variant product would always add whatever specific SKU was hardcoded at
authoring time, silently ignoring the shopper's actual on-page selection.

## The decision: resolve at add-to-cart time, per-skuId

A bundle tier's `skuIds` stays exactly as authored -- no schema/shape change to
`BundleTier` or `Bundle`. A new pure function, `resolveTierCartSkuIds` (new file
`packages/bundles/src/resolve-tier-skus.ts`, exported from the package), resolves the
tier's *authored* skuIds against the shopper's *live* PDP selection at the moment
"Add to cart" is actually submitted -- never earlier, never cached, same "always live,
never snapshotted" discipline `computeTierPricing` already uses for pricing
(`types.ts`'s `TierPricing` doc comment).

This mirrors the repo's own established pattern for exactly this class of problem,
confirmed by re-checking the other 3 merchandising subsystems before committing to it
(per the audit's own instruction not to freehand this):

- **Recommendations** resolve by `sourceProductId`, never `skuId` -- variant-agnostic
  by construction, no resolution step needed.
- **Promotions**' `targetSkuIds` already matches against a cart's *real* line-item
  `skuId`s per-variant, correctly, at evaluation time (`bundle-promotion-integration
  .test.ts`, still green) -- i.e. promotions never trust a stale/pre-resolved SKU
  either; they resolve against what's actually in the cart.
- **The PDP itself** already resolves a live SKU from a stored, non-live selection
  (query params) via `pdp.resolveSelection` at request time, never persisting a
  "the shopper wants navy" fact anywhere durable.

Bundles now follows the same shape: the *authored* data (`BundleTier.skuIds`) is a
durable reference; the *actual* SKU added to cart is resolved live, at the point of
use, against whatever context is available then (here: the PDP's current variant
selection, passed through as two hidden form fields).

## Why `skuIds` (plural) needed real care, not a naive 1:1 swap

Before assuming "swap the tier's one skuId for the shopper's selected skuId,"
`packages/bundles/src/service.ts`/`test/bundles.test.ts` were read closely.
`BundleTier.skuIds` is genuinely a list of **different products bundled together in
one tier** ("Complete Overhaul" = `[productA-sku, proSetup-sku, overhaulAddon-sku]`,
three unrelated products/services, not three variants of one product) -- confirmed by
`types.ts`'s own doc comment ("this tier includes product A one specific way + product
B") and by every seeded/tested bundle in this repo. A naive swap of the *entire*
tier's skuIds for the shopper's one selected SKU would silently drop every other
product a tier bundles in.

So `resolveTierCartSkuIds` evaluates each of a tier's skuIds **independently**. A
given skuId is only ever replaced by the shopper's active selection when *all* of:

1. that skuId's own product is exactly the product the shopper is currently viewing
   (`activeSelection.productId`) -- a different, non-selectable product bundled
   alongside it in the same tier is left untouched;
2. that product genuinely has 2+ real SKUs (`listSkusByProduct(...).length > 1`) -- a
   single-SKU product's tier skuId is already the only value it could ever be, so
   "resolving" it is defined to be a no-op (this is also what keeps every existing,
   single-SKU-per-tier bundle behavior byte-identical, whether or not an
   `activeSelection` happens to be passed).

Every other skuId in the tier passes through completely unchanged.

## Where the logic lives, and why

- **`packages/bundles/src/resolve-tier-skus.ts`** (new): the pure resolution function
  plus its own narrow `TierSkuVariantLookup` structural interface (`getSku` +
  `listSkusByProduct`). Deliberately a *separate* interface from bundles' existing
  `SkuPriceLookup` (used by `createBundle`/`updateBundle`/`computeTierPricing`) rather
  than widening that one -- `SkuPriceLookup`'s own doc comment calls it "the narrowest
  possible read dependency," and every existing caller (including every test's fake
  lookup) only ever needs `{id, price, title?}` for validation/pricing. Forcing a
  `productId`/sibling-count read onto all of those unrelated call sites would violate
  that discipline for no benefit; `@mercatus-liber/catalog`'s `CatalogService` already
  structurally satisfies the new interface too (`getSku` returns a full `Sku`, which
  has `productId`; `listSkusByProduct` already exists), so app-composition code wires
  `catalog` in directly with zero adapter object, same pattern as `skuLookup: catalog`
  in `lib/services.ts`.
- **`apps/reference-storefront/lib/actions.ts`**' `addBundleTierToCartAction`: the one
  real call site. Reads two new optional hidden form fields, `activeProductId`/
  `activeSkuId`, and passes them through to `resolveTierCartSkuIds` before adding to
  cart. This keeps the resolution decision at the app-composition layer, the same
  "bundles is deliberately NOT part of pdp's view model... composed at the app layer"
  pattern the PDP page already uses for stock/bundles/recommendations/reviews.
- **`apps/reference-storefront/components/bundle-tier-selector.tsx`**: each tier's
  `<form>` gains the two hidden fields, sourced from the same `viewModel.product.id`/
  `activeSku.id` the PDP page already resolved for its own per-SKU add-to-cart forms
  (`app/demo/[demoSlug]/products/[slug]/page.tsx`) -- no new resolution logic in the
  component itself, it stays a pure render.

## Backward compatibility

Additive by construction, verified by the regression tests below:

- `BundleTier`'s stored shape is completely unchanged -- no migration needed for
  today's data (nothing overlaps a bundle with a multi-variant product yet).
- `resolveTierCartSkuIds(tier, undefined, lookup)` (no `activeSelection`, e.g. any
  call site that never passes one) returns `tier.skuIds` completely unchanged.
- Even *with* an `activeSelection` passed, a single-SKU-per-tier bundle (every bundle
  that exists in this repo's live seed data today) is untouched, since its product's
  `siblingSkuCount` is never `> 1`.
- `computeTierPricing` is unchanged -- it still prices the tier's *authored* skuIds,
  not a resolved set. (Live pricing for a resolved multi-variant tier would need a
  second story once a real product actually combines both features; out of scope
  here, same "no live data affected" scoping the original audit finding used.)

## Regression tests

- `packages/bundles/test/resolve-tier-skus.test.ts`: unit-level proof of
  `resolveTierCartSkuIds` itself -- (a) no-op with no `activeSelection`; a
  single-SKU-per-tier bundle untouched even *with* one; a 3-different-product tier
  (the "Complete Overhaul" shape) untouched when the active selection matches none of
  them. (b) a tier pinned to one SKU of a constructed 3-SKU multi-variant product
  resolves to the shopper's newly-selected SKU; a different bundled product's skuId in
  the same tier is left alone; a product mismatch (shopper viewing a different PDU)
  leaves the tier's polo skuId alone even though that product is multi-variant
  elsewhere.
- `apps/reference-storefront/test/bundle-variant-resolution.test.ts`: full real-wiring
  integration test (real `catalog`/`bundles`/`cart` services, same DI shape as
  `lib/services.ts` and `bundle-promotion-integration.test.ts`) -- (a) a single-SKU
  product's bundle tier adds the same one skuId as before; (b) a tier authored against
  one SKU of a constructed 2-variant product ends up adding the shopper's
  newly-selected variant's SKU to the cart, not the originally-hardcoded one.

## Live demo verification

No live product in any of the 3 demos combines a bundle with a multi-variant product
today (confirmed again while implementing this fix, same finding as the original
audit pass) -- so there is no way to click through this fix live on
`commerce.mdostal.com` without first seeding a new demo product+bundle combination
purely to exercise it. Given the regression tests above already prove the fix
correctly at both the unit and real-service-wiring level, a deploy-only-to-demo-a-gap
seed was judged not worth the scope creep for a currently-unreachable code path; this
is recorded as a deliberate choice, not an oversight -- see the epic-backlog row for
this story for the final disposition.
