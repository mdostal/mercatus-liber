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

  it("ships exactly the 4 default components: hero-banner, ad-slot, category-spot, product-grid", () => {
    const types = cms.components.list().map((c) => c.type).sort();
    expect(types).toEqual(["ad-slot", "category-spot", "hero-banner", "product-grid"]);
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
});
