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
