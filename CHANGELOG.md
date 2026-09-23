# Changelog

All notable changes to this project are documented in this file. Entries are grouped by
release, oldest first.

This changelog covers epics 20-65 plus this reconstruction epic's own closeout
(`changelog-and-version-reconstruction`). Epics 20-25 were documented live as they merged; epics
26-65 were reconstructed retroactively by the `changelog-and-version-reconstruction` epic from
each epic's own `epic.yaml` `version_bump` where one existed, and a best-evidenced inferred
bump from `.pHive/planning/epic-backlog.md`'s row text where it didn't -- see
`.pHive/epics/changelog-and-version-reconstruction/docs/reconstruction-working-doc.md` for the
full research trail. Earlier epics (1-19) have no retroactive changelog or version history --
that is disclosed, pre-existing debt tracked in
`.pHive/epics/commerce-gap-audit-2/docs/audit-findings.md`, still out of scope.

## [0.2.0] - 2026-09-08

### Added

- **Promotions & discounts** (`@mercatus-liber/promotions`, subsystem 16): coupon-code and
  auto-applied percentage/fixed discounts, cart-scope and product-scope. Wires into
  checkout-orders through a narrow optional `PricingAdjuster` interface, so `previewCheckout`
  and `startCheckout` can compute a discounted total with zero changes required from
  deployments that don't adopt promotions.

## [0.3.0] - 2026-09-08

### Added

- **Bundles** (`@mercatus-liber/bundles`, subsystem 17): multi-product tiered bundles (e.g.
  "Product Only" / "+ Pro Setup" / "Complete Overhaul") sold from a single PDP. A selected
  tier resolves to ordinary per-SKU cart lines at the app layer, so cart, checkout-orders,
  promotions, and inventory needed no changes to support it.

## [0.4.0] - 2026-09-08

### Added

- **Upsell / cross-sell recommendations** (`@mercatus-liber/recommendations`, subsystem 18):
  admin-curated "customers also bought" product-to-product links shown on the PDP and cart,
  with a same-category fallback heuristic so every product gets a reasonable shelf even
  before an admin curates anything.

## [0.5.0] - 2026-09-08

### Added

- **Advertising** (`@mercatus-liber/advertising`, subsystem 19): admin-curated ad campaigns
  and creatives with optional service-area/page targeting and stateless weighted-random
  rotation, filling in the CMS's previously unimplemented ad-slot component.

## [0.6.0] - 2026-09-08

### Added

- **Internal BI / metrics** (`@mercatus-liber/internal-bi`, subsystem 20): an owned internal
  analytics layer -- revenue over time, order volume, top products, conversion funnel, and
  promotion redemption rates -- surfaced at `/admin/metrics`, distinct from the write-only
  PostHog forwarding in `@mercatus-liber/analytics`.

### Changed

- `checkout-orders`: `Order` gained an additive, required `createdAt` timestamp field to
  support BI's revenue-over-time and funnel calculations.

## [0.6.1] - 2026-09-08

### Added

- **Admin adapter-visibility settings page**: a read-only `/admin/settings` page showing
  which concrete adapter (persistence, CMS, payments, analytics) this running instance
  actually chose, backed by a small hand-maintained descriptor module kept next to each
  adapter's construction site so it can't silently drift from reality.

## [0.6.2] - 2026-09-08

### Fixed

- **Gap-audit-2 quick fixes** (repo-wide): closed three small, real gaps found by a second
  cross-subsystem audit mirroring epic 17's own methodology -- added page-view/impression
  tracking on surfaces that didn't exist when the first audit ran, added a real integration
  test proving `bundles` and `promotions` compose correctly together, and fixed one missing
  analytics event mapping. This same pass authored this repository's first `CHANGELOG.md`
  (covering epics 20-25).

## [0.7.0] - 2026-09-08

### Security

- **Admin authentication & authorization** (`@mercatus-liber/admin-auth`,
  `@mercatus-liber/adapter-clerk`, subsystem 21): closed a genuine, live-exploitable gap --
  `/admin` had zero authentication anywhere in the repo, fully open CRUD on a real public
  deployment. A new swappable `AdminAuthAdapter` contract ships a zero-infra local-dev default
  and a production-grade Clerk-backed implementation, with a three-role model
  (owner/admin/viewer) resolved via a pure `hasPermission` check against Clerk's own
  `publicMetadata`, enforced two-layered via root `middleware.ts` (authentication) and a
  `requireAdminPermission` guard on every admin mutation (authorization).

## [0.7.1] - 2026-09-08

### Added

- **CMS page authoring UI** (`@mercatus-liber/cms`): closed a real gap where
  `CmsService.createPage`/`createMarketingPage` already worked but no admin UI or MCP action
  could call them. Added `/admin/cms/new`, `/admin/cms/marketing/new`, and an edit/publish flow
  at `/admin/cms/[id]`, plus a new `"create"` action on the `manage_cms_page` MCP tool, gated
  by the same `requireAdminPermission("mutate")` guard every other admin mutation carries.

## [0.7.2] - 2026-09-08

### Fixed

- **Sanity CMS adapter wiring** (`@mercatus-liber/adapter-sanity`): fixed a discoverability gap
  where the real, already-tested Sanity CMS adapter (epic 18) was never actually constructed --
  `services.ts` was hardcoded to the in-memory adapter with zero env-var branch. Wired
  `SANITY_PROJECT_ID`/`SANITY_DATASET`/`SANITY_TOKEN` into the standard
  env-var-truthy-picks-the-real-adapter pattern and fixed a stale `/admin/settings` status
  string.

## [0.8.0] - 2026-09-09

### Added

- **Demo-agnostic landing page & multi-tenant demo routing**: `commerce.mdostal.com`'s root now
  serves a real framework landing page instead of defaulting into one hardcoded demo. Every
  shopper- and admin-facing route moved under `app/demo/[demoSlug]/...`, `lib/services.ts`
  became a per-demo `Map`-keyed service-graph registry, and every cart/session cookie is now
  demo-namespaced so one browser session holds independent state per demo simultaneously.
- **`create-store` scaffolder docs and skill** (`@mercatus-liber/create-store`, epic 30 --
  `version_bump: none`, folded here per §4): a corrected, code-verified README and a new
  `.claude/skills/create-store/SKILL.md` agent-facing procedure for provisioning a new store
  from this monorepo, closeout-verified end to end against a real throwaway scaffold.

## [0.8.1] - 2026-09-09

### Changed

- **Storefront token & copy refinement** (`@mercatus-liber/theming`): expanded the theme-token
  vocabulary (`--color-muted`, `--color-border`, a 4-step spacing scale, a type scale,
  `--shadow-card`) and refined the default `classic` bundle into a warm ivory/near-black serif
  palette, plus a copy pass removing framework-pitch language that had leaked into the
  dragon-merch demo's own storefront copy.

## [0.9.0] - 2026-09-09

### Added

- **Documentation site** (`apps/docs`): a real, from-scratch Nextra documentation site with a
  build-time content-sync script pulling `README.md`, `docs/ARCHITECTURE.md`, and every
  `docs/subsystems/*.md` file into the published site, plus hand-authored landing/
  getting-started pages. Deployed live as its own Vercel project.

## [0.10.0] - 2026-09-09

### Added

- **Structurally distinct storefront templates** (`@mercatus-liber/theming`): registered real
  competing `LayoutTemplate`s for nav/home/category/cart (previously one hardcoded layout
  each) and three new theme bundles (`editorial`/`maximalist`/`datasheet`) sourced from
  independently-designed HTML artifacts, giving 3 of 10 bundles genuinely different
  component-level markup, not just token values, while the other 7 remain byte-for-byte
  unchanged.

## [0.11.0] - 2026-09-09

### Changed

- **Northline Home Tech depth pass**: replaced Northline's single catch-all service category
  with 4 real categories, added tiered SKUs for camera and home-theater installs, published a
  real CMS location page for all 8 service areas, and gave every demo's nav real server-built
  `navLinks` (categories, service areas, published campaigns) in place of hardcoded links.

## [0.12.0] - 2026-09-09

### Changed

- **"The Print Shop" demo rebrand**: renamed `dragon-merch` to `print-shop` and replaced its
  catalog with a real embroidery/custom-print business across 4 categories and 8 products,
  adding an additive, optional `customizationNote` field threaded end-to-end from PDP
  personalization input through to the persisted order line.

## [0.13.0] - 2026-09-09

### Added

- **Broadleaf & Co. demo store**: a brand-new third demo store -- an artisan/handmade-goods
  marketplace with 9 real products across 4 categories (Plants, Ceramics & Planters, Textiles &
  Fiber Arts, Paper & Ephemera), including a tiered-variant product (3 real pot-size SKUs).

## [0.14.0] - 2026-09-09

### Added

- **Feature deep-dive documentation** (`apps/docs`): 8 real narrative deep-dive pages with code
  snippets pulled directly from the packages they document (Commerce Core, Theming, CMS &
  Marketing, Admin & Access Control, Promotions & Merchandising, BI & Analytics, Plugins &
  AI/Agent Interface, Adapters & Portability), plus a planning-index page publishing every
  epic's own real design-discussion reasoning, not just conclusions.

## [0.15.0] - 2026-09-09

### Added

- **Catalog persistence, backup, and restore** (`@mercatus-liber/adapter-sqlite`): gave the
  reference storefront's catalog persistence the same env-var-truthy adapter-selection pattern
  every other subsystem already had (`DATABASE_URL` -> Postgres, `SQLITE_FILE_PATH` -> durable
  file-backed SQLite, else ephemeral in-memory), plus a real backup/restore CLI built on
  better-sqlite3's native Online Backup API.

## [0.16.0] - 2026-09-09

### Added

- **Order fulfillment routing** (`@mercatus-liber/fulfillment`, subsystem 22): a new
  `FulfillmentAdapter` contract and `FulfillmentRoutingRepository`, plus a zero-infra
  manual-fulfillment default modeling this repo's prior implicit self-fulfillment behavior.
  `/admin/orders` now shows each line's routed provider, status, and tracking, with new
  `submitOrderForFulfillmentAction`/`markFulfillmentLineShippedAction` mutations.
- **Commerce feature-parity research** (epic 40 -- `version_bump: none`, folded here per §4):
  a research-only squad surveyed Shopify/BigCommerce/WooCommerce-class platform capabilities
  (app ecosystems, tracking, SEO, subscriptions/loyalty, marketing tools); findings folded
  directly into epics 45-47.

## [0.17.0] - 2026-09-09

### Added

- **Printful fulfillment adapter** (`@mercatus-liber/adapter-printful`): a real wrapper
  implementing `FulfillmentAdapter` against Printful's v1/v2 APIs (draft-then-confirm order
  lifecycle, mockup generation, fail-closed webhook handling pending a confirmed signature
  scheme), wired into `services.ts` via a `PRINTFUL_API_TOKEN` env-var branch alongside the
  always-registered manual default.

## [0.18.0] - 2026-09-09

### Added

- **Printify fulfillment adapter** (`@mercatus-liber/adapter-printify`): a second,
  marketplace-model POD provider implementing `FulfillmentAdapter` against Printify's v1 order
  API, with confirmed HMAC-SHA256 webhook verification (unlike Printful's unconfirmable
  signature scheme), wired in additively alongside manual and Printful.

## [0.19.0] - 2026-09-09

### Added

- **Shipping rates & labels** (`@mercatus-liber/shipping`, `@mercatus-liber/adapter-shippo`,
  subsystem 23): a new `ShippingAdapter` contract with a documented manual-workflow default
  (Pirate Ship publishes no public API) and a real Shippo-backed implementation for rate
  shopping, label purchase, and tracking lookup.

## [0.20.0] - 2026-09-09

### Added

- **SEO & AEO infrastructure**: real per-page `generateMetadata` (PDP/category/search/home), a
  live-queried `app/sitemap.ts` and `app/robots.ts`, `Product`/`Organization`/`WebSite`/
  `BreadcrumbList` JSON-LD, a real `llms.txt` following the `llmstxt.org` convention, and an
  `FAQPage` block on the landing page -- replacing a prior state where every route shared one
  static "Shop" title.

## [0.21.0] - 2026-09-09

### Added

- **Analytics insights import** (`@mercatus-liber/analytics`): a new
  `AnalyticsInsightsAdapter` contract sibling to the existing write-only adapter, with real
  PostHog Query API and GA4 Data API implementations surfaced as a "Traffic & Sources" section
  on `/admin/metrics`, each independently gated on its own configuration.

## [0.21.1] - 2026-09-09

### Added

- **VISION.md & community roadmap**: a real `VISION.md` plus a public roadmap/checklist page on
  the docs site stating plainly what's done, in progress, and explicitly wanted as free
  community-contributed plugins (reviews/UGC at the time, wishlist, gift cards, subscriptions,
  loyalty, i18n, RMA, and more), publishing the project's own design-discussion corpus
  alongside it.

## [0.21.2] - 2026-09-09

### Fixed

- **Demo seed idempotency crash fix**: fixed a real `SQLITE_CONSTRAINT_UNIQUE` crash that
  permanently bricked a demo for the rest of a process's life on any restart against persisted
  storage, since seed functions always called `createProduct` unconditionally. A new
  check-by-slug-before-create helper (`idempotent-seed.ts`) is now wired into every
  product/category creation call site across all 3 demos.

## [0.22.0] - 2026-09-11

### Added

- **Product reviews & ratings** (`@mercatus-liber/reviews`, subsystem 24): a new subsystem with
  a real moderation queue -- submitted reviews start `"pending"` and can never leak onto a live
  PDP until published -- a live-computed rating summary, a shopper-facing submission form, and
  an admin moderation UI at `/admin/reviews`.

## [0.23.0] - 2026-09-11

### Added

- **Storefront views** (`@mercatus-liber/storefront-views`, subsystem 25): a new first-class
  subsystem for curated, addressable storefront "views" -- a category/product subset with its
  own branding/theme/route and an optional time-boxed homepage-takeover mechanic --
  demonstrated with 3 genuinely different real examples across the 3 demo stores.

## [0.24.0] - 2026-09-11

### Added

- **Postgres inventory adapter** (`@mercatus-liber/adapter-postgres-inventory`): a second, real
  `InventoryAdapter` implementation backed by Postgres (reusing the same `DATABASE_URL`
  infrastructure catalog persistence already uses), proving the inventory subsystem is
  genuinely swappable rather than single-implementation.

## [0.25.0] - 2026-09-11

### Added

- **MongoDB catalog adapter** (`@mercatus-liber/adapter-mongodb`): a `CatalogPersistenceAdapter`
  implementation backed by MongoDB's document-store model, wired into `services.ts`'s
  adapter-priority chain, proving a genuinely different persistence paradigm from the existing
  relational adapters.

## [0.26.0] - 2026-09-11

### Added

- **Convex catalog adapter** (`@mercatus-liber/adapter-convex`): a `CatalogPersistenceAdapter`
  implementation backed by Convex's real-time reactive backend, the furthest-paradigm alternate
  offered, shipping real Convex function source for deployment to a user's own project.

## [0.26.1] - 2026-09-11

### Added

- **Per-demo start/onboarding page**: a real `/start` orientation page per demo store covering
  the admin login path, a live promo code pulled from `PromotionsService`, a link to
  `/admin/metrics`, and a curated rundown of which adapters/subsystems that store demonstrates.

## [0.26.2] - 2026-09-11

### Fixed

- **Live-provider verification fixes**: flipped Supabase/Postgres, PostHog, and Sanity from
  disclosed-unverified to live-verified in production, fixing a real Sanity `_id`-collision bug
  between marketing-page-meta and page documents (`marketingMetaDocId()` prefix) along the way,
  and root-caused and fixed a Clerk `/admin` regression traced to this repo's own README
  documenting a non-existent, wrong publishable-key env var name, adding a defensive runtime
  guard (`clerk-env-check.ts`) against recurrence.

### Added

- **Framework brand system** (`.pHive/brand/brand-system.yaml`, epic 55 -- `version_bump: none`,
  folded here per §4): a real token system (Ledger Indigo primary, Garnet accent, Public Sans +
  JetBrains Mono type) applied to the framework landing page, the docs site, and a generated
  favicon -- audited first against all 6 existing storefront themes to guarantee zero
  palette/font collision, with zero cross-bleed into any of the 3 demo stores' own independent
  themes.

## [0.27.0] - 2026-09-16

### Added

- **Per-demo backend diversity**: real per-demo persistence-backend resolution
  (`resolveDemoPersistenceEnv`, an override tier of `DATABASE_URL`/`MONGODB_URL`/`CONVEX_URL`/
  `SQLITE_FILE_PATH`) plus real category persistence built for all 4 adapter packages, letting
  each demo store run on a genuinely different live backend simultaneously (print-shop on
  Postgres, Broadleaf & Co. on Convex).

## [0.28.0] - 2026-09-16

### Added

- **Full commerce persistence audit**: real Postgres persistence shipped for all 13 remaining
  subsystems that had been unconditionally in-memory-only (cart, orders, customer accounts,
  promotions, reviews, storefront-views, bundles, recommendations, advertising, service-areas,
  the BI event log, fulfillment routing), plus a new first-class `Catalog` entity and an
  owner-only, per-demo-scoped `reset-demo-data` admin action.

## [0.28.1] - 2026-09-22

### Added

- **Sanity-powered AI commerce copilot** (`apps/reference-storefront/lib/copilot/`, epic 59 --
  `version_bump: none`, folded here per §4): a real Anthropic-SDK tool-calling loop plus a
  Sanity Context MCP client with `propose_options`/`apply_option` admin mutations, surfaced at
  `admin/copilot`, alongside a new schema-typed CMS section editor and a `content-layout`
  dashboard connecting CMS content to per-page-type layout templates for the first time.

### Fixed

- **CMS demo-scoping fix**: fixed a real live bug where every demo's nav/sitemap/admin-CMS-list
  showed every OTHER demo's marketing/location pages, since `PageRepository.list()` had no
  demo-scoping concept at all. Added an additive `demoSlug` field threaded through
  `packages/cms` and `packages/adapter-sanity`, and cleaned up 209 duplicate live Sanity page
  documents down to the real 13.

## [0.28.2] - 2026-09-22

### Fixed

- **Marketing-catalog demo-scoping fix**: fixed a real live bug where print-shop's and
  Northline's shared Postgres `categories` table had no demo-scoping, so each demo's nav showed
  the other's top-level categories mixed in. Added the same additive `demoSlug` pattern epic 60
  established, threaded through all 4 real adapter implementations (Postgres/SQLite/
  MongoDB/Convex).

## [0.28.3] - 2026-09-22

### Fixed

- **Checkout order-paid crash fix** (`@mercatus-liber/adapter-postgres-inventory`): fixed a
  real production 500 on every paid order against Postgres-backed inventory -- an
  untyped-parameter unary-minus in raw SQL (`-$2`) that Postgres's operator resolver couldn't
  disambiguate (`operator is not unique: - unknown`). Added a real-Postgres integration test
  suite, since a mocked pool double could never have caught this.

## [0.28.4] - 2026-09-22

### Added

- **Multi-axis product configurator** (epic 63 -- `version_bump: none`, folded here per §4): a
  real, live, interactive variant picker for multi-attribute products -- one `<select>` per
  identifying attribute, progressively enhanced with a `<noscript>` fallback -- wired into all
  3 PDP templates and backed by a new admin SKU-matrix/add-combination surface, demonstrated
  with a real 2-axis (color x size) product.

### Fixed

- **Round-3 gap audit: cross-demo data bleed fixes**: found and fixed 5 real, high-priority
  live production bugs, all the same shared-Postgres-with-zero-demo-scoping class epics 60/61
  had already fixed twice -- advertising campaigns, promotion/coupon codes, and service areas
  all lacked demo-scoping (one demo's coupon code was genuinely redeemable at another's
  checkout), `catalog.listProducts()` submitted cross-demo URLs to `/sitemap.xml`, and the
  recommendation shelf linked to un-prefixed, 404ing product URLs. Categorized under `Fixed`,
  not `Security` -- see §6 for the explicit reasoning.

## [0.28.5] - 2026-09-22

### Fixed

- **Bundles & recommendations admin demo-scoping fix**: closed the one remaining gap epic 64's
  audit disclosed but didn't fix -- `/admin/bundles` and `/admin/recommendations` had no
  demo-scoping, so an operator in one demo's admin saw another demo's bundle/recommendation
  rows mixed into their own list. The same additive `demoSlug` pattern was applied a sixth
  time, threaded through `packages/bundles`, `packages/recommendations`, and `adapter-postgres`,
  live-backfilled with zero ambiguous rows remaining. Same shared-backend
  data-isolation/correctness shape as epic 64 -- categorized under `Fixed`, not `Security`, for
  the identical reasoning given in §6.

## [0.28.6] - 2026-09-22

### Added

- **CHANGELOG.md / package.json version reconstruction** (`changelog-and-version-reconstruction`):
  retroactively reconstructed this file's release history and `package.json`'s `"version"`
  field through the 40 epics (26-65) that shipped real code between epic 25's `[0.6.1]` entry
  and this epic's own closeout, none of which had been reflected in a changelog entry or a
  version bump at the time they merged. Each entry above was transcribed from a dedicated
  research pass (`.pHive/epics/changelog-and-version-reconstruction/docs/reconstruction-working-doc.md`)
  that read every epic's own `epic.yaml` `version_bump` where one existed, and inferred a
  best-evidenced bump from `.pHive/planning/epic-backlog.md`'s own row text where it didn't,
  citing real commits and file paths throughout. Epics 1-19 remain the one disclosed,
  still-out-of-scope gap -- see the preamble above.
