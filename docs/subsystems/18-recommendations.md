# Subsystem 18 — Recommendations (Upsell / Cross-sell)

## Purpose
"Customers also bought" / "you might also like" product-to-product recommendations on the PDP
and cart page. Admin-curated, explicit `RecommendationRule` records mapping one source product
to an ordered list of target products, distinct from marketing-catalog's `SuggestionRule`
(which suggests *categories* for a product to be assigned to, an admin-curation aid — never a
shopper-facing product recommendation).

## Depends on
`@mercatus-liber/core` only. Never imports catalog, cart, checkout-orders, promotions,
bundles, or analytics. Product ids are stored as bare strings, resolved via catalog at read
time by the app-composition layer — this package never resolves or validates them itself
(unlike promotions/bundles, which do validate SKU ids against a structural lookup interface;
recommendations deliberately stays even thinner, since an admin-authored product id that later
disappears from catalog should just silently drop from the rendered shelf, not block the rule
from being created/edited — see Open Questions).

## Responsibilities
- `RecommendationRule` entity: id, `sourceProductId`, `label` (free text — "Customers also
  bought", "Frequently bought together", etc.), `placement` (`pdp` | `cart` | `both`),
  `targetProductIds: string[]` (ordered), status.
- `RecommendationRepository` (adapter pattern) + in-memory reference implementation.
- `RecommendationsService.getRecommendationsForProduct(productId, placement?)` — the PDP/
  cart-facing read, returning active rules for that source product, optionally filtered by
  placement.
- Admin CRUD (`/admin/recommendations`).

## Explicitly NOT this subsystem's job
- A same-category fallback heuristic when no curated rule exists — that's app-composition-layer
  orchestration in `apps/reference-storefront`, reusing `marketing-catalog`'s existing
  `listCategoriesForProduct`/`listProductIdsInCategory` read path directly (the same idiom
  already used by the category page), not a dependency this package declares itself. See
  `.pHive/epics/upsell-cross-sell/docs/design-discussion.md` §3.
- Any inferred/computed recommendation signal (co-view, co-purchase frequency). Analytics
  (subsystem 13) has no queryable read side today — building one is a genuinely separate,
  larger undertaking (its own event-sourced aggregation subsystem), deferred and documented,
  not silently skipped.
- Validating that `targetProductIds`/`sourceProductId` currently resolve in catalog at
  create/update time — kept intentionally thin; the app-composition layer resolves ids at
  render time and simply omits anything that no longer exists.
- Owning cart or PDP state — cart (07) and PDP (04) stay untouched; recommendations are
  composed alongside their existing view models at the app layer, the same pattern bundles
  (17) established.

## Decoupling notes
`packages/recommendations`'s only dependency is `@mercatus-liber/core`. Verify via
`grep -rn "@mercatus-liber/recommendations" packages/cart packages/checkout-orders/src
packages/promotions/src packages/bundles/src packages/inventory/src packages/pdp/src
packages/marketing-catalog/src packages/analytics/src` before merge — every one of those must
return zero hits; recommendations is consumed only by `apps/reference-storefront`.

## Open questions
1. Should `createRule`/`updateRule` validate product ids against catalog at write time (like
   promotions/bundles do for SKU ids), trading a slightly heavier dependency for earlier error
   feedback to the admin? Deferred — v1 favors the thinner, catalog-independent package;
   revisit if stale-id admin confusion turns out to be a real problem.
2. Ranking/personalization for the app-composed "same category" fallback is intentionally
   naive (first-N, no scoring) — a future epic could improve this without touching this
   subsystem's own contract at all, since the fallback lives entirely at the app layer.
