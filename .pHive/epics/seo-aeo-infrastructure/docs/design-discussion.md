# Design Discussion: seo-aeo-infrastructure

## 0. Context

Backlog epic 45. Flagged as the single highest-priority gap by epic 40's competitive research
squad: zero SEO infrastructure exists today. **Confirmed by direct inspection, not assumed:**
every route under `app/demo/[demoSlug]/layout.tsx` shares one static, hardcoded
`export const metadata = { title: "Shop", description: "Browse the catalog, add to cart, and
check out." }` — every product page, every category page, every search-results page across all
3 demos literally shows the browser tab title "Shop," with zero per-page distinction. No
`sitemap.xml`, no `robots.txt`, no structured data anywhere in the repo (confirmed by a repo-wide
search).

## 1. Scope

**Primary target: `apps/reference-storefront`** (the demo storefronts + `commerce.mdostal.com`'s
own landing page, per epic 31's routing). `apps/docs` (Nextra) is out of primary scope --
Nextra ships its own reasonable default per-page metadata derived from each MDX page's
frontmatter/heading already; a lighter follow-up note in this epic's closeout is enough there,
not a parallel custom metadata system.

## 2. Design questions

**(a) Per-page dynamic metadata -- mechanism?**
Resolved: Next.js App Router's native `generateMetadata` export (async, receives route params) --
the framework-idiomatic mechanism, zero new dependencies. Replace the demo layout's one static
`metadata` object with real `generateMetadata` functions on the actual leaf pages that need
per-item distinction (PDP: real product title/description; category: real category title;
search: query-aware title; home: real demo displayName) -- the layout's static export becomes a
sane fallback/root template (`title: { template: "%s | <demo displayName>", default: "<demo
displayName>" }`) for any route that doesn't define its own.

**(b) Sitemap -- one combined, or per-demo?**
Resolved: **one combined root `app/sitemap.ts`** (Next.js's native convention), enumerating
every real route across all 3 demos (home, every category, every product, every published
location/marketing page) plus the framework landing page -- simpler than per-demo sitemaps and
correct for this single-deployment, path-based multi-tenancy architecture (epic 31). Built by
querying each demo's real services (via `getServicesForDemo`), not hardcoded route lists, so it
stays accurate as catalogs grow (epics 35-37's new depth already means many more real URLs
exist than when epic 31 shipped).

**(c) Structured data -- how much, on what pages?**
Resolved: `Product` schema (JSON-LD) on every PDP (real price/availability/description),
`Organization`/`WebSite` schema on the framework landing page, `BreadcrumbList` on category/PDP
pages (category -> product, matching real nav hierarchy). Not overbuilt beyond this -- these 3
schema types cover the highest-value real estate (product rich results, sitelinks search box,
breadcrumb rich results) without speculative schema for content that doesn't exist yet.

**(d) AEO (answer-engine optimization) -- what does this concretely mean here?**
Resolved: (i) a real `llms.txt` at the repo root of the deployed site (the emerging convention
for AI crawlers/agents -- a plain-text summary of what the site/framework is and where its real
docs/demos live, distinct from `robots.txt`'s crawl-permission semantics), (ii) confirming the
semantic HTML already in place (epic 34's real nav/heading structure, not div-soup) is clean
enough for an LLM to parse without extra work, (iii) one real structured FAQ/Q&A block (JSON-LD
`FAQPage` schema) on the framework landing page answering the genuinely common questions a
prospective adopter or AI agent researching this framework would ask (what is it, is it free,
can I self-host it, does it support X payment/CMS provider) -- sourced from real content already
in README.md/VISION.md, not invented.

## 3. Scope assessment

**Medium.** Framework-native mechanisms throughout (`generateMetadata`, `app/sitemap.ts`,
`app/robots.ts`), no new dependencies, no schema/persistence change. Bounded to
`apps/reference-storefront`.

## 4. Stories

1. **dynamic-metadata-and-canonical** -- real `generateMetadata` on PDP/category/search/home
   pages across all 3 demos plus the landing page, a sane root-template fallback replacing the
   one static "Shop" title, canonical URLs via `metadata.alternates.canonical`.
2. **sitemap-robots-structured-data** -- `app/sitemap.ts` (real, live-queried, all 3 demos),
   `app/robots.ts`, `Product`/`Organization`/`BreadcrumbList` JSON-LD.
3. **aeo-and-verification** -- `llms.txt`, one real `FAQPage` JSON-LD block on the landing page,
   full live verification (real distinct titles per page confirmed across multiple products/
   categories, valid sitemap XML fetched and parsed, JSON-LD validated as real parseable JSON
   matching schema.org shapes), docs update, closeout, merge.

## 5. Risks

- **Low.** Purely additive metadata/route-convention work -- no existing behavior changes
  except the literal title text shoppers see, which was a confirmed defect, not a working
  feature being altered.

## 6. Open questions

None blocking.
