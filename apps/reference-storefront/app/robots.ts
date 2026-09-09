import type { MetadataRoute } from "next";
import { getSiteUrl } from "../lib/site-url";

/**
 * seo-02: a real robots.txt (Next.js's native `robots.ts` file convention).
 * Allows every real shopper-facing route; explicitly disallows every demo's
 * `/admin/*` subtree (already auth-gated behind Clerk/dev-session -- see
 * lib/services.ts's adminAuth wiring -- but excluding it from crawl
 * indexing is still correct practice, per the story spec). The `*` glob
 * covers every current and future demo slug (print-shop/northline/broadleaf
 * today) without needing to enumerate DEMO_SLUGS by hand -- major crawlers
 * (Googlebot et al.) support `*` wildcards in robots.txt path patterns.
 * References the real sitemap URL below, built from the same
 * getSiteUrl() this app's canonicalUrl() (lib/site-url.ts) already uses.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/demo/*/admin",
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
