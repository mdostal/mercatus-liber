/**
 * mc-03: proves the seeded demo data exercises many-to-many category
 * assignment and that the search index reflects seeded products without a
 * manual reindex call (via the event-driven subscriber wired in
 * lib/services.ts, exercised here the same way test/integration.test.ts
 * exercises the core-foundation slice -- rebuilding the same wiring shape
 * directly rather than importing lib/services.ts's process-singleton).
 */
import { createInMemoryIndex, registerCatalogSearchSync } from "@mercatus-liber/search";
import { describe, expect, it } from "vitest";
import { seedCatalog } from "../lib/seed.js";
import { buildTestCatalogServices } from "./helpers.js";

describe("seeded marketing catalog + search", () => {
  it("assigns the seeded products to categories, including a shared category (many-to-many)", async () => {
    const { catalog, marketingCatalog, cms, inventory } = buildTestCatalogServices();
    await seedCatalog(catalog, marketingCatalog, cms, inventory);

    // "Embroidered Fleece Hoodie" is deliberately assigned to BOTH
    // "embroidery" and "apparel" (see lib/seed.ts's DEMO_PRODUCTS doc
    // comment) -- proves many-to-many, not just 1:1.
    const embroidery = await marketingCatalog.getCategoryBySlug("embroidery");
    expect(embroidery).not.toBeNull();
    const embroideryProductIds = await marketingCatalog.listProductIdsInCategory(embroidery!.id);
    expect(embroideryProductIds).toHaveLength(3); // tote, cap, hoodie

    const apparel = await marketingCatalog.getCategoryBySlug("apparel");
    const apparelProductIds = await marketingCatalog.listProductIdsInCategory(apparel!.id);
    expect(apparelProductIds).toHaveLength(2); // hoodie, tee

    const hoodie = await catalog.getProductBySlug("embroidered-fleece-hoodie");
    expect(embroideryProductIds).toContain(hoodie!.id);
    expect(apparelProductIds).toContain(hoodie!.id);
  });

  it("indexes every seeded product for search without a manual reindex call", async () => {
    const { events, catalog, marketingCatalog, cms, inventory } = buildTestCatalogServices();

    const search = createInMemoryIndex();
    registerCatalogSearchSync({ events, index: search, products: catalog });

    await seedCatalog(catalog, marketingCatalog, cms, inventory);

    const results = await search.query({ text: "embroidered" });
    expect(results.length).toBeGreaterThanOrEqual(4);
    const titles = results.map((r) => r.title).sort();
    expect(titles).toEqual([
      "Embroidered Canvas Tote Bag",
      "Embroidered Cotton T-Shirt",
      "Embroidered Dad Cap",
      "Embroidered Fleece Hoodie",
    ]);
  });
});
