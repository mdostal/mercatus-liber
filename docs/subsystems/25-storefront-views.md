# Subsystem 25 — Storefront Views

## Purpose
A named, reusable "view" — a curated category/product subset plus its own optional theme
override plus its own route — binding over an already-real store's shared catalog/inventory,
addressable and swappable the same way every other subsystem here is. Built from a real user ask
for "tools that just enable store creation flexibility," demonstrating three distinct
store-creation patterns with one mechanism plus this repo's existing multi-tenant demo
architecture:

1. **A Caterpillar-style split** (a distinct curated storefront for a different audience over the
   same catalog) — e.g. Northline's `commercial` view ("Commercial & Multi-Unit Installs") splits
   a B2B/property-manager audience from the consumer-booking main site.
2. **A shared-inventory/shared-catalog pair of genuinely different storefronts** — e.g.
   print-shop's `corporate-bulk` view ("Corporate & Bulk Orders"), a permanent second storefront
   with its own theme, curated categories, and copy, alongside (never replacing) the normal shop.
3. **A time-boxed seasonal homepage takeover** — e.g. Broadleaf's `autumn-gift-guide` view
   (`isDefaultOverride: true`, a real `startsAt`/`endsAt` window), which genuinely replaces the
   store's own home page only while its window is live, and auto-reverts afterward with no
   manual step.

A fourth pattern — Wayfair-style multi-brand tenancy (multiple brands, each its own catalog) —
is deliberately NOT this subsystem's job; it's already covered by the pre-existing multi-tenant
demo-store architecture (`apps/reference-storefront`'s 3 fully independent demo stores, each
with its own `buildServices(demoSlug)` call, catalog, and inventory — see subsystem doc for
demo routing). Storefront views are multi-VIEW within one shared catalog; the demo-store
architecture is multi-TENANT across fully separate catalogs — a genuinely different axis, not
competing solutions to the same problem.

## Depends on
`@mercatus-liber/core` only (for `randomUUID`-backed id generation and shared error types) — no
import of `catalog`, `marketing-catalog`, `cms`, or `theming`. A view's `categoryIds` are bare
strings resolved against the caller's own real `MarketingCatalogService` at render time
(`apps/reference-storefront/lib/storefront-view-sections.ts`'s `buildViewSections`), and its
optional `themeKey` is resolved against `@mercatus-liber/theming`'s registry the same way —
this package itself never imports either, mirroring `recommendations`/`advertising`'s
deliberately thin coupling posture.

## Responsibilities
- `StorefrontView` entity: id, `demoSlug`, `slug` (unique per demoSlug, becomes the real route
  `/demo/<demoSlug>/site/<slug>`), name, hero headline/subheadline, `categoryIds` (curated
  subset; empty = every top-level category), `themeKey` (null inherits the store's active
  theme), `isDefaultOverride`, `startsAt`/`endsAt` (both independently optional — a view can
  open on a date and run forever, close on a date with no start, be a real time-boxed campaign
  with both, or be a permanent second storefront with neither), `status`
  (`draft` / `active` / `archived` — archived is a real kept terminal state, never a delete).
- `isViewLive(view, now?)` — the one shared live/not-live predicate (exported so app-layer route
  handlers reuse the exact logic `getActiveDefaultOverride` uses internally rather than
  re-deriving it): `status === "active"` AND, if a window exists, `now` falls inside it.
- `StorefrontViewsService.publishView` — draft → active; throws `DuplicateStorefrontViewSlugError`
  if another currently-active view for the same `demoSlug` already claims the slug (two draft
  views may harmlessly share a slug; only one may ever be live at once).
- `StorefrontViewsService.getActiveDefaultOverride(demoSlug, now?)` — the one real point of the
  takeover mechanic: the first `isDefaultOverride` view that's currently live, or `null`.
  Computed fresh against `now` every call, never cached or stamped, so a campaign's window
  ending reverts the home page automatically on the very next request.
- `StorefrontViewRepository` (adapter pattern) + in-memory reference implementation.

## App-layer wiring (apps/reference-storefront)
- `buildViewSections` (`lib/storefront-view-sections.ts`): turns one `StorefrontView` into the
  same CMS-shaped `sections` array + resolved theme both call sites below render through — kept
  as one shared helper so neither can drift from the other. Resolves `categoryIds` against the
  store's real `MarketingCatalogService`, flattens+dedupes each category's real product ids
  (capped at 12), and links to the same real `/category/[slug]`/`/products/[slug]` routes every
  other page uses — a curated entry point, never a parallel copy of PDP/category pages.
- `/demo/[demoSlug]/site/[viewSlug]`: a view's own permanent entry point. `isViewLive` gates
  this route too, not just the override — a draft/archived/out-of-window view 404s here exactly
  like an unknown slug (deliberate: an out-of-season view isn't browsable early via its own URL
  either, not a bug).
- `/demo/[demoSlug]` (the store's own home page): checks `getActiveDefaultOverride` on every
  request; when one is live, renders that view's curated content via the same `buildViewSections`
  helper instead of the store's normal CMS home page.
- Admin CRUD: `/admin/storefront-views`.
- Seed content: all 3 demo stores seed exactly one real view each, deliberately demonstrating
  three different shapes of the same mechanism rather than three identical examples — see
  Purpose above.

## Explicitly NOT this subsystem's job
- Duplicating PDP/category page content — a view only narrows which categories/products surface
  on its own curated entry point; the actual product/PDP/category pages are never forked or
  copied.
- Multi-brand tenancy (fully separate catalogs) — see Purpose above; that's the pre-existing
  demo-store architecture, a different axis entirely.
- A/B testing or traffic-split routing between views — `getActiveDefaultOverride` always returns
  the first live override deterministically; there is no random-assignment or experimentation
  infrastructure anywhere in this repo.

## Open questions
1. `publishView`'s duplicate-slug check only considers other *active* views — a draft view can
   silently sit on a slug another view later wants to publish under, discovered only at publish
   time via the thrown error, not proactively validated at create/draft time. Acceptable for the
   current scale (a handful of views per store, admin-curated); would need a stronger
   creation-time check under heavier real-world usage.
