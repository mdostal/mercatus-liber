# Subsystem 17 — Bundles

## Purpose
Multi-product bundles sold as a single purchasable selection: a `Bundle` references one base
`Product` and defines an ordered list of `BundleTier`s (e.g. "Product Only" / "+ Pro Setup" /
"Complete Overhaul" — the acceptance shape from a real client's confirmed PDP direction), each
an explicit list of constituent SKU ids. Selecting a tier adds one ordinary cart line per
constituent SKU — bundles never becomes a new line-item shape any other subsystem has to learn.

## Depends on
`@mercatus-liber/core` only. Declares its own narrow `SkuPriceLookup` structural interface
(satisfied by catalog's `CatalogService`, never imported directly) to validate `skuId`s and
compute a tier's live sum-of-parts price. Never imports cart, checkout-orders, promotions, or
inventory — and none of them ever import bundles either. "Add a tier to cart" is app-layer
orchestration (the reference-storefront calls `cart.addItem` once per constituent SKU), not a
structural dependency bundles declares on cart.

## Responsibilities
- `Bundle` entity: id, the base `productId`, title, an ordered `tiers: BundleTier[]`, status.
- `BundleTier`: id, label (free text — no hardcoded tier vocabulary), the full `skuIds[]` to add
  to cart when selected (explicit per tier, not a delta from the prior tier).
- `BundleRepository` (adapter pattern, as everywhere else) + in-memory reference implementation.
- `BundlesService.getBundleForProduct(productId)` — the PDP-facing read used to decide whether
  to render the tier selector at all.
- `BundlesService.computeTierPricing(bundleId, tierId)` — live sum of the tier's constituent
  SKUs' current catalog prices via `SkuPriceLookup`, computed on read, never cached into the
  `Bundle` record — guarantees the PDP's displayed price and the cart's actual line-item total
  can never drift, since both read the same catalog SKU prices.
- Admin CRUD for bundles (`/admin/bundles`).

## Explicitly NOT this subsystem's job
- A bundle-specific discounted/flat tier price — that's a product-scope promotion (subsystem
  16) targeting the tier's `skuIds`, reusing already-shipped infrastructure rather than a
  second, parallel discount mechanism inside bundles. See
  `.pHive/epics/bundles/docs/design-discussion.md` §4 for the full reasoning.
- Owning cart state or a new `CartItem` shape — cart (07) stays untouched; a selected tier
  becomes N ordinary `cart.addItem` calls, one per constituent SKU, orchestrated at the
  reference-storefront app layer.
- Changing `packages/pdp`'s own `PdpViewModel`/`ProductLookup` contract — resolves PDP's open
  question 1 (`docs/subsystems/04-pdp.md`) by composing bundles data at the app layer instead,
  the same established pattern stock-lookup already uses on the product page.
- Special inventory handling for "1 bundle unit" — each constituent SKU decrements
  independently via inventory's existing per-line-item event subscriber; no code change needed
  there.

## Decoupling notes
`packages/bundles`'s only dependency is `@mercatus-liber/core`; its only read dependency on
catalog is the narrow `SkuPriceLookup` interface it declares itself. Verify via
`grep -rn "@mercatus-liber/bundles" packages/cart packages/checkout-orders/src
packages/promotions/src packages/inventory/src packages/pdp/src` before merge — every one of
those must return zero hits; bundles is consumed only by
`apps/reference-storefront` (the composition root).

## Open questions
1. Composing bundles with promotions for a genuine below-sum-of-parts tier price — an admin
   can already do this today via a product-scope promotion targeting a tier's `skuIds`; a
   future, small epic could add a UI convenience linking a promotion to a specific bundle
   tier, but no new subsystem-level work is required for the underlying discount math.
2. Constituent-SKU stock exhaustion mid-tier is handled the same as any other multi-item cart
   today (each line independently) — no "the whole tier becomes unavailable" UX in v1.
