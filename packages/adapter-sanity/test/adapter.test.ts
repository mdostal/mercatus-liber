import type { MarketingPageMeta, Page } from "@mercatus-liber/cms";
import { beforeEach, describe, expect, it } from "vitest";
import { createSanityAdapter } from "../src/index.js";
import { createFakeSanityFetch } from "./fake-sanity-store.js";

describe("createSanityAdapter", () => {
  let adapter: ReturnType<typeof createSanityAdapter>;

  beforeEach(() => {
    adapter = createSanityAdapter({
      projectId: "test-project",
      dataset: "production",
      token: "sk_fake",
      fetchImpl: createFakeSanityFetch(),
    });
  });

  const home: Page = {
    id: "page-1",
    pageType: "home",
    slug: "home",
    title: "Home",
    status: "draft",
    sections: [{ componentType: "hero-banner", config: { headline: "Welcome" } }],
  };

  describe("pages -- same canonical scenarios as the built-in in-memory adapter", () => {
    it("saves and retrieves a page by id, exactly as given -- no id bridging needed (unlike Shopify)", async () => {
      await adapter.pages.save(home);
      const found = await adapter.pages.get("page-1");
      expect(found).toEqual(home);
    });

    it("retrieves a page by slug regardless of draft/published status", async () => {
      await adapter.pages.save(home);
      const found = await adapter.pages.getBySlug("home");
      expect(found?.id).toBe("page-1");
      expect(found?.status).toBe("draft");
    });

    it("returns null for a missing page", async () => {
      expect(await adapter.pages.get("missing")).toBeNull();
      expect(await adapter.pages.getBySlug("missing")).toBeNull();
    });

    it("lists pages, optionally filtered by pageType and status", async () => {
      await adapter.pages.save(home);
      await adapter.pages.save({ ...home, id: "page-2", slug: "sale", pageType: "marketing", status: "published" });

      expect(await adapter.pages.list()).toHaveLength(2);
      expect((await adapter.pages.list({ pageType: "home" })).map((p) => p.id)).toEqual(["page-1"]);
      expect((await adapter.pages.list({ status: "published" })).map((p) => p.id)).toEqual(["page-2"]);
    });

    it("upserts on save with the same id (createOrReplace) rather than creating a duplicate", async () => {
      await adapter.pages.save(home);
      await adapter.pages.save({ ...home, title: "Updated Home" });
      const found = await adapter.pages.get("page-1");
      expect(found?.title).toBe("Updated Home");
      expect(await adapter.pages.list()).toHaveLength(1);
    });

    it("round-trips sections (componentType + config) exactly, including nested config objects", async () => {
      await adapter.pages.save(home);
      const found = await adapter.pages.get("page-1");
      expect(found?.sections).toEqual([{ componentType: "hero-banner", config: { headline: "Welcome" } }]);
    });

    it("publishing (status draft -> published) round-trips correctly", async () => {
      await adapter.pages.save(home);
      await adapter.pages.save({ ...home, status: "published" });
      expect((await adapter.pages.get("page-1"))?.status).toBe("published");
    });
  });

  describe("marketingMeta -- same canonical scenarios", () => {
    const meta: MarketingPageMeta = {
      pageId: "page-2",
      campaignName: "Fall Sale 2026",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      productIds: ["p3", "p1", "p2"],
    };

    it("saves and retrieves marketing meta by page id, preserving curated product order exactly (not sorted)", async () => {
      await adapter.marketingMeta.save(meta);
      const found = await adapter.marketingMeta.getByPageId("page-2");
      expect(found).toEqual(meta);
      expect(found?.productIds).toEqual(["p3", "p1", "p2"]);
    });

    it("returns null for a page with no marketing meta", async () => {
      expect(await adapter.marketingMeta.getByPageId("missing")).toBeNull();
    });

    it("handles an open-ended campaign (endDate: null)", async () => {
      await adapter.marketingMeta.save({ ...meta, endDate: null });
      expect((await adapter.marketingMeta.getByPageId("page-2"))?.endDate).toBeNull();
    });

    it("upserts on save with the same pageId rather than creating a duplicate", async () => {
      await adapter.marketingMeta.save(meta);
      await adapter.marketingMeta.save({ ...meta, campaignName: "Fall Sale 2026 (extended)" });
      expect((await adapter.marketingMeta.getByPageId("page-2"))?.campaignName).toBe("Fall Sale 2026 (extended)");
    });
  });

  it("exposes only the CmsPersistenceAdapter interface -- no Sanity-specific member leaks through", () => {
    const keys = Object.keys(adapter).sort();
    expect(keys).toEqual(["marketingMeta", "pages"]);
    expect(Object.keys(adapter.pages).sort()).toEqual(["get", "getBySlug", "list", "save"]);
    expect(Object.keys(adapter.marketingMeta).sort()).toEqual(["getByPageId", "save"]);
  });
});
