import { describe, expect, it } from "vitest";
import { resolveTierCartSkuIds, type TierSkuVariantLookup } from "../src/resolve-tier-skus.js";
import type { BundleTier } from "../src/types.js";

/**
 * commerce-gap-audit-3 finding #13 (see
 * .pHive/epics/commerce-gap-audit-3/docs/bundle-variant-resolution-design.md):
 * a bundle tier's `skuIds` is a fixed list chosen at bundle-creation time,
 * completely independent of whatever SKU the shopper's variant picker
 * currently has selected. These tests prove resolveTierCartSkuIds' fix:
 * (a) every pre-existing single-SKU-per-tier bundle behaves byte-identically
 * to before (backward compatible), and (b) a tier referencing one SKU of a
 * real multi-variant product resolves to the shopper's newly-selected SKU
 * once the PDP's active selection changes -- while a DIFFERENT product's
 * skuId bundled in the same tier is left exactly as authored.
 */

interface FakeCatalogSku {
  id: string;
  productId: string;
}

function createFakeLookup(skus: FakeCatalogSku[]): TierSkuVariantLookup {
  const byId = new Map(skus.map((sku) => [sku.id, sku]));
  return {
    async getSku(id: string) {
      const sku = byId.get(id);
      return sku ? { id: sku.id, productId: sku.productId } : null;
    },
    async listSkusByProduct(productId: string) {
      return skus.filter((sku) => sku.productId === productId).map((sku) => ({ id: sku.id }));
    },
  };
}

describe("resolveTierCartSkuIds", () => {
  describe("backward compatibility -- existing single-SKU-per-tier bundles", () => {
    it("returns tier.skuIds completely unchanged when no activeSelection is given", async () => {
      const tier: BundleTier = { id: "tier-1", label: "Product Only", skuIds: ["sku-a"] };
      const lookup = createFakeLookup([{ id: "sku-a", productId: "product-1" }]);

      const resolved = await resolveTierCartSkuIds(tier, undefined, lookup);

      expect(resolved).toEqual(["sku-a"]);
    });

    it("leaves a single-SKU product's tier skuId unchanged even when an activeSelection IS passed for that product", async () => {
      // product-1 has exactly one real SKU -- siblingSkuCount is 1, so this
      // is never eligible for override even though productId matches.
      const tier: BundleTier = { id: "tier-1", label: "Product Only", skuIds: ["sku-a"] };
      const lookup = createFakeLookup([{ id: "sku-a", productId: "product-1" }]);

      const resolved = await resolveTierCartSkuIds(
        tier,
        { productId: "product-1", skuId: "sku-a" },
        lookup,
      );

      expect(resolved).toEqual(["sku-a"]);
    });

    it("multi-SKU tier bundling several different (single-variant) products stays byte-identical", async () => {
      // Mirrors THREE_SKUS in bundles.test.ts / the "Complete Overhaul" tier
      // shape -- 3 different products' SKUs in one tier, none of them
      // multi-variant, and no activeSelection matches any of them.
      const tier: BundleTier = { id: "tier-3", label: "Complete Overhaul", skuIds: ["a", "b", "c"] };
      const lookup = createFakeLookup([
        { id: "a", productId: "product-a" },
        { id: "b", productId: "product-b" },
        { id: "c", productId: "product-c" },
      ]);

      const resolved = await resolveTierCartSkuIds(
        tier,
        { productId: "some-other-product", skuId: "sku-x" },
        lookup,
      );

      expect(resolved).toEqual(["a", "b", "c"]);
    });
  });

  describe("multi-variant resolution -- the new fix", () => {
    it("resolves a tier's skuId to the shopper's newly-selected SKU when the PDP's active product/variant changed", async () => {
      // embroidered-performance-polo-shaped product: 3 real color SKUs.
      // The tier was authored pinned to the "navy" SKU.
      const tier: BundleTier = { id: "tier-1", label: "Product Only", skuIds: ["polo-navy"] };
      const lookup = createFakeLookup([
        { id: "polo-navy", productId: "polo" },
        { id: "polo-red", productId: "polo" },
        { id: "polo-blue", productId: "polo" },
      ]);

      // Shopper is viewing the polo PDP and has picked "red" via the variant
      // picker before clicking this tier's add-to-cart.
      const resolved = await resolveTierCartSkuIds(
        tier,
        { productId: "polo", skuId: "polo-red" },
        lookup,
      );

      expect(resolved).toEqual(["polo-red"]);
    });

    it("resolves only the matching product's skuId, leaving a different bundled product's skuId untouched", async () => {
      // A tier bundling the multi-variant polo together with a fixed,
      // single-SKU accessory (e.g. a tote bag) -- this is exactly why
      // BundleTier.skuIds is an array (see its own doc comment).
      const tier: BundleTier = { id: "tier-2", label: "Polo + Tote", skuIds: ["polo-navy", "tote-standard"] };
      const lookup = createFakeLookup([
        { id: "polo-navy", productId: "polo" },
        { id: "polo-red", productId: "polo" },
        { id: "polo-blue", productId: "polo" },
        { id: "tote-standard", productId: "tote" },
      ]);

      const resolved = await resolveTierCartSkuIds(
        tier,
        { productId: "polo", skuId: "polo-blue" },
        lookup,
      );

      expect(resolved).toEqual(["polo-blue", "tote-standard"]);
    });

    it("does not touch a skuId whose product differs from the PDP's active product, even if it happens to be multi-variant", async () => {
      // The shopper is viewing the tote PDP (single-SKU), not the polo PDP
      // -- the polo skuId in this tier must stay exactly as authored.
      const tier: BundleTier = { id: "tier-2", label: "Polo + Tote", skuIds: ["polo-navy", "tote-standard"] };
      const lookup = createFakeLookup([
        { id: "polo-navy", productId: "polo" },
        { id: "polo-red", productId: "polo" },
        { id: "tote-standard", productId: "tote" },
      ]);

      const resolved = await resolveTierCartSkuIds(
        tier,
        { productId: "tote", skuId: "tote-standard" },
        lookup,
      );

      expect(resolved).toEqual(["polo-navy", "tote-standard"]);
    });

    it("is a no-op when the active selection already equals the tier's authored skuId (no lookup call needed)", async () => {
      const tier: BundleTier = { id: "tier-1", label: "Product Only", skuIds: ["polo-navy"] };
      let lookupCalls = 0;
      const lookup: TierSkuVariantLookup = {
        async getSku(id) {
          lookupCalls++;
          return { id, productId: "polo" };
        },
        async listSkusByProduct() {
          lookupCalls++;
          return [{ id: "polo-navy" }, { id: "polo-red" }];
        },
      };

      const resolved = await resolveTierCartSkuIds(
        tier,
        { productId: "polo", skuId: "polo-navy" },
        lookup,
      );

      expect(resolved).toEqual(["polo-navy"]);
      expect(lookupCalls).toBe(0);
    });
  });
});
