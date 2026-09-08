# Design Discussion — Epic 22: `upsell-cross-sell`

## 0. Prelude

**Source:** backlog epic 22 (`.pHive/planning/epic-backlog.md`), identified by epic 17's
commerce-gap audit, backlogged 2026-09-08, planned immediately after epics 20
(`promotions-discounts`) and 21 (`bundles`), both merged to master. Explicitly scoped as
distinct from marketing-catalog's `SuggestionRule`, which suggests *categories* for a product
(an admin-curation aid), never other products for a shopper.

## 1. Goal

"Customers also bought" / "you might also like" product recommendations on the PDP and cart
page — a genuinely new, shopper-facing product-to-product recommendation surface, without
reshaping catalog, cart, or marketing-catalog's existing contracts.

## 2. Research findings (grounding)

- **`SuggestionRule` is category-shaped, not product-shaped, by construction.**
  `packages/marketing-catalog/src/types.ts:43-56` — `{ attributeKey, attributeValue?,
  categorySlug }`, consumed by `MarketingCatalogService.suggestCategories(productId)`
  (`service.ts:99-118`), which matches **one product's own catalog attributes** against
  admin rules to suggest **categories to assign that product to** — an admin-curation aid for
  `assignProductToCategory`, never a product-to-product relationship. Confirmed unused
  anywhere in the app today (zero hits for `SuggestionRule`/`suggestCategories` across
  `apps/reference-storefront`). This cleanly confirms epic 22 is a different concept, not an
  overlapping one.
- **"Same category, other products" is already cheaply queryable with an established call
  pattern**, live today on the category page
  (`apps/reference-storefront/app/category/[slug]/page.tsx:8-15`):
  `marketingCatalog.getCategoryBySlug` → `listProductIdsInCategory` →
  `Promise.all(catalog.getProduct)`. No new read path is needed in catalog/marketing-catalog
  for a "same category" fallback heuristic.
- **Analytics has no read side — a genuinely data-driven recommender is not buildable from
  existing infrastructure.** `packages/analytics`'s entire public surface
  (`packages/analytics/src/types.ts:6-10`) is `track`/`identify`/`page` — write-only calls
  into whatever adapter is configured (PostHog by default,
  `packages/analytics/src/posthog-adapter.ts:16-42`, wrapping `client.capture`). There is no
  query/read module, no repo-owned event store, and `docs/subsystems/13-analytics-tracking.md`
  explicitly states analytics is a one-directional subscriber that no other subsystem may
  depend on. Product-view events (`product_viewed`) are fired client-side straight into
  PostHog's hosted API, not captured into any queryable local store. Building a real
  co-view/co-purchase engine would mean a whole new event-sourced read model duplicating what
  analytics already forwards — a much larger, separate undertaking, not this epic's job.
- **PDP and cart pages already establish the exact composition pattern to reuse.** The PDP
  page (`apps/reference-storefront/app/products/[slug]/page.tsx`) composes `bundles` and
  `inventory` alongside `pdp`'s own view model as parallel, no-op-when-absent service calls
  (epic 21's own precedent, cited directly in its design discussion §5). The cart page
  (`apps/reference-storefront/app/cart/page.tsx`) composes `cart`+`catalog`+`checkout` today
  but has no recommendation composition yet — this epic adds the first one there.
- **Core-schema's file-header rule still applies** (`packages/core/src/schema.ts:1-6`): no
  subsystem may fork `Product`/`Sku`; a recommendation record must reference `productId`s by
  bare string id, resolved via catalog at read time, never duplicating title/price fields.
- **Both sibling epics' packages are core-only dependencies**
  (`packages/promotions/package.json`, `packages/bundles/package.json`), each declaring its
  own narrow structural interface onto catalog data rather than importing catalog directly.

## 3. The design question, resolved: admin-curated explicit links + an app-composed "same category" fallback — not an inferred/analytics-driven engine

**Decision: new subsystem, `recommendations` (package `@mercatus-liber/recommendations`),
subsystem 18.** A `RecommendationRule` is an admin-authored, explicit mapping from one source
product to an ordered list of target product ids, with a `label` (free text — "Customers also
bought", "Frequently bought together", "You might also like") and a `placement` (`pdp` |
`cart` | `both`). The package depends on `@mercatus-liber/core` only, mirroring
promotions/bundles exactly; it does not import catalog, cart, or analytics.

**Why admin-curated, not inferred/computed:** the research is unambiguous — there is no
queryable read side to analytics data anywhere in this repo today, and building one is a
separate, much larger undertaking (a new event-sourced aggregation subsystem) that isn't this
epic's scope. This mirrors exactly how promotions (epic 20) shipped explicit coupon rules
rather than inventing dynamic pricing algorithms, and bundles (epic 21) shipped explicit
admin-authored tiers rather than inferring "what goes together" — the established posture in
this repo is: ship a real, useful, explicit v1 rather than a half-built inference pipeline.

**Why a "same category" fallback lives at the app layer, not inside the package:** the
`recommendations` package itself only ever knows about curated `RecommendationRule` records —
keeping it as narrowly scoped as promotions/bundles. The reference-storefront's PDP and cart
pages, when a product has no curated rule, fall back to the same
`marketingCatalog.listCategoriesForProduct` → `listProductIdsInCategory` call chain the
category page already uses (§2), composed the same way stock/bundles already are. This keeps
`packages/recommendations` dependency-clean (core-only) while still giving every product a
reasonable recommendation surface from day one, not just ones an admin has gotten to yet — the
fallback is app-composed orchestration, not a new package dependency on marketing-catalog.

**PDP integration:** `apps/reference-storefront/app/products/[slug]/page.tsx` gains one more
parallel, no-op-when-absent service call —
`recommendations.getRecommendationsForProduct(productId, "pdp")` — composed alongside the
existing stock/bundles composition, exactly matching epic 21's own precedent. When no curated
rule exists, the page falls back to the same-category heuristic. `packages/pdp`'s own
`PdpViewModel`/`ProductLookup` contract stays untouched, same resolution shape as PDP's open
question 1 in epic 21.

**Cart integration:** `apps/reference-storefront/app/cart/page.tsx` gains a new composition —
for each cart line's resolved `productId`,
`recommendations.getRecommendationsForProduct(productId, "cart")`, union targets across all
cart lines, dedup, and exclude any product already in the cart. Falls back to the same-category
heuristic per cart line when no curated rule exists for that line's product. `packages/cart`
itself is untouched — recommendations never becomes a cart-owned concept, matching the "cart
stays a dumb SKU+quantity ledger" posture already established in `docs/subsystems/07-cart.md`.

## 4. Open questions

1. **A genuinely data-driven (co-view/co-purchase) recommender** is a real, larger future
   capability — deferred, not forgotten. It would need a new, purpose-built event-sourced read
   model (its own subscriber re-consuming the same bus topics analytics forwards, its own
   aggregation/staleness story), which is a substantially bigger undertaking than this epic;
   documented here so a future epic doesn't have to re-derive that analytics currently has no
   read side.
2. **Fallback heuristic quality** ("same category, exclude self") is intentionally naive — no
   ranking, no personalization, first-N by whatever order `listProductIdsInCategory` returns.
   Good enough to guarantee every product has *some* recommendation shelf; refining ranking is
   out of scope for v1.
3. **Placement enum (`pdp`/`cart`/`both`) is a simple flat field**, not a more general
   targeting system — matches bundles' "free text label, no hardcoded vocabulary beyond the
   mechanism itself" posture.

## 5. Scale assessment

**Medium.** Multi-file (new package + PDP/cart page composition + admin UI), multiple layers,
one new subsystem, zero changes required to catalog, cart, checkout-orders, promotions, or
bundles' public contracts. Proceeding directly to story decomposition.

## 6. Version bump

`minor` — new package, new optional capability, zero breaking change to any existing
subsystem.
