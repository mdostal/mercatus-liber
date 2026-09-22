import { beforeEach, describe, expect, it } from "vitest";
import { createComponentRegistry } from "../src/component-registry.js";
import { createInMemoryCmsAdapter } from "../src/in-memory-repository.js";
import { createCmsService, type CmsService } from "../src/service.js";
import { PageNotFoundError } from "../src/types.js";

describe("cms service", () => {
  let cms: CmsService;

  beforeEach(() => {
    cms = createCmsService({
      persistence: createInMemoryCmsAdapter(),
      components: createComponentRegistry(),
    });
  });

  it("ships exactly the 5 default components: hero-banner, ad-slot, category-spot, product-grid, service-area-info", () => {
    const types = cms.components.list().map((c) => c.type).sort();
    expect(types).toEqual(["ad-slot", "category-spot", "hero-banner", "product-grid", "service-area-info"]);
  });

  it("accepts a 'location' page -- the service-areas subsystem's page type", async () => {
    const page = await cms.createPage({
      pageType: "location",
      slug: "royse-city-tx",
      title: "Royse City, TX",
      sections: [{ componentType: "service-area-info", config: { hours: "Mon-Fri 8am-6pm" } }],
    });
    expect(page.pageType).toBe("location");
    expect((await cms.listPages({ pageType: "location" })).map((p) => p.id)).toEqual([page.id]);
  });

  it("creates a page as draft and publishPage transitions it to published", async () => {
    const page = await cms.createPage({
      pageType: "home",
      slug: "home",
      title: "Home",
      sections: [{ componentType: "hero-banner", config: { headline: "Welcome" } }],
    });
    expect(page.status).toBe("draft");

    const published = await cms.publishPage(page.id);
    expect(published.status).toBe("published");
    expect((await cms.getPage(page.id))?.status).toBe("published");
  });

  it("getPageBySlug returns a page regardless of draft/published status", async () => {
    const page = await cms.createPage({ pageType: "home", slug: "home", title: "Home", sections: [] });
    const found = await cms.getPageBySlug("home");
    expect(found?.id).toBe(page.id);
    expect(found?.status).toBe("draft");
  });

  it("throws PageNotFoundError when publishing or updating an unknown page", async () => {
    await expect(cms.publishPage("missing")).rejects.toThrow(PageNotFoundError);
    await expect(cms.updatePage("missing", { title: "x" })).rejects.toThrow(PageNotFoundError);
  });

  it("createMarketingPage creates both a Page and its MarketingPageMeta with the curated product order preserved exactly", async () => {
    const { page, meta } = await cms.createMarketingPage({
      slug: "fall-sale",
      title: "Fall Sale",
      sections: [{ componentType: "product-grid", config: {} }],
      campaignName: "Fall Sale 2026",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      productIds: ["p3", "p1", "p2"],
    });

    expect(page.pageType).toBe("marketing");
    expect(meta.pageId).toBe(page.id);
    // Curated order preserved exactly -- NOT sorted, NOT deduplicated-and-reordered.
    expect(meta.productIds).toEqual(["p3", "p1", "p2"]);

    const fetchedMeta = await cms.getMarketingPageMeta(page.id);
    expect(fetchedMeta).toEqual(meta);
  });

  it("listPages filters by pageType and status", async () => {
    const home = await cms.createPage({ pageType: "home", slug: "home", title: "Home", sections: [] });
    await cms.publishPage(home.id);
    await cms.createMarketingPage({
      slug: "sale",
      title: "Sale",
      sections: [],
      campaignName: "Sale",
      startDate: "2026-01-01",
      endDate: null,
      productIds: [],
    });

    expect((await cms.listPages({ pageType: "home" })).map((p) => p.id)).toEqual([home.id]);
    expect((await cms.listPages({ status: "published" })).map((p) => p.id)).toEqual([home.id]);
    expect((await cms.listPages({ status: "draft" })).map((p) => p.pageType)).toEqual(["marketing"]);
  });

  /**
   * Real, confirmed live bug (2026-09-22): under a SHARED persistent CMS
   * backend, print-shop's own "Fall Sale" campaign page showed up in
   * Broadleaf's and Northline's nav too, because `listPages` had no way to
   * scope a query to one demo's own pages. This proves the fix: two
   * different demos' marketing pages never bleed into each other's
   * demoSlug-scoped `listPages` results, and an unscoped `listPages()` call
   * (e.g. a legitimate cross-demo admin view) still returns everything,
   * fully backward compatible.
   */
  it("listPages scopes by demoSlug -- two different demos' pages never bleed into each other's results", async () => {
    const printShopHome = await cms.createPage({
      pageType: "home",
      slug: "home-print-shop",
      title: "The Print Shop",
      sections: [],
      demoSlug: "print-shop",
    });
    await cms.publishPage(printShopHome.id);
    const { page: printShopSale } = await cms.createMarketingPage({
      slug: "fall-sale",
      title: "Fall Sale",
      sections: [],
      campaignName: "Fall Sale 2026",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      productIds: [],
      demoSlug: "print-shop",
    });
    await cms.publishPage(printShopSale.id);

    const broadleafHome = await cms.createPage({
      pageType: "home",
      slug: "home-broadleaf",
      title: "Broadleaf & Co.",
      sections: [],
      demoSlug: "broadleaf",
    });
    await cms.publishPage(broadleafHome.id);

    const printShopMarketing = await cms.listPages({ pageType: "marketing", status: "published", demoSlug: "print-shop" });
    expect(printShopMarketing.map((p) => p.slug)).toEqual(["fall-sale"]);

    const broadleafMarketing = await cms.listPages({ pageType: "marketing", status: "published", demoSlug: "broadleaf" });
    expect(broadleafMarketing).toEqual([]);

    const broadleafAll = await cms.listPages({ demoSlug: "broadleaf" });
    expect(broadleafAll.map((p) => p.id)).toEqual([broadleafHome.id]);

    // Unscoped listPages() (no demoSlug filter) legitimately still returns
    // every demo's pages -- backward compatible, for admin surfaces that
    // genuinely want the whole cross-demo picture.
    const everything = await cms.listPages({});
    expect(everything.map((p) => p.id).sort()).toEqual(
      [printShopHome.id, printShopSale.id, broadleafHome.id].sort(),
    );
  });
});
