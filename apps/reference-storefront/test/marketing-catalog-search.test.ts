/**
 * mc-03: proves the seeded demo data exercises many-to-many category
 * assignment and that the search index reflects seeded products without a
 * manual reindex call (via the event-driven subscriber wired in
 * lib/services.ts, exercised here the same way test/integration.test.ts
 * exercises the core-foundation slice -- rebuilding the same wiring shape
 * directly rather than importing lib/services.ts's process-singleton).
 */
import { createSqliteAdapter } from "@mercatus-liber/adapter-sqlite";
import { createCatalogService } from "@mercatus-liber/catalog";
import { createInMemoryEventBus } from "@mercatus-liber/core";
import {
  createInMemoryCategoryRepository,
  createInMemoryProductCategoryRepository,
  createMarketingCatalogService,
} from "@mercatus-liber/marketing-catalog";
import { createInMemoryIndex, registerCatalogSearchSync } from "@mercatus-liber/search";
import { describe, expect, it } from "vitest";
import { seedCatalog } from "../lib/seed.js";

describe("seeded marketing catalog + search", () => {
  it("assigns the seeded products to categories, including a shared category (many-to-many)", async () => {
    const events = createInMemoryEventBus();
    const persistence = createSqliteAdapter(":memory:");
    const catalog = createCatalogService({ persistence, events });
    const marketingCatalog = createMarketingCatalogService({
      categories: createInMemoryCategoryRepository(),
      assignments: createInMemoryProductCategoryRepository(),
      attributes: catalog,
    });
    await seedCatalog(catalog, marketingCatalog);

    const deskAccessories = await marketingCatalog.getCategoryBySlug("desk-accessories");
    expect(deskAccessories).not.toBeNull();
    const productIdsInCategory = await marketingCatalog.listProductIdsInCategory(deskAccessories!.id);
    // Both seeded products share "desk-accessories" -- proves many-to-many, not just 1:1.
    expect(productIdsInCategory).toHaveLength(2);

    const printed3d = await marketingCatalog.getCategoryBySlug("3d-printed");
    const printedProductIds = await marketingCatalog.listProductIdsInCategory(printed3d!.id);
    expect(printedProductIds).toHaveLength(1);
  });

  it("indexes every seeded product for search without a manual reindex call", async () => {
    const events = createInMemoryEventBus();
    const persistence = createSqliteAdapter(":memory:");
    const catalog = createCatalogService({ persistence, events });
    const marketingCatalog = createMarketingCatalogService({
      categories: createInMemoryCategoryRepository(),
      assignments: createInMemoryProductCategoryRepository(),
      attributes: catalog,
    });

    const search = createInMemoryIndex();
    registerCatalogSearchSync({ events, index: search, products: catalog });

    await seedCatalog(catalog, marketingCatalog);

    const results = await search.query({ text: "dragon" });
    expect(results.length).toBeGreaterThanOrEqual(2);
    const titles = results.map((r) => r.title).sort();
    expect(titles).toEqual(["Dragon Cable Organizer", "Dragon Desk Mat"]);
  });
});
