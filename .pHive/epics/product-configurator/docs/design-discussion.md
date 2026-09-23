# Design discussion: product-configurator (epic 63)

## 1. Why this epic, and why now

Explicitly deferred from the `sanity-challenge-commerce-copilot` epic (row 59 in
`.pHive/planning/epic-backlog.md`), per the user's own choice at that epic's scope-cut:
"the full product-configurator (attribute-matrix -> SKU picker + admin combination rules)
... real, well-grounded, de-risked (`resolveSelection`/`generateSkus` already exist as
unused scaffolding), but core catalog/PDP work, not a Sanity integration, and out of scope
for the Oct 4 deadline." That deadline work is done, submitted for user review, and
correctly not something I autonomously merge/publish (publish is explicitly user-gated).

This is picked up now as part of the standing "keep looping and going until you've bled
through the ENTIRE backlog" directive. A full backlog sweep (2026-09-22) found every other
row either **done**, or **blocked on the user** (real external credentials/API keys the
user hasn't provided, or an explicit user go-ahead to publish). `product-configurator` is
the one item that is real, scoped, explicitly pre-approved, and has zero external
dependency -- the only genuinely unblocked build-worthy work left.

**Not in conflict with row 47's roadmap deferral.** Row 47 (`vision-and-community-roadmap`)
deferred generic "product personalization/customizer" to community-plugin territory as a
default stance. Row 59 shows the user explicitly asked for this specific attribute-matrix
variant-picker feature and explicitly chose to defer it to its own follow-on epic rather
than decline it -- a specific, granted exception to the general community-plugin default,
the same pattern as row 49's reviews reversal.

## 2. What's already real (verified by reading the actual code, not assumed)

- `packages/core/src/schema.ts`: `IdentifyingAttribute { key, value }`, `Sku.identifyingAttributes`
  (must contain exactly one entry per `Product.identifyingAttributeKeys`).
- `packages/catalog/src/service.ts`: `generateSkus(productId, valuesByKey, price, exclude?)` --
  a real cartesian-product SKU generator (`cartesianProduct` helper), already exercised by
  real seed data. `resolveVariant(productId, selection)` -- finds the one SKU whose
  identifying attributes exactly match a selection.
- `packages/pdp/src/service.ts`: `PdpService.resolveSelection` -- delegates entirely to
  `catalog.resolveVariant` ("never reimplements variant matching", per its own doc
  comment). `PdpService.getViewModel` already computes `optionValues` (the distinct
  available value per identifying-attribute key, derived from the product's real SKUs, via
  `packages/pdp/src/option-values.ts`'s `computeOptionValues`) and returns it as part of
  `PdpViewModel`.
- **The real, confirmed gap**: `resolveSelection` has zero call sites outside its own
  package's tests (`grep -rln "resolveSelection" apps/` returns only
  `lib/services.ts`'s service-construction wiring -- never a route/component). The PDP page
  (`apps/reference-storefront/app/demo/[demoSlug]/products/[slug]/page.tsx`) passes the
  full `viewModel.skus` array straight through to whichever template renders it.
  `pdp-long-scroll.tsx` (confirmed by reading it directly) renders `optionValues` as a
  **static, read-only `<ul>`** ("Available options: color: red, blue / size: S, M, L") and
  then lists **one entire `<form>` with its own "Add to cart" button per SKU**, stacked
  vertically. For a product with real color+size variance this means N separate buy-boxes
  on one page -- never an interactive "pick color, pick size, one price/stock/button
  updates to match" experience. `pdp-spec-sheet.tsx`/`pdp-tabbed-detail.tsx` don't reference
  `optionValues` at all today.
- Real seed data already has multi-SKU products: `apps/reference-storefront/lib/seed.ts`'s
  `DEMO_VARIANT_PRODUCTS` (`identifyingAttributeKeys: ["color", "size"]`) generate one real
  SKU per size tier -- **but every tier of a given product shares the same fixed `color`**,
  so no seeded product today actually varies on two axes at once. The picker this epic
  builds needs at least one product, in at least one demo, that varies on 2+ axes for real
  (e.g. 2 colors x 3 sizes = 6 real SKUs) to prove the feature does what it claims.

## 3. Scope

**In scope:**
1. A real, interactive variant-picker UI component: one control per identifying-attribute
   key (native `<select>` or a radio/swatch group -- real form controls, not
   click-div-only, for accessibility and no-JS-degradation), that resolves the current
   selection to exactly one SKU and updates the shown price/stock/Add-to-cart target to
   match -- replacing the current "list every SKU as its own buy-box" pattern for any
   product with more than one SKU. A single-SKU product renders exactly as it does today
   (no picker chrome added for a product that has nothing to pick).
2. Wiring `pdp.resolveSelection` into this real, so it's genuinely exercised (not dead code
   again) -- the implementation detail (client-side match over the already-fetched SKU list
   vs. a server round trip per selection change) is an implementation choice for story
   pc-01, not dictated here; either way, `resolveSelection`/`resolveVariant` must have a
   real, live call site by the end of this epic, and cart submission must go through the
   resolved SKU id exactly as `addToCartAction` already expects.
3. Applying the picker across all 3 real PDP templates (`pdp-tabbed-detail`,
   `pdp-long-scroll` incl. its editorial variant, `pdp-spec-sheet`) so every demo/theme
   combination gets the real interactive experience, not just one template.
4. At least one real 2-axis (or more) seeded variant product, in at least one demo, so the
   picker is demoed against genuine multi-axis data.
5. A minimal real admin surface for the "admin combination rules" half of the original ask
   (row 59's own phrasing) -- letting an admin see a product's existing SKU matrix and add
   new combinations via `catalog.generateSkus`, mirroring this repo's existing plain-HTML
   admin-CRUD convention (bundles/advertising/promotions all already do this; no new UI
   framework).

**Out of scope (explicitly, so no scope creep):**
- No new core schema fields. `IdentifyingAttribute`/`Sku` already support this fully.
- No change to `generateSkus`/`resolveVariant`'s own logic -- both are already correct and
  tested; this epic is entirely about giving them real call sites.
- No inventory-adapter changes -- stock-by-sku lookup already exists and composes cleanly.
- No cross-sell/bundle interaction changes (bundles' own tier selector is a separate,
  already-shipped concern living beside, not inside, this picker).
- Community-plugin-territory items row 47 already deferred (wishlist, personalization
  beyond this literal attribute-matrix ask, etc.) stay deferred.

## 4. Risks

| Risk | Mitigation |
|---|---|
| Picker breaks the existing "list every SKU" behavior for demos that rely on today's UI shape in a Playwright/E2E test | Every story that touches template components live-verifies via a real dev server; single-SKU products must render byte-identical to today (their only real regression surface) |
| Editorial theme variant (`EditorialPdpLongScroll`) diverges visually if only the non-editorial component is updated | pc-01 explicitly covers both `pdp-long-scroll.tsx` paths |
| New 2-axis seed product accidentally duplicates on repeat seed runs | Must go through the existing `upsertProduct`/idempotent-seed pattern already used everywhere else in `seed.ts`, never a fresh unconditional create |
| Admin SKU-matrix surface allows creating invalid/duplicate combinations | Reuse `generateSkus`'s own existing validation (throws `InvalidIdentifyingAttributesError` on key mismatch) -- no new validation logic invented here |

## 5. Scale assessment

**Medium.** A real, bounded UI + one small admin surface + one seed addition, entirely
within already-existing, already-correct core/catalog/pdp logic -- no new subsystem, no new
schema, no new adapter. Proceeding directly to stories (no H/V, no structured outline),
matching this session's own established Medium-scope precedent (`framework-brand-system`).
