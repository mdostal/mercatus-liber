import { createSqliteAdapter } from "@mercatus-liber/adapter-sqlite";
import { createInMemoryEventBus, type EventBus } from "@mercatus-liber/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CatalogNotFoundError,
  DuplicateCatalogSlugError,
  createInMemoryCatalogRepository,
  createInMemoryProductCatalogRepository,
} from "../src/catalog-entity.js";
import { createCatalogService, InvalidIdentifyingAttributesError, ProductNotFoundError } from "../src/service.js";
import { attributesKey, cartesianProduct } from "../src/variant-utils.js";

describe("cartesianProduct", () => {
  it("generates the cartesian product of identifying-attribute value sets", () => {
    const combos = cartesianProduct({ color: ["red", "blue"], size: ["large"] });
    expect(combos).toHaveLength(2);
    expect(combos.map(attributesKey).sort()).toEqual(
      [
        [{ key: "color", value: "red" }, { key: "size", value: "large" }],
        [{ key: "color", value: "blue" }, { key: "size", value: "large" }],
      ]
        .map(attributesKey)
        .sort(),
    );
  });

  it("excludes combinations explicitly marked invalid", () => {
    const combos = cartesianProduct(
      { color: ["red", "blue"], size: ["large"] },
      [[{ key: "color", value: "red" }, { key: "size", value: "large" }]],
    );
    expect(combos).toHaveLength(1);
    expect(combos[0]).toEqual([{ key: "color", value: "blue" }, { key: "size", value: "large" }]);
  });
});

describe("catalog service", () => {
  let events: EventBus;
  let catalog: ReturnType<typeof createCatalogService>;
  const emitted: { event: string; payload: unknown }[] = [];

  beforeEach(() => {
    emitted.length = 0;
    events = createInMemoryEventBus();
    for (const name of [
      "catalog.product.created",
      "catalog.product.updated",
      "catalog.product.archived",
      "catalog.sku.created",
      "catalog.attribute.updated",
      "catalog.attribute.removed",
    ]) {
      events.subscribe(name, async (payload) => {
        emitted.push({ event: name, payload });
      });
    }
    const persistence = createSqliteAdapter(":memory:");
    catalog = createCatalogService({
      persistence,
      events,
      catalogs: createInMemoryCatalogRepository(),
      productCatalogs: createInMemoryProductCatalogRepository(),
    });
  });

  it("creates a product as draft and publishes catalog.product.created", async () => {
    const product = await catalog.createProduct({
      slug: "dragon-cable-organizer",
      title: "Dragon Cable Organizer",
      description: "A cable organizer.",
      identifyingAttributeKeys: ["color", "size"],
    });
    expect(product.status).toBe("draft");
    expect(emitted).toContainEqual({ event: "catalog.product.created", payload: { id: product.id } });
  });

  it("updates and archives a product, publishing the matching events", async () => {
    const product = await catalog.createProduct({
      slug: "p",
      title: "P",
      description: "d",
      identifyingAttributeKeys: [],
    });
    const updated = await catalog.updateProduct(product.id, { title: "New Title" });
    expect(updated.title).toBe("New Title");
    expect(emitted).toContainEqual({ event: "catalog.product.updated", payload: { id: product.id } });

    await catalog.archiveProduct(product.id);
    const archived = await catalog.getProduct(product.id);
    expect(archived?.status).toBe("archived");
    expect(emitted).toContainEqual({ event: "catalog.product.archived", payload: { id: product.id } });
  });

  it("publishes a draft product to active", async () => {
    const product = await catalog.createProduct({
      slug: "p3",
      title: "P3",
      description: "d",
      identifyingAttributeKeys: [],
    });
    expect(product.status).toBe("draft");
    const published = await catalog.publishProduct(product.id);
    expect(published.status).toBe("active");
    expect((await catalog.getProduct(product.id))?.status).toBe("active");
  });

  it("throws ProductNotFoundError for an unknown product id", async () => {
    await expect(catalog.updateProduct("missing", { title: "x" })).rejects.toThrow(ProductNotFoundError);
    await expect(catalog.archiveProduct("missing")).rejects.toThrow(ProductNotFoundError);
  });

  describe("generateSkus + resolveVariant (options-on-a-page)", () => {
    it("generates the cartesian product of SKUs and resolves a chosen combination to the matching SKU", async () => {
      const product = await catalog.createProduct({
        slug: "organizer",
        title: "Organizer",
        description: "d",
        identifyingAttributeKeys: ["color", "size"],
      });

      const skus = await catalog.generateSkus(
        product.id,
        { color: ["red", "blue"], size: ["large", "small"] },
        { amount: 1999, currency: "USD" },
      );
      expect(skus).toHaveLength(4);

      const resolved = await catalog.resolveVariant(product.id, [
        { key: "color", value: "blue" },
        { key: "size", value: "small" },
      ]);
      expect(resolved).not.toBeNull();
      expect(resolved?.identifyingAttributes.sort((a, b) => a.key.localeCompare(b.key))).toEqual([
        { key: "color", value: "blue" },
        { key: "size", value: "small" },
      ]);
    });

    it("returns null from resolveVariant for a combination that doesn't exist", async () => {
      const product = await catalog.createProduct({
        slug: "organizer2",
        title: "Organizer 2",
        description: "d",
        identifyingAttributeKeys: ["color"],
      });
      await catalog.generateSkus(product.id, { color: ["red"] }, { amount: 100, currency: "USD" });
      const resolved = await catalog.resolveVariant(product.id, [{ key: "color", value: "green" }]);
      expect(resolved).toBeNull();
    });

    it("rejects generateSkus when valuesByKey doesn't exactly match the product's identifying keys", async () => {
      const product = await catalog.createProduct({
        slug: "organizer3",
        title: "Organizer 3",
        description: "d",
        identifyingAttributeKeys: ["color", "size"],
      });
      await expect(
        catalog.generateSkus(product.id, { color: ["red"] }, { amount: 100, currency: "USD" }),
      ).rejects.toThrow(InvalidIdentifyingAttributesError);
    });

    it("rejects createSku when identifyingAttributes doesn't match the product's identifying keys", async () => {
      const product = await catalog.createProduct({
        slug: "organizer4",
        title: "Organizer 4",
        description: "d",
        identifyingAttributeKeys: ["color", "size"],
      });
      await expect(
        catalog.createSku({
          productId: product.id,
          identifyingAttributes: [{ key: "color", value: "red" }],
          price: { amount: 100, currency: "USD" },
        }),
      ).rejects.toThrow(InvalidIdentifyingAttributesError);
    });
  });

  describe("getSku", () => {
    it("returns a SKU by id, or null when not found", async () => {
      const product = await catalog.createProduct({
        slug: "organizer5",
        title: "Organizer 5",
        description: "d",
        identifyingAttributeKeys: ["color"],
      });
      const created = await catalog.createSku({
        productId: product.id,
        identifyingAttributes: [{ key: "color", value: "red" }],
        price: { amount: 500, currency: "USD" },
      });
      expect(await catalog.getSku(created.id)).toEqual(created);
      expect(await catalog.getSku("missing")).toBeNull();
    });
  });

  describe("full attribute map", () => {
    it("sets, lists, and removes product attributes independently of identifying attributes", async () => {
      const product = await catalog.createProduct({
        slug: "p2",
        title: "P2",
        description: "d",
        identifyingAttributeKeys: ["color"],
      });
      await catalog.setAttribute({
        productId: product.id,
        key: "printer_compatible",
        value: true,
        facetable: true,
      });
      await catalog.setAttribute({
        productId: product.id,
        key: "materials",
        value: ["PLA", "PETG"],
        facetable: false,
      });
      const attrs = await catalog.listAttributes(product.id);
      expect(attrs).toHaveLength(2);
      expect(emitted).toContainEqual({
        event: "catalog.attribute.updated",
        payload: { productId: product.id, key: "printer_compatible" },
      });

      await catalog.removeAttribute(product.id, "materials");
      expect(await catalog.listAttributes(product.id)).toHaveLength(1);
      expect(emitted).toContainEqual({
        event: "catalog.attribute.removed",
        payload: { productId: product.id, key: "materials" },
      });
    });
  });

  describe("Catalog entity (real, named, many-to-many with Product)", () => {
    it("creates, gets, gets by slug, and lists catalogs -- a save/round-trip", async () => {
      const created = await catalog.createCatalog({
        slug: "print-shop",
        name: "Print Shop",
        description: "The print-shop demo store's catalog.",
      });
      expect(created.id).toBeTruthy();
      expect(created.createdAt).toBeTruthy();

      expect(await catalog.getCatalog(created.id)).toEqual(created);
      expect(await catalog.getCatalogBySlug("print-shop")).toEqual(created);
      expect(await catalog.getCatalog("missing")).toBeNull();
      expect(await catalog.getCatalogBySlug("missing")).toBeNull();

      const second = await catalog.createCatalog({
        slug: "northline",
        name: "Northline",
        description: "The northline demo store's catalog.",
      });
      const listed = await catalog.listCatalogs();
      expect(listed).toHaveLength(2);
      expect(listed.map((c) => c.id).sort()).toEqual([created.id, second.id].sort());
    });

    it("assigns a product to a catalog and lists both directions", async () => {
      const printShop = await catalog.createCatalog({
        slug: "print-shop-2",
        name: "Print Shop",
        description: "d",
      });
      const product = await catalog.createProduct({
        slug: "widget",
        title: "Widget",
        description: "d",
        identifyingAttributeKeys: [],
      });

      await catalog.assignProductToCatalog(product.id, printShop.id);
      expect(await catalog.listCatalogIdsForProduct(product.id)).toEqual([printShop.id]);
      expect(await catalog.listProductIdsInCatalog(printShop.id)).toEqual([product.id]);
    });

    it("supports a product in more than one catalog (real many-to-many)", async () => {
      const catalogA = await catalog.createCatalog({ slug: "catalog-a", name: "A", description: "d" });
      const catalogB = await catalog.createCatalog({ slug: "catalog-b", name: "B", description: "d" });
      const product = await catalog.createProduct({
        slug: "widget2",
        title: "Widget 2",
        description: "d",
        identifyingAttributeKeys: [],
      });

      await catalog.assignProductToCatalog(product.id, catalogA.id);
      await catalog.assignProductToCatalog(product.id, catalogB.id);

      expect(await catalog.listCatalogIdsForProduct(product.id)).toEqual(
        expect.arrayContaining([catalogA.id, catalogB.id]),
      );
    });

    it("assign is idempotent -- assigning the same pair twice doesn't duplicate", async () => {
      const printShop = await catalog.createCatalog({ slug: "print-shop-3", name: "P", description: "d" });
      const product = await catalog.createProduct({
        slug: "widget3",
        title: "Widget 3",
        description: "d",
        identifyingAttributeKeys: [],
      });

      await catalog.assignProductToCatalog(product.id, printShop.id);
      await catalog.assignProductToCatalog(product.id, printShop.id);
      expect(await catalog.listCatalogIdsForProduct(product.id)).toEqual([printShop.id]);
    });

    it("unassign removes exactly the given pair", async () => {
      const catalogA = await catalog.createCatalog({ slug: "catalog-a2", name: "A", description: "d" });
      const catalogB = await catalog.createCatalog({ slug: "catalog-b2", name: "B", description: "d" });
      const product = await catalog.createProduct({
        slug: "widget4",
        title: "Widget 4",
        description: "d",
        identifyingAttributeKeys: [],
      });

      await catalog.assignProductToCatalog(product.id, catalogA.id);
      await catalog.assignProductToCatalog(product.id, catalogB.id);
      await catalog.unassignProductFromCatalog(product.id, catalogA.id);

      expect(await catalog.listCatalogIdsForProduct(product.id)).toEqual([catalogB.id]);
    });

    it("returns an empty array for a product/catalog with no assignments", async () => {
      expect(await catalog.listCatalogIdsForProduct("missing")).toEqual([]);
      expect(await catalog.listProductIdsInCatalog("missing")).toEqual([]);
    });

    it("rejects createCatalog when the slug is already taken by another catalog", async () => {
      await catalog.createCatalog({ slug: "dup-slug", name: "First", description: "d" });
      await expect(
        catalog.createCatalog({ slug: "dup-slug", name: "Second", description: "d" }),
      ).rejects.toThrow(DuplicateCatalogSlugError);
      expect(await catalog.listCatalogs()).toHaveLength(1);
    });

    it("rejects assignProductToCatalog for a catalog id that doesn't exist", async () => {
      const product = await catalog.createProduct({
        slug: "widget5",
        title: "Widget 5",
        description: "d",
        identifyingAttributeKeys: [],
      });
      await expect(catalog.assignProductToCatalog(product.id, "missing-catalog")).rejects.toThrow(
        CatalogNotFoundError,
      );
    });

    it("listProductsInCatalog resolves real Products via the catalog's own getProduct, not just ids", async () => {
      const printShop = await catalog.createCatalog({ slug: "print-shop-4", name: "Print Shop", description: "d" });
      const widget = await catalog.createProduct({
        slug: "widget6",
        title: "Widget 6",
        description: "d",
        identifyingAttributeKeys: [],
      });
      const gadget = await catalog.createProduct({
        slug: "gadget",
        title: "Gadget",
        description: "d",
        identifyingAttributeKeys: [],
      });

      await catalog.assignProductToCatalog(widget.id, printShop.id);
      await catalog.assignProductToCatalog(gadget.id, printShop.id);

      const products = await catalog.listProductsInCatalog(printShop.id);
      expect(products).toEqual(expect.arrayContaining([widget, gadget]));
      expect(products).toHaveLength(2);
    });

    it("listProductsInCatalog resolves a product genuinely assigned to two catalogs at once", async () => {
      const catalogA = await catalog.createCatalog({ slug: "catalog-a3", name: "A", description: "d" });
      const catalogB = await catalog.createCatalog({ slug: "catalog-b3", name: "B", description: "d" });
      const shared = await catalog.createProduct({
        slug: "shared-widget",
        title: "Shared Widget",
        description: "d",
        identifyingAttributeKeys: [],
      });

      await catalog.assignProductToCatalog(shared.id, catalogA.id);
      await catalog.assignProductToCatalog(shared.id, catalogB.id);

      expect(await catalog.listProductsInCatalog(catalogA.id)).toEqual([shared]);
      expect(await catalog.listProductsInCatalog(catalogB.id)).toEqual([shared]);
    });

    it("listProductsInCatalog filters out assignments whose product no longer exists", async () => {
      const printShop = await catalog.createCatalog({ slug: "print-shop-5", name: "Print Shop", description: "d" });
      await catalog.assignProductToCatalog("ghost-product-id", printShop.id);
      expect(await catalog.listProductsInCatalog(printShop.id)).toEqual([]);
    });
  });
});
