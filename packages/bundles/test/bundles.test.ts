import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryBundleRepository } from "../src/in-memory-repository.js";
import { createBundlesService, type BundlesService } from "../src/service.js";
import {
  BundleCurrencyMismatchError,
  BundleSkuNotFoundError,
  type BundleRepository,
  type CreateBundleInput,
  type SkuPriceLookup,
} from "../src/types.js";

interface FakeSku {
  id: string;
  price: { amount: number; currency: string };
  title?: string;
}

function createFakeSkuLookup(skus: FakeSku[]): SkuPriceLookup {
  const byId = new Map(skus.map((sku) => [sku.id, sku]));
  return {
    async getSku(id: string) {
      const sku = byId.get(id);
      return sku ? { id: sku.id, price: sku.price, title: sku.title } : null;
    },
  };
}

const THREE_SKUS: FakeSku[] = [
  { id: "a", price: { amount: 10000, currency: "USD" }, title: "Product A" },
  { id: "b", price: { amount: 5000, currency: "USD" }, title: "Pro Setup" },
  { id: "c", price: { amount: 8000, currency: "USD" }, title: "Overhaul Add-on" },
];

function threeTierBundleInput(overrides: Partial<CreateBundleInput> = {}): CreateBundleInput {
  return {
    productId: "product-1",
    title: "Widget Bundle",
    tiers: [
      { id: "tier-1", label: "Product Only", skuIds: ["a"] },
      { id: "tier-2", label: "+ Pro Setup", skuIds: ["a", "b"] },
      { id: "tier-3", label: "Complete Overhaul", skuIds: ["a", "b", "c"] },
    ],
    ...overrides,
  };
}

describe("bundles service", () => {
  let repository: BundleRepository;
  let skuLookup: SkuPriceLookup;
  let bundles: BundlesService;

  beforeEach(() => {
    repository = createInMemoryBundleRepository();
    skuLookup = createFakeSkuLookup(THREE_SKUS);
    bundles = createBundlesService({ repository, skuLookup });
  });

  describe("CRUD", () => {
    it("createBundle assigns an id and defaults status to active", async () => {
      const bundle = await bundles.createBundle(threeTierBundleInput());
      expect(bundle.id).toBeTruthy();
      expect(bundle.status).toBe("active");
      expect(bundle.tiers).toHaveLength(3);
    });

    it("getBundle returns null for an unknown id", async () => {
      expect(await bundles.getBundle("missing")).toBeNull();
    });

    it("getBundle returns the created bundle by id", async () => {
      const created = await bundles.createBundle(threeTierBundleInput());
      expect(await bundles.getBundle(created.id)).toEqual(created);
    });

    it("listBundles returns every created bundle", async () => {
      const a = await bundles.createBundle(threeTierBundleInput({ productId: "product-a" }));
      const b = await bundles.createBundle(threeTierBundleInput({ productId: "product-b" }));
      const listed = await bundles.listBundles();
      expect(listed.map((bundle) => bundle.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    });

    it("rejects createBundle with no tiers", async () => {
      await expect(bundles.createBundle(threeTierBundleInput({ tiers: [] }))).rejects.toThrow(
        /at least one tier/,
      );
      expect(await bundles.listBundles()).toHaveLength(0);
    });

    it("rejects createBundle when a tier has no skuIds", async () => {
      await expect(
        bundles.createBundle(
          threeTierBundleInput({ tiers: [{ id: "tier-1", label: "Empty", skuIds: [] }] }),
        ),
      ).rejects.toThrow(/at least one skuId/);
      expect(await bundles.listBundles()).toHaveLength(0);
    });
  });

  describe("computeTierPricing", () => {
    // Acceptance criterion 1
    it("returns the live sum-of-parts total and one line per constituent SKU for the Complete Overhaul tier", async () => {
      const bundle = await bundles.createBundle(threeTierBundleInput());

      const pricing = await bundles.computeTierPricing(bundle.id, "tier-3");

      expect(pricing).not.toBeNull();
      expect(pricing!.total).toEqual({ amount: 23000, currency: "USD" });
      expect(pricing!.lines).toHaveLength(3);
      expect(pricing!.lines).toEqual(
        expect.arrayContaining([
          { skuId: "a", title: "Product A", unitAmount: { amount: 10000, currency: "USD" } },
          { skuId: "b", title: "Pro Setup", unitAmount: { amount: 5000, currency: "USD" } },
          { skuId: "c", title: "Overhaul Add-on", unitAmount: { amount: 8000, currency: "USD" } },
        ]),
      );
    });

    it("returns the smaller sum for the Product Only tier", async () => {
      const bundle = await bundles.createBundle(threeTierBundleInput());
      const pricing = await bundles.computeTierPricing(bundle.id, "tier-1");
      expect(pricing!.total).toEqual({ amount: 10000, currency: "USD" });
      expect(pricing!.lines).toHaveLength(1);
    });

    it("recomputes live rather than caching -- a price change on the SKU lookup is reflected immediately", async () => {
      const bundle = await bundles.createBundle(threeTierBundleInput());
      const first = await bundles.computeTierPricing(bundle.id, "tier-1");
      expect(first!.total.amount).toBe(10000);

      // Mutate the underlying lookup's price for SKU "a" and recompute.
      skuLookup = createFakeSkuLookup([
        { id: "a", price: { amount: 12000, currency: "USD" }, title: "Product A" },
        THREE_SKUS[1]!,
        THREE_SKUS[2]!,
      ]);
      const rebound = createBundlesService({ repository, skuLookup });
      const second = await rebound.computeTierPricing(bundle.id, "tier-1");
      expect(second!.total.amount).toBe(12000);
    });

    it("returns null when the bundle id is not found", async () => {
      expect(await bundles.computeTierPricing("missing-bundle", "tier-1")).toBeNull();
    });

    it("returns null when the tier id is not found on an existing bundle", async () => {
      const bundle = await bundles.createBundle(threeTierBundleInput());
      expect(await bundles.computeTierPricing(bundle.id, "missing-tier")).toBeNull();
    });

    it("throws BundleCurrencyMismatchError when a tier's constituent SKUs span more than one currency", async () => {
      const mixedLookup = createFakeSkuLookup([
        { id: "a", price: { amount: 10000, currency: "USD" } },
        { id: "eur-b", price: { amount: 5000, currency: "EUR" } },
      ]);
      const mixedBundles = createBundlesService({ repository, skuLookup: mixedLookup });
      const bundle = await mixedBundles.createBundle(
        threeTierBundleInput({
          tiers: [{ id: "tier-1", label: "Mixed Currency", skuIds: ["a", "eur-b"] }],
        }),
      );

      await expect(mixedBundles.computeTierPricing(bundle.id, "tier-1")).rejects.toThrow(
        BundleCurrencyMismatchError,
      );
    });
  });

  describe("getBundleForProduct", () => {
    // Acceptance criterion 2
    it("returns the active bundle attached to a product", async () => {
      const created = await bundles.createBundle(threeTierBundleInput({ productId: "product-42" }));
      const found = await bundles.getBundleForProduct("product-42");
      expect(found).toEqual(created);
    });

    // Acceptance criterion 3
    it("returns null for a product with no bundle attached", async () => {
      await bundles.createBundle(threeTierBundleInput({ productId: "product-42" }));
      expect(await bundles.getBundleForProduct("product-no-bundle")).toBeNull();
    });

    // Acceptance criterion 6
    it("returns null for a deactivated bundle's product, though it stays visible via listBundles/getBundle", async () => {
      const created = await bundles.createBundle(threeTierBundleInput({ productId: "product-99" }));
      await bundles.deactivateBundle(created.id);

      expect(await bundles.getBundleForProduct("product-99")).toBeNull();
      expect((await bundles.getBundle(created.id))?.status).toBe("inactive");
      expect((await bundles.listBundles()).map((b) => b.id)).toContain(created.id);
    });
  });

  describe("createBundle validation", () => {
    // Acceptance criterion 4
    it("rejects clearly naming the missing skuId, and persists nothing", async () => {
      await expect(
        bundles.createBundle(
          threeTierBundleInput({
            tiers: [{ id: "tier-1", label: "Product Only", skuIds: ["does-not-exist"] }],
          }),
        ),
      ).rejects.toThrow(BundleSkuNotFoundError);

      await expect(
        bundles.createBundle(
          threeTierBundleInput({
            tiers: [{ id: "tier-1", label: "Product Only", skuIds: ["does-not-exist"] }],
          }),
        ),
      ).rejects.toThrow(/does-not-exist/);

      expect(await bundles.listBundles()).toHaveLength(0);
    });
  });

  describe("updateBundle", () => {
    // Acceptance criterion 5
    it("changes the title while preserving id and tiers, reflected in getBundle", async () => {
      const created = await bundles.createBundle(threeTierBundleInput());

      const updated = await bundles.updateBundle(created.id, { title: "Renamed Bundle" });

      expect(updated).not.toBeNull();
      expect(updated!.id).toBe(created.id);
      expect(updated!.title).toBe("Renamed Bundle");
      expect(updated!.tiers).toEqual(created.tiers);

      const fetched = await bundles.getBundle(created.id);
      expect(fetched?.title).toBe("Renamed Bundle");
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.tiers).toEqual(created.tiers);
    });

    it("returns null for an unknown id", async () => {
      expect(await bundles.updateBundle("missing", { title: "Nope" })).toBeNull();
    });

    it("re-validates the merged tiers, rejecting an update that introduces an unresolvable skuId", async () => {
      const created = await bundles.createBundle(threeTierBundleInput());

      await expect(
        bundles.updateBundle(created.id, {
          tiers: [{ id: "tier-1", label: "Product Only", skuIds: ["nonexistent-sku"] }],
        }),
      ).rejects.toThrow(BundleSkuNotFoundError);

      // Unchanged by the rejected update.
      const stillOriginal = await bundles.getBundle(created.id);
      expect(stillOriginal?.tiers).toEqual(created.tiers);
    });
  });

  describe("deactivateBundle", () => {
    it("flips status to inactive and returns null for an unknown id", async () => {
      const created = await bundles.createBundle(threeTierBundleInput());
      const deactivated = await bundles.deactivateBundle(created.id);
      expect(deactivated?.status).toBe("inactive");
      expect(await bundles.deactivateBundle("missing")).toBeNull();
    });
  });

  /**
   * commerce-gap-audit-3 finding 13: a real, disclosed gap -- listBundles()
   * carried no demo filter at all, so an operator in one demo's own
   * `/admin/bundles` list saw every other demo's bundles mixed in too.
   * Same bug class/fix shape as service-areas/advertising/promotions'
   * demoSlug tests (commerce-gap-audit-3 findings 1-3).
   */
  describe("demo scoping", () => {
    it("listBundles(filter) scopes by demoSlug -- two demos' bundles never bleed into each other's results", async () => {
      const printShop = await bundles.createBundle(
        threeTierBundleInput({ productId: "product-print-shop", demoSlug: "print-shop" }),
      );
      const northline = await bundles.createBundle(
        threeTierBundleInput({ productId: "product-northline", demoSlug: "northline" }),
      );

      const printShopOnly = await bundles.listBundles({ demoSlug: "print-shop" });
      expect(printShopOnly.map((b) => b.id)).toEqual([printShop.id]);

      const northlineOnly = await bundles.listBundles({ demoSlug: "northline" });
      expect(northlineOnly.map((b) => b.id)).toEqual([northline.id]);

      // Unscoped listBundles() (no demoSlug filter) legitimately still
      // returns every demo's bundles -- backward compatible.
      const everything = await bundles.listBundles();
      expect(everything.map((b) => b.id).sort()).toEqual([printShop.id, northline.id].sort());
    });
  });
});
