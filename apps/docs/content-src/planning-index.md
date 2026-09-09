# Planning corpus

Mercatus Liber is built with Plugin Hive, an internal Claude Code planning process: every epic
starts as a real, hand-written **design discussion** — the actual reasoning behind a decision,
including rejected alternatives, open risks, and the concrete evidence (file paths, line
numbers, direct user quotes) that shaped it — before any story is written or any code is
touched.

This page indexes every one of those documents, synced verbatim (see this site's own
`apps/docs/scripts/sync-content.mjs`) from `.pHive/epics/<name>/docs/design-discussion.md` into
this site. Nothing here is a summary or a sanitized rewrite — it's the same doc an internal
contributor would read, publicly readable so an outside contributor can see *why* this project
looks the way it does, not just *what* shipped.

## Commerce core & merchandising

Filling out the gaps a first commerce-gap audit (epic 17) found in the core shopping loop.

- **[Promotions & discounts](/planning/promotions-discounts)** (epic 20) — cart-level discount
  rules (percentage/fixed/BOGO), the first epic off the gap-audit backlog.
- **[Bundles](/planning/bundles)** (epic 21) — multi-tier product packages (e.g. "Product Only"
  / "+ Pro Setup" / "+ Pro Setup + Extended Warranty"), building on promotions' pricing
  primitives.
- **[Upsell & cross-sell](/planning/upsell-cross-sell)** (epic 22) — product-level suggestion
  rules, deliberately scoped apart from marketing-catalog's category-suggestion mechanism.
- **[Advertising](/planning/advertising)** (epic 23) — real campaign/creative/targeting/rotation
  management behind the CMS's existing static `ad-slot` component.

## Admin & operations

Making the admin side and the "adapters for how it runs" story as complete as the commerce core.

- **[Internal BI & metrics](/planning/internal-bi-metrics)** (epic 24) — an owned,
  internal business-intelligence layer, distinct from outbound marketing analytics (PostHog).
- **[Admin adapter visibility settings](/planning/admin-adapter-visibility-settings)** (epic 25)
  — a settings page showing which concrete adapter is actually active per swappable subsystem.
- **[Admin auth (Clerk)](/planning/admin-auth-clerk)** (epic 27) — closing a real, unscoped gap:
  `/admin` had zero authentication anywhere before this epic.
- **[CMS admin CRUD](/planning/cms-admin-crud)** (epic 28) — a real create/edit/publish admin UI
  for CMS pages, replacing a read-only table despite the service layer already supporting it.

## CMS, content adapters & tooling

- **[CMS adapter discoverability](/planning/cms-adapter-discoverability)** (epic 29) — making the
  already-real, already-tested Sanity adapter actually discoverable (env-var branch + docs),
  instead of silently unreachable.
- **[create-store skill](/planning/create-store-skill)** (epic 30) — a README and an
  agent-facing MCP `SKILL.md` for the existing `create-store` CLI, so provisioning a new store
  is discoverable by both humans and agents.

## Storefront design, landing & demo stores

The visual-identity and multi-demo arc: real copy, real themes, real layout variation, and three
fully-realized public demo stores.

- **[Commerce landing & demo routing](/planning/commerce-landing-and-demo-routing)** (epic 31) —
  turning `commerce.mdostal.com`'s root into a real framework-pitch landing page, with shoppable
  demos underneath it.
- **[Storefront visual redesign](/planning/storefront-visual-redesign)** (epic 32) — real copy +
  an enriched, disciplined design-token vocabulary for the default `classic` theme bundle.
- **[Storefront design system v2](/planning/storefront-design-system-v2)** (epic 34) — the
  follow-on that actually varies *layout*, not just tokens: `ThemeBundle` carries real
  per-page-type template markup, not just palette swaps.
- **[Demo store: Northline depth](/planning/demo-store-northline-depth)** (epic 35) — real
  navigation, a true product menu, and full category depth for the Northline Home Tech demo.
- **[Demo store: print shop rebrand](/planning/demo-store-print-shop-rebrand)** (epic 36) — a
  genuine business-concept change (dragon-merch to a real embroidery/custom-goods print shop),
  not a rename-in-place.
- **[Demo store: plant shop](/planning/demo-store-plant-shop)** (epic 37) — a third public demo,
  "Broadleaf & Co.," a real eclectic small-batch goods shop.

## Docs & planning infrastructure

- **[Docs site](/planning/docs-site)** (epic 33) — the Nextra-based `apps/docs` site itself: the
  sync mechanism, landing page, and subsystem-reference publishing this whole planning corpus
  now rides on.
- **[Docs feature deep dive](/planning/docs-feature-deep-dive)** (epic 38) — the epic that added
  this page: real narrative deep-dive content plus this public planning-corpus sync, and a
  duplicate-docs-infrastructure cleanup found and resolved along the way.
