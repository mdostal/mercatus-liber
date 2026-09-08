import type { Product, ProductAttribute, Sku } from "@mercatus-liber/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createShopifyAdapter, ProductNotFoundInShopifyError } from "../src/index.js";
import { createFakeShopifyFetch } from "./fake-shopify-store.js";

describe("createShopifyAdapter", () => {
  let adapter: ReturnType<typeof createShopifyAdapter>;

  beforeEach(() => {
    adapter = createShopifyAdapter({
      shop: "test-shop.myshopify.com",
      accessToken: "shpat_fake",
      fetchImpl: createFakeShopifyFetch(),
    });
  });

  const dragon: Product = {
    id: "p1",
    slug: "dragon-cable-organizer",
    title: "Dragon Cable Organizer",
    description: "A cable organizer.",
    identifyingAttributeKeys: ["color", "size"],
    status: "active",
  };

  describe("products -- same canonical scenarios as adapter-sqlite/adapter-postgres", () => {
    it("saves and retrieves a product by id -- the caller-assigned id round-trips exactly (not Shopify's own GID)", async () => {
      await adapter.products.save(dragon);
      const found = await adapter.products.get("p1");
      expect(found).toEqual(dragon);
    });

    it("retrieves a product by slug", async () => {
      await adapter.products.save(dragon);
      const found = await adapter.products.getBySlug("dragon-cable-organizer");
      expect(found?.id).toBe("p1");
    });

    it("returns null for a missing product", async () => {
      expect(await adapter.products.get("missing")).toBeNull();
      expect(await adapter.products.getBySlug("missing")).toBeNull();
    });

    it("lists products, optionally filtered by status", async () => {
      await adapter.products.save(dragon);
      await adapter.products.save({ ...dragon, id: "p2", slug: "draft-thing", status: "draft" });
      expect(await adapter.products.list()).toHaveLength(2);
      expect(await adapter.products.list({ status: "active" })).toEqual([dragon]);
    });

    it("upserts on save with the same id -- updates the existing Shopify product rather than creating a duplicate", async () => {
      await adapter.products.save(dragon);
      await adapter.products.save({ ...dragon, title: "Updated Title" });
      const found = await adapter.products.get("p1");
      expect(found?.title).toBe("Updated Title");
      expect(await adapter.products.list()).toHaveLength(1);
    });

    it("maps status through Shopify's uppercase enum and back losslessly", async () => {
      await adapter.products.save({ ...dragon, status: "archived" });
      expect((await adapter.products.get("p1"))?.status).toBe("archived");
    });
  });

  describe("skus -- same canonical scenarios, plus Shopify-specific status inheritance", () => {
    const sku: Sku = {
      id: "s1",
      productId: "p1",
      identifyingAttributes: [
        { key: "color", value: "red" },
        { key: "size", value: "large" },
      ],
      price: { amount: 1999, currency: "USD" },
      status: "active",
    };

    beforeEach(async () => {
      await adapter.products.save(dragon);
    });

    it("saves and retrieves a SKU by id, preserving identifying attributes and price", async () => {
      await adapter.skus.save(sku);
      const found = await adapter.skus.get("s1");
      expect(found).toEqual(sku);
    });

    it("lists SKUs by product id", async () => {
      await adapter.skus.save(sku);
      await adapter.skus.save({ ...sku, id: "s2", identifyingAttributes: [{ key: "color", value: "blue" }, { key: "size", value: "large" }] });
      const found = await adapter.skus.listByProduct("p1");
      expect(found).toHaveLength(2);
    });

    it("returns null for a missing SKU", async () => {
      expect(await adapter.skus.get("missing")).toBeNull();
    });

    it("upserts a SKU with the same id rather than creating a duplicate variant", async () => {
      await adapter.skus.save(sku);
      await adapter.skus.save({ ...sku, price: { amount: 2999, currency: "USD" } });
      expect(await adapter.skus.listByProduct("p1")).toHaveLength(1);
      expect((await adapter.skus.get("s1"))?.price.amount).toBe(2999);
    });

    it("a SKU's status always mirrors its parent product's current status -- Shopify has no independent per-variant status", async () => {
      await adapter.skus.save(sku);
      await adapter.products.save({ ...dragon, status: "archived" });
      expect((await adapter.skus.get("s1"))?.status).toBe("archived");
      expect((await adapter.skus.listByProduct("p1"))[0]?.status).toBe("archived");
    });

    it("throws ProductNotFoundInShopifyError when saving a SKU for a product that doesn't exist in Shopify", async () => {
      await expect(adapter.skus.save({ ...sku, productId: "no-such-product" })).rejects.toThrow(ProductNotFoundInShopifyError);
    });

    it("listByProduct returns an empty array for a product that doesn't exist", async () => {
      expect(await adapter.skus.listByProduct("no-such-product")).toEqual([]);
    });
  });

  describe("attributes -- same canonical scenarios, backed by product metafields", () => {
    beforeEach(async () => {
      await adapter.products.save(dragon);
    });

    it("saves and lists attributes, including array-valued and facetable flags", async () => {
      const facetable: ProductAttribute = { productId: "p1", key: "printer_compatible", value: true, facetable: true };
      const materials: ProductAttribute = { productId: "p1", key: "materials", value: ["PLA", "PETG"], facetable: false };
      await adapter.attributes.save(facetable);
      await adapter.attributes.save(materials);
      const found = await adapter.attributes.listByProduct("p1");
      expect(found).toHaveLength(2);
      expect(found.find((a) => a.key === "materials")?.value).toEqual(["PLA", "PETG"]);
      expect(found.find((a) => a.key === "printer_compatible")?.facetable).toBe(true);
    });

    it("removes an attribute by product id and key", async () => {
      await adapter.attributes.save({ productId: "p1", key: "color", value: "red", facetable: true });
      await adapter.attributes.remove("p1", "color");
      expect(await adapter.attributes.listByProduct("p1")).toHaveLength(0);
    });

    it("throws ProductNotFoundInShopifyError when saving an attribute for a product that doesn't exist in Shopify", async () => {
      await expect(adapter.attributes.save({ productId: "no-such-product", key: "k", value: "v", facetable: false })).rejects.toThrow(
        ProductNotFoundInShopifyError,
      );
    });
  });

  it("exposes only the CatalogPersistenceAdapter interface -- no Shopify-specific member leaks through", () => {
    const keys = Object.keys(adapter).sort();
    expect(keys).toEqual(["attributes", "products", "skus"]);
    expect(Object.keys(adapter.products).sort()).toEqual(["get", "getBySlug", "list", "save"]);
    expect(Object.keys(adapter.skus).sort()).toEqual(["get", "listByProduct", "save"]);
    expect(Object.keys(adapter.attributes).sort()).toEqual(["listByProduct", "remove", "save"]);
  });
});
