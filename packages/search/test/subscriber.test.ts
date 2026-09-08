import { createSqliteAdapter } from "@mercatus-liber/adapter-sqlite";
import { createCatalogService, type CatalogService } from "@mercatus-liber/catalog";
import { createInMemoryEventBus, type EventBus } from "@mercatus-liber/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryIndex } from "../src/in-memory-index.js";
import { registerCatalogSearchSync } from "../src/subscriber.js";
import type { SearchIndexAdapter } from "../src/types.js";

describe("registerCatalogSearchSync", () => {
  let events: EventBus;
  let catalog: CatalogService;
  let index: SearchIndexAdapter;

  beforeEach(() => {
    events = createInMemoryEventBus();
    const persistence = createSqliteAdapter(":memory:");
    catalog = createCatalogService({ persistence, events });
    index = createInMemoryIndex();
    registerCatalogSearchSync({ events, index, products: catalog }); // structural typing -- catalog never imported by src/, only by this test
  });

  it("indexes a product on catalog.product.created without any direct call back into catalog from the caller", async () => {
    const product = await catalog.createProduct({
      slug: "dragon-organizer",
      title: "Dragon Cable Organizer",
      description: "A dragon-branded cable organizer.",
      identifyingAttributeKeys: [],
    });
    await catalog.publishProduct(product.id); // status must be active to be indexed

    const results = await index.query({ text: "dragon" });
    expect(results.map((d) => d.id)).toEqual([product.id]);
  });

  it("does not index a draft (unpublished) product", async () => {
    await catalog.createProduct({
      slug: "draft-thing",
      title: "Draft Thing",
      description: "d",
      identifyingAttributeKeys: [],
    });
    expect(await index.query({ text: "draft" })).toEqual([]);
  });

  it("carries facetable attributes into the indexed document's facets", async () => {
    const product = await catalog.createProduct({
      slug: "p2",
      title: "P2",
      description: "d",
      identifyingAttributeKeys: [],
    });
    await catalog.publishProduct(product.id);
    await catalog.setAttribute({ productId: product.id, key: "printer_compatible", value: true, facetable: true });
    await catalog.setAttribute({ productId: product.id, key: "internal_note", value: "x", facetable: false });

    const results = await index.query({ facets: { printer_compatible: true } });
    expect(results.map((d) => d.id)).toEqual([product.id]);
    expect(results[0]?.facets).toEqual({ printer_compatible: true });
  });

  it("removes a product from the index when catalog.product.archived fires", async () => {
    const product = await catalog.createProduct({
      slug: "p3",
      title: "P3",
      description: "d",
      identifyingAttributeKeys: [],
    });
    await catalog.publishProduct(product.id);
    expect(await index.query({ text: "p3" })).toHaveLength(1);

    await catalog.archiveProduct(product.id);
    expect(await index.query({ text: "p3" })).toEqual([]);
  });

  it("re-syncs an already-indexed product when catalog.product.updated fires", async () => {
    const product = await catalog.createProduct({
      slug: "p4",
      title: "Old Title",
      description: "d",
      identifyingAttributeKeys: [],
    });
    await catalog.publishProduct(product.id);
    await catalog.updateProduct(product.id, { title: "New Title" });

    expect(await index.query({ text: "old title" })).toEqual([]);
    expect((await index.query({ text: "new title" })).map((d) => d.id)).toEqual([product.id]);
  });
});
