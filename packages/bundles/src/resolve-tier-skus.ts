import type { BundleTier } from "./types.js";

/**
 * The PDP-supplied context needed to resolve a tier's skuIds against the
 * shopper's live variant-picker selection -- see
 * resolveTierCartSkuIds' own doc comment and
 * .pHive/epics/commerce-gap-audit-3/docs/bundle-variant-resolution-design.md
 * (audit finding #13) for the full design reasoning.
 */
export interface ActiveVariantSelection {
  /** The product the shopper is currently viewing (viewModel.product.id on the PDP). */
  productId: string;
  /** The SKU the shopper's variant picker currently has resolved for that product (activeSku.id on the PDP -- for a single-SKU product this is simply that product's one real SKU). */
  skuId: string;
}

/**
 * The narrowest possible read dependency resolveTierCartSkuIds needs beyond
 * BundleTier itself -- structural, same "narrowest possible" pattern as
 * bundles' own SkuPriceLookup (types.ts). Deliberately NOT folded into
 * SkuPriceLookup itself: that interface is what createBundle/updateBundle/
 * computeTierPricing validate/price against, and every existing caller
 * (including every test's fake lookup) only ever needs {id, price, title?}
 * for that -- adding a productId/sibling-count read to it would force every
 * one of those unrelated call sites to grow a dependency they don't need.
 * @mercatus-liber/catalog's CatalogService already satisfies this shape
 * structurally via getSku + listSkusByProduct, so app-composition code
 * (apps/reference-storefront/lib/actions.ts) wires `catalog` in directly,
 * no adapter object needed -- the same pattern used everywhere else in this
 * repo (see services.ts's own "structurally satisfies" comments).
 */
export interface TierSkuVariantLookup {
  getSku(id: string): Promise<{ id: string; productId: string } | null>;
  listSkusByProduct(productId: string): Promise<{ id: string }[]>;
}

/**
 * Resolves the real, final list of skuIds to add to cart for one Bundle
 * tier -- the fix for commerce-gap-audit-3 finding #13: a tier's `skuIds`
 * is a fixed list chosen at bundle-creation time, completely independent of
 * whatever SKU the shopper's variant picker (epic 63, packages/pdp's
 * resolveSelection) currently has selected. See
 * .pHive/epics/commerce-gap-audit-3/docs/bundle-variant-resolution-design.md
 * for the full design discussion of why this resolves at add-to-cart time
 * rather than leaving a tier permanently SKU-pinned.
 *
 * `BundleTier.skuIds` itself is never mutated or re-authored -- this is a
 * pure, read-time resolution layer, so a tier's stored shape stays exactly
 * what bundle-authoring produced.
 *
 * Additive/backward-compatible by construction: called with no
 * `activeSelection` (the common case -- e.g. computeTierPricing's own
 * internal use, or any call site that hasn't been updated to pass one),
 * this returns `tier.skuIds` completely unchanged, byte-identical to every
 * pre-existing caller. Backward compatibility also holds for every
 * single-SKU-per-tier bundle even WHEN an `activeSelection` is passed: a
 * tier skuId whose product has only one real SKU never has
 * `siblingSkuCount > 1`, so it's never touched.
 *
 * When `activeSelection` is given, each of the tier's skuIds is evaluated
 * independently -- this correctly handles a tier that bundles several
 * different products together in the same tier (this is why `skuIds` is an
 * array in the first place, see BundleTier's own doc comment: "this tier
 * includes product A one specific way + product B"). A skuId is swapped for
 * `activeSelection.skuId` only when ALL of the following hold:
 *   1. that skuId's own product is EXACTLY the product being viewed
 *      (`activeSelection.productId`) -- a skuId belonging to some other,
 *      non-selectable product bundled alongside it is left untouched;
 *   2. that product genuinely has 2+ real SKUs (`siblingSkuCount > 1`) --
 *      a real multi-variant product, not a single-SKU product where
 *      "resolution" would be a same-value no-op anyway.
 * A skuId that already equals `activeSelection.skuId` is left as-is without
 * a lookup call. Any skuId this bundle's own validation already guarantees
 * resolves via SkuPriceLookup (createBundle/updateBundle reject anything
 * else), so a null `lookup.getSku` result here would only mean stale data
 * since bundle-authoring -- treated the same as "not this product," i.e.
 * left unchanged, never thrown.
 */
export async function resolveTierCartSkuIds(
  tier: BundleTier,
  activeSelection: ActiveVariantSelection | undefined,
  lookup: TierSkuVariantLookup,
): Promise<string[]> {
  if (!activeSelection) return tier.skuIds;

  const resolved: string[] = [];
  for (const skuId of tier.skuIds) {
    if (skuId === activeSelection.skuId) {
      resolved.push(skuId);
      continue;
    }

    const sku = await lookup.getSku(skuId);
    if (!sku || sku.productId !== activeSelection.productId) {
      resolved.push(skuId);
      continue;
    }

    const siblings = await lookup.listSkusByProduct(sku.productId);
    resolved.push(siblings.length > 1 ? activeSelection.skuId : skuId);
  }
  return resolved;
}
