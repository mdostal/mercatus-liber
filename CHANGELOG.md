# Changelog

All notable changes to this project are documented in this file. Entries are grouped by
release, oldest first.

This changelog covers epics 20-85 plus both reconstruction epics' own closeouts
(`changelog-and-version-reconstruction`, `changelog-and-version-reconstruction-ii`). Epics
20-25 were documented live as they merged; epics 26-65 were reconstructed retroactively by the
`changelog-and-version-reconstruction` epic (see
`.pHive/epics/changelog-and-version-reconstruction/docs/reconstruction-working-doc.md`) and
epics 67-85 by the follow-on `changelog-and-version-reconstruction-ii` epic (see
`.pHive/epics/changelog-and-version-reconstruction-ii/docs/reconstruction-working-doc.md`),
each from the epic's own `epic.yaml` `version_bump` where one existed, and a best-evidenced
inferred bump from `.pHive/planning/epic-backlog.md`'s row text where it didn't. Earlier epics
(1-19) have no retroactive changelog or version history -- that is disclosed, pre-existing debt
tracked in `.pHive/epics/commerce-gap-audit-2/docs/audit-findings.md`, still out of scope.

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

## [0.28.7] - 2026-09-23

### Added

- **Storefront-view edit UI** (`@mercatus-liber/storefront-views`): closed a real CRUD gap
  where `StorefrontViewsService.updateView` existed but had no admin UI or call site -- an
  operator could create, publish, or archive a view but never edit one afterward. Added a new
  `/admin/storefront-views/[id]` edit route (a shared `StorefrontViewFormFields` component
  extracted from the existing create form) and a new `updateStorefrontViewAction` server
  action, gated by the same `requireAdminPermission` guard every other admin mutation uses,
  with 6 new tests covering viewer/no-session rejection and real persistence.
- **Gap-audit-3 test-coverage follow-up** (epic 67 -- `version_bump: none`, folded here, zero
  application behavior changed): added 21 real tests closing three disclosed coverage gaps
  from `commerce-gap-audit-3` -- the multi-attribute variant picker (epic 63), the admin
  SKU-matrix page's data-display logic, and the brand-system landing page, none of which had
  any test coverage before this epic.

## [0.28.8] - 2026-09-23

### Security

- **Dependency vulnerability remediation** (`@xmldom/xmldom`): closed 13 real advisories (11
  high, 2 moderate) reported by `pnpm audit`, all tracing to one deeply-transitive dependency
  pulled in via `apps/docs`'s `nextra` -> `mathjax-full` -> `speech-rule-engine` chain. Pinned
  `@xmldom/xmldom` to `0.9.12` (npm's current `latest`) via `pnpm-workspace.yaml`'s existing
  `overrides:` convention; `pnpm audit` now reports zero vulnerabilities at every severity.

## [0.28.9] - 2026-09-23

### Fixed

- **Bundle-tier variant resolution** (`@mercatus-liber/bundles`): fixed a real, not-yet-reached
  correctness bug where a `BundleTier`'s pinned `skuIds` were completely independent of the
  shopper's live variant-picker selection. Added `resolveTierCartSkuIds`, resolving each tier
  SKU against the shopper's active selection only when it belongs to the product currently
  being viewed, wired into `addBundleTierToCartAction` -- `BundleTier`'s stored shape is
  unchanged, and 9 new regression tests prove both backward compatibility and the new
  resolution.

## [0.28.10] - 2026-09-23

### Added

- **OSS community-health scaffolding**: added `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1), and GitHub-native
  `.github/ISSUE_TEMPLATE`/`PULL_REQUEST_TEMPLATE.md` files, grounded in this repo's real dev
  setup, adapter-contribution pattern, and an honestly-scoped pre-1.0 security-support policy
  -- closing a real gap where a project explicitly pitched for "full open source community and
  free plugins" had no GitHub-native contribution scaffolding at all.

## [0.28.11] - 2026-09-23

### Changed

- **Routine dependency maintenance**: applied 13 genuine minor/patch version bumps
  workspace-wide (`next`, `@clerk/nextjs`, `stripe`, `react`/`react-dom`, `convex`,
  `posthog-js`/`posthog-node`, `turbo`, and others), deliberately leaving 3 real
  major-version jumps (`typescript`, `@types/node`, `@types/better-sqlite3`) untouched for
  their own isolated pass. `pnpm audit` confirmed 0 vulnerabilities at every severity after the
  bump; live-verified post-deploy across all 3 demo stores, Clerk admin auth, and
  Stripe-backed sandbox checkout.

## [0.28.12] - 2026-09-23

### Fixed

- **First formal accessibility (a11y) audit**: ran axe-core 4.10.2 against the landing page,
  all 3 demo stores, PDPs, category/cart pages, and the required admin surfaces. Fixed 16 of
  17 real, live-confirmed findings -- undercomputed contrast tokens across several theme
  bundles, 2 critical unlabeled add-to-cart/quantity inputs, 4 missing/unlabeled landmark gaps,
  2 heading-hierarchy skips, and an empty admin table header -- live-reverified at 0 axe-core
  violations on 3 production pages post-deploy. One systemic finding (`--color-primary` reused
  as small foreground text) was deliberately documented rather than patched blind, since fixing
  it well needs a real design decision -- see `[0.28.14]`.

## [0.28.13] - 2026-09-23

### Fixed

- **CI Node-version mismatch**: found this repo's GitHub Actions CI workflow had failed on
  both of its real runs since being added -- `pnpm@11.22.0` requires Node >=22.13, but the
  workflow was pinned to Node 20, crashing before `pnpm install` could even run. Bumped the
  workflow's `node-version` to `24`, corrected `package.json`'s `engines.node` and
  `CONTRIBUTING.md`'s matching claim, then watched a real GitHub Actions run through to a
  genuine `success` conclusion.

## [0.28.14] - 2026-09-23

### Fixed

- **`--color-primary` foreground-contrast fix** (`@mercatus-liber/theming`): closed the a11y
  audit's deliberately-deferred finding -- `--color-primary` reused directly as small/
  body-sized foreground text failed WCAG AA on 5 of 10 theme bundles. Added an additive,
  per-bundle derived `--color-primary-text` token (darkened until it clears real AA contrast)
  and swapped it in at every real foreground call site, including a fill-swap fallback for the
  two bundles dark enough that no same-hue ink reaches AA; the other 5 passing bundles are
  completely untouched. Live-reverified with axe-core across every affected bundle and
  component on production, 0 violations.

## [0.28.15] - 2026-09-23

### Added

- **Final brand mark applied** (`.pHive/brand/`): applied the real, human-selected final logo
  (Brass Amber stacked lockup) to all 3 surfaces it had never actually reached -- the reference
  storefront's `icon.png`/`apple-icon.png` (replacing the original generic "M" monogram),
  `.pHive/brand/social-preview.png`, and `docs/assets/logo.png` -- live-verified post-deploy
  via byte-identical content-length/dimension/head-tag checks, not just a successful deploy.

## [0.28.16] - 2026-10-07

### Added

- **Integrations catalog & ecosystem gap audit**: published a real, code-verified
  `apps/docs/content-src/integrations.md` page (correcting 2 real drift findings along the way
  -- `adapter-shopify` is built but not wired into any live demo, and `adapter-convex`'s own
  epic row was stale), plus a 7-category research pass against real provider docs that
  recorded 3 new-epic-candidates for future pickup: `accounting-erp-sync-adapter`,
  `outbound-webhook-event-delivery`, and `second-payment-processor-adapter` (all three now
  shipped -- see `[0.32.0]` onward below).

## [0.29.0] - 2026-10-07

### Added

- **Shopify-to-native migration tool** (`@mercatus-liber/migrate-shopify`): a new package
  providing a one-time, cursor-paginated read of a live Shopify store's catalog/variants/
  collections/inventory and a dry-run-by-default, idempotent, resumable native-write path
  through this repo's own `CatalogService`/`MarketingCatalogService`/`InventoryAdapter`, plus a
  real CLI (`migrate-shopify --target sqlite|postgres --confirm`). Live-verified end-to-end
  against a real local fixture HTTP server standing in for Shopify; disclosed as not yet
  verified against a real Shopify account (no credentials available in this environment).

## [0.29.1] - 2026-10-15

### Added

- **Free-tier backend resilience & keep-alive**: added a narrow, verified-shape
  `backend-unreachable` detector rendering an honest "this demo may be asleep" state (with
  manual retry) instead of a raw 500 for Supabase-paused and MongoDB-unreachable errors
  specifically, recovered a real live Supabase outage affecting print-shop and northline, and
  shipped a daily GitHub Actions keep-alive/revival job (`.github/workflows/keepalive.yml`)
  that pings and, once 3 new repo secrets are added by a human, can call Supabase's real
  project-restore API.

## [0.29.2] - 2026-10-15

### Added

- **GitHub Wiki, docs-site reference section, and cross-linking**: stood up a real GitHub Wiki
  (Home/FAQ/Troubleshooting/Decisions-Log) and a new `apps/docs/content-src/sample-stores.md`
  reference page, then cross-linked every surface (README, docs-site navbar/footer, wiki) so
  each reaches every other in at most one click.

### Fixed

- **Vercel deploy ignore + docs-site nav-link fixes**: fixed a real bug where the root
  `.vercelignore` excluded the entire `.pHive/` tree, 404ing every `/planning/<epic>` route in
  production, and fixed the docs site's `projectLink`/`docsRepositoryBase` pointing at a
  nonexistent GitHub org and branch (`mercatus-liber/mercatus-liber` on `main`, corrected to
  the real `mdostal/mercatus-liber` on `master`).

## [0.30.0] - 2026-10-15

### Added

- **Single-tenant mode & three independently-deployed sample stores**: added an env-gated
  (`SINGLE_TENANT_DEMO_SLUG`) single-tenant rewrite mode to `apps/reference-storefront`,
  byte-identical to existing behavior when unset, then deployed it to three brand-new, real,
  independently-addressable Vercel projects -- `mercatus-liber-print-shop`,
  `mercatus-liber-northline`, `mercatus-liber-broadleaf` -- the first time these demo stores
  have been reachable as genuinely separate sites rather than `/demo/<slug>` paths inside one
  shared deployment. A real Next.js 16 `middleware.ts` -> `proxy.ts` rename bug (hit mid-
  rollout) was found and fixed along the way.

## [0.31.0] - 2026-10-15

### Added

- **Structured shipping address threaded through fulfillment** (`@mercatus-liber/checkout-orders`,
  `@mercatus-liber/fulfillment`): added real, all-optional structured address fields to
  `ShippingInfo` (street/city/state/postal/country/phone) and a new `FulfillmentRecipient` type
  flowing through `OrderLookup`/`SubmitFulfillmentOrderInput` into
  `FulfillmentService.submitOrder` -- previously dead data now actually reaches whichever
  adapter an order routes to. Re-verified Printful's v2 webhook-signature format live
  (correcting the September research record) and added real address-mapping functions for both
  the Printful and Printify adapters.

## [0.32.0] - 2026-10-18

### Added

- **Outbound webhook event delivery** (`@mercatus-liber/webhooks`): a new package giving the
  previously purely in-process `EventBus` a real external-subscriber contract --
  HMAC-SHA256-signed HTTP delivery with bounded exponential-backoff retry and a full
  per-attempt delivery log, plus a Postgres-backed subscription/delivery-log store in
  `adapter-postgres`. Not yet wired into any live app, so no deploy was needed.

## [0.33.0] - 2026-10-18

### Added

- **Second payment processor: PayPal** (`@mercatus-liber/adapter-paypal`): a real
  `PaymentAdapter` implementation against PayPal's Orders v2 API (OAuth2 client-credentials,
  create/capture/get, remote webhook-signature verification), wired into
  `apps/reference-storefront` as a second option behind Stripe in the existing adapter
  priority chain. Dead code in production until PayPal credentials are configured -- no live
  demo has them yet, so no behavior changed and no deploy was triggered.

## [0.34.0] - 2026-10-18

### Added

- **Accounting/ERP order sync** (`@mercatus-liber/accounting-sync`,
  `@mercatus-liber/adapter-quickbooks`): a new `AccountingSyncAdapter` contract, triggered
  fire-and-forget off the real `checkout.order.paid` event, with a QuickBooks Online reference
  implementation (OAuth2 refresh-token rotation, `SalesReceipt` creation, signed webhooks).
  Registered only when `QUICKBOOKS_REALM_ID` is configured -- unregistered and behaviorally
  inert for every live demo today, so no deploy was triggered. Closes the last of the three
  new-epic-candidates `integrations-catalog-and-ecosystem-audit` recorded (`[0.28.16]`).

## [0.35.0] - 2026-11-03

### Added

- **Product media: 3D viewer, teardown video, license/attribution** (core schema): `Product`
  gains three additive, optional fields -- `videos?: ProductVideo[]`, `viewerUrl?: string`,
  `license?: string` -- mirroring the image-cdn epic's own precedent exactly (core schema,
  catalog service, both reference adapters, a migration-safety test building a legacy-shape
  SQLite file by hand). Closes issue #2, filed by a downstream storefront (shop.mdostal.com)
  that had been working around the gap with the generic `ProductAttribute` mechanism.
- **Community Goals: vote-threshold-gated feature unlocks** (`@mercatus-liber/community-goals`,
  subsystem 26): a storefront publishes a `Goal` (a vote target, optionally with a second,
  higher stretch threshold), visitors cast one deduped vote each via
  `GoalsService.castVote(goalId, voterKey)`, and `computeGoalStatus()` derives
  locked/unlocked/bonus-unlocked plus uncapped 0..1+ progress fractions for a liquid-fill/
  overflow UI. Carries zero rendering/animation concern of its own by design. Ships in-memory
  only at v1 (same posture `@mercatus-liber/bundles` took initially); a durable adapter is a
  separable follow-up.

## [0.36.0] - 2026-11-03

### Added

- **Community Goals: durable Postgres adapter** (`@mercatus-liber/adapter-postgres`):
  `createPostgresGoalRepository`/`createPostgresGoalVoteRepository`, same "own schema-init,
  no shared-file edits" pattern `bundles.ts`/`orders.ts` already established.
  `GoalVoteRepository.recordIfNew` is backed by a real `PRIMARY KEY (goal_id, voter_key)`
  constraint via `INSERT ... ON CONFLICT DO NOTHING RETURNING goal_id` -- genuinely atomic
  under concurrency (Postgres enforces it, not application code), verified with a racing-
  calls probe against the real built package export, not just sequential tests. Closes
  `docs/subsystems/26-community-goals.md`'s open question 1. Not yet wired into any live
  demo's `services.ts` -- no deploy triggered.

## [0.36.1] - 2026-11-03

### Added

- **Community Goals: enable/disable** (`@mercatus-liber/community-goals`): `Goal` gains an
  `enabled` field (admin on/off switch, defaults true, deliberately named apart from
  `GoalStatus`'s own derived `status` to avoid colliding). `GoalsService.enableGoal`/
  `disableGoal` (same convenience-one-liner shape as `Bundle.deactivateBundle`);
  `castVote` against a disabled goal throws a new `GoalDisabledError` rather than silently
  no-op'ing or silently counting it. `@mercatus-liber/adapter-postgres`'s `goals` table
  gains a matching `enabled BOOLEAN NOT NULL DEFAULT TRUE` column, added via `ALTER TABLE
  ... ADD COLUMN IF NOT EXISTS` for safety against any already-created table. Not yet wired
  into any live demo -- no deploy triggered.

## [0.37.0] - 2026-11-03

### Added

- **Community Goals: reference-storefront wiring** -- `goals` exposed on the Services bag
  (Postgres-when-configured / in-memory-otherwise), a minimal admin CRUD page
  (`/demo/[demoSlug]/admin/community-goals`), and a public, unauthenticated
  `GET`/`POST /api/demo/[demoSlug]/community-goals/[slug]` route for a storefront's own
  client-side UI to read live status and cast a vote (anonymous, cookie-deduped voter
  identity via new `lib/voter-cookie.ts`). Verified end-to-end against a real `next start`
  production build.

### Fixed

- **`lib/services.ts`'s per-demo services cache now survives a Route-Handler-vs-page bundle
  split.** Found live, verifying the above against a real production build: Next.js's App
  Router bundles Route Handlers into their own module graph, so a plain module-scoped
  `const servicesByDemo` was NOT actually shared with the Server Action/page bundle, even in
  the same running process -- an admin-created goal was invisible to the public vote route,
  and a thrown `GoalDisabledError` failed an `instanceof` check across the same boundary.
  Fixed by pinning the cache onto `globalThis` (the standard Next.js singleton pattern) and
  switching the error check to `err.name`. Restores the in-memory default working correctly
  for ANY subsystem pairing a Route Handler with mutable Server-Action-written state, not
  just this one -- previously untested because community-goals is the first to do that.
  5 test files' `vi.resetModules()`-based isolation needed a matching test-only
  `__resetServicesCacheForTests()` export (same fix, same reason) to keep working.

## [0.38.0] - 2026-11-03

### Added

- **SKU-level images** (closes GitHub issue #1): `Sku` gains an optional, additive
  `images?: ProductImage[]`, same zero-regression discipline as `Product.images` -- for a
  product whose identifying attribute is itself visual (e.g. sunglasses lens color), a SKU
  can now carry its own photo distinct from the product's shared gallery. New
  `CatalogService.updateSku(id, patch)` -- SKUs previously had no post-creation edit path at
  all (only `createSku`/`generateSkus`); the real workflow is `generateSkus()` to create the
  variant grid, then `updateSku()` once per SKU to set its own image (or price/status).
  `apps/reference-storefront`'s product page falls back to the product-level gallery when
  the active SKU has none of its own. Both reference adapters (sqlite/postgres) persist the
  new field with the established `ALTER TABLE ... ADD COLUMN` migration-safety pattern, each
  with a dedicated test building a real pre-migration-shape DB by hand. Verified at the real
  built-dist package boundary against the exact sunglasses scenario from the filed issue (4
  lens-color SKUs, each getting its own photo via the generate-then-update workflow,
  surviving a process restart).

## [0.38.1] - 2026-11-03

### Fixed

- **Community Goals: `castVote` vote-count race condition**, reported from a real downstream
  integration building against this API. `castVote` used to read `goal.voteCount` once, then
  compute `before`/`after` locally before calling `save()` -- concurrent votes on the same
  goal could read the same stale snapshot, silently lose a real vote (last `save()` wins),
  and independently (sometimes wrongly) believe they crossed a threshold. Fixed with a new
  `GoalRepository.incrementVoteCount(id)`, required to be atomic at the repository layer (a
  single `UPDATE ... SET vote_count = vote_count + 1 RETURNING *` for Postgres; a
  synchronous Map read-modify-write for in-memory). `castVote` now derives `before`/`after`
  from its own atomic increment's return value instead of the earlier stale read. Per-voter
  dedup (`GoalVoteRepository.recordIfNew`) was never affected -- only the aggregate
  `voteCount` counter had the race. Confirmed the fix genuinely closes the gap: reverted it
  temporarily and watched 20 real concurrent votes (via `Promise.all`, the real built-dist
  export) collapse to `voteCount: 1`, restored it and watched the same 20 votes correctly
  land at `voteCount: 20` with `crossedThreshold` firing exactly once.

## [0.39.0] - 2026-11-04

### Added

- **SKU availability status**: a shared `AvailabilityStatus` type ("active" | "discontinued"
  | "request", missing means active) in `@mercatus-liber/core`, plus `Sku.availabilityStatus`/
  `availabilityNote`. Deliberately a separate axis from `Sku.status` (`ProductStatus`) -- a
  published Sku can independently be discontinued (shown grayed out, not selectable) or
  request-only (selectable "on request," captured with the order) without changing its
  catalog publishing state. Ported from a real, live reference implementation
  (dostal-3d-printing's color-regions.json manifest v2's own `statuses`/`rules.status`
  blocks), confirmed by reading the real file directly, not guessed at. Threaded through
  `catalog.createSku`/`updateSku` and both reference adapters with the established
  migration-safety pattern (a dedicated test building a real pre-migration-shape DB file by
  hand). Shared in core specifically so `@mercatus-liber/customization` (shipping next) can
  reuse the identical three-state concept for its own palette colors and finish tiers,
  rather than each subsystem forking its own status enum.

## [0.40.0] - 2026-11-04

### Added

- **Customization** (`@mercatus-liber/customization`, subsystem 27): a shared color palette,
  ranked/priced finish tiers (one-color print up to hand-painted), and per-product color
  regions with the real printing-process rules a made-to-order shop needs -- a region too
  small to be its own physically separate part follows its parent region's color once a
  finish produces separate assembled parts; a region can restrict which palette colors it
  offers (e.g. a light-diffuser that must stay white for an LED to shine through). Ported
  faithfully from a real reference implementation (dostal-3d-printing's
  `shop-assets/color/color-regions.json` and its reference editor's own `effective()`/
  `choices()` logic), not invented from scratch. Direct response to the storefront owner's
  own request for "the components, controls, and framework for doing all of this... out of
  the box in mercatus liber," with the actual UI/rendering explicitly left to the storefront
  (the separately-shipped `@mercatus-liber/customization-ui` Web Component).
  `AvailabilityStatus` (the sku-availability-status epic's shared type) is reused verbatim
  for both `PaletteColor.status` and `FinishTier.status` -- "discontinued" and "request" are
  the same mechanism answering both halves of the owner's ask (grey-out-but-still-show, and
  a request option), not two separate features. Both are enforced server-side, not left to a
  client-side UI alone: `resolveEffectiveColors` throws `DiscontinuedFinishError` for a
  discontinued finish tier and `InvalidColorSelectionError` for any submitted color that
  matches a discontinued palette entry; a `request`-status finish or color is explicitly let
  through. Adds `ProductCustomization.finishPriceDeltas`, a per-product override of a finish
  tier's global `priceDelta` (hand-painting a
  large chest costs more than hand-painting a small insert tray, so one global delta per
  finish tier can't be the only price lever). Ships in-memory only at v1, the same posture
  `community-goals`/`bundles` each took initially. 44 new tests (resolution-logic unit tests
  built from two real products' own region data -- treasure-chest and stovetop-glow --
  mirroring the reference manifest's own rules exactly, plus full service-layer coverage).
  Verified at the real built-dist package boundary against the exact stovetop-glow scenario
  (a non-separable, allowed-colors-restricted region following its parent under an
  assembled-parts finish, plus a rejected discontinued-color submission). Full repo check:
  148/148 tasks green.
  Also adds the pricing primitives the shop owner asked for directly, in the same package:
  `PaletteColor.priceDelta` (a specific color costs more wherever it's used), `ColorRegion.
  priceDelta` (a specific part costs more to give its own independent color), and
  `ProductCustomization.colorCountPriceDeltas` (a surcharge keyed by the exact number of
  distinct colors a build resolves to) -- all summed by a new `resolveCustomizationPriceDelta`/
  `CustomizationService.getCustomizationPriceDelta` without double-counting each other. The
  distinct-color count itself (`resolveColorCount`/`CustomizationService.getColorCount`) is
  exactly what the reference editor's own manifest now asks for (a new `pricing.colors` note,
  confirmed by reading the real file directly after a peer session updated it) and dedups by
  palette id rather than hex -- forward-compatible with a proposed multi-color/blend filament
  shape that could share a representative hex with an unrelated solid color. Test fixtures
  updated to match the manifest's real, finer-grained region split (the chest's straps/name/
  plate-border/plate/lock) and new `pink` "request"-status palette color. 20 more tests (64
  total in the package).

## [0.41.0] - 2026-11-04

### Added

- **Art style pricing axis** (`@mercatus-liber/customization`): a new `ArtStyle` type
  ("flush" or "raised" engraved/printed art, ported from the real reference manifest's own
  `art_styles`), with `ProductCustomization.artStyleIds` (which styles a product offers) and
  `artStylePriceDeltas` (a per-product override of a style's global `priceDelta`), same
  override pattern as `finishPriceDeltas`. Real business driver: raised art prints faster
  (fewer filament swaps) so the shop prices it lower -- this package carries the pricing
  axis, never which GLB a style loads (that stays a pure rendering/asset concern). New
  `resolveArtStylePriceDelta`, and `resolveCustomizationPriceDelta` grew two optional
  trailing parameters (`artStyles`, `artStyleId`) so it keeps summing finish + per-color +
  per-region + color-count + art-style without double-counting, backward-compatible with
  every existing call site. `CustomizationService` gained `listArtStyles`/`setArtStyle`,
  `getArtStylePriceDelta`, and an optional `artStyleId` parameter on
  `getCustomizationPriceDelta`; a discontinued or not-offered art style is rejected
  server-side (`DiscontinuedArtStyleError`/`UnknownArtStyleError`), never left to a
  client-side UI alone, matching every other availability check in this package.
  `createCustomizationService`'s deps now require an `ArtStyleRepository` (a new
  `createInMemoryArtStyleRepository` ships alongside the existing in-memory repositories) --
  the only breaking change in this release, with no other consumer in this repo to migrate.
  16 new tests (80 total in the package). Verified at the real built-dist package boundary.
  Full repo check: 151/151 tasks green.

## [0.42.0] - 2026-11-04

### Changed

- **Customization pricing, rebuilt as a generic, fully admin-defined rules engine.** Direct
  correction from the shop owner, reacting to real per-region slicer-time data (a treasure
  chest's straps cost ~$45 extra only when they *differ* from the chest body) plus his own
  words: "it isn't a flat per color count charge... fully customizeable across the entire
  board... our tool should basically allow us to build a formula and have a bunch of
  attributes for a product." **Removed** the fixed-field pricing design shipped in the
  previous two releases: `FinishTier.priceDelta`/`ProductCustomization.finishPriceDeltas`,
  `ArtStyle.priceDelta`/`artStylePriceDeltas`, `ColorRegion.priceDelta`,
  `ProductCustomization.colorCountPriceDeltas`, `PaletteColor.priceDelta`,
  `resolveFinishPriceDelta`/`resolveArtStylePriceDelta`/`resolveCustomizationPriceDelta`, and
  `CustomizationService.getFinishPriceDelta`/`getArtStylePriceDelta`/
  `getCustomizationPriceDelta` -- all superseded, not deprecated-and-kept (no other consumer in
  this repo depended on them; confirmed with the storefront consumer before removing).
  **Added**: `PricingAttribute` (an admin-defined cost driver, `id`/`label`/`perUnitCents`,
  can be negative, `quoteOnly` for request-only hardware), `ContrastRule` (generalizes the
  real, measured "cost only when colors actually differ" mechanism to any product/region
  pair, not just the one chest case), `PricingRules` (one product's complete, standalone
  pricing formula -- no global/override layering, since there's no automated regeneration to
  clobber an admin's edit), and `resolvePrice` -- the one real pricing path both a storefront
  preview and the real charge must call. Checked against 4 of the 7 cent-exact scenarios (corrected in 0.43.1) ported
  from dostal-3d-printing's own cost model (`pricing.js`/`suggested-levers.json`, kept as a
  reference, never a contract this package maintains). New `PricingService`/
  `PricingRulesRepository`, deliberately separate from `CustomizationService` -- a storefront's
  admin screen reads/writes one product's whole pricing document at a time through this.
  `PaletteColor` gains `kind`/`hexes` (real multi-color/blend filaments, e.g. a silk gradient)
  and `material` (the real cost driver behind a per-material surcharge, carried as a fact, not
  a price). In-memory only at v1 for the new pricing repository, same posture as everything
  else in this package -- flagged as the clearly-scoped next step (an admin screen's edits
  need to survive a restart to mean anything). 69 tests total in the package (the old
  fixed-field pricing tests retired along with the fields/functions they covered, replaced by
  a new pricing.ts/pricing-service.ts test suite). Verified at the real built-dist package
  boundary against 6 real scenarios including the request-only-hardware and missing-rules
  paths. Full repo check: 151/151 tasks green.

## [0.43.0] - 2026-11-04

### Added

- **Complexity-based pricing lever** (`@mercatus-liber/customization`): a new `ExcessUnitRule`
  type generalizing `ContrastRule`'s own split (this package derives a real-world count, the
  admin keeps the rate/label on a normal `PricingAttribute`) to three more drivers --
  estimated print minutes beyond a free threshold, distinct colors beyond the first ("color
  changes off base"), and personalization length beyond a free character count. Direct
  follow-up request from the shop owner once the base engine shipped: a time-over-threshold
  multiplier, an estimated-filament-wastage charge scaled off color-change count, and
  "the name plate over 8 characters probably bumps up in cost... since that causes more
  layers." `PricingRules` gains `estimatedMinutes` (a (product, finish)-level admin constant,
  read once from the 3D side's own real slicer-time reference data, never a live dependency)
  and `excessUnitRules`. `PriceBuild` gains exactly one new field, `nameLength` (a plain
  character count, never the personalization text itself). `colorChanges` is deliberately
  NOT a new field -- derived automatically inside `resolvePrice` from the same `colors` map
  `contrastRules`/`colorMarkupCents` already consume, reusing the existing `extraColor`
  convention so there's no second caller-computed count that could drift. No change to
  `resolvePrice`'s public signature, main attribute loop, `quoteOnly` branch,
  `colorMarkupCents` block, or base-floor -- the new logic folds into the existing private
  `resolveAttributeCounts` helper only. Planned with the user directly (plan-mode review)
  before implementation, given it's a real formula with its own admin-tunable coefficients,
  not just another flat-rate attribute. 8 new tests (77 total in the package), including
  real treasure-chest minute numbers (ported from the 3D side's own estimates.json:
  `solid.time_s=50249` ~837min, `ams.time_s=218501` ~3642min) and 🔍 probes for rounding
  (never truncation), zero-floor (never negative), and the per-product attribute allowlist
  still holding for derived counts. Verified at the real built-dist package boundary. Full
  repo check: 151/151 tasks green.

## [0.43.1] - 2026-11-05

### Documentation

- Rewrote the root README around verified state: live sample stores, a tested quick start, an
  adapter status table, how to write plugins and adapters, and how the UI layers are organized,
  including what isn't built yet. Moved the environment-variable reference to
  `apps/docs/content-src/configuration.md`.
- Added a README to all 40 packages that lacked one.
- Brought `docs/ARCHITECTURE.md`'s subsystem map current (14 to 28), updated `VISION.md`, and added
  PayPal and QuickBooks to the integrations catalog.

### Corrections

- Earlier entries overstated customization testing and behavior. 0.42.0 said the engine was
  validated against 7 scenarios; tests cover 4. 0.40.0 and 0.42.0 said color counting dedups by
  palette id in a way that stays correct for multi-color filaments; it matches by hex, so entries
  sharing a hex count as one color. Source comments claimed `resolveEffectiveColors` output could
  drive `colorMarkupCents`; it can't, because one is hex and the other is keyed by palette id. See
  "Known limitations" in `docs/subsystems/27-customization.md`. No behavior changed in this release.

### Chores

- Ignored local Hive runtime state and committed the storefront's generated agent files.

## [0.44.0] - 2026-11-05

### Changed

- **Breaking, `@mercatus-liber/customization`:** palette ids are now the canonical color value in selections, effective colors, and `PriceBuild.colors`, matching `print-order/1`. `validateSelectedColor` rejects a hex in a region without a free color, even one matching a palette entry, and rejects a malformed free hex.

### Added

- `canonicalColor`, `resolveColorHex`, and `defaultSelection` in `@mercatus-liber/customization`.

### Fixed

- `colorMarkupCents` now charges when fed `resolveEffectiveColors` output; it silently charged nothing before.
- Two palette entries sharing a hex count as two colors in `resolveColorCount`.
- `colorChanges` no longer counts hexes differing only by case as two colors.

## [0.45.0] - 2026-11-05

### Added

- Postgres repositories for customization in `@mercatus-liber/adapter-postgres`: palette, finish tiers, art styles, product customizations, and pricing rules. An admin's price edits now survive a restart on Postgres.
- `@electric-sql/pglite` as a dev dependency, so these repositories are tested against real Postgres SQL rather than a fake pool.

## [0.46.0] - 2026-11-05

### Added

- Customization repositories for SQLite, MongoDB, and Convex, alongside Postgres. New Convex functions in `convex-functions/customization.ts` and a `customizationRecords` table must be deployed before use.
- A shared contract, `packages/customization/test/repository-contract.ts`, run against every storage backend.
- Dev dependencies `convex-test` and `@edge-runtime/vm`, so the real Convex functions run in tests.
- `MONGODB_TEST_URL` runs the customization contract against a real MongoDB server.

### Changed

- The in-memory finish tier repository lists by rank, matching every durable backend.

## [0.47.0] - 2026-11-05

### Added

- Options and variants in `@mercatus-liber/customization`: `ProductCustomization.options` and `variants`, `ColorRegion.when`, `resolvePicks`, `activeRegions`, `defaultPicks`, and `validateOptions`. `resolveEffectiveColors`, `getRegionChoices`, and `getColorCount` take optional picks.
- A choice's `attributeId` charges through a pricing attribute, and `PricingRules.variantOverrides` with `PriceBuild.variant` prices a variant separately.

### Changed

- A product with variants now throws `InvalidPicksError` from those three service methods when picks are missing or don't match a variant.
- Postgres adds `options`, `variants`, and `variant_overrides` columns on first use.

## [0.48.0] - 2026-11-05

### Added

- `LineCustomization` in `@mercatus-liber/core`: a shopper's choices as structured data, carried by `CartItem` and `OrderLineItem`.
- `CustomizationService.resolveLine`, `priceLine`, and `toPrintOrder` in `@mercatus-liber/customization`.
- `CartService.addItem` takes `customization` and a server-computed `unitPrice`. Customized lines get a `lineId`, which `removeItem` and `updateQuantity` accept.
- Request-only choices are listed on the line, so they reach the order for fulfillment.

### Changed

- `startCheckout` refuses a line marked `quoteRequired`, throwing `QuoteRequiredError`.
- Postgres adds `customization` and `line_id` columns to `cart_items` on first use.

### Fixed

- Checkout priced by SKU, so two lines of one SKU at different prices would both have charged the same amount. It now prices by line position.

## [0.49.0] - 2026-11-05

### Added

- `@mercatus-liber/storefront-ui`, the start of the common component package: `Customizer`, with live server-side pricing, and `PriceBreakdown`, an itemized price with a chart.
- The Print Shop's Embroidered Dad Cap now has a working customizer through cart, checkout, and the admin orders page, as a public example.
- Admin > Customization edits base prices, charges, and color markups.
- `@mercatus-liber/customization/client` exports the pure logic for browsers. Adds `normalizePicks`, `isOptionVisible`, and `isChoiceAvailable`.

### Changed

- `priceLine` labels a color markup with the color's name instead of its id.
- Cart templates keep customized lines of one SKU separate when changing quantity or removing.

## [0.50.0] - 2026-11-05

### Changed

- Moved the three cart templates, three product page templates, and the variant picker from the reference storefront into `@mercatus-liber/storefront-ui`. They now take a `store` and `actions` prop instead of importing the app's routes and server actions.

## [0.51.0] - 2026-11-06

### Added

- `ProviderCatalogMappingRepository` in `@mercatus-liber/fulfillment`, storing which Printful or Printify product each SKU is made from, with repositories for Postgres, SQLite, MongoDB, and Convex.
- `printifyCatalogTargetsFrom` and `printfulCatalogTargetsFrom`, building each adapter's `resolveCatalogTarget` from stored mappings.
- `holdOrders` on both print-on-demand adapters, leaving orders unsubmitted for safe testing against a real account. The storefront reads `PRINTFUL_HOLD_ORDERS` and `PRINTIFY_HOLD_ORDERS`.

### Changed

- The reference storefront resolves Printful and Printify products from stored mappings instead of always throwing.

## [0.52.0] - 2026-11-06

### Added

- `createPrintfulCatalogClient` in `@mercatus-liber/adapter-printful`: catalog products and variants, prices, shipping rates, webhook settings, and mockups, following Printful's pagination.
- `PrintfulProductSpec`, `planPrintfulProduct`, and `applyPrintfulProduct`: describe a Printful product as data and create its SKUs, mappings, and routing, with each SKU's real cost and margin.
- `printfulUnitCostCents` and `printfulPriceToCents`.
- `"held"` in `FulfillmentLineStatus`, reported for Printful drafts and Printify on-hold orders.

### Changed

- The Printful adapter refuses an address missing a street line, city, country, or postal code before calling Printful, which otherwise rejects it.

## [0.53.0] - 2026-11-06

### Added

- `estimateCosts` on the Printful catalog client: Printful's actual cost for items from an order-estimation task, which creates no order.
- `planPrintfulProduct` takes exact costs per variant, since Printful's price list can be higher than what it charges.

## [0.54.0] - 2026-11-06

### Added

- `@mercatus-liber/store-api`: a key-authenticated HTTP API for outside apps to read products and categories, read and create promotions, and subscribe to webhooks. Keys are scoped and stored hashed, with repositories for Postgres, SQLite, MongoDB, and Convex.
- `@mercatus-liber/store-client`: a dependency-free typed client for it, with webhook signature checks.
- The reference storefront serves the API at `/api/store/v1/<demo>`, delivers outbound webhooks per demo store, and adds Admin > Store API for keys.
- `docs/integrations/flayr.md`: the plan for connecting a Mercatus store to flayr, for both repos.

## [0.55.0] - 2026-11-08

### Added

- Checkout can charge shipping: an optional `ShippingQuoter` prices it per order, the order records `shippingTotal`, and the payment session gets it as a shipping charge. The Stripe adapter sends it as a fixed shipping rate with Stripe Tax's shipping tax code.
- Checkout can name line items on the payment page (`nameLineItem`) instead of showing "SKU <id>".
- Postgres orders gain a nullable `shipping_total` column, added in place on existing tables.
- The sandbox payment page's total includes shipping, and its URL carries the shipping amount.

