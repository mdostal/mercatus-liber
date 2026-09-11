import type { Product, ProductAttribute, Sku } from "@mercatus-liber/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createMongoAdapter } from "../src/index.js";
import { createFakeDb } from "./fake-db.js";

describe("createMongoAdapter", () => {
  let adapter: Awaited<ReturnType<typeof createMongoAdapter>>;

  beforeEach(async () => {
    adapter = await createMongoAdapter(createFakeDb());
  });

  const dragon: Product = {
    id: "p1",
    slug: "dragon-cable-organizer",
    title: "Dragon Cable Organizer",
    description: "A cable organizer.",
    identifyingAttributeKeys: ["color", "size"],
    status: "active",
  };

  describe("products", () => {
    it("saves and retrieves a product by id", async () => {
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

    it("upserts on save with the same id -- a second save updates in place, never creates a duplicate", async () => {
      await adapter.products.save(dragon);
      await adapter.products.save({ ...dragon, title: "Updated Title" });
      const found = await adapter.products.get("p1");
      expect(found?.title).toBe("Updated Title");
      expect(await adapter.products.list()).toHaveLength(1);
    });

    it("saves and retrieves a product's real images array, and a product with none round-trips with images absent", async () => {
      const withImages: Product = {
        ...dragon,
        images: [{ url: "https://example.com/dragon.jpg", alt: "Dragon cable organizer" }],
      };
      await adapter.products.save(withImages);
      expect((await adapter.products.get("p1"))?.images).toEqual(withImages.images);

      await adapter.products.save({ ...dragon, id: "p2", slug: "no-image" });
      const found = await adapter.products.get("p2");
      expect(found?.images).toBeUndefined();
    });
  });

  describe("skus", () => {
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

    it("saves and retrieves a SKU by id", async () => {
      await adapter.skus.save(sku);
      expect(await adapter.skus.get("s1")).toEqual(sku);
    });

    it("lists SKUs by product id, excluding another product's SKUs", async () => {
      await adapter.skus.save(sku);
      await adapter.skus.save({ ...sku, id: "s2", productId: "other-product" });
      const found = await adapter.skus.listByProduct("p1");
      expect(found).toEqual([sku]);
    });

    it("returns null for a missing SKU", async () => {
      expect(await adapter.skus.get("missing")).toBeNull();
    });
  });

  describe("attributes -- real compound (productId, key) identity", () => {
    const attribute: ProductAttribute = { productId: "p1", key: "material", value: "oak", facetable: true };

    it("saves and lists a product's attributes", async () => {
      await adapter.attributes.save(attribute);
      expect(await adapter.attributes.listByProduct("p1")).toEqual([attribute]);
    });

    it("never leaks another product's attributes into listByProduct", async () => {
      await adapter.attributes.save(attribute);
      await adapter.attributes.save({ productId: "p2", key: "material", value: "pine", facetable: true });
      expect(await adapter.attributes.listByProduct("p1")).toEqual([attribute]);
    });

    it("upserts on the same (productId, key), never duplicating", async () => {
      await adapter.attributes.save(attribute);
      await adapter.attributes.save({ ...attribute, value: "walnut" });
      const found = await adapter.attributes.listByProduct("p1");
      expect(found).toHaveLength(1);
      expect(found[0]?.value).toBe("walnut");
    });

    it("remove deletes exactly the one (productId, key) pair", async () => {
      await adapter.attributes.save(attribute);
      await adapter.attributes.save({ productId: "p1", key: "color", value: "brown", facetable: false });
      await adapter.attributes.remove("p1", "material");
      const found = await adapter.attributes.listByProduct("p1");
      expect(found).toHaveLength(1);
      expect(found[0]?.key).toBe("color");
    });
  });
});
