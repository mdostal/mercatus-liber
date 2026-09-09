import type { Product, ProductAttribute, Sku } from "@mercatus-liber/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createSqliteAdapter } from "../src/index.js";

describe("createSqliteAdapter", () => {
  let adapter: ReturnType<typeof createSqliteAdapter>;

  beforeEach(() => {
    adapter = createSqliteAdapter(":memory:");
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

    it("upserts on save with the same id (ON CONFLICT DO UPDATE)", async () => {
      await adapter.products.save(dragon);
      await adapter.products.save({ ...dragon, title: "Updated Title" });
      const found = await adapter.products.get("p1");
      expect(found?.title).toBe("Updated Title");
      expect(await adapter.products.list()).toHaveLength(1);
    });

    it("image-cdn epic: saves and retrieves a product's real images array, round-tripping through the JSON-encoded TEXT column", async () => {
      const withImages: Product = {
        ...dragon,
        images: [
          { url: "https://example.com/dragon-front.jpg", alt: "Dragon cable organizer, front view" },
          { url: "https://example.com/dragon-side.jpg", alt: "Dragon cable organizer, side view" },
        ],
      };
      await adapter.products.save(withImages);
      const found = await adapter.products.get("p1");
      expect(found?.images).toEqual(withImages.images);
    });

    it("image-cdn epic: a product saved with no images round-trips with `images` absent, not an empty array or null", async () => {
      await adapter.products.save(dragon);
      const found = await adapter.products.get("p1");
      expect(found?.images).toBeUndefined();
      expect("images" in (found as object)).toBe(false);
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
  });

  describe("attributes", () => {
    beforeEach(async () => {
      await adapter.products.save(dragon);
    });

    it("saves and lists attributes, including array-valued and facetable flags", async () => {
      const facetable: ProductAttribute = {
        productId: "p1",
        key: "printer_compatible",
        value: true,
        facetable: true,
      };
      const materials: ProductAttribute = {
        productId: "p1",
        key: "materials",
        value: ["PLA", "PETG"],
        facetable: false,
      };
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
  });

  it("exposes only the CatalogPersistenceAdapter interface -- no SQLite-specific members", () => {
    const keys = Object.keys(adapter).sort();
    expect(keys).toEqual(["attributes", "products", "skus"]);
    expect(Object.keys(adapter.products).sort()).toEqual(["get", "getBySlug", "list", "save"]);
  });
});
