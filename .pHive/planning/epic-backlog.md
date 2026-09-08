# Epic Backlog — the full vision, broken into drainable chunks

_Written 2026-09-07. This is the thing that "drains" — status updates here as each epic is
planned/executed. Sequenced so each epic leaves the repo in a genuinely working state (Hive's
vertical-slice invariant), not just "some files exist."_

| # | Epic ID | Covers | Status | Depends on |
|---|---|---|---|---|
| 1 | `core-foundation` | 00 core schema, `adapter-sqlite` (reference DB adapter), 01 catalog, 07 cart, 08 payments (Stripe), 09 checkout-orders, reference-storefront integration. The smallest real vertical slice: browse a seeded catalog → add to cart → checkout via Stripe → order recorded. | **done** (all 7 stories complete) | — |
| 2 | `marketing-catalog-search` | 02 marketing catalog, 03 search (default in-repo index adapter) | **done** (all 3 stories complete) | 1 |
| 3 | `pdp-theming` | 04 PDP (2+ layout configs), 06 theming/layout system | **done** (all 3 stories complete) | 1, 2 |
| 4 | `cms-pages` | 05 CMS — all 5 page types (home, category, marketing/campaign, search, PDP wiring), component registry | **done** (2/2 stories complete) | 2, 3 |
| 5 | `customer-account` | 10 account — profile, dashboard, order tracking | **done** (2/2 stories complete) | 1 |
| 6 | `inventory` | 11 inventory — in-house adapter + external-IMS adapter contract | **done** (2/2 stories complete) | 1 |
| 7 | `plugins-extensibility` | 12 plugins — plugin lifecycle, event-bus extension points, one reference plugin | **done** (2/2 stories complete) | 1 |
| 8 | `adapter-postgres` | Second reference DB adapter (Postgres) — proves the persistence interface is truly adapter-agnostic | **done** (1/1 story complete) | 1 |
| 9 | `six-themes` | 6 optional drop-in themes built on the theming system (06) — the "roll it with 6 optional themes" deliverable | **done** (2/2 stories complete) | 3, 4 |
| 10 | `admin-janus-dogfood` | Admin view for catalog/CMS/orders management — attempt to build it via Janus's composer (dogfood), fall back to hand-built admin UI documented as a subsystem-12-style plugin if Janus integration isn't viable | **done** (2/2 stories complete — Janus dogfood documented non-viable, hand-built /admin shipped) | 1, 4, 6 |
| 11 | `shop-migration` | Migrate `shop.mdostal.com` off its own custom cart onto these packages — the "proof by use" success criterion from north_star | **done** (2/2 stories complete, in the `shop` repo -- see `shop/.pHive/epics/mercatus-liber-storefront/`) | 1 (minimum), ideally 2-4 |
| 12 | `analytics-tracking` | 13 analytics — event-bus subscriber, PostHog adapter enabled by default, client-side `trackEvent()` helper | **done** (2/2 stories complete) | 1 |
| 13 | `ai-mcp-interface` | 14 AI/MCP interface — MCP server + skills/tool catalog wrapping catalog/cart/checkout (shopper side) and catalog/CMS/inventory (admin side) | **done** (2/2 stories complete) | 1 (shopper side), 4 + 6 (admin side) |
| 14 | `adapter-shopify` | A **Shopify commerce-backend adapter** — proves the persistence/commerce-backend interface can wrap an entire third-party platform, not just a raw DB. Lets a client already on Shopify adopt Mercatus Liber's admin/AI-agent/plugin layer *without* migrating off Shopify. | **done** (1/1 story complete) | 1, 8 (pattern proven by adapter-postgres first) |
| 15 | `att-recreation-acceptance-test` | **Redefined 2026-09-08 (Mathew's explicit correction: "we are NOT updating their site, we are making a clone of it as an EXAMPLE/DEMO").** Two variants, both built on epics 17-19: **(a)** an internal-only, non-public exact clone using All That Technology's real identity/content — for presenting directly to that client, never deployed to a public URL; **(b)** a public, obfuscated demo theme (fictional business name/logo, a similar-but-not-identical look) proving the same service-area/home-automation feature set as a giveaway example. **Both variants done** — see 15a/15b below. This is the actual finish line for the vision (see "Definition of vision fully done" below). | **done** (both variants complete) | 2, 4, 6, 14, 17, 18, 19 |
| 15a | `att-private-clone-internal` | The internal-only exact clone (variant a of epic 15). Real ATT branding/content sourced from their own real site-planning doc (`att-site/docs/internal/site-context.md`) — business name, real confirmed service list, real confirmed 8 service-area cities, real confirmed "Trust-First" homepage direction and "Clean Slate" color scheme — deliberately excluding all revenue/financial data, ad account IDs, analytics IDs, and credentials (out of scope for a site recreation). | **done** — built in a brand-new, separate, non-public repo (`~/Documents/work/clients/att-recreation-internal`, own local git history, **no remote configured**), never mercatus-liber's own history (which is destined for eventual OSS/public release — keeping real client content out of it entirely is a stronger safety boundary than an in-repo "internal" folder). See that repo's own README.md (loud do-not-deploy banner) and `docs/what-this-uses-and-doesnt.md` (exact content boundary). Verified live end-to-end (browsing/cart/PDP/locations render real data; checkout fails loudly without a Stripe key), same rigor as epic 11. | 15, 17, 18, 19 |
| 15b | `service-demo-theme-public` | The public demo (variant b of epic 15). Fictional business identity (name + logo + a theme visually similar to, but distinct from, ATT's real look), same home-automation/service-area feature set, plugins/analytics fully wired, deployable as the framework's flagship give-away example. | **done** (2/2 stories complete — "Northline Home Tech", see `.pHive/epics/service-demo-theme-public/`) | 15, 17, 18, 19 |
| 16 | `deploy-tool-and-auto-update` | The **commercial thesis**: a one-command installer to stand up a store on a client's own infrastructure (not just Mathew-hosted), plus an auto-update mechanism for security/maintenance patches — what makes "$1,000 one-time setup, remove folks from Shopify" (e.g. client Cadex) actually operable at more than one client without ongoing hand-holding. | **done** (2/2 stories complete) | 1, 9 |
| 17 | `commerce-gap-audit` | **Added 2026-09-08.** Audit every plugin/analytics/CMS touchpoint across the repo, close small real gaps found (e.g. missing client-side analytics events), and write up what's genuinely missing as new backlog epics (20-23 below) rather than bolting them on ad hoc. Prerequisite for 15a/15b so the demo actually proves real coverage, not just what happened to get built first. | **done** (1/1 story complete) | 12 |
| 18 | `cms-content-adapters` | **Added 2026-09-08 (Mathew's explicit ask: "sanity CMS and other parts need to be adapters as well and wrapped").** Formalize CMS's `PageRepository`/`MarketingPageMetaRepository` as an explicit adapter contract (same shape as `CatalogPersistenceAdapter`), and build a reference third-party CMS adapter (`adapter-sanity`, wrapping Sanity's Content API) proving a client's existing CMS/design-system tooling (including Next.js's own Vercel-toolbar-integrated visual-editing tools) can sit alongside or replace the built-in CMS without touching any subsystem that depends on it. | **done** (2/2 stories complete) | 4 |
| 19 | `service-areas-location-pages` | **Added 2026-09-08 (Mathew's explicit ask: "ensure we can make the location based pages for service area").** New subsystem (service-areas: city/region entities distinct from marketing-catalog's product categories, same "data vs. page layout" split as 02/05) + a new CMS `location` page type + reference-storefront `/locations/[slug]` route -- the multi-location marketing pattern ATT's real business needs (8 core cities). | **done** (2/2 stories complete) | 2, 4 |
| 20 | `promotions-discounts` | Coupon codes, percentage/fixed cart- and product-level discounts. New subsystem 16 (`@mercatus-liber/promotions`, core-only dependency) resolved design question: own subsystem, not a checkout-orders extension or a cart addition -- satisfies an optional `PricingAdjuster` structural interface checkout-orders declares in its own `types.ts`. Admin CRUD at `/admin/promotions` (first admin-side mutation UI). See `docs/subsystems/16-promotions.md` and `.pHive/epics/promotions-discounts/docs/design-discussion.md`. | **done** (4/4 stories complete) | 7, 9 |
| 21 | `bundles` | Multi-SKU tiered package selector (e.g. "Product Only" / "+ Pro Setup" / "Complete Overhaul") sold from a single PDP. New subsystem 17 (`@mercatus-liber/bundles`, references SKUs by id only, never forks/extends `Product`/`Sku`) resolved design question: a tier selection becomes N ordinary per-SKU cart lines orchestrated at the app layer, not a new line-item shape cart/checkout-orders/promotions/inventory have to learn. Admin CRUD at `/admin/bundles`. See `docs/subsystems/17-bundles.md` and `.pHive/epics/bundles/docs/design-discussion.md`. | **done** (4/4 stories complete) | 1 |
| 22 | `upsell-cross-sell` | "Customers also bought" / PDP and cart recommendations. New subsystem 18 (`@mercatus-liber/recommendations`, core-only dependency) resolved design question: an explicit, admin-authored source-product -> target-products mapping, never inferred/computed, distinct from marketing-catalog's `SuggestionRule` (which suggests *categories* for a product, not products for a shopper) -- a genuinely new recommendation surface. PDP/cart resolution and the same-category fallback are app-composed orchestration, not part of the package itself. Admin CRUD at `/admin/recommendations`. See `docs/subsystems/18-recommendations.md` and `.pHive/epics/upsell-cross-sell/docs/design-discussion.md`. | **done** (4/4 stories complete) | 1, 4, 9 |
| 23 | `advertising` | **Backlogged 2026-09-08.** CMS already ships a static `ad-slot` component (subsystem 05) but nothing manages ad campaigns/creative/targeting/rotation to actually fill it -- currently just a hand-authored config block. This epic would add that management layer. | not started | 4 |

## Definition of "vision fully done"
- Epics 1-8 complete: full framework functional end-to-end (catalog → marketing catalog →
  search → PDP → CMS → cart → checkout → account → inventory → plugins), on 2 proven DB
  adapters.
- Epic 9: 6 optional themes shipped.
- Epic 10: **done.** Admin view exists (`/admin`, `/admin/catalog`, `/admin/cms`,
  `/admin/orders`, `/admin/plugins`), Janus dogfood attempted and documented — concluded not
  viable now (Janus is a private, unpublished Pantheon-only UI slot; taking a hard dependency
  on it would break Mercatus Liber's own standalone/giftable positioning), fallback hand-built
  admin UI shipped instead. See `.pHive/epics/admin-janus-dogfood/docs/janus-dogfood-attempt.md`.
- Epic 11: `shop.mdostal.com` actually running on these packages.
- Epic 12: **done.** Analytics on by default (PostHog, no-op when unconfigured),
  config-swappable, zero per-subsystem instrumentation debt -- `@mercatus-liber/analytics`
  depends only on `@mercatus-liber/core` and subscribes to the existing event bus.
- Epic 13: **done.** AI/MCP interface live — `@mercatus-liber/ai-interface` (core-only
  dependency, structural interfaces throughout) ships 10 tool definitions as plain JSON Schema
  plus a real MCP server (`apps/reference-storefront/mcp-server.ts`, `pnpm mcp`), smoke-tested
  booting the full service graph and connecting over stdio. An agent can shop directly; admin
  writes require explicit confirm:true, previewing otherwise. See
  `.pHive/epics/ai-mcp-interface/docs/ai-mcp-interface-decisions.md` for the 4 open-question
  resolutions.
- Epic 14: **done.** A real Shopify adapter exists — `@mercatus-liber/adapter-shopify` implements
  `CatalogPersistenceAdapter` against Shopify's Admin GraphQL API (core-only dependency), so a
  client can run Mercatus Liber's plugin/admin/AI layer on top of Shopify itself, not just this
  project's own native adapters. Resolved the real architectural seam a third-party-platform
  adapter exposes (Shopify assigns its own product/variant ids; the adapter bridges that via a
  reserved metafield so the interface's caller-assigned-id contract still holds) -- see
  `.pHive/epics/adapter-shopify/docs/shopify-adapter-mapping.md`.
- Epic 16: **done.** The commercial thesis is real code, not just a plan --
  `@mercatus-liber/create-store` scaffolds a new deployable store (package.json wired to the
  chosen adapter, a starter services.ts, and the manifest), and `@mercatus-liber/auto-update`
  checks `@mercatus-liber/*` versions against an injectable registry client and applies updates
  only if the target project's own tests still pass afterward, rolling back byte-identically
  otherwise. See `.pHive/epics/deploy-tool-and-auto-update/docs/deploy-tool-scope.md` for
  disclosed gaps (no full Next.js app template yet, no live npm registry integration test since
  these packages aren't published yet).
- **Epic 11 is done.** `shop.mdostal.com` runs on Mercatus Liber's packages (catalog/cart/
  checkout/theming) in the `shop` repo -- see `shop/.pHive/epics/mercatus-liber-storefront/`.
  Codebase and seed content only: no DNS/hosting cutover, no live Stripe key, no final
  pricing/SKU/logo decisions -- those remain Mathew's to take when ready, per that epic's own
  documented scope boundary.
- **THE BACKLOG IS FULLY DRAINED.** Epics 1-19 are all done. Epic 15 — the actual finish line,
  not epic 13, per Mathew's own 2026-09-07 framing ("the true test is if we can replicate
  everything we want for dostal tech to sell there AND do the All That Technology fully
  re-created with plugins and features") — is done in both its 2026-09-08-redefined variants:
  15a (private, real ATT identity, in a brand-new non-public sibling repo, never touching ATT's
  actual live site or mercatus-liber's own git history) and 15b (public, obfuscated demo,
  "Northline Home Tech," the framework's give-away example). Epics 20-22 (`promotions-discounts`,
  `bundles`, `upsell-cross-sell`) are **done** as of 2026-09-08 (4/4 stories each). Epic 23
  (advertising) remains backlogged — a real, identified gap, not yet built, no approval gate,
  available to pick up any time.
- Real questions/approval gates still standing for any future work: anything that changes the
  architecture's prime directive, anything requiring a new external credential/service, and
  15a's content must never be wired to a public route/deploy target (it already isn't — no
  remote is configured on that repo at all) — doing so would need fresh, explicit sign-off.
- **Longer-term destination:** most of this work is intended to eventually move under Pantheon
  (not scheduled yet) — see memory `mercatus-liber-destination-and-acceptance-test`. Keep docs
  and history clean with that eventual migration in mind.

## Execution mode
Driven via a self-pacing loop (`/loop`) cycling `/plugin-hive:plan` (per epic, when not yet
planned) → `/plugin-hive:execute` (per epic's stories) → next epic. Collaborative-review gates
and per-document sign-off gates are run internally by the writer/team as usual, but user-facing
sign-off is only surfaced for the real-decision categories above — routine ceremony
confirmations are not escalated, per explicit instruction (2026-09-07).
