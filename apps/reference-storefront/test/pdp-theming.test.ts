/**
 * pt-03: proves the reference storefront's PDP is actually theming-driven --
 * default resolution picks the first-registered template (tabbed-detail), and
 * an override switches to long-scroll, with identical underlying view-model
 * data either way.
 */
import { createSqliteAdapter } from "@mercatus-liber/adapter-sqlite";
import { createCatalogService } from "@mercatus-liber/catalog";
import { createInMemoryEventBus } from "@mercatus-liber/core";
import {
  createInMemoryCategoryRepository,
  createInMemoryProductCategoryRepository,
  createMarketingCatalogService,
} from "@mercatus-liber/marketing-catalog";
import { createPdpService } from "@mercatus-liber/pdp";
import { createThemingService } from "@mercatus-liber/theming";
import { describe, expect, it } from "vitest";
import { seedCatalog } from "../lib/seed.js";

describe("PDP theming wiring", () => {
  it("defaults to the first-registered template (tabbed-detail) with no override", async () => {
    const events = createInMemoryEventBus();
    const persistence = createSqliteAdapter(":memory:");
    const catalog = createCatalogService({ persistence, events });
    const marketingCatalog = createMarketingCatalogService({
      categories: createInMemoryCategoryRepository(),
      assignments: createInMemoryProductCategoryRepository(),
      attributes: catalog,
    });
    await seedCatalog(catalog, marketingCatalog);

    const theming = createThemingService();
    const pdp = createPdpService({ catalog, theming });

    const viewModel = await pdp.getViewModel("dragon-cable-organizer");
    expect(viewModel?.templateKey).toBe("pdp.tabbed-detail");
  });

  it("an override resolves to a different template with the same underlying data", async () => {
    const events = createInMemoryEventBus();
    const persistence = createSqliteAdapter(":memory:");
    const catalog = createCatalogService({ persistence, events });
    const marketingCatalog = createMarketingCatalogService({
      categories: createInMemoryCategoryRepository(),
      assignments: createInMemoryProductCategoryRepository(),
      attributes: catalog,
    });
    await seedCatalog(catalog, marketingCatalog);

    const theming = createThemingService();
    const pdp = createPdpService({ catalog, theming });

    const defaultView = await pdp.getViewModel("dragon-cable-organizer");
    const longScrollView = await pdp.getViewModel("dragon-cable-organizer", "pdp.long-scroll");

    expect(longScrollView?.templateKey).toBe("pdp.long-scroll");
    expect(defaultView?.templateKey).not.toBe(longScrollView?.templateKey);
    // Same product/SKU data regardless of which template renders it.
    expect(longScrollView?.product).toEqual(defaultView?.product);
    expect(longScrollView?.skus).toEqual(defaultView?.skus);
  });
});
