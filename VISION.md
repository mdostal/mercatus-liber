# Vision

Mercatus Liber ("free market") is a free, open-source, headless commerce framework. The goal is
not to be one more hosted SaaS platform — it's to be the thing a small business, an agency, or
an individual developer can pick up, self-host or deploy anywhere, and own outright. No
per-transaction cut, no forced app-store tax, no vendor lock-in.

**The long-term destination: replace the commercial commerce-platform stack (Shopify-, BigCommerce-,
WooCommerce-class systems) with a genuinely community-developed, free alternative** — a core
that stays small, sharp, and adapter-first, surrounded by a plugin/adapter ecosystem the
community builds and owns, not a single maintainer.

This document is the honest state of that effort: what's real today, what's actively being
built, and — just as important — what's *wanted but not started*, explicitly left as an
invitation for community contribution rather than a promise one person will get to it.

This is a living document. It should be updated after every epic slice lands, not batched up
and rewritten from scratch later. See `.pHive/planning/epic-backlog.md` for the full,
blow-by-blow ledger this summarizes.

## Design principles (why this looks the way it does)

1. **Adapter-first, always.** Every subsystem that could plausibly have more than one
   implementation (persistence, CMS, payments, admin-auth, analytics, fulfillment, shipping) is
   defined as a narrow structural interface with a zero-infra reference default and real
   third-party adapters living in sibling packages. Nothing forces a specific vendor. This is
   what makes "roll your own commerce, own your store" actually true rather than a slogan.
2. **Vertical slices over horizontal layers.** Every epic in this project's history ships a
   working, demonstrable increment — not "the database layer" followed six months later by "the
   UI layer." A slice isn't done until it's live-verified against a real running server.
3. **Small core, big community surface.** The framework's own packages stay narrowly scoped to
   what genuinely needs to be shared infrastructure. Everything else — reviews, loyalty,
   subscriptions, marketplace-channel sync, print-on-demand routing, and dozens of features
   listed below — is designed to be a plugin or adapter someone else can build, using the same
   contract pattern the core itself uses internally. The plugin subsystem (see `docs/subsystems/12-plugins.md`)
   and the event bus exist specifically so this is possible without forking the core.
4. **No AI-agent tax.** The framework ships an MCP server and Claude Code skills so an AI agent
   can set up, operate, and extend a store the same way a human developer would — this isn't a
   bolt-on integration, it's a first-class interface alongside the human-facing admin UI.

## Where things stand today

**Done — the real, working core** (see `.pHive/planning/epic-backlog.md` epics 1–47 for the
full detail on every item below; only backlog epic 48 remains genuinely open):

- Catalog, cart, checkout, Stripe payments, orders — the base commerce loop, with two real
  reference persistence adapters (SQLite, Postgres) proving the interface is genuinely
  adapter-agnostic, plus a Shopify commerce-backend adapter proving it can wrap a whole
  third-party platform.
- Marketing catalog, search, PDP, CMS (5 page types), theming/layout system, 7 theme bundles.
- Customer accounts, inventory (in-house + external-IMS contract), plugin/event-bus
  extensibility, analytics event forwarding (PostHog by default), an AI/MCP interface covering
  both shopper- and admin-side operations.
- Promotions/coupons, multi-tier bundles, upsell/cross-sell recommendations, admin-managed
  advertising, an internal business-intelligence dashboard.
- Real admin authentication (Clerk-backed, three-role owner/admin/viewer model) — closing what
  was, for a while, a genuinely live unauthenticated-admin gap.
- A store-scaffolding CLI + agent-facing skill so a new store can be provisioned end-to-end.
- Multi-tenant demo routing (multiple fully-isolated demo storefronts live under one deployment)
  and a real Nextra-based documentation site syncing from this repo's own `docs/`.
- A from-scratch competitive-feature research pass (epic 40) against Shopify/BigCommerce/
  WooCommerce, which is what grounds most of the "wanted, not started" list below in real
  research rather than guesswork.
- **`storefront-design-system-v2`** (epic 34) — three genuinely independent, professionally
  designed visual themes (not a token palette swap) built via a repeatable blind-parallel-
  design-agent process, now real switchable, component-level themes (`editorial`/`maximalist`/
  `datasheet`) any demo store can use, alongside the 7 pre-existing bundles.
- **Three demo stores with real depth** (epics 35–37) — a true navigation menu, a deep product
  catalog, and genuine interactive actions across all three: Northline Home Tech (smart-home
  installer, 4 categories, 8 real service-area location pages, tiered service SKUs, `northline`
  theme by default), The Print Shop (embroidery/custom prints/coasters, reconceived from the
  earlier dragon-branded placeholder demo and renamed to the `print-shop` slug, 4 categories,
  per-line-item customization notes, `editorial` theme by default), and Broadleaf & Co. (a new
  eclectic artisan/handmade-goods shop across Plants, Ceramics & Planters, Textiles & Fiber
  Arts, and Paper & Ephemera, 9 real products including a tiered Trailing Pothos in 3 pot
  sizes, `vibrant` theme by default).
- **A real documentation feature deep-dive** (epic 38) — 8 narrative deep-dive pages
  (`apps/docs/content-src/deep-dive/`) with real code pulled directly from the actual packages,
  not paraphrased — Commerce Core, Theming & Design System, CMS & Marketing, Admin & Access
  Control, Promotions & Merchandising, Business Intelligence & Analytics, Plugins & AI/Agent
  Interface, and Adapters & Portability — plus a planning-index landing page, and
  `sync-content.mjs` extended to publish every epic's own real `design-discussion.md` into a
  public planning corpus (`content/planning/<epic-name>.md`) so the reasoning behind this
  project's own decisions is public, not just conclusions. Also found and removed a stray,
  unwired `mkdocs.yml`/`docs/index.md` duplicate left by an uncoordinated session, keeping the
  real Nextra site the one canonical docs technology.
- **Real database persistence plus backup/restore** (epic 39) — catalog persistence gained the
  same env-var-driven three-state wiring every other adapter already had (`DATABASE_URL` for a
  real Postgres adapter, else `SQLITE_FILE_PATH` for real file-backed WAL-mode SQLite, else the
  original ephemeral in-memory default, byte-for-byte unchanged), plus a real backup/restore CLI
  in `packages/adapter-sqlite` built on better-sqlite3's native Online Backup API rather than an
  unsafe raw file copy. Live-verified surviving a genuine server restart and a real backup/restore
  round-trip with byte-for-byte matching data. This work also surfaced a real follow-up gap in
  demo-seeding idempotency, now tracked as backlog epic 48 — see "Queued, not yet started" below.
- **SEO & AEO infrastructure** (epic 45) — real per-page `generateMetadata` (product/category/
  search/home titles and descriptions, replacing one static "Shop" title every route previously
  shared), canonical URLs, a live-queried `sitemap.xml` (53 real URLs) and `robots.txt`,
  `Product`/`Organization`+`WebSite`/`BreadcrumbList`/`FAQPage` JSON-LD, and a real `llms.txt`
  following the `llmstxt.org` convention — closing what had been zero SEO/AEO infrastructure
  anywhere in the reference storefront, flagged by the epic 40 research pass as the single
  highest-priority gap found.
- **Fulfillment & shipping** (epics 41–44) — a new `@mercatus-liber/fulfillment` subsystem
  (who/how an order gets produced — self-fulfilled by default via a real manual adapter, plus
  real Printful and Printify print-on-demand adapters, each API-verified against real, current
  provider docs, live and additively wired in `/admin/orders`) and a new
  `@mercatus-liber/shipping` subsystem (rate shopping, label purchase, tracking —
  manual/PirateShip by default, confirmed to genuinely have no public API rather than assumed,
  plus a real Shippo adapter for full automation). Printful/Printify/Shippo are each blocked on
  a real provider credential, none of which exist in this environment yet — built and
  unit-tested for real correctness against current API docs, honestly disclosed as
  live-unverified rather than claimed working end to end.
- **Analytics insights & import adapters** (epic 46) — a new `AnalyticsInsightsAdapter`
  read-side contract (distinct from `analytics`' existing write-only event-forwarding one),
  real GA4 Data API and PostHog Query API adapters, and a `/admin/metrics` Traffic & Sources
  view showing every configured source side by side, never silently merged. Both providers are
  credential-gated the same honest way as Printful/Printify/Shippo above.
- **`apps/docs` deployed live for the first time** — its own real Vercel project
  (`mercatus-liber-docs`), wired into `commerce.mdostal.com`'s `NEXT_PUBLIC_DOCS_URL` in
  production, closing epic 33's original disclosed deployment gap.

**In progress** — nothing is genuinely mid-build right now. The backlog is drained down to the
open community invitation further down, plus one logged, real, not-yet-started fix:

- **Demo-seed idempotency** (backlog epic 48) — a real gap surfaced by epic 39's live persistence
  verification, and confirmed worse on a fuller audit than first logged: within one running
  process repeated seed calls are memoized and safe, but an actual **process restart** against a
  persisted `SQLITE_FILE_PATH`/`DATABASE_URL` throws an unhandled `SQLITE_CONSTRAINT_UNIQUE` on
  `products.slug` and permanently breaks that demo for the rest of the process's life (sibling
  demos stay healthy), since every demo's seed function creates products unconditionally instead
  of checking first. Harmless under the in-memory default (production's current state — real
  persistence isn't enabled on `commerce.mdostal.com` yet); a real blocker the moment it is.

## Wanted, not started — the community plugin frontier

Everything below is a real gap, verified against live Shopify/BigCommerce/WooCommerce
documentation (not guessed), that this project has **deliberately chosen not to build solo**.
These are exactly the kind of features the adapter/plugin pattern above exists to support — each
one is a plausible standalone package or adapter, buildable independently, without needing to
touch the core. If you want to contribute to Mercatus Liber, this list is the best place to
start.

| Feature | What it does | Why it's not core | Contribution shape |
|---|---|---|---|
| Product reviews / UGC | Star ratings, written reviews, photo/video review content on PDPs | Every platform treats this as an add-on app, not core commerce logic | New subsystem + adapter contract (e.g. wrapping a hosted reviews API, or a self-hosted default) |
| Wishlist | Save-for-later across sessions/devices | Orthogonal to the core purchase loop | Small subsystem, cart-adjacent |
| Backorder / pre-order | Sell out-of-stock items with an expected ship date | Extension of inventory, not a new purchase primitive | Extends `inventory`'s existing contract |
| Gift cards & store credit | Purchasable/redeemable stored-value codes | A payment-adjacent primitive most platforms bolt on separately | New subsystem, adapter-shaped like `promotions` |
| Dynamic/AI-driven upsell | Recommendations computed from real behavior data, not admin-curated mappings | The existing `recommendations` subsystem is deliberately explicit/admin-authored — a computed variant is a distinct, optional strategy | A second `RecommendationsAdapter` implementation |
| Product personalization / customizer | Let a shopper attach custom text/artwork to a cart line (e.g. embroidery, engraving) | Needs its own data model (design assets, per-line customization state) genuinely separate from `catalog` | New subsystem; also the concrete blocker for a fully-real "Print Shop" demo, so likely gets a minimal scoped version sooner than the rest of this list |
| Ad-pixel / tag management | Meta/Google/TikTok conversion pixel wiring | A configuration/integration concern layered on top of existing `analytics` | Adapter or plugin on top of subsystem 13 |
| Abandoned-cart recovery | Automated email/SMS nudges for incomplete carts | Needs an email/SMS provider integration this project doesn't have yet | New subsystem + provider adapter (e.g. Klaviyo, Postmark) |
| Lifecycle email/SMS marketing | Broader automated marketing flows beyond cart recovery | Same provider-integration gap as above | Same shape, larger scope |
| Referral / affiliate programs | Track and reward referred purchases | A fully separate tracking/attribution primitive | New subsystem |
| Customer segmentation | Group customers for targeted campaigns/pricing | Needs a real customer-data layer beyond today's account subsystem | Extension of `customer-account` + `analytics` |
| Subscriptions & recurring billing | Recurring orders/charges | A genuinely different payment/checkout shape than one-time orders | New subsystem, likely its own `SubscriptionAdapter` alongside `payments` |
| Loyalty / rewards programs | Points, tiers, redeemable rewards | Independent of the core purchase loop | New subsystem |
| Multi-currency / i18n | Localized pricing, currency conversion, translated storefronts | Cross-cuts catalog, cart, checkout, and CMS all at once — a real, non-trivial undertaking | Best tackled as its own dedicated epic once there's real multi-region demand |
| Returns / RMA | Structured return/exchange workflow | An extension of the order lifecycle beyond today's linear status model | New subsystem alongside `checkout-orders` |
| Marketplace / social channel sync | List and sync inventory to Amazon, Instagram/TikTok Shop, Google Shopping | Each is its own real third-party integration with its own auth/data model | One adapter per channel |
| POS / omnichannel bridges | Sync online inventory with a physical point-of-sale system | Only relevant to a subset of operators; a real, separate integration surface | Adapter, provider-specific |

**How to propose adding to this list, or claiming an item:** open an issue/discussion referencing
this file (once the repo has a public issue tracker set up), or check
`.pHive/planning/epic-backlog.md` for whether it's already been scoped into a numbered epic —
if not, the same research-then-propose pattern epic 40 and the fulfillment/shipping addendum
used (verify against real provider docs, propose a scoped epic, note what's genuinely blocked
on a credential or an unresolved design question) is the expected shape for a new contribution.

## Not a roadmap with dates

Nothing above carries a committed date. This is intentionally a *state* document (done /
in-progress / wanted), not a schedule — schedules on a community project tend to become either
false promises or a source of pressure on volunteer contributors. What's true today is what
`.pHive/planning/epic-backlog.md` says is done; what's coming next is whatever's marked "in
progress" above; everything else is an open invitation.
