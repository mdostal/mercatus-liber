/**
 * A cold start re-runs a demo's whole seed against whatever the shared
 * database already holds. Before 2026-11-20 five seed steps inserted
 * unconditionally, and the live demo database had piled up 1,971 bundles,
 * 4,658 campaigns, 5,197 recommendation rules and 57,994 reviews. Seeding a
 * demo a second time against the same services must add nothing.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Services } from "../lib/services";

async function servicesFor(slug: "print-shop" | "northline" | "broadleaf"): Promise<Services> {
  for (const key of ["DATABASE_URL", "MONGODB_URL", "MONGODB_URI", "CONVEX_URL", "SQLITE_FILE_PATH", "SANITY_PROJECT_ID"]) vi.stubEnv(key, "");
  vi.resetModules();
  const { getServicesForDemo, __resetServicesCacheForTests } = await import("../lib/services");
  __resetServicesCacheForTests();
  return getServicesForDemo(slug);
}

async function counts(s: Services, slug: string) {
  return {
    bundles: (await s.bundles.listBundles({ demoSlug: slug })).length,
    rules: (await s.recommendations.listRules({ demoSlug: slug })).length,
    campaigns: (await s.advertising.listCampaigns({ demoSlug: slug })).length,
    promotions: (await s.promotions.listPromotions({ demoSlug: slug })).length,
    reviews: (await s.reviews.listAllForModeration()).length,
    publishedReviews: (await s.reviews.listAllForModeration({ status: "published" })).length,
  };
}

describe("seeding a demo again adds nothing", { timeout: 60_000 }, () => {
  afterEach(() => vi.unstubAllEnvs());

  for (const slug of ["print-shop", "northline", "broadleaf"] as const) {
    it(slug, async () => {
      const s = await servicesFor(slug);
      const before = await counts(s, slug);
      expect(before.bundles).toBeGreaterThan(0);
      expect(before.reviews).toBeGreaterThan(0);

      const { DEMO_REGISTRY } = await import("../lib/demos");
      const deps = {
        catalog: s.catalog,
        marketingCatalog: s.marketingCatalog,
        cms: s.cms,
        inventory: s.inventory,
        serviceAreas: s.serviceAreas,
        bundles: s.bundles,
        recommendations: s.recommendations,
        advertising: s.advertising,
        promotions: s.promotions,
        reviews: s.reviews,
        storefrontViews: s.storefrontViews,
      };
      await DEMO_REGISTRY[slug].seed(deps);
      await DEMO_REGISTRY[slug].seed(deps);
      expect(await counts(s, slug)).toEqual(before);
    });
  }
});
