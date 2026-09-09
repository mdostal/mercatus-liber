# Design Discussion — Epic 32: `storefront-visual-redesign`

## 0. Prelude

**Source:** direct user direction (2026-09-09), confirmed depth: "Real copy + a genuinely
polished default theme (Recommended) — rewrite the homepage/hero/nav copy to read like an
actual shop, pick or build one strong default visual theme, add real-feeling product
presentation — no new component library." This follows epic 31 (commerce landing + multi-demo
routing), which deliberately built the correct route/demo structure with genuine-but-unpolished
content and explicitly deferred this redesign to a separate piece of work.

## 1. Goal

The default demo (dragon-merch, reached at `/demo/dragon-merch`) reads like a real, considered
shop — not a bare engineering scaffold — through better copy and a genuinely polished visual
theme, without inventing a new component system.

## 2. What's actually available to work with

- **`StyleTokens` is `Record<string, string>` — deliberately unopinionated about format**
  (`packages/theming/src/types.ts`). `applyTheme()` is pure composition of
  `setTokens`/`setDefaultTemplate`, never a parallel mechanism. This means the token
  *vocabulary* can grow (more CSS custom properties) without any package contract change —
  no new component library needed to get a richer design language.
- **Today's vocabulary is thin**: exactly 6 tokens per bundle
  (`--color-background`, `--color-text`, `--color-primary`, `--color-accent`, `--font-family`,
  `--radius`), applied via inline `style={{ ... var(--color-primary) ... }}` throughout every
  shared render component (`HeroBanner`, `CategorySpot`, `ProductGrid`, the two PDP templates,
  `BundleTierSelector`, `RecommendationShelf`, `AdSlot`, the cart page, etc.). There is no
  secondary/muted text color, no spacing scale, no typography scale beyond one font-family, no
  card/elevation treatment — every component invents its own spacing numbers inline. This is
  the real, structural reason the default demo reads as "bare": not bad color choices so much
  as no consistent rhythm or hierarchy anywhere.
- **Seven existing theme bundles**, none built for this purpose: six are genuinely
  demonstration/utility bundles (classic/dark/minimal/vibrant/retro/high-contrast — proving the
  theming system's own swappability, epic 9's own deliverable), and the seventh (`northline`)
  is deliberately scoped to one specific fictional brand (epic 15b), not a general-purpose
  default.

## 3. Design decision: enrich the token vocabulary, refine `classic` as the real default, apply consistently — still zero new components

**Decision:** extend `StyleTokens`' vocabulary with a small, disciplined set of additional
tokens (a muted/secondary text color, a border/divider color, a 3-4 step spacing scale, a
heading font-size scale, one subtle shadow value) — still just more CSS custom properties, no
new component contract, no new package. Refine the `classic` bundle's own token values (the
default every demo currently loads) into a genuinely considered palette/spacing/type system
using this richer vocabulary, rather than inventing an eighth bundle — `classic` staying the
literal default keeps "the default experience is good" true without adding bundle-selection
complexity. The six other demonstration bundles and `northline` are untouched — they exist to
prove swappability, not to be "the good one."

Every shared render component gets updated to consume the new tokens consistently (real
spacing rhythm, a real type scale for headings vs. body text, a subtle card treatment for
product/category tiles) — this is a real, if bounded, CSS pass across the existing components,
not new components. Copy across the seed data (product/category/hero text) and static UI
strings (buttons, empty states, section labels) gets rewritten to read like a real shop
describing real (if placeholder-branded) merchandise, not a framework's own developer-facing
demo language.

## 4. Explicitly out of scope

- **No new component library or design system tooling** — per the user's own stated depth
  choice. This is a token-vocabulary + copy + CSS-consistency pass on what already exists.
- **Real product photography** — this repo's existing placeholder posture (no product images
  anywhere) is unchanged; "real-feeling product presentation" here means real copy, real
  spacing/hierarchy, and a coherent palette, not photography.
- **Northline's own theme/copy** — it already has its own considered brand direction from epic
  15b; this epic doesn't touch it.
- **Visual verification via screenshot** — no browser/screenshot tool is connected in this
  environment. Verification is via reading rendered HTML/computed inline styles on a real dev
  server and describing the result honestly, not a pixel-level visual review. Flagged here so
  later verification doesn't overclaim what was actually checked.

## 5. Scale assessment

**Medium.** Token vocabulary + `classic` bundle refinement (small, one file), a real but
bounded CSS-consistency pass across ~8-10 shared components, a copy pass across seed data and
static UI strings. Four stories: tokens/theme, copy, component polish, closeout.

## 6. Version bump

`patch` — no new package, no contract change beyond additive token keys in an already
unopinionated `Record<string, string>` map.
