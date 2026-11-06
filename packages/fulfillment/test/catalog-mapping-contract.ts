import { describe, expect, it } from "vitest";
import { MissingCatalogMappingError, requireCatalogTarget, type ProviderCatalogMappingRepository } from "../src/catalog-mapping.js";

/** What every storage backend's catalog mapping repository must do. `open` returns a repository on a fresh store; `reopen` a new one on the same store. */
export function describeCatalogMappingContract(
  name: string,
  setup: () => Promise<{ open(): ProviderCatalogMappingRepository }>,
  options: { timeout?: number } = {},
): void {
  describe(`${name}: provider catalog mapping contract`, { timeout: options.timeout ?? 5_000 }, () => {
    const tee = { skuId: "sku-tee", provider: "printify", target: { productId: "5d39b159e7c48c000728c89f", variantId: 33719, nested: { a: [1, 2] } } };

    it("round-trips a mapping and returns null for a missing one", async () => {
      const repo = (await setup()).open();
      await repo.save(tee);
      expect(await repo.get("sku-tee", "printify")).toEqual(tee);
      expect(await repo.get("sku-tee", "printful")).toBeNull();
      expect(await repo.get("nope", "printify")).toBeNull();
    });

    it("🔍 keeps one SKU's mappings for different providers apart, and a save replaces only its own", async () => {
      const repo = (await setup()).open();
      await repo.save(tee);
      await repo.save({ skuId: "sku-tee", provider: "printful", target: { catalogVariantId: 4012 } });
      await repo.save({ ...tee, target: { productId: "p2", variantId: 1 } });
      expect((await repo.get("sku-tee", "printify"))!.target).toEqual({ productId: "p2", variantId: 1 });
      expect((await repo.get("sku-tee", "printful"))!.target).toEqual({ catalogVariantId: 4012 });
    });

    it("lists by provider, ordered by SKU", async () => {
      const repo = (await setup()).open();
      for (const skuId of ["c", "a", "b"]) await repo.save({ skuId, provider: "printify", target: { productId: skuId, variantId: 1 } });
      await repo.save({ skuId: "a", provider: "printful", target: { catalogVariantId: 1 } });
      expect((await repo.list("printify")).map((m) => m.skuId)).toEqual(["a", "b", "c"]);
      expect(await repo.list()).toHaveLength(4);
    });

    it("removes one provider's mapping only", async () => {
      const repo = (await setup()).open();
      await repo.save(tee);
      await repo.save({ skuId: "sku-tee", provider: "printful", target: { catalogVariantId: 1 } });
      await repo.remove("sku-tee", "printify");
      expect(await repo.get("sku-tee", "printify")).toBeNull();
      expect(await repo.get("sku-tee", "printful")).not.toBeNull();
    });

    it("🔍 keeps mappings across a restart", async () => {
      const store = await setup();
      await store.open().save(tee);
      expect(await store.open().get("sku-tee", "printify")).toEqual(tee);
    });

    it("requireCatalogTarget throws a clear error for an unmapped SKU", async () => {
      const repo = (await setup()).open();
      await expect(requireCatalogTarget(repo, "nope", "printify")).rejects.toThrow(MissingCatalogMappingError);
    });
  });
}
