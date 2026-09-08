# Epic Backlog — the full vision, broken into drainable chunks

_Written 2026-09-07. This is the thing that "drains" — status updates here as each epic is
planned/executed. Sequenced so each epic leaves the repo in a genuinely working state (Hive's
vertical-slice invariant), not just "some files exist."_

| # | Epic ID | Covers | Status | Depends on |
|---|---|---|---|---|
| 1 | `core-foundation` | 00 core schema, `adapter-sqlite` (reference DB adapter), 01 catalog, 07 cart, 08 payments (Stripe), 09 checkout-orders. The smallest real vertical slice: browse a seeded catalog → add to cart → checkout via Stripe → order recorded. | **planning** | — |
| 2 | `marketing-catalog-search` | 02 marketing catalog, 03 search (default in-repo index adapter) | not started | 1 |
| 3 | `pdp-theming` | 04 PDP (2+ layout configs), 06 theming/layout system | not started | 1, 2 |
| 4 | `cms-pages` | 05 CMS — all 5 page types (home, category, marketing/campaign, search, PDP wiring), component registry | not started | 2, 3 |
| 5 | `customer-account` | 10 account — profile, dashboard, order tracking | not started | 1 |
| 6 | `inventory` | 11 inventory — in-house adapter + external-IMS adapter contract | not started | 1 |
| 7 | `plugins-extensibility` | 12 plugins — plugin lifecycle, event-bus extension points, one reference plugin | not started | 1 |
| 8 | `adapter-postgres` | Second reference DB adapter (Postgres) — proves the persistence interface is truly adapter-agnostic | not started | 1 |
| 9 | `six-themes` | 6 optional drop-in themes built on the theming system (06) — the "roll it with 6 optional themes" deliverable | not started | 3, 4 |
| 10 | `admin-janus-dogfood` | Admin view for catalog/CMS/orders management — attempt to build it via Janus's composer (dogfood), fall back to hand-built admin UI documented as a subsystem-12-style plugin if Janus integration isn't viable | not started | 1, 4, 6 |
| 11 | `shop-migration` | Migrate `shop.mdostal.com` off its own custom cart onto these packages — the "proof by use" success criterion from north_star | not started | 1 (minimum), ideally 2-4 |
| 12 | `analytics-tracking` | 13 analytics — event-bus subscriber, PostHog adapter enabled by default, client-side `trackEvent()` helper | not started | 1 |
| 13 | `ai-mcp-interface` | 14 AI/MCP interface — MCP server + skills/tool catalog wrapping catalog/cart/checkout (shopper side) and catalog/CMS/inventory (admin side) | not started | 1 (shopper side), 4 + 6 (admin side) |

## Definition of "vision fully done"
- Epics 1-8 complete: full framework functional end-to-end (catalog → marketing catalog →
  search → PDP → CMS → cart → checkout → account → inventory → plugins), on 2 proven DB
  adapters.
- Epic 9: 6 optional themes shipped.
- Epic 10: admin view exists, Janus dogfood attempted and documented (success or honest
  documented failure — "we tried, here's what happened" counts as done, it doesn't have to
  succeed to close this epic).
- Epic 11: `shop.mdostal.com` actually running on these packages.
- Epic 12: analytics on by default (PostHog), config-swappable, zero per-subsystem
  instrumentation debt.
- Epic 13: AI/MCP interface live — an agent can shop and (with proper authorization) manage
  admin operations through the same interfaces a human uses.
- Only then does this backlog "drain." Real questions/approval gates along the way: anything
  that changes the architecture's prime directive, anything requiring a new external
  credential/service, and epic 11's cutover itself (touches a live-ish shop, not a green field).

## Execution mode
Driven via a self-pacing loop (`/loop`) cycling `/plugin-hive:plan` (per epic, when not yet
planned) → `/plugin-hive:execute` (per epic's stories) → next epic. Collaborative-review gates
and per-document sign-off gates are run internally by the writer/team as usual, but user-facing
sign-off is only surfaced for the real-decision categories above — routine ceremony
confirmations are not escalated, per explicit instruction (2026-09-07).
