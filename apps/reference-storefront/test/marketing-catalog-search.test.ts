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
    // Original 3 (tote, cap, hoodie) + demo-store-catalog-depth's 7 new
    // embroidered products (zip pouch, luggage tag, baby onesie, canvas
    // apron, quarter-zip pullover, kids' tee, iron-on patch set) +
    // product-configurator's 1 new 2-axis product (Embroidered Performance
    // Polo, lib/seed.ts's DEMO_MULTI_AXIS_VARIANT_PRODUCTS).
    expect(embroideryProductIds).toHaveLength(11);

    const apparel = await marketingCatalog.getCategoryBySlug("apparel");
    const apparelProductIds = await marketingCatalog.listProductIdsInCategory(apparel!.id);
    // Original 2 (hoodie, tee) + demo-store-catalog-depth's 5 new apparel
    // products (baby onesie, canvas apron, quarter-zip pullover, kids' tee,
    // screen-printed sweatshirt) + product-configurator's 1 new 2-axis
    // product (Embroidered Performance Polo).
    expect(apparelProductIds).toHaveLength(8);

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
    // Original 4 + demo-store-catalog-depth's 7 new products + product-
    // configurator's 1 new 2-axis product, all with a title that literally
    // says "Embroidered" (see lib/seed.ts's DEMO_PRODUCTS/
    // DEMO_VARIANT_PRODUCTS/DEMO_MULTI_AXIS_VARIANT_PRODUCTS doc comments) --
    // the woven (non-embroidered) patch set is deliberately excluded here,
    // proving this is a real substring match, not "everything in the
    // embroidery category".
    expect(titles).toEqual([
      "Embroidered Baby Onesie",
      "Embroidered Canvas Apron",
      "Embroidered Canvas Tote Bag",
      "Embroidered Cotton T-Shirt",
      "Embroidered Dad Cap",
      "Embroidered Fleece Hoodie",
      "Embroidered Iron-On Patch Set (Set of 3)",
      "Embroidered Luggage Tag",
      "Embroidered Performance Polo",
      "Embroidered Quarter-Zip Pullover",
      "Embroidered Zip Pouch",
      "Kids' Embroidered Tee",
    ]);
  });
});
