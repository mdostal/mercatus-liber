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

**Done — the real, working core** (see `.pHive/planning/epic-backlog.md` epics 1–33, 40 for the
full detail on every item below):

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

**In progress** (see the backlog for exact story-level status):

- **`storefront-design-system-v2`** — three genuinely independent, professionally designed
  visual themes (not a token palette swap) built via a repeatable blind-parallel-design-agent
  process, becoming real switchable, component-level themes any demo store can use.
- **Three demo stores getting real depth** — a true navigation menu, a deep product catalog, and
  genuine interactive actions (not the thin, mostly-unlinked state they were in before): Northline
  Home Tech (smart-home installer), The Print Shop (embroidery/custom prints, reconceived from
  the earlier dragon-branded placeholder demo, since renamed to the `print-shop` slug), and a
  new eclectic artisan/handmade-goods shop.
- **Fulfillment & shipping** — a new `@mercatus-liber/fulfillment` subsystem (who/how an order
  gets produced — self-fulfilled by default, with real Printful and Printify print-on-demand
  adapters) and a new `@mercatus-liber/shipping` subsystem (rate shopping, label purchase,
  tracking — manual/PirateShip by default, a real Shippo adapter for full automation).
- **SEO & AEO infrastructure** — sitemap, meta tags, structured data, canonical URLs, and
  answer-engine optimization (`llms.txt`, clean semantic markup, structured Q&A) for both the
  demo storefronts and the framework's own landing/docs surfaces. Currently zero infrastructure
  exists here — this is flagged as the single highest-priority gap found by the epic 40 research
  pass.
- **Analytics insights & import adapters** — tying the internal BI dashboard together with
  *both* Google Analytics 4 and PostHog (not an either/or), plus a pluggable
  `AnalyticsInsightsAdapter` contract so anyone can wire in their own analytics system instead,
  surfaced as a real traffic-source/page-ranking insights view in the admin.
- **Data backup/restore & adapter portability docs** — export/import across persistence
  adapters, and an honest, explicit capability matrix of which subsystems are swappable today
  and what "bring your own database" actually looks like in practice.
- **A genuine feature deep-dive on the documentation site** — going well past the current
  `docs/subsystems/*.md` mirror into real narrative, example-driven documentation per capability
  area.

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
