import type { MetadataRoute } from "next";
import { DEMO_SLUGS } from "../lib/demos";
import { getServicesForDemo } from "../lib/services";
import { canonicalUrl } from "../lib/site-url";

/**
 * seo-02: `sitemap.js`/`sitemap.ts` is cached by default unless it uses a
 * request-time API or opts into dynamic rendering (see node_modules/next/
 * dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/
 * sitemap.md's "Good to know" note) -- this route reads live, in-memory
 * per-demo catalog/CMS state via getServicesForDemo, which real seeded
 * content/admin mutations change at runtime, so it must always be
 * regenerated per request, the same `force-dynamic` opt-in every other
 * live-queried route in this app already uses (see e.g.
 * app/demo/[demoSlug]/products/[slug]/page.tsx).
 */
export const dynamic = "force-dynamic";

/**
 * A real, live-queried sitemap -- one combined root sitemap across all 3
 * demos (design-discussion.md §2b), NOT a hardcoded route list. For each
 * demo in DEMO_REGISTRY this calls the real getServicesForDemo(slug) and
 * enumerates: the demo's home page, every real category
 * (marketingCatalog.listCategories), every real *published* product
 * (catalog.listProducts({ status: "active" }) -- "active" is catalog's own
 * published state, see packages/catalog/src/service.ts's publishProduct),
 * and every real *published* CMS marketing/location page
 * (cms.listPages({ pageType, status: "published" })) -- plus the
 * demo-agnostic framework landing page itself. Every URL is built from
 * story seo-01's real canonicalUrl() (lib/site-url.ts), the same base-URL
 * resolution every generateMetadata call in this app already reuses.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: canonicalUrl("/"), changeFrequency: "monthly", priority: 1 },
  ];

  for (const demoSlug of DEMO_SLUGS) {
    const { catalog, marketingCatalog, cms } = await getServicesForDemo(demoSlug);

    entries.push({
      url: canonicalUrl(`/demo/${demoSlug}`),
      changeFrequency: "daily",
      priority: 0.9,
    });

    const categories = await marketingCatalog.listCategories();
    for (const category of categories) {
      entries.push({
        url: canonicalUrl(`/demo/${demoSlug}/category/${category.slug}`),
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }

    // "active" is catalog's own published status (draft -> active via
    // publishProduct) -- a draft/archived product has no real public PDP
    // worth indexing.
    const products = await catalog.listProducts({ status: "active" });
    for (const product of products) {
      entries.push({
        url: canonicalUrl(`/demo/${demoSlug}/products/${product.slug}`),
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }

    // Marketing (campaign) pages render at /demo/[demoSlug]/campaign/[slug]
    // (see app/demo/[demoSlug]/campaign/[slug]/page.tsx's cms.getPageBySlug(slug)).
    const marketingPages = await cms.listPages({ pageType: "marketing", status: "published" });
    for (const page of marketingPages) {
      entries.push({
        url: canonicalUrl(`/demo/${demoSlug}/campaign/${page.slug}`),
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }

    // Location pages render at /demo/[demoSlug]/locations/[slug], keyed by
    // the same slug as the CMS "location" page (see app/demo/[demoSlug]/
    // locations/[slug]/page.tsx's cms.getPageBySlug(slug) lookup).
    const locationPages = await cms.listPages({ pageType: "location", status: "published" });
    for (const page of locationPages) {
      entries.push({
        url: canonicalUrl(`/demo/${demoSlug}/locations/${page.slug}`),
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }
  }

  return entries;
}
