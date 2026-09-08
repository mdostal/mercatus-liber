# Design Discussion — Epic 21: `bundles`

## 0. Prelude

**Source:** backlog epic 21 (`.pHive/planning/epic-backlog.md`), identified by epic 17's
commerce-gap audit, backlogged 2026-09-08, planned 2026-09-08 immediately after epic 20
(`promotions-discounts`, merged to master). Real-world acceptance shape: All That Technology's
confirmed PDP direction is a 3-tier package selector ("Product Only" / "+ Pro Setup" /
"Complete Overhaul") — see `~/Documents/work/clients/att-recreation-internal/docs/what-this-uses-and-doesnt.md`
lines 26-31, which explicitly flagged this as epic 21's job and was deliberately **not** faked
in that internal-only recreation.

**Prior-decision constraint found in an existing subsystem doc:** `docs/subsystems/04-pdp.md`
open question 1 (line 39-40): *"Does the PDP data contract need to support 'bundle' products
(multiple SKUs sold as one purchasable unit) at v1, or is that a documented future extension?"*
This epic resolves that open question directly (see §5).

## 1. Goal

Let a shopper buy a curated set of SKUs as a single purchasable selection from one PDP — a
"tier" (Product Only / + Pro Setup / Complete Overhaul is the acceptance shape, but the
mechanism is generic N-tier) — with an admin CRUD to define bundles, without reshaping any
existing subsystem's per-SKU contracts (`Cart`/`CartItem`, `OrderLineItem`,
`PricingAdjuster`, inventory's per-SKU decrement loop).

## 2. Research findings (grounding)

- **Zero prior art.** `Product`/`Sku` are strictly one-SKU-per-product
  (`packages/core/src/schema.ts:32-39`, `Sku.productId: string` singular); `CartItem` is
  strictly one-`skuId`-per-line (`packages/cart/src/types.ts:3-8`); `OrderLineItem` likewise
  (`packages/checkout-orders/src/types.ts:3-7`). Grepping `bundle|kit|composite` across
  `packages/`/`apps/` returns only unrelated hits (`ThemeBundle` — a theming/layout grouping,
  totally unrelated; generic "bundle of repositories" prose). No multi-SKU-per-purchase
  concept exists anywhere today.
- **`packages/core/src/schema.ts:1-6`** is explicit: *"No subsystem may fork or duplicate
  these shapes; every subsystem's own entities... reference these types by id, never by
  re-declaring them."* — a hard constraint against extending `Product`/`Sku` themselves with a
  new multi-SKU concept; a peer subsystem referencing SKUs **by id** is the compliant shape.
- **The add-to-cart path today is one `skuId` + one `quantity`, always.** Both PDP layout
  templates render one `<form>` per SKU (`components/pdp-tabbed-detail.tsx:34-49`,
  `components/pdp-long-scroll.tsx:31-47`); `addToCartAction`
  (`apps/reference-storefront/lib/actions.ts:13-20`) reads exactly one `skuId` from
  `FormData`. There is no existing tier/variant-picker UI to extend — this epic adds the first
  one.
- **checkout-orders/promotions/inventory all operate on flat, per-SKU line items with zero
  grouping concept** (`OrderLineItem`, `PricingAdjuster.computeAdjustment`'s `items[]`,
  inventory's `registerInventorySync` looping `order.items[]` by bare `skuId`+`quantity`,
  `packages/inventory/src/subscriber.ts:11-42`). Representing a bundle tier as **N ordinary
  SKU-level cart lines, added in one orchestrated action**, means every one of those
  subsystems needs **zero code changes** — each constituent SKU just becomes one more line in
  a cart/order they already know how to iterate.
- **The PDP page already composes multiple services at the app layer, not inside subsystem
  04 itself** — stock is fetched in `apps/reference-storefront/app/products/[slug]/page.tsx`
  (lines 42-50) specifically *because* it isn't part of `pdp`'s view model, with a code
  comment naming this "the app composes multiple services" pattern explicitly. This is the
  precedent for how bundles gets composed onto the PDP page too (see §5).
- **Admin CRUD convention confirmed unchanged** from epic 20:
  `apps/reference-storefront/app/admin/promotions/{page.tsx,new/page.tsx,[id]/page.tsx,PromotionFormFields.tsx}`
  + `lib/actions.ts`'s `"use server"` action + `revalidatePath` pattern — directly mirrorable
  for `/admin/bundles`.

## 3. The design question, resolved: own peer subsystem, add-N-SKUs orchestration — not a `Product`/`Sku` extension

**Decision: new subsystem, `bundles` (package `@mercatus-liber/bundles`), subsystem 17 in
`docs/subsystems/`.** A `Bundle` references one base `Product` and defines an ordered list of
`BundleTier`s, each an explicit, full list of `skuIds` to add to the cart when that tier is
selected (not a delta from the previous tier — an explicit list avoids any accumulation
ambiguity). `packages/bundles` depends on `@mercatus-liber/core` only, and declares its own
narrow `SkuPriceLookup` structural interface (satisfied by catalog's `CatalogService`, never
imported directly) to validate `skuId`s and compute a tier's display price as the **sum of its
constituent SKUs' own catalog prices** — never a separate override field (see §4 for why).

**"Add a tier to cart" is app-layer orchestration, not a new cart capability:** a new
`addBundleTierToCartAction` server action (mirroring `addToCartAction`) resolves the tier's
`skuIds` via the bundles service, then calls the *existing* `cart.addItem(cartId, skuId, 1)`
once per SKU — cart's `CartItem`/`CartService` are untouched, exactly the "N ordinary SKU-level
cart lines" approach the research grounds. checkout-orders, promotions, and inventory all see
those lines as indistinguishable from any other multi-item cart and require **zero code
changes** — a stronger decoupling result than promotions' own integration (epic 20 needed one
new optional interface on checkout-orders; bundles needs none).

**Why not extend `Product`/`Sku`:** `packages/core/src/schema.ts`'s own header forbids
subsystems from forking these shapes; a `Sku.productId` is singular by design (one SKU belongs
to exactly one product), and every downstream consumer (cart, checkout-orders, promotions,
inventory, PDP) is built and tested against that single-product-per-SKU invariant. Bundling is
a **cross-product commerce concept** layered on top of catalog, not a catalog-internal
concept — the same category of reasoning that kept promotions out of cart.

**Why not a `CartItem` grouping field:** cart's own doc (`docs/subsystems/07-cart.md` lines
25-29) already declares higher-order commerce concepts out of scope; forcing every consumer of
`CartItem`/`OrderLineItem` to learn an optional `bundleRef` field would be a wider blast radius
for zero behavioral gain over "the constituent SKUs are just N lines" — a shopper's receipt
showing 3 separate lines for a "Complete Overhaul" tier is normal, legible commerce UX (this is
exactly how real POS/e-commerce systems itemize bundle contents), not a gap to paper over.

## 4. Pricing: sum-of-parts only, no separate bundle-discount mechanism (v1 scope)

A tier's displayed price is **always** the live sum of its constituent SKUs' current catalog
prices (computed on read, never cached/snapshotted into the `Bundle` record itself) — this
guarantees the PDP's displayed tier price and the cart's actual line-item total can never
drift out of sync, since both ultimately read the same catalog SKU prices.

**Explicitly not this epic's job:** a bundle-specific flat/discounted tier price. Epic 20
already shipped exactly the mechanism a deployment needs for "these SKUs together cost less
than list" — a **product-scope promotion** (`packages/promotions`) targeting the tier's
`skuIds`. Wiring bundles' own second, parallel discount concept would duplicate promotions'
job; instead this is documented as a deliberate composition point (§6 open question 1) for a
deployment to combine bundles (which SKUs) with promotions (what discount), reusing existing,
already-tested infrastructure rather than inventing new pricing math inside bundles.

## 5. Resolving PDP's open question 1

**Answer: a documented future extension for subsystem 04's own data contract — v1 handles it
entirely at the app-composition layer, the same way stock already does.** `packages/pdp`'s
`PdpViewModel`/`ProductLookup` are untouched by this epic. The reference-storefront's product
page (`apps/reference-storefront/app/products/[slug]/page.tsx`) gains one more parallel service
call — `bundles.getBundleForProduct(viewModel.product.id)` — composed alongside the existing
stock-lookup composition already present there (lines 42-50), and a new
`<BundleTierSelector>` component renders instead of (or alongside) the normal per-SKU
add-to-cart form when a bundle exists for that product. This keeps subsystem 04's actual
data/behavior contract additive-free, matching the file-header rule that no subsystem forks
`@mercatus-liber/core`'s shapes and the PDP doc's own "app composes multiple services"
precedent — `docs/subsystems/04-pdp.md`'s open question 1 is updated (not deleted) to record
this resolution, in case a future epic needs bundles folded directly into `PdpViewModel` at
larger scale.

## 6. Open questions

1. **Composing bundles with promotions for an actual below-sum-of-parts tier price** is a
   real, legitimate deployment need (a real client bundle discount) — deferred, not
   forgotten: an admin can already create a product-scope promotion targeting a tier's
   `skuIds` today using epic 20's existing admin UI; a future, small epic could add a "this
   promotion recognizes tier X of bundle Y" convenience link, but the underlying discount math
   needs no new subsystem work.
2. **Constituent-SKU stock exhaustion mid-tier** (one SKU in a 3-SKU tier goes out of stock):
   handled identically to any other multi-item cart today — inventory rejects/flags each line
   independently; no special "the whole tier becomes unavailable" UX is built in v1. Documented
   as an accepted gap, not silently ignored.
3. **Tier ordering/labels are admin-authored free text**, not a constrained enum — "Product
   Only" / "+ Pro Setup" / "Complete Overhaul" is the acceptance shape, not a hardcoded
   vocabulary; any deployment can name its own tiers.

## 7. Scale assessment

**Medium.** Multi-file (new package + PDP-page composition + admin UI), multiple layers, one
new subsystem, zero changes required to any existing subsystem's public contract (a *stronger*
decoupling result than epic 20's, which needed one new optional interface on checkout-orders).
Proceeding directly to story decomposition.

## 8. Version bump

`minor` — new package, new optional capability, zero breaking change to any existing
subsystem (cart, checkout-orders, promotions, inventory, and PDP's own package are all
byte-identical after this epic; only the reference-storefront app composes the new subsystem
in).
