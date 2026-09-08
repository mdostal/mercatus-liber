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
| 12 | `analytics-tracking` | 13 analytics — event-bus subscriber, PostHog adapter enabled by default, client-side `trackEvent()` helper | not started | 1 |
| 13 | `ai-mcp-interface` | 14 AI/MCP interface — MCP server + skills/tool catalog wrapping catalog/cart/checkout (shopper side) and catalog/CMS/inventory (admin side) | not started | 1 (shopper side), 4 + 6 (admin side) |
| 14 | `adapter-shopify` | A **Shopify commerce-backend adapter** — proves the persistence/commerce-backend interface can wrap an entire third-party platform, not just a raw DB. Lets a client already on Shopify adopt Mercatus Liber's admin/AI-agent/plugin layer *without* migrating off Shopify. | not started | 1, 8 (pattern proven by adapter-postgres first) |
| 15 | `att-recreation-acceptance-test` | **The real acceptance test.** Fully recreate client **All That Technology**'s site/functionality (home-automation installs — TV mounting, cameras, doorbells, fiber; Royse City TX service-area business, 8 core cities, multi-location marketing pattern) using Mercatus Liber's plugins/features, runnable on either the native stack or the Shopify adapter (14) — client's choice. See memory `mercatus-liber-destination-and-acceptance-test` for full context. | not started | 2, 4, 6, 14 |
| 16 | `deploy-tool-and-auto-update` | The **commercial thesis**: a one-command installer to stand up a store on a client's own infrastructure (not just Mathew-hosted), plus an auto-update mechanism for security/maintenance patches — what makes "$1,000 one-time setup, remove folks from Shopify" (e.g. client Cadex) actually operable at more than one client without ongoing hand-holding. | not started | 1, 9 |

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
- Epic 12: analytics on by default (PostHog), config-swappable, zero per-subsystem
  instrumentation debt.
- Epic 13: AI/MCP interface live — an agent can shop and (with proper authorization) manage
  admin operations through the same interfaces a human uses.
- Epic 14: a real Shopify adapter exists — a client can run Mercatus Liber's plugin/admin/AI
  layer on top of Shopify itself, not just this project's own native adapters.
- **Epic 15 is the actual finish line, not epic 13.** Per Mathew's own framing (2026-09-07):
  "the true test is if we can replicate everything we want for dostal tech to sell there AND do
  the All That Technology fully re-created with plugins and features so they could choose to
  run off of shopify if they wanted." shop.mdostal.com (epic 11) alone is not sufficient proof
  — a real client's real multi-location service-area business, recreated end-to-end, optionally
  on Shopify, is the bar.
- Only then does this backlog "drain." Real questions/approval gates along the way: anything
  that changes the architecture's prime directive, anything requiring a new external
  credential/service, epic 11's cutover itself (touches a live-ish shop, not a green field), and
  epic 15's use of a real client's identity/business (needs Mathew's explicit sign-off before
  anything client-facing is touched, even as a recreation exercise).
- **Longer-term destination:** most of this work is intended to eventually move under Pantheon
  (not scheduled yet) — see memory `mercatus-liber-destination-and-acceptance-test`. Keep docs
  and history clean with that eventual migration in mind.

## Execution mode
Driven via a self-pacing loop (`/loop`) cycling `/plugin-hive:plan` (per epic, when not yet
planned) → `/plugin-hive:execute` (per epic's stories) → next epic. Collaborative-review gates
and per-document sign-off gates are run internally by the writer/team as usual, but user-facing
sign-off is only surfaced for the real-decision categories above — routine ceremony
confirmations are not escalated, per explicit instruction (2026-09-07).
