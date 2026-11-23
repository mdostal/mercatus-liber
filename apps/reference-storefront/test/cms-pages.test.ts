/**
 * cms-02: proves the seeded home page and marketing/campaign page are real,
 * CMS-authored content -- not hardcoded data -- and that the marketing
 * page's curated product order is preserved.
 */
import { describe, expect, it, vi } from "vitest";
import { seedCatalog } from "../lib/seed.js";
import { buildTestCatalogServices } from "./helpers.js";

describe("seeded CMS pages", () => {
  it("seeds a published home page with a hero-banner and a category-spot section", async () => {
    const { catalog, marketingCatalog, cms, inventory } = buildTestCatalogServices();
    await seedCatalog(catalog, marketingCatalog, cms, inventory);

    const home = await cms.getPageBySlug("home-print-shop");
    expect(home).not.toBeNull();
    expect(home?.status).toBe("published");
    // ad-slot added by epic 23 (advertising); marketing-tile by scheduled-lines -- see lib/seed.ts's seedCmsPages.
    expect(home?.sections.map((s) => s.componentType)).toEqual(["hero-banner", "marketing-tile", "category-spot", "ad-slot"]);

    const categorySpot = home!.sections.find((s) => s.componentType === "category-spot");
    expect(categorySpot?.config).toEqual({ categorySlugs: ["embroidery", "custom-coasters"] });
  });

  it("seeds a published marketing page with a curated single-product mini-catalog", async () => {
    const { catalog, marketingCatalog, cms, inventory } = buildTestCatalogServices();
    await seedCatalog(catalog, marketingCatalog, cms, inventory);

    const campaign = await cms.getPageBySlug("fall-sale");
    expect(campaign).not.toBeNull();
    expect(campaign?.pageType).toBe("marketing");
    expect(campaign?.status).toBe("published");

    const meta = await cms.getMarketingPageMeta(campaign!.id);
    expect(meta?.campaignName).toBe("Fall Sale 2026");
    expect(meta?.productIds).toHaveLength(1);

    const tote = await catalog.getProductBySlug("embroidered-canvas-tote");
    expect(meta?.productIds).toEqual([tote?.id]);
  });

  it("still seeds, without the tile, when the CMS refuses writes to an existing page", async () => {
    const { catalog, marketingCatalog, cms, inventory } = buildTestCatalogServices();
    const readOnlyUpdates = Object.assign(Object.create(Object.getPrototypeOf(cms)), cms, {
      updatePage: async () => {
        throw new Error('Insufficient permissions; permission "update" required');
      },
    }) as typeof cms;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(seedCatalog(catalog, marketingCatalog, readOnlyUpdates, inventory)).resolves.not.toThrow();
    const home = await cms.getPageBySlug("home-print-shop");
    expect(home?.sections.map((s) => s.componentType)).toEqual(["hero-banner", "category-spot", "ad-slot"]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("marketing tile"));
    warn.mockRestore();
  });
});
