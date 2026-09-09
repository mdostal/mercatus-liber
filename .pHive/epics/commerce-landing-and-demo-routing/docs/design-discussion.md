# Design Discussion — Epic 31: `commerce-landing-and-demo-routing`

## 0. Prelude

**Source:** direct user direction (2026-09-09): "commerce.mdostal.com is a pretty horrible
reference storefront, ideally we make all the reference ones underneath that." Confirmed via
clarifying questions: the domain's root becomes a real landing page about Mercatus Liber the
framework itself, with shoppable demos (dragon-merch, and Northline Home Tech — previously
built but never deployed) moved under path-based routes (`/demo/<slug>/...`), both live
simultaneously under one deployment, landing/docs focused on the framework and its tools, not
on being a demo shop themselves.

## 1. Goal

`commerce.mdostal.com/` is a real marketing/landing page for Mercatus Liber. `/demo/dragon-merch`
and `/demo/northline` are two genuinely separate, simultaneously-live shoppable storefronts,
each with fully isolated cart/order/promotion/CMS/admin state. Every existing route,
mutation action, cookie, and internal link keeps working correctly once moved.

## 2. Research findings (grounding)

Full architecture research (file:line grounded, not guessed) confirmed:

- **The entire services graph must be duplicated per demo, not just seed data.**
  `buildServices()`'s `DEMO_BRAND` branch only picks which seed function populates one set of
  repositories — carts, orders, promotions, bundles, recommendations, campaigns, CMS pages,
  inventory, and the BI event log are all mutable, request-driven, in-memory state a real
  shopper changes during a session. Sharing one `Services` graph between two demos would let a
  northline shopper apply a dragon-merch coupon, or a dragon-merch order show up in
  northline's `/admin/orders`.
- **~150 files are affected**: 40 files under `apps/reference-storefront/app/` (33 pages, 2
  layouts, 5 shared admin form-field components) live at routes that must move under
  `/demo/[demoSlug]/`; all 16 `"use server"` mutation actions in `lib/actions.ts` currently
  call `getServices()` with zero demo context and have 23 hardcoded `revalidatePath`/`redirect`
  targets; 24 files have hardcoded internal `href`s that must become demo-prefixed.
- **A real, previously-latent correctness risk**: every cookie (`ml_cart_id`,
  `ml_customer_id`, `ml_coupon_code`, `ml_theme`) is currently unnamespaced and `path: "/"`.
  With two demos' cart repositories genuinely separate, browsing both demos in two tabs of the
  same browser (an extremely plausible thing to do on a page whose whole point is "look, both
  demos work") would silently corrupt cart/customer/coupon state across demos — the *same*
  cookie value gets read against two unrelated in-memory repositories. This must be fixed in
  the same change, not as a follow-up.
- **`startCheckoutAction`'s Stripe `successUrl`/`cancelUrl` are already hardcoded to
  `http://localhost:3000/order/confirmed`** — a pre-existing latent bug this migration forces
  a real fix for regardless (both the demo path prefix and the real deployed origin).

## 3. The design question, resolved: physical route move under `app/demo/[demoSlug]/`, `getServicesForDemo(demoSlug)` keyed by a Map, demo-namespaced cookies

**Decision: option (a) from the research — physically move every shop/admin route under
`app/demo/[demoSlug]/...`, replace the module-scoped services singleton with
`Map<string, Promise<Services>>` keyed by demo slug, and namespace every cookie by demo slug.**
Rejected the alternative (a proxy/middleware rewrite keeping routes physically at today's
paths, carrying the demo slug on a header/cookie instead of a route param): the expensive part
of this migration — threading `demoSlug` through every page, every Server Action, every
`revalidatePath`/`redirect`, and every hardcoded `href` — costs exactly the same either way.
The rewrite approach pays that identical cost for a strictly worse primitive (an
extra-indirection cookie/header read with no compile-time guarantee it's present) instead of
Next's own first-class, type-checked `params.demoSlug`, and creates a permanent URL/physical-
route mismatch that every future page addition would have to remember to handle specially.
Physical route moves keep Next's own conventions (`params`, `generateMetadata`,
`generateStaticParams`, route-scoped layouts) working the way they're designed to — which
matters more, not less, in a codebase this size built across 30 prior epics.

**Two root layouts, by design.** `app/layout.tsx`/`app/page.tsx` become the new framework
landing page; a new `app/demo/[demoSlug]/layout.tsx` carries today's shop nav (demo-slug-aware
links, both demos cross-linked, a link back to the landing page). Navigating landing → a demo
is a full page reload (Next's own "multiple root layouts" pattern) — an acceptable, deliberate
cost for what is genuinely a navigation into a different "app," not a regression to silently
"fix" later by merging the layouts back together.

**Demo registry replaces the `DEMO_BRAND` env var.** A small `demos.ts` module maps known
slugs (`"dragon-merch"`, `"northline"`) to their seed function — the same functions that
already exist (`seedCatalog`, `seedNorthlineDemo`), just selected by route param instead of a
build-time env var.

**Admin moves too, and admin-auth's Clerk gating becomes demo-slug-aware.** Admin data
(promotions, bundles, CMS pages, etc.) is demo-scoped exactly like shopper data — a
dragon-merch admin session has no business seeing northline's promotions. The existing
`middleware.ts`'s `isAdminRoute` matcher and sign-in redirect target both need to recognize
`/demo/[demoSlug]/admin/*` paths and preserve `demoSlug` through the Clerk sign-in round trip.

## 4. Explicitly out of scope for this epic

- **Any change to the underlying commerce packages** (`packages/promotions`, `packages/bundles`,
  etc.) — this epic is entirely `apps/reference-storefront` application-layer routing/wiring.
  No `packages/*` decoupling grep is needed for this epic, the same posture epic 25/30 took.
- **The visual redesign** (real copy, a polished default theme) — a deliberately separate,
  parallel piece of work (epic 32) that lands its content changes onto the new route structure
  once this epic merges, avoiding two large concurrent pieces of work fighting over the same
  files mid-move.
- **The docs/wiki site** — a fully independent new app (epic 33), zero file overlap with this
  epic, safe to build in parallel.
- **Migrating `middleware.ts` to Next 16's renamed `proxy.ts` convention** — noted as a real,
  separate housekeeping item (the file still works under its current name); not blocking this
  epic and not conflated with it.

## 5. Scale assessment

**Large.** The biggest single-epic file-touch count of this entire session (~150 files). Six
stories, sequenced to keep each piece of concurrent work on disjoint file trees: services/
registry (foundational) → shop routes and admin routes in parallel (disjoint trees) → actions/
cookies (the genuinely non-mechanical layer, depends on both route moves landing first) →
landing page + demo layout → live-verified closeout.

## 6. Version bump

`minor` — no breaking change to any package's public contract; the reference app's own route
structure changes, which is app-layer, not a published package surface.
