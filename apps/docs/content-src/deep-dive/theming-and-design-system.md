# Theming & Design System

Theming is the newest and, deployment-for-deployment, the richest subsystem in the framework —
and it exists to reject a specific model. The founder was explicit about what this is *not*:
Shopify's approach, where changing anything meaningful about a storefront means building a
whole theme that touches every page. Mercatus Liber's answer is
[CMS for each page](/subsystems/05-cms-pages) plus a separate, composable way to lay it out and
style it — a deployment can apply a full theme bundle across the whole site, swap one page
type's layout in isolation, or touch nothing and get sane defaults, without any of those paths
being required to use the framework at all. See [Subsystem 06 — Theming & Layout](/subsystems/06-theming-layout)
for the full technical reference this page expands on.

## Two independent axes: layout templates and style tokens

The theming package separates two concerns that a lot of theme systems conflate: *structure*
(which components render, in what arrangement) and *style* (colors, type, spacing, radius —
values consumed by whatever structure is currently rendering). These are the two primitives
everything else in this subsystem is built from:

```ts
// packages/theming/src/types.ts
export type StyleTokens = Record<string, string>;

export interface LayoutTemplate {
  /** e.g. "pdp.tabbed-detail" -- namespaced by page type. */
  key: string;
  pageType: string;
  label: string;
  description: string;
}

export interface ThemingService {
  registerTemplate(template: LayoutTemplate): void;
  listTemplates(pageType: string): LayoutTemplate[];
  /** Explicit override wins; else the deployment's configured default; else the first registered template for that page type, deterministically (registration order). */
  resolveTemplate(pageType: string, override?: string): string | null;
  setDefaultTemplate(pageType: string, templateKey: string): void;
  getTokens(): StyleTokens;
  setTokens(tokens: StyleTokens): void;
}
```

`resolveTemplate` is the mechanism a page actually calls at render time, and its resolution
order is deliberately simple and deterministic: an explicit per-request override wins if given,
otherwise the deployment's configured default for that page type, otherwise whichever template
was registered *first* for that page type. That last rule is what makes "add a second layout
option without breaking anyone already running the first one" safe — a brand-new template
registered for, say, the `cart` page type never changes what an existing deployment renders
unless someone explicitly opts in.

## The template registry: from one PDP layout to five page types

Originally, only the PDP page type had more than one registered template (`pdp.tabbed-detail`
and `pdp.long-scroll`, an eBay-style single long scroll). Every other page type — nav, home,
category, cart — had exactly one hardcoded layout. The `storefront-design-system-v2` epic
extended the *same* `LayoutTemplate`/`resolveTemplate` primitives (no new mechanism at all) to
four more page types, registering real, structurally distinct components for each:

```ts
// packages/theming/src/service.ts
export const DEFAULT_TEMPLATES: LayoutTemplate[] = [
  { key: "pdp.tabbed-detail", pageType: "pdp", label: "Tabbed Detail", description: "Product info organized into tabs (description, specs, reviews)." },
  { key: "pdp.long-scroll", pageType: "pdp", label: "Long Scroll", description: "A single long-scrolling page with all product info inline (eBay-style)." },
  // nav -- "nav.top-bar" is today's only current chrome layout and MUST stay first so it
  // remains the deterministic fallback default for the 7 pre-existing bundles.
  { key: "nav.top-bar", pageType: "nav", label: "Top Bar", description: "Standard horizontal top navigation bar (today's current chrome layout)." },
  { key: "nav.rail", pageType: "nav", label: "Rail", description: "Fixed left side-rail nav with jump links, per \"Blaze Theme\"." },
  // home -- "home.standard-grid" is today's current layout and MUST stay first.
  { key: "home.standard-grid", pageType: "home", label: "Standard Grid", description: "Today's current uniform product grid layout for the home page." },
  { key: "home.magazine-grid", pageType: "home", label: "Magazine Grid", description: "Asymmetric feature-card layout, per \"The Slow Catalog\"." },
  { key: "home.spec-grid", pageType: "home", label: "Spec Grid", description: "Dense datasheet-style grid, per \"Datasheet Storefront\"." },
  // ... category and cart follow the identical standard/magazine/spec (or receipt/spec-table) pattern
];
```

Each new template key corresponds to a real React component in
`apps/reference-storefront/components/` — `nav-rail.tsx`, `home-magazine-grid.tsx`,
`cart-spec-table.tsx`, and so on — consuming the *exact same* data and server actions as the
original component for that page type. A magazine-grid home page still renders the same CMS
sections through `cms-sections.tsx`; a spec-table cart still submits through the same
`updateCartItemQuantityAction`/`removeCartItemAction`/`applyCouponAction`/`startCheckoutAction`
server actions as the standard cart. Only the surrounding markup changes — theming owns *how*
something looks, never the data or the action wiring underneath it.

## Theme bundles: sugar over the same two primitives, not a third mechanism

A **theme bundle** groups a set of style tokens with a set of per-page-type template defaults,
so a deployment can apply one coherent look across the whole site in a single call. The
important design decision here is that a bundle is *not* a separate code path — it's pure
composition of the two `ThemingService` methods already shown above:

```ts
// packages/theming/src/theme-bundles.ts
export interface ThemeBundle {
  key: string;
  label: string;
  tokens: StyleTokens;
  /** Page type -> default template key, e.g. { pdp: "pdp.long-scroll" }. */
  defaultTemplatesByPageType: Record<string, string>;
}

/** Pure composition of ThemingService's existing methods -- proves a theme is not a separate code path. */
export function applyTheme(theming: ThemingService, bundle: ThemeBundle): void {
  theming.setTokens(bundle.tokens);
  for (const [pageType, templateKey] of Object.entries(bundle.defaultTemplatesByPageType)) {
    theming.setDefaultTemplate(pageType, templateKey);
  }
}
```

`applyTheme` is the whole mechanism. There's no hidden third code path a "theme" gets that a
hand-configured deployment doesn't also have access to — anything a bundle can do, a deployment
can do manually, one `setDefaultTemplate` call at a time.

## Ten real bundles, three of them structurally distinct

The framework ships ten theme bundles today. Seven are the original token-only bundles
(`classic`, `dark`, `minimal`, `vibrant`, `retro`, `high-contrast`, `northline`) — each sets its
own color/type/spacing tokens, but none of them override `defaultTemplatesByPageType` for nav,
home, category, or cart, so `resolveTemplate` falls back to the first-registered template for
each and every one of those seven renders identically to how the framework looked before this
epic. That fallback-preservation guarantee was live-verified end to end (nav/home/category/PDP/
cart) against a real dev server for `classic` and `northline` as part of closing out the epic.

The three newest bundles — `editorial` ("The Slow Catalog"), `maximalist` ("Blaze Theme"), and
`datasheet` ("Datasheet Storefront") — are where the "swap layouts, not just colors" half of
this subsystem's purpose actually shows up. Here's `editorial`'s real bundle definition:

```ts
// packages/theming/src/theme-bundles.ts
{
  key: "editorial",
  label: "Editorial",
  tokens: {
    "--color-background": "#F2E9D8",
    "--color-text": "#241C14",
    "--color-primary": "#B14B2A",
    "--color-accent": "#5E6E45",
    "--font-family": "'Newsreader', 'Iowan Old Style', Georgia, serif",
    // Additive, backward-compatible token -- only "editorial" defines it. Always
    // referenced as var(--font-family-display, var(--font-family)) so every other
    // bundle (which doesn't define it) falls back to --font-family with zero behavior
    // change.
    "--font-family-display": "'Fraunces', 'Iowan Old Style', Georgia, serif",
    "--radius": "3px",
    // ... spacing/type-scale/shadow tokens
  },
  defaultTemplatesByPageType: {
    pdp: "pdp.long-scroll",
    nav: "nav.top-bar",
    home: "home.magazine-grid",
    category: "category.magazine-grid",
    // cart: "cart.receipt-style"
  },
}
```

`editorial` is warm and editorial: serif display type, an asymmetric magazine-grid home and
category layout, a receipt-styled cart, and a drop-cap long-scroll PDP. `maximalist` goes the
other direction — an ink-black/sage-white/blaze-orange palette with a fixed left-rail nav — but
deliberately keeps the *standard* home/category/cart templates, because that bundle's
distinctiveness comes entirely from token values (color, border weight, shadow), not a
competing structural layout. `datasheet` is precision-technical: a hairline-border grid system,
spec-table PDP and cart layout, and monospace pricing. Each is a real, independently designed
direction, not three variations on one template — see the
[storefront-design-system-v2 planning corpus](/planning/storefront-design-system-v2) for the
full provenance of how these three were designed and verified.

`--font-family-display` is worth calling out as a pattern, not just a token: it's additive.
Every component that might use a display font references it as
`var(--font-family-display, var(--font-family))`, so the nine bundles that don't define it fall
straight back to their own body font with zero behavior change. That's the same
additive-token-with-a-literal-fallback discipline the token vocabulary itself was built on
(`--color-muted`, `--color-border`, the `--space-*` scale, and `--shadow-card` all followed the
same rule when they were introduced) — a new token is never a breaking change for a bundle that
predates it.

## Trying it

Every seeded demo storefront ships a real theme switcher
(`apps/reference-storefront/components/theme-switcher.tsx`) listing all ten bundles by their
real design name — "The Slow Catalog (editorial)," not just the raw bundle key — backed by a
per-demo cookie (`theme-cookie.ts`'s `themeCookieName(demoSlug)`). Run the reference storefront
(see [Getting started](/getting-started)) and switch bundles live on `/demo/print-shop` or
`/demo/northline` to see the same page render through a genuinely different layout, not just
different colors.

## Further reading

- [Subsystem 06 — Theming & Layout](/subsystems/06-theming-layout)
- [Planning corpus: storefront-design-system-v2](/planning/storefront-design-system-v2)
- [Subsystem 05 — CMS Pages](/subsystems/05-cms-pages) (the content this layer lays out)
