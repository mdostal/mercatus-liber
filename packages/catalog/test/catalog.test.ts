import { createSqliteAdapter } from "@mercatus-liber/adapter-sqlite";
import { createInMemoryEventBus, type EventBus } from "@mercatus-liber/core";
import { beforeEach, describe, expect, it } from "vitest";
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
    ]) {
      events.subscribe(name, async (payload) => {
        emitted.push({ event: name, payload });
      });
    }
    const persistence = createSqliteAdapter(":memory:");
    catalog = createCatalogService({ persistence, events });
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

      await catalog.removeAttribute(product.id, "materials");
      expect(await catalog.listAttributes(product.id)).toHaveLength(1);
    });
  });
});
