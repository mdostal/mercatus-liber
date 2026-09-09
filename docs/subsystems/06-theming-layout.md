# Subsystem 06 — Theming & Layout

## Purpose
The founder was explicit about what this is *not*: Shopify's model, where you must build a
whole theme touching every page to change anything. Instead: **CMS for each page (05) plus a
custom way to layout/tweak it**, with the option to apply a theme (a bundle of layout+style
choices) across pages, swap individual layouts, or build a full drop-in theme package later —
but none of those are required to use any single page.

## Depends on
`@core/schema` only. This is a leaf subsystem — CMS (05) and PDP (04) depend on theming, not
the other way around. Theming has zero knowledge of catalog, orders, or any business data; it
only knows about layout templates, components, and style tokens.

## Responsibilities
- **Layout template registry:** per page type (05) or per PDP (04), a small set of default
  layout templates (~3, per the founder's spec) that a deployment can pick per-page or as a
  deployment-wide default.
- **Component rendering contract:** given a component reference from CMS (e.g. "hero banner
  with this image/copy") and a chosen layout template, render it. Theming owns the *how*; CMS
  owns the *what*.
- **Theme bundles:** an optional, higher-level grouping of layout choices + style
  tokens (colors, type, spacing) that can be applied across the whole site at once — this is
  the "build full themes like Shopify to drop in" capability, implemented as sugar over the
  same per-page primitives, not a separate forced mechanism.
- Style-token system (design tokens: color/type/spacing) so a theme swap is mostly
  token-replacement, not a rewrite of every component.

## Explicitly NOT this subsystem's job
- Page content/data (CMS, 05, and PDP, 04, own what's on a page — theming owns how it looks).
- Business logic of any kind.

## Decoupling notes
Because CMS and PDP depend on theming (not the reverse), theming can be developed, tested, and
even swapped (a whole new theming engine) without either subsystem's data model changing. A
deployment running with zero custom theming still works — components render with sane
defaults; theming is additive polish, not a hard dependency for functionality.

## Open questions
1. Style-token format — CSS custom properties, a design-token JSON spec (e.g. W3C Design
   Tokens, already used elsewhere in the founder's Hive tooling), or both?
2. Drop-in theme packages — npm packages implementing a theme interface, or a simpler
   directory-of-files convention (lower barrier to entry for non-npm-publishing contributors)?
3. Per-page layout override vs. deployment-wide default — confirm both are first-class, not
   just deployment-wide with per-page as an afterthought (the founder's spec implies both
   matter: "apply a theme across or swap layouts or even build themes").

## Real component-level layout variation (storefront-design-system-v2, epic 34)

The founder rejected an earlier token-only pass (`storefront-visual-redesign`, epic 32) as
insufficient ("is this a joke?") — every bundle rendered through identical component markup,
just with different CSS custom-property *values*. This epic makes good on the "swap
layouts" half of the Purpose statement above: real, structurally-distinct markup per bundle,
not just a repainted version of the same layout, using the *existing* `LayoutTemplate` /
`resolveTemplate()` primitives (`packages/theming/src/service.ts`, `types.ts`) — no new
mechanism, exactly PDP's own already-proven `pdp.tabbed-detail` / `pdp.long-scroll` pattern
extended to four more page types.

**Page types now carrying a real template registry** (previously only `pdp` had more than one
registered template; every other page type had exactly one hardcoded layout):

| Page type | Registered template keys | Today's default (first-registered, preserved byte-for-byte) |
|---|---|---|
| `pdp` | `pdp.tabbed-detail`, `pdp.long-scroll` | `pdp.tabbed-detail` |
| `nav` | `nav.top-bar`, `nav.rail` | `nav.top-bar` |
| `home` | `home.standard-grid`, `home.magazine-grid`, `home.spec-grid` | `home.standard-grid` |
| `category` | `category.standard-grid`, `category.magazine-grid`, `category.spec-grid` | `category.standard-grid` |
| `cart` | `cart.standard`, `cart.receipt-style`, `cart.spec-table` | `cart.standard` |

Each new template key is a real, distinct React component in `apps/reference-storefront/
components/` (e.g. `nav-rail.tsx`, `home-magazine-grid.tsx`, `cart-spec-table.tsx`), consuming
the exact same real data/actions as its page type's original component — a magazine-grid home
page still renders the same CMS sections through `cms-sections.tsx`; a spec-table cart still
submits through the same `updateCartItemQuantityAction`/`removeCartItemAction`/
`applyCouponAction`/`startCheckoutAction` server actions as `cart.standard`. Only the
surrounding markup/layout differs. The consuming app component for each page type branches on
`resolveTemplate(pageType)` via a `Record<templateKey, Component>` lookup map, mirroring
`app/demo/[demoSlug]/products/[slug]/page.tsx`'s pre-existing pattern exactly.

**Three new theme bundles**, each a real published design (see
`.pHive/epics/storefront-design-system-v2/docs/design-discussion.md` §1 for the full
provenance — 3 blind, independent design agents, one direction each, personally verified and
published before this epic's planning pass), registered in `packages/theming/src/
theme-bundles.ts`:

- **`editorial`** ("The Slow Catalog") — warm editorial/artisan-market. Serif display type,
  asymmetric magazine-style grid, receipt-styled cart, drop-cap long-scroll PDP. Sets
  `defaultTemplatesByPageType` to `pdp.long-scroll`, `nav.top-bar`, `home.magazine-grid`,
  `category.magazine-grid`, `cart.receipt-style`.
- **`maximalist`** ("Blaze Theme") — bold modern maximalist. Ink-black/sage-white/blaze-orange
  palette, thick borders, hard offset shadows, fixed left-rail jump-nav. Sets
  `pdp.tabbed-detail`, `nav.rail`, and (deliberately) the *standard* `home`/`category`/`cart`
  templates — this bundle's distinctiveness on those three page types comes entirely from its
  token values (color/radius/shadow/type), not a competing structural template, since no
  home/category/cart design signature was proposed for this direction beyond the rail nav.
- **`datasheet`** ("Datasheet Storefront") — precision technical/minimal-grid. Cool neutral +
  calibration-orange palette, hairline-border grid system (borders *as* the grid, no card
  shadows), spec-table PDP/cart layout, monospace pricing. Sets `pdp.tabbed-detail`,
  `nav.top-bar`, `home.spec-grid`, `category.spec-grid`, `cart.spec-table`.

**Additive token — `--font-family-display`:** `editorial` is the only bundle that defines it (a
serif display face for large feature headings, distinct from its body `--font-family`). Every
consuming component references it as `var(--font-family-display, var(--font-family))`, so every
other bundle (which doesn't define it) falls back to its own `--font-family` with zero behavior
change — the same "additive token with a literal fallback" pattern epic 32 established for
`--color-muted`/`--color-border`/`--space-*`/`--font-size-*`/`--shadow-card`.

**Fallback preservation, live-verified:** the 7 pre-existing bundles (`classic`, `dark`,
`minimal`, `vibrant`, `retro`, `high-contrast`, `northline`) set no `nav`/`home`/`category`/
`cart` entry in `defaultTemplatesByPageType` at all — `resolveTemplate()`'s existing
deterministic first-registered-template fallback resolves each to `nav.top-bar`/
`home.standard-grid`/`category.standard-grid`/`cart.standard`, i.e. today's one-and-only prior
layout, preserved byte-for-byte. `classic` and `northline` were re-verified end-to-end
(nav/home/category/PDP/cart) against a real dev server as part of this closeout and render
identically to before this epic.

**Theme switcher:** `apps/reference-storefront/components/theme-switcher.tsx` lists all 10
bundles (unchanged cookie mechanism — `theme-cookie.ts`'s `themeCookieName(demoSlug)` /
`readActiveThemeBundle()`, `lib/actions.ts`'s `setThemeAction`); the 3 new bundles show their
real design name alongside the bundle key (e.g. "The Slow Catalog (editorial)") rather than the
generic `ThemeBundle.label`.
