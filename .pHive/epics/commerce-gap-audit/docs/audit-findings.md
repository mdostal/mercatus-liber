# Commerce gap audit — findings (2026-09-08)

Per Mathew's instruction to "double check ALL THE PLUGINS, all the parts for analytics, etc
across the board" before building the service-area/demo work (epic 15's redefined variants).
Read every file in `packages/plugins`, `packages/analytics`, and `packages/cms` directly rather
than relying on memory of what was built in earlier epics.

## Plugins (`packages/plugins`)

- `PluginContext` exposes exactly `{ events: EventBus }` — nothing else. A plugin can react to
  any bus event and publish new ones, but has no structural way to, e.g., adjust a cart's price
  or inject an admin UI panel.
- One reference plugin ships (`order-notification-plugin`), proving the lifecycle/registration
  mechanism, not a library of real extension points.
- **Finding, not a bug:** this is exactly what subsystem 12's own doc scopes it as ("plugin
  lifecycle, event-bus extension points, one reference plugin") — the shallow context is
  intentional, not an oversight. The real gap is one level up: nothing in `cart`/`checkout-orders`
  exposes a *pricing-adjustment* seam a promotions engine could hook into. That's epic 20's
  design question to resolve when it's planned, not something to bolt onto plugins ad hoc now.

## Analytics (`packages/analytics`, client wiring in `apps/reference-storefront`)

- Server-side allow-list (`ANALYTICS_EVENT_MAP`) is solid: every cart/checkout/payment event
  this repo actually publishes is covered, and admin/catalog CRUD events are deliberately
  excluded (the doc's own "lean allow-list" decision, still correct).
- **Real gap found and fixed in this epic:** client-side collection only covered
  `product_viewed` (PDP). `search_performed` (search page) and `category_viewed` (category page)
  had no coverage at all, despite both pages already existing and rendering real content.
  Fixed by generalizing `product-viewed-tracker.tsx` into a reusable
  `components/interaction-tracker.tsx` (`<InteractionTracker eventName="..." properties={...} />`)
  and wiring it into all three pages (PDP, search, category).
- Not fixed here (genuinely separate scope, not a quick win): a `page_viewed` event for the
  home/campaign/location pages, and any event for a future promotions/bundles/upsell surface
  that doesn't exist yet. Left for whichever epic ships that surface.

## CMS (`packages/cms`)

- `PageRepository`/`MarketingPageMetaRepository` are already narrow, swap-friendly interfaces —
  structurally the same shape as `CatalogPersistenceAdapter`. The gap isn't the interface shape,
  it's that no reference implementation *other than the in-memory one* has ever been built to
  prove it's actually swappable, unlike catalog (which has sqlite/postgres/Shopify). That's
  epic 18's job.
- `ComponentRegistry` is genuinely open (`register()` lets any component type be added) — no
  gap here.
- `PageType` is a closed union (`"home" | "category" | "marketing" | "search" | "pdp"`) with no
  location/service-area type. That's epic 19's job.
- The `ad-slot` component is real (renders whatever `config` an author sets) but there is no
  subsystem managing ad campaigns/creative/targeting/rotation behind it — it's a static
  placeholder today. Confirmed via `apps/reference-storefront/components/cms-sections.tsx`'s
  literal case statement. That's epic 23, backlogged, not built now.

## What this epic actually changed

1. `components/interaction-tracker.tsx` (new, generalizes and replaces `product-viewed-tracker.tsx`)
2. PDP, search, and category pages wired to it.
3. This document, plus the backlog additions already committed in
   `.pHive/planning/epic-backlog.md` (epics 18-23) as the audit's actual output for everything
   that's a real gap but NOT a quick fix.
