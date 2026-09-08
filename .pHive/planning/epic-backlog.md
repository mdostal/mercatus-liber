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
| 11 | `shop-migration` | Migrate `shop.mdostal.com` off its own custom cart onto these packages — the "proof by use" success criterion from north_star | not started | 1 (minimum), ideally 2-4 |
| 12 | `analytics-tracking` | 13 analytics — event-bus subscriber, PostHog adapter enabled by default, client-side `trackEvent()` helper | **done** (2/2 stories complete) | 1 |
| 13 | `ai-mcp-interface` | 14 AI/MCP interface — MCP server + skills/tool catalog wrapping catalog/cart/checkout (shopper side) and catalog/CMS/inventory (admin side) | **done** (2/2 stories complete) | 1 (shopper side), 4 + 6 (admin side) |
| 14 | `adapter-shopify` | A **Shopify commerce-backend adapter** — proves the persistence/commerce-backend interface can wrap an entire third-party platform, not just a raw DB. Lets a client already on Shopify adopt Mercatus Liber's admin/AI-agent/plugin layer *without* migrating off Shopify. | **done** (1/1 story complete) | 1, 8 (pattern proven by adapter-postgres first) |
| 15 | `att-recreation-acceptance-test` | **Redefined 2026-09-08 (Mathew's explicit correction: "we are NOT updating their site, we are making a clone of it as an EXAMPLE/DEMO").** Two variants, both built on epics 17-19 below: **(a)** an internal-only, non-public exact clone using All That Technology's real identity/content — for presenting directly to that client, never deployed to a public URL; **(b)** a public, obfuscated demo theme (fictional business name/logo, a similar-but-not-identical look) proving the same service-area/home-automation feature set as a giveaway example. See sub-epics 15a/15b below and memory `mercatus-liber-destination-and-acceptance-test`. | not started (blocked on 17-19) | 2, 4, 6, 14, 17, 18, 19 |
| 15a | `att-private-clone-internal` | The internal-only exact clone (variant a of epic 15). Real ATT branding/content, seeded from what's already known (Royse City TX, 8 core cities, TV mounting/cameras/doorbells/fiber). Lives in a clearly-labeled internal/private area of the repo or a separate non-public app; never wired to a public route or deploy target. | not started | 15, 17, 18, 19 |
| 15b | `service-demo-theme-public` | The public demo (variant b of epic 15). Fictional business identity (name + logo + a theme visually similar to, but distinct from, ATT's real look), same home-automation/service-area feature set, plugins/analytics fully wired, deployable as the framework's flagship give-away example. | not started | 15, 17, 18, 19 |
| 16 | `deploy-tool-and-auto-update` | The **commercial thesis**: a one-command installer to stand up a store on a client's own infrastructure (not just Mathew-hosted), plus an auto-update mechanism for security/maintenance patches — what makes "$1,000 one-time setup, remove folks from Shopify" (e.g. client Cadex) actually operable at more than one client without ongoing hand-holding. | **done** (2/2 stories complete) | 1, 9 |
| 17 | `commerce-gap-audit` | **Added 2026-09-08.** Audit every plugin/analytics/CMS touchpoint across the repo, close small real gaps found (e.g. missing client-side analytics events), and write up what's genuinely missing as new backlog epics (20-23 below) rather than bolting them on ad hoc. Prerequisite for 15a/15b so the demo actually proves real coverage, not just what happened to get built first. | **done** (1/1 story complete) | 12 |
| 18 | `cms-content-adapters` | **Added 2026-09-08 (Mathew's explicit ask: "sanity CMS and other parts need to be adapters as well and wrapped").** Formalize CMS's `PageRepository`/`MarketingPageMetaRepository` as an explicit adapter contract (same shape as `CatalogPersistenceAdapter`), and build a reference third-party CMS adapter (`adapter-sanity`, wrapping Sanity's Content API) proving a client's existing CMS/design-system tooling (including Next.js's own Vercel-toolbar-integrated visual-editing tools) can sit alongside or replace the built-in CMS without touching any subsystem that depends on it. | not started | 4 |
| 19 | `service-areas-location-pages` | **Added 2026-09-08 (Mathew's explicit ask: "ensure we can make the location based pages for service area").** New subsystem (service-areas: city/region entities distinct from marketing-catalog's product categories, same "data vs. page layout" split as 02/05) + a new CMS `location` page type + reference-storefront `/locations/[slug]` route -- the multi-location marketing pattern ATT's real business needs (8 core cities). | not started | 2, 4 |
| 20 | `promotions-discounts` | **Backlogged 2026-09-08 (identified via epic 17's audit, not yet built).** Coupon codes, percentage/fixed cart- and product-level discounts. Needs a pluggable pricing-adjustment interface checkout-orders/cart can consult -- design question (own subsystem vs. plugin extension point) deferred to this epic's own planning. | not started | 7, 9 |
| 21 | `bundles` | **Backlogged 2026-09-08.** Multi-product bundles sold as a single purchasable unit (e.g. camera + install kit). Likely extends catalog's Product/Sku model rather than a wholly separate subsystem -- design question deferred to this epic's own planning. | not started | 1 |
| 22 | `upsell-cross-sell` | **Backlogged 2026-09-08.** "Customers also bought" / PDP and cart recommendations. Distinct from marketing-catalog's `SuggestionRule` (which suggests *categories* for a product, not products for a shopper) -- a genuinely new recommendation surface. | not started | 1, 4, 9 |
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
- **Every ungated epic through 16 is done (1-10, 12-14, 16).** Epics 11 and 15 are both now
  **approved to proceed** (Mathew, 2026-09-08): epic 11 (`shop-migration`) unconditionally;
  epic 15 in its redefined shape (15a private clone / 15b public demo, per above) after epics
  17-19 land. New epics 17-23 (added 2026-09-08 from Mathew's audit/gap-analysis instructions)
  have no approval gate and proceed autonomously like every other epic.
- **Epic 15 is still the actual finish line, not epic 13** — the same framing as 2026-09-07
  ("the true test is if we can replicate everything we want for dostal tech to sell there AND
  do the All That Technology fully re-created with plugins and features") still holds, now
  split into 15a (private, real ATT identity, presented directly to that client) and 15b
  (public, obfuscated demo, the framework's give-away example) per Mathew's 2026-09-08
  correction that neither variant touches ATT's actual live site.
- Real questions/approval gates still standing: anything that changes the architecture's prime
  directive, anything requiring a new external credential/service, and — even though 15a is
  approved to build — 15a's content must never be wired to a public route/deploy target; that
  would cross back into needing explicit fresh sign-off.
- **Longer-term destination:** most of this work is intended to eventually move under Pantheon
  (not scheduled yet) — see memory `mercatus-liber-destination-and-acceptance-test`. Keep docs
  and history clean with that eventual migration in mind.

## Execution mode
Driven via a self-pacing loop (`/loop`) cycling `/plugin-hive:plan` (per epic, when not yet
planned) → `/plugin-hive:execute` (per epic's stories) → next epic. Collaborative-review gates
and per-document sign-off gates are run internally by the writer/team as usual, but user-facing
sign-off is only surfaced for the real-decision categories above — routine ceremony
confirmations are not escalated, per explicit instruction (2026-09-07).
