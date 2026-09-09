# Design Discussion: storefront-design-system-v2

## 0. Context

Backlog epic 34. Direct follow-on to the user's explicit rejection of epic 32's
"storefront-visual-redesign" as insufficient ("is this a joke?") — that epic enriched
`packages/theming`'s token vocabulary and refined the `classic` bundle's palette, but it never
touched layout: every bundle still renders through the exact same component markup, just with
different CSS custom-property *values*. The user asked for real design work via a specific,
explicit, repeatable methodology (documented verbatim in `.pHive/planning/epic-backlog.md`'s
epic 34 row and in project memory as `mercatus-liber-oss-community-vision`), which has already
run: 3 genuinely independent (non-fork) design agents, same real structural brief + real seeded
product/cart data (no lorem ipsum), one distinct creative direction each, each self-contained
HTML, zero cross-visibility. All 3 were personally verified (balanced markup, no duplicate IDs,
correct $85.98 cart math, no lorem ipsum, no disallowed external resources) and published as
Artifacts, unfiltered, before this planning pass.

**This epic's job is not to design — that's done. It's to turn 3 finished designs into a real,
switchable, component-level theme system.**

## 1. The three source designs

| Bundle key (proposed) | Design name | Creative direction | Key structural signature |
|---|---|---|---|
| `editorial` | "The Slow Catalog" | Warm editorial / artisan-market | Serif display type (Fraunces/Newsreader/Libre Franklin), asymmetric magazine-style product grid (one tall feature card + smaller cards), receipt-styled cart, drop-cap PDP body copy |
| `maximalist` | "Blaze Theme" | Bold modern maximalist | Ink-black/sage-white/blaze-orange palette, thick 3px borders, hard offset shadows, sticker-style product cards, fixed left-rail jump-nav pattern, working qty stepper |
| `datasheet` | "Datasheet Storefront" | Precision technical / minimal-grid | Cool neutral palette + calibration-orange accent, blueprint dot-grid background, hairline-border grid system (borders *as* the grid, no card shadows), spec-table PDP layout, monospace pricing |

Each design covered the same four page-type surfaces: nav, home, PDP, cart — using this repo's
real product data shape (`slug`/`title`/`description`/`color`/`size`/`priceCents`/
`categorySlugs`/`stockUnits`) and a real 4-line cart totaling $85.98.

## 2. The central design question: how does `ThemeBundle` carry real layout, not just tokens?

**Resolved. Not guessed — derived directly from the package's own stated design philosophy and
its one existing precedent.**

`packages/theming`'s `ThemingService` already has exactly the right primitive for this:
`LayoutTemplate` (`{ key, pageType, label, description }`) plus `resolveTemplate(pageType,
override)`, which a component reads to decide which of several registered layouts to render for
that page type. This exists today for exactly one page type — `pdp` has two real registered
templates (`pdp.tabbed-detail`, `pdp.long-scroll`), and the PDP page component already branches
on the resolved template key to render genuinely different markup. `ThemeBundle.tokens` sugars
`setTokens()`; `ThemeBundle.defaultTemplatesByPageType` already sugars `setDefaultTemplate()` —
today it only ever sets `pdp`.

**The fix is not a new mechanism. It's extending template-registry coverage to the page types
that today have exactly one hardcoded layout each** (nav chrome, home, category/PLP grid, cart)
and registering 2-3 real competing templates per page type — one matching each of the 3 new
designs' actual structural signature (e.g. `home.magazine-grid` / `home.bento-grid` /
`home.spec-grid`, `nav.top-bar` / `nav.rail`, `card.editorial` / `card.sticker` /
`card.spec-sheet`). Each new `ThemeBundle` then sets `defaultTemplatesByPageType` across all of
these page types (not just `pdp`), and the consuming React components gain the same
template-key branch PDP already has, instead of a single hardcoded render path.

This was evaluated against one alternative — a brand-new "component-variant registry" parallel
to `LayoutTemplate` — and rejected: it would duplicate a mechanism that already exists and
already has one proven consumer (PDP), for no functional gain, directly contradicting this
package's own documented principle ("deliberately sugar over `ThemingService`'s existing
primitives, never a parallel mechanism").

**What does NOT change:** `ThemeBundle`'s shape (`key`, `label`, `tokens`,
`defaultTemplatesByPageType`) is unchanged — only the *number of page types* a bundle can
usefully set defaults for grows, and the *number of registered templates per page type* grows
from 1 (today, for every page type except PDP) to 2-4. The 7 existing bundles are untouched:
each keeps its existing `defaultTemplatesByPageType: { pdp: ... }` and simply inherits
`resolveTemplate`'s existing fallback (no entry for `nav`/`home`/`category`/`cart` → falls back
to the first-registered template for that page type, deterministically — the same fallback
`resolveTemplate` already implements). No bundle needs to change; no consuming component's
existing behavior for the 7 old bundles changes, since the *first-registered* template for each
new page type is defined to be today's current (only) layout, preserved byte-for-byte.

## 3. Scope assessment

**Medium.** Cross-cutting (touches `packages/theming` plus several shared render components:
nav layout, home page, category/PLP grid, product card, cart page, plus the theme-switcher UI),
but bounded — no new subsystem, no new persistence model, no new package, no schema migration.
Auto-proceeding to story decomposition per this repo's established medium-scope default (no H/V
gate presented), consistent with every prior epic this session.

## 4. Stories (vertical slices)

1. **template-registry-and-bundles** — theming-package-only: register real competing templates
   for `nav`/`home`/`category`/`cart` (today's only layout becomes the first-registered/default
   template, preserving all 7 existing bundles' behavior byte-for-byte), add the 3 new
   `ThemeBundle`s (`editorial`/`maximalist`/`datasheet`) with full token sets derived from the 3
   published designs, each selecting its own template per page type. Testable in complete
   isolation from the app.
2. **component-template-wiring** — wire the actual shared render components (nav, home,
   category/PLP, cart, product card) to branch on `resolveTemplate(pageType)`, mirroring the
   exact pattern PDP's page component already uses for `pdp.tabbed-detail` vs. `pdp.long-scroll`
   — each new template key renders real, distinct markup/layout matching its source design, not
   just different token values inside identical markup. Every new-token `var()` reference
   carries a literal CSS fallback, per epic 32's established pattern, since only `classic` and
   the 3 new bundles will define the full token vocabulary.
3. **switcher-and-verification** — extend the theme-switcher UI to list all 3 new bundles,
   live-verify every one of the 4 page types under all 3 new bundles plus at least one existing
   bundle (proving the fallback path genuinely still works) against a real running dev server,
   confirm the full monorepo test suite/typecheck/build stay green, update
   `docs/subsystems/06-theming-layout.md`, close out and merge.

## 5. Risks

- **Medium — component-template-wiring is the largest, riskiest story.** Real layout branching
  (not just token swaps) across 4 page types is a materially bigger diff than epic 32's
  token-only pass. Mitigation: story 1 ships and is testable before story 2 starts; story 2's
  acceptance criteria requires each of the 4 page types to be checked individually.
- **Low — fallback correctness for the 7 untouched bundles.** Mitigation: `resolveTemplate`'s
  existing deterministic first-registered-template fallback already handles this; story 1's
  acceptance criteria requires registering today's current layout as literally the first
  template for each newly-covered page type, and story 3's live verification explicitly checks
  an old bundle still renders unchanged.

## 6. Open questions

None blocking — the one real open design question (§2) is resolved above. A residual, explicitly
non-blocking question for story 2's implementer: whether `nav`'s two variants (top-bar vs.
left-rail, per "Blaze Theme"'s jump-nav pattern) need any layout-shell (not just per-page)
change — flagged for that story's own research step, not guessed here.
