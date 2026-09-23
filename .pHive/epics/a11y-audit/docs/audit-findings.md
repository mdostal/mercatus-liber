# Accessibility (a11y) audit — findings (2026-09-23)

First formal accessibility pass over Mercatus Liber. Same rigor/format precedent as
`commerce-gap-audit`/`-2`/`-3`: read real code, browse the real live production deployment
(`commerce.mdostal.com`), and back every claim with a real, reproducible measurement — not a
rubber-stamp pass. The measurement tool here is real, standard, and well-known: **axe-core
4.10.2** (Deque's own open-source WCAG engine, the same engine Lighthouse/axe DevTools/most CI
a11y gates use under the hood), injected live via its CDN build (`page.addScriptTag`-equivalent)
and run with `axe.run()` against real rendered pages — not a hand-rolled contrast checker.
`axe-core` is not a dependency anywhere in this repo yet (confirmed: `grep -rl "axe-core"
--include=package.json .` returns nothing outside `node_modules`), so every scan in this audit
loaded it fresh from `cdn.jsdelivr.net` per page.

**Scope covered**, per this audit's brief: the framework landing page (`/`), all 3 demo
homepages, a PDP on each (`embroidered-performance-polo` on print-shop specifically, to exercise
the product-configurator's variant-picker), a category page, the cart page, and 2 admin pages
(`/admin/catalog`, the epic-63 SKU-matrix page) — all via axe-core; manual keyboard-navigation
spot-checks of the variant-picker, theme-switcher, and an admin form; real WCAG-contrast
verification (by hand, cross-checked against axe-core's own measurements) of the brand-system's
derived tokens and (well beyond the "at least 2" ask) all 10 `packages/theming` demo bundles;
and spot-checks for missing alt text, unlabeled inputs, and heading-hierarchy skips.

**Admin auth**: production gates `/admin` behind real Clerk (`middleware.ts`'s `clerkMiddleware`).
Per this audit's own instructions, no real Clerk credentials were touched. Instead, a local dev
server was run with `CLERK_SECRET_KEY`/`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` unset (this repo's own
documented, zero-infra dev-default fallback — see `packages/admin-auth/src/default-adapter.ts`
and `docs/subsystems/21-admin-auth.md`) and a **new, local-only, throwaway**
`ADMIN_DEV_PASSWORD` (`a11yAudit_local2026`, set only in this session's shell environment, never
committed, never touching `.env.local`'s real Clerk keys) to reach the 2 required admin pages.

## Summary

| # | Finding | Severity | Disposition |
|---|---|---|---|
| 1 | Framework landing page: derived `--ml-ink-faint` token (#8c8c90) never contrast-checked — 3.34:1 on footer text, all 3 pages that use it | Serious | **FIXED** |
| 2 | `editorial` theme bundle's `--color-muted` (#7A6C58) — 4.23:1 against its own page background, live on nav/cart/table headers across print-shop | Serious | **FIXED** (2 rounds — see §2) |
| 3 | `datasheet` theme bundle's `--color-muted` (#8891A0) — 2.86:1, a severe fail, live on nav/theme-switcher/PDP/home/category | Serious | **FIXED** |
| 4 | Site utility-nav strip fell back to `--color-primary` (not `--color-muted`) for 6 of 10 bundles that don't define the latter — 2.64:1 live on broadleaf's default "vibrant" theme | Serious | **FIXED** |
| 5 | Theme-switcher's `.ts-label` applied `opacity: 0.75` on top of an already-muted color, silently degrading contrast further — 3.85:1 on maximalist | Serious | **FIXED** |
| 6 | Site utility-nav strip (`<div>`) sat outside any landmark — `region` violation on every single page in this app | Moderate | **FIXED** |
| 7 | `pdp-spec-sheet.tsx` (the "Datasheet Storefront" PDP template) rendered with **no `<main>` landmark at all** | Moderate | **FIXED** |
| 8 | `RecommendationShelf` — bare `<section>`, no accessible name, outside any landmark, on every PDP/cart with recommendations | Moderate | **FIXED** |
| 9 | `BundleTierSelector` — same bare-`<section>` gap, on every PDP with a bundle | Moderate | **FIXED** |
| 10 | `category-spec-grid.tsx` / `category-maximalist-grid.tsx` — product-card `<h3>` skipped a level (page's own `<h1>` → `<h3>`, no `<h2>`) | Moderate | **FIXED** |
| 11 | `category-magazine-grid.tsx` — same skip, conditional on no "feature" product; real but not reproduced live today | Moderate | **FIXED proactively** |
| 12 | **Critical**: PDP add-to-cart quantity `<input type="number">` had **zero accessible name** — `pdp-tabbed-detail.tsx` (2 sites) + `pdp-long-scroll.tsx` (4 sites), the PDP templates 7 of 10 bundles use | **Critical** | **FIXED** |
| 13 | **Critical**: cart-page quantity-update `<input type="number">` had zero accessible name — `cart-standard.tsx`, `cart-spec-table.tsx`, `cart-receipt-style.tsx` (every cart template) | **Critical** | **FIXED** |
| 14 | Admin `/admin/catalog` table: empty `<th>` (the SKU-matrix link column) had no text visible to screen readers | Minor | **FIXED** |
| 15 | Every `/admin` page: 2 unlabeled `<header>` elements (storefront nav + admin session bar), both getting the implicit "banner" role — "more than one banner landmark" | Moderate | **FIXED** |
| 16 | Editorial home template's hero subheadline lost its own white text to a CSS override, rendering illegibly (2.26:1) against its own hardcoded dark `#222` background — pre-existing, not introduced by this audit | Serious | **FIXED** |
| 17 | `--color-primary` used directly as small/body-sized foreground text (not a button fill with a chosen ink color) fails AA in multiple bundles: main shop nav links (vibrant 2.64:1, retro 2.98:1 by calculation), CTA button text-on-fill (maximalist 2.98:1, editorial 4.45:1 near-miss), "ghost" cart buttons (editorial 4.45–4.46:1), the maximalist hero "pop" word (2.98:1, partially mitigated by a 2px text-stroke axe can't credit) | **High** (real, systemic, shopper-facing) | **Documented — new-epic-candidate**, not fixed blind (needs a real design decision, not a rushed per-bundle patch) |
| 18 | `variant-picker.tsx` | — | **NOT A GAP** — real `<select>`s, implicit `<label>` + `aria-label`, visible `:focus-visible` outline, `<noscript>` fallback. Genuinely accessible already. |
| 19 | Admin SKU-matrix form (`admin/products/[productId]/skus`) | — | **NOT A GAP** — every real input (`attr_color`, `attr_size`, `price`, `currency`, `stock`) has a proper `<label>`. |
| 20 | Product image alt text, every page scanned (9 images spot-checked on broadleaf's `/category/plants` alone) | — | **NOT A GAP** — descriptive, specific alt text everywhere; zero `image-alt` violations in this entire audit. |
| 21 | Keyboard operability / visible focus states (variant-picker, theme-switcher, admin forms) | — | **NOT A GAP** — no `tabindex` hacks anywhere, no `outline: none` without a replacement anywhere in the app, real focus rings confirmed live on the variant-picker's `<select>` and an admin `<input>`. |

## 1. Framework landing page — undercomputed derived token

`.pHive/brand/brand-system.yaml` computed real WCAG contrast for the 4 *named* brand colors
(Ledger Indigo, Garnet, Carbon Ink, Paper Neutral) — all genuinely pass (9.08:1 / 6.60:1 /
17.36:1 / n/a-as-surface). It never touched the two *derived* secondary-text tokens
`app/(landing)/layout.tsx` actually defines and every landing page consumes:
`--ml-ink-soft: #5a5a5e` (checked by hand here: 6.87:1, fine) and **`--ml-ink-faint: #8c8c90`**
(checked by hand: 3.34:1 — axe-core independently measured the identical 3.34:1 live on both
localhost and `commerce.mdostal.com`). `--ml-ink-faint` styles the footer's two column headings
and the legal-line text on `/`, the FAQ "+" glyph on `/`, the architecture page's table headers,
and the themes page's key labels — all real, all visible, all failing WCAG AA's 4.5:1 minimum
(the footer headings are bold but at 12.48px, well under the 18.66px bold "large text" threshold
that would relax the requirement to 3:1).

**Fixed**: `--ml-ink-faint` → `#6b6b6f` (same true-neutral hue family, verified by hand at 5.30:1
against `#ffffff`, a real pass with margin). One token, one place
(`app/(landing)/layout.tsx`'s `:root`), fixes every consumer.

## 2. `editorial` theme bundle's `--color-muted` — two real, distinct failures

The first axe-core scan (print-shop's default "editorial"/"The Slow Catalog" theme) found
`--color-muted: #7A6C58` measuring 4.23:1 against its own `--color-background` (#F2E9D8) — live
on the site utility-nav strip (18 nodes on `/`, 44 on `/category/embroidery`, 33 on `/cart`).
Fixed to `#6F6250` (4.92:1 by hand).

**That fix alone did not close the gap.** Re-scanning after deploying it (methodology: local
rebuild + re-scan, same axe-core session) found the theme-switcher's own `.ts-label` *still*
failing, now at **exactly** 4.23:1 again — a real second, distinct root cause axe-core's live
render caught that the first hand-calculation didn't: `.ts-label` doesn't sit on the raw page
background, it sits on `.ts-pill`'s own `background: color-mix(in srgb, var(--color-background)
92%, var(--color-text) 8%)` (`#E2D9C8`, darker than the raw `#F2E9D8`, confirmed by hand-computing
the exact color-mix result and matching it to axe's own reported background). This is precisely
the "rendered pages combine tokens in ways that weren't checked" scenario this audit's brief
flagged as a real risk. Re-fixed to **`#635747`** (5.84:1 against the raw background, 5.02:1
against the darkened pill background — passes both real usages with margin).

Both the CSS-variable value (`packages/theming/src/theme-bundles.ts`, plus its test assertion)
and 10 hardcoded literal fallbacks (`var(--color-muted, #7A6C58)`) across `pdp-long-scroll.tsx`
and `cart-receipt-style.tsx` were updated to the final value for defense-in-depth consistency.

## 3. `datasheet` theme bundle's `--color-muted` — severe fail

`--color-muted: #8891A0` measured **2.86:1** against `--color-background` (#F1F3F6) — a severe
AA fail, live on 16 nodes on one page alone (site utility nav + `.ts-label`). Confirmed on
print-shop's home/category/PDP under the "Datasheet Storefront" theme. Fixed to `#626B78`
(4.85:1 by hand, same cool blue-slate family as the bundle's own `--color-accent`). Same
defense-in-depth pass on 8 hardcoded `#8891A0` literal fallbacks across `category-spec-grid.tsx`,
`pdp-spec-sheet.tsx`, `datasheet-styles.tsx`, and `cart-spec-table.tsx`.

## 4. Utility-nav strip's `--color-primary` fallback — 6-of-10-bundle exposure

`app/demo/[demoSlug]/layout.tsx`'s "Start here"/"How this works"/admin/cross-demo utility strip
styled every link `color: var(--color-muted, var(--color-primary))`. Fine for the 4 bundles that
define `--color-muted` — but the 6 that don't (dark/minimal/vibrant/retro/high-contrast/
northline) fell through to `--color-primary`, a color meant for buttons/CTAs, not small secondary
nav text. Confirmed live on broadleaf's default "vibrant" theme: `#f97316`-on-`#fff7ed` measured
**2.64:1** across all 15 links (severe fail). Every bundle's `--color-text` already passes 4.5:1
against its own background with wide margin (worst case, by hand: retro at 12.05:1) — fixed by
changing the fallback to `var(--color-muted, var(--color-text))`, closing the gap for every
current and future bundle that skips `--color-muted`, without adding a token to each one.

## 5. Theme-switcher `.ts-label` opacity compounding

`.ts-label { color: var(--color-muted, var(--color-text)); opacity: 0.75; }` — the opacity sat
on top of an already-muted color. Confirmed live on maximalist: `--color-muted` (#55503f) is a
real 7.00:1 AA pass on its own, but the 0.75 opacity composited it toward the `#EEF0E6`
background to an effective `#7b7869`/**3.85:1**, a real fail (verified by hand: the composited
color matches axe's own measurement exactly). Removing the opacity can only ever *increase*
contrast against the background (it moves the effective color away from, not toward, most
themes' typically-darker-than-background muted tones) — fixed by deleting the `opacity: 0.75`
line outright; the muted color choice itself already provides the intended "de-emphasized" look.

## 6–9. Landmark gaps — 4 distinct real components, same underlying pattern

Real HTML/ARIA structure gaps, all confirmed live via axe-core's `region`/`landmark-one-main`
rules, all in components that predate this audit:

- **Utility-nav strip** (finding above): a bare `<div>` holding 6+ real navigation links, sitting
  directly under `<body>`, ahead of `NavChrome`'s own `<header>`/`<nav>` — flagged on **every
  single page** in this app. Fixed: `<div>` → `<nav aria-label="Site utility links">` (it *is*
  navigation, so this is the honest element, not a wrapper-for-wrapping's-sake).
- **`pdp-spec-sheet.tsx`** (the "Datasheet Storefront" PDP template): the other 2 registered PDP
  templates (`pdp-tabbed-detail.tsx`, `pdp-long-scroll.tsx`) both wrap their content in `<main>`;
  this one didn't. Confirmed live on `embroidered-performance-polo` under the datasheet theme:
  `landmark-one-main` ("document does not have a main landmark") plus **27** `region` violations
  on that one page. Fixed: outer `<div className="ds-scope ds-pdp">` → `<main className="ds-scope
  ds-pdp">`, 1:1, zero other markup change. (Checked the same gap for `home-spec-grid.tsx` and
  `category-spec-grid.tsx`, the datasheet theme's other 2 dedicated templates — **both are
  actually fine**: their parent route (`app/demo/[demoSlug]/page.tsx` /
  `category/[slug]/page.tsx`) already wraps the whole `<Template>` call in its own `<main>`,
  unlike the PDP route, which uses a bare fragment and delegates `<main>` entirely to whichever
  PDP template is selected. An earlier draft of this fix mistakenly added a *second*, nested
  `<main>` to both — caught and reverted before commit by checking each page.tsx's own JSX, not
  assumed from the PDP fix's shape.)
- **`RecommendationShelf`**: a bare `<section>` with an `<h2>` but no accessible name, rendered as
  a sibling *after* the PDP template's own `<main>` (by design — it's related-but-secondary
  content, not part of the product detail). A `<section>` with no name isn't a landmark in the
  accessibility tree, so axe correctly flagged it (2 nodes on northline's PDP). Fixed:
  `aria-labelledby` pointing at the shelf's own `<h2>` (given an `id`) — makes it a real, named
  "region" landmark without folding it into `<main>`, which would have been the wrong shape.
- **`BundleTierSelector`**: the identical bare-`<section>` gap, found on northline's
  `tv-wall-mounting` PDP (a real bundle, "TV Mount Install Packages" — 4 nodes). Same fix.

## 10–11. Category-card heading-level skips

`category/[slug]/page.tsx` renders exactly one `<h1>` (the category title) and nothing else
before handing off to whichever category template is active. Two of the 4 registered templates
render each product card's title as an `<h3>` directly after that `<h1>` — skipping `<h2>`:

- **`category-spec-grid.tsx`** (datasheet): confirmed live via axe-core's `heading-order` rule on
  print-shop's `/category/embroidery`.
- **`category-maximalist-grid.tsx`**: confirmed live the same way, same category, maximalist
  theme.
- **`category-magazine-grid.tsx`** (editorial): its "feature" product tile renders a real `<h2>`
  — but that tile is conditional (`{feature && ...}`), and the grid/overflow cards below it always
  render `<h3>` regardless. Every category this repo has seeded happens to have a feature product
  today, so this specific skip was **not reproduced live** — but the code path is real and will
  fire for any future category without one. Fixed proactively rather than left for someone to
  rediscover from a blank category.

All 3 fixed: `<h3>` → `<h2>` (plus their matching CSS tag selectors), making every product card a
same-level sibling section under the page's own `<h1>` — correct semantics, not just quieting the
rule.

## 12–13. Critical: unlabeled cart-quantity number inputs

The single most severe finding of this audit. `axe-core`'s `label` rule, **impact: critical**,
fired on:

- **Northline's real `tv-wall-mounting` PDP** — the add-to-cart quantity `<input type="number">`
  had no implicit label, no explicit label, no `aria-label`, no `title`, no `placeholder`. A
  screen-reader user hits this field with zero indication of what it's for.
- **Print-shop's cart page** (2 real line items) — the same gap, 2 nodes, on the quantity-update
  input for each cart line.

Traced to source: `pdp-spec-sheet.tsx` (the datasheet PDP) already did this correctly
(`aria-label="Quantity"`) — but **`pdp-tabbed-detail.tsx`** (2 call sites — the shared fallback
PDP template for classic/dark/minimal/vibrant/retro/high-contrast/northline, 7 of 10 bundles) and
**`pdp-long-scroll.tsx`** (4 call sites — editorial/minimal/vibrant/high-contrast) both had zero
label of any kind. Same gap, same shape, on every cart template: `cart-standard.tsx`,
`cart-spec-table.tsx`, `cart-receipt-style.tsx`.

Fixed: `aria-label="Quantity"` on the 6 PDP sites (matching `pdp-spec-sheet.tsx`'s own
convention). For the 3 cart templates, used a **per-line** `aria-label={\`Quantity for
${line.title}\`}` instead of a bare "Quantity" — a cart can have multiple lines, and a bare label
repeated identically on every row leaves a screen-reader user with no way to tell which line
they're editing.

## 14–15. Admin-page findings

Both required admin pages (`/admin/catalog`, the epic-63 SKU-matrix page) were scanned. The
SKU-matrix page was **clean from the first scan** — zero axe-core violations, and a manual check
confirmed every real form field (`attr_color`, `attr_size`, `price`, `currency`, `stock`) has a
proper `<label>`. `/admin/catalog` had 2 real, fixable gaps:

- **Empty `<th>`**: the 4th table-header cell (the column holding each product's "SKU matrix"
  link) had no text at all — `empty-table-header`, confirmed live. Fixed: gave it real, visible
  text, "SKU matrix" (matching the link it contains — better for sighted users too, not just a
  screen-reader-only fix).
- **Duplicate unlabeled "banner" landmark**: `admin/layout.tsx` renders its own `<header>`
  ("Signed in as X") as a sibling of the outer demo layout's `NavChrome`, which *also* renders a
  `<header>` for 8 of 10 bundles (`nav-top-bar.tsx`, shared fallback + editorial's own branch).
  Neither is nested inside `main`/`article`/`aside`/`section`, so both get the HTML spec's
  implicit "banner" role — `landmark-no-duplicate-banner` fired ("document has more than one
  banner landmark"). First attempt (adding distinguishing `aria-label`s to both) did **not**
  satisfy this specific rule — unlike `landmark-unique`, `landmark-no-duplicate-banner` requires
  *at most one* banner landmark, full stop, confirmed by re-scanning after the label-only attempt
  still failed. Real fix: the admin session bar was never really the page's primary banner
  anyway — changed it to a `<section aria-label="Admin session">` (drops the implicit "banner"
  role entirely, while still being a real, named "region" landmark so axe's separate `region`
  rule doesn't then flag it as uncontained). `nav-top-bar.tsx`'s own header kept a new
  `aria-label="Store navigation"` too, for clarity even now that it's the only banner.
  `/admin/catalog` is now genuinely 0-violation.

## 16. Editorial home hero — pre-existing, found while re-verifying a fix

While re-scanning print-shop's home page after fixing finding #2, axe-core surfaced a *new*
violation with the **new** muted color (`#635747`) as the reported failing foreground —
`section > p`, 2.26:1 against a `background: #222` hero banner. Traced to source:
`cms-sections.tsx`'s generic `HeroBanner` component sets `color: "#fff"` on its own `<section>`
(a deliberately dark banner), and its subheadline `<p>` doesn't set its own color, so it should
inherit white. But `home-magazine-grid.tsx` (the editorial home template) has its own
`.ed-home .ed-hero-feature p { color: var(--color-muted, ...) }` rule that overrides the
inherited white with the page's *light-background* muted-text color — illegible against the
hero's own hardcoded dark background. **This bug predates this audit's own token changes** — the
old `#7A6C58` value would have measured just as badly against `#222` (verified by hand); it
surfaced now simply because fixing #2 changed which exact hex the browser reported. Fixed at the
real point of the conflict: the `HeroBanner` subheadline `<p>` now sets `color: "inherit"`
inline — inline style always wins over any external/embedded stylesheet class selector regardless
of specificity, so it reliably re-inherits the section's own white, without touching the
editorial template's rule (which is still correct for every *other* section type that can render
in that "feature" slot).

## 17. `--color-primary`-as-foreground contrast — real, systemic, documented (not fixed blind)

The single largest remaining gap this audit found, deliberately **not** fixed inline, because
fixing it correctly needs a real design decision this audit shouldn't freehand. `--color-primary`
is used directly as small/body-sized foreground text (not as a button fill with a separately
chosen ink color) in several places across the app, and several bundles' primary colors were
picked for brand feel without ever being checked for that specific usage:

- **Main shop navigation** (`nav-top-bar.tsx`'s non-editorial branch — category links, Cart,
  Search, Account — the primary way a shopper navigates 7 of 10 bundles): confirmed live on
  broadleaf's default "vibrant" theme, `#f97316`-on-`#fff7ed`, **2.64:1**, 9 nodes on the home
  page alone. By hand-calculation, "retro"'s `#b58900`-on-`#fdf6e3` is also a fail (2.98:1) —
  not yet reproduced live, but the same component, same pattern.
- **CTA button text-on-fill** (`background: var(--color-primary); color:
  var(--color-background)`, used for "Add to cart"/"Submit review"/checkout buttons across
  `pdp-tabbed-detail.tsx`, `pdp-long-scroll.tsx`, `bundle-tier-selector.tsx`,
  `cart-receipt-style.tsx`): confirmed live on maximalist (`#eef0e6`-on-`#ff4515`, **2.98:1**) and
  — found while re-verifying finding #16's fix — editorial too, at **4.45:1**, a near-miss just
  under the 4.5:1 line.
- **"Ghost" cart action buttons** (`color: var(--color-primary)` text on the page background,
  `.ed-btn-ghost` in `cart-receipt-style.tsx` — the "Update"/"Remove"/coupon "Apply" buttons):
  confirmed live on print-shop's real (non-empty) cart, editorial's own primary measuring
  **4.45–4.46:1**, the same near-miss as above (the same brand color, two call sites).
- **Maximalist's hero "pop" word** (`.mx-pop`, a 72px bold display word): `#ff4515`-on-`#eef0e6`
  measures 2.98:1 against the large-text 3:1 threshold — the **closest** of all these to passing,
  and it has a real, if automated-tooling-invisible, mitigation: a 2px `-webkit-text-stroke` in a
  near-black border color, which meaningfully improves real legibility in a way axe-core's
  fill-color-only algorithm can't credit.

**Why documented, not fixed**: this isn't one broken token, it's `--color-primary` itself —
across at least 3 bundles (vibrant, maximalist, editorial) and likely a 4th (retro, by
calculation) — being reused as foreground text in several different components without a
dedicated "safe as foreground" variant. Fixing this well means either (a) a new per-bundle
"on-primary"/"primary-ink" token plus updating every consuming component to prefer it, or (b)
individually re-tuning several bundles' actual brand-primary hex values, which is a real design
call (these are each demo's *signature* accent color, chosen deliberately in the
`storefront-design-system-v2` epic) — not something to patch bundle-by-bundle inside an audit
pass. **Recommend a dedicated epic**: `brand-primary-foreground-contrast-audit`, scoped to
auditing and fixing exactly this pattern across all 10 bundles and every real consuming
component, with a real before/after axe-core re-scan per bundle as its own acceptance criterion.

## 18–21. Real surfaces checked and found genuinely fine

Per this audit's own "be honest" instruction — these are not invented problems:

- **`components/variant-picker.tsx`**: real `<select>` elements (never a click-only `<div>`), an
  implicit `<label>` wrapping each field's text + control, *and* a redundant-but-harmless
  `aria-label={\`Select ${key}\`}` (the effective accessible name, since `aria-label` wins), a
  real `:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }`
  (confirmed live: focusing the color `<select>` on the real polo PDP produced a genuine 2px
  solid outline), and a `<noscript>` submit-button fallback for JS-disabled sessions. This is a
  genuinely well-built, accessible component — exactly what epic 63's own commerce-gap-audit-3
  disclosed as *untested* (no dedicated test file), not *inaccessible*; this audit's own read
  confirms the distinction holds.
- **Admin SKU-matrix form**: every real input has a proper `<label>` (`attr_color`, `attr_size`,
  `price` — with a genuinely helpful label text, "Price (minor-unit amount, e.g. cents)" —
  `currency`, `stock`). Zero axe-core violations on this page from the very first scan.
- **Product image alt text**: every `<img>` checked across every page this audit scanned had
  real, specific, descriptive alt text (e.g. "A trailing pothos plant with variegated
  heart-shaped leaves in a hanging pot" — not a filename, not empty, not generic "product
  image"). Zero `image-alt` violations anywhere in this entire audit, across 3 demos and 4
  themes.
- **Keyboard operability**: `grep -rn "tabIndex"` across `variant-picker.tsx`/`theme-switcher.tsx`
  returns nothing (natural DOM tab order, by construction, no keyboard traps), and a repo-wide
  grep for `outline:\s*none` in every component/app file returns nothing — no suppressed focus
  ring anywhere without a real replacement. Verified live: focusing the polo PDP's color
  `<select>` produces the component's own 2px outline; focusing the SKU-matrix admin page's price
  `<input>` (which defines no custom focus style at all) still produces the browser's own default
  visible focus ring. No missing focus state found anywhere this audit checked.

## Axe-core scan results (violation counts, not just "issues found")

All scans below used `axe.run(document, { resultTypes: ["violations"] })`, `axe-core@4.10.2` via
CDN. "Before" = first scan of that exact page+theme combination; "after" = re-scan against this
branch's fixed code (local dev server, rebuilt `packages/theming`, same axe-core session).

| Page (theme) | Before | After |
|---|---|---|
| `/` landing (production) | 1 violation, 3 nodes (`color-contrast`) | **0 violations** |
| print-shop home (editorial, default) | 2 violations — `color-contrast` 18, `region` 1 | **0 violations** |
| print-shop home (datasheet) | 2 violations — `color-contrast` 16, `region` 1 | not re-scanned in this theme (same root causes, both fixed) |
| northline home (northline, default) | 1 violation — `region` 1 | (same fix; region strip fixed app-wide) |
| broadleaf home (vibrant, default) | 2 violations — `color-contrast` 15, `region` 1 | **1 violation, 9 nodes** (`color-contrast` — finding #17, documented not fixed) |
| broadleaf home (maximalist) | 2 violations — `color-contrast` 2, `region` 1 | (`.ts-label` part fixed; `.mx-pop` is finding #17) |
| print-shop PDP `embroidered-performance-polo` (datasheet) | 3 violations — `color-contrast` 20, `landmark-one-main` 1, `region` 27 | not re-scanned in this theme (all 3 root causes fixed) |
| print-shop PDP `embroidered-performance-polo` (editorial) | (not scanned before other fixes landed) | **1 violation, 2 nodes** (`color-contrast` — finding #17, documented not fixed) |
| print-shop `/category/embroidery` (datasheet) | 3 violations — `color-contrast` 44, `heading-order` 1, `region` 1 | **0 violations** |
| print-shop `/category/embroidery` (maximalist) | 3 violations — `color-contrast` 1, `heading-order` 1, `region` 1 | (same fixes apply) |
| print-shop `/category/embroidery` (editorial) | 2 violations — `color-contrast` 18, `region` 1 | **0 violations** |
| northline PDP `tv-wall-mounting` | 2 violations — `label` (**critical**) 1, `region` 6 | **0 violations** |
| broadleaf PDP `trailing-pothos` (maximalist) | 3 violations — `color-contrast` 5, `label` (**critical**) 1, `region` 6 | (label + region fixed; color-contrast is finding #17) |
| print-shop `/cart` (editorial, 2 real lines) | 3 violations — `color-contrast` 33, `label` (**critical**) 2, `region` 2 | **1 violation, 4 nodes** (`color-contrast` — finding #17, documented not fixed) |
| `/admin/catalog` (print-shop, editorial, local dev) | 4 violations — `color-contrast` 18, `empty-table-header` 1, `landmark-no-duplicate-banner` 1, `landmark-unique` 1 | **0 violations** |
| `/admin/products/[productId]/skus` (print-shop, local dev) | **0 violations** | **0 violations** (unchanged, clean from the start) |
| broadleaf `/category/plants` (`image-alt` rule only) | **0 violations** (9 real product images, all with descriptive alt) | — |

## What this audit actually changed

1. `apps/reference-storefront/app/(landing)/layout.tsx` — `--ml-ink-faint` contrast fix
   (finding #1).
2. `packages/theming/src/theme-bundles.ts` + `packages/theming/test/theme-bundles.test.ts` —
   `editorial`/`datasheet` `--color-muted` fixes (findings #2, #3), plus their doc comments.
3. `apps/reference-storefront/components/{pdp-long-scroll,cart-receipt-style,category-spec-grid,
   pdp-spec-sheet,datasheet-styles,cart-spec-table}.tsx` — hardcoded literal-fallback consistency
   pass for the same two token fixes.
4. `apps/reference-storefront/app/demo/[demoSlug]/layout.tsx` — utility-nav strip: `<div>` →
   `<nav aria-label>` (finding #6), `--color-primary` fallback → `--color-text` (finding #4).
5. `apps/reference-storefront/components/theme-switcher.tsx` — removed `.ts-label`'s
   `opacity: 0.75` (finding #5).
6. `apps/reference-storefront/components/pdp-spec-sheet.tsx` — added the missing `<main>`
   (finding #7).
7. `apps/reference-storefront/components/recommendation-shelf.tsx` +
   `apps/reference-storefront/components/bundle-tier-selector.tsx` — `aria-labelledby` real
   landmark fix (findings #8, #9).
8. `apps/reference-storefront/components/{category-spec-grid,category-maximalist-grid,
   category-magazine-grid}.tsx` — `<h3>` → `<h2>` heading-order fixes (findings #10, #11).
9. `apps/reference-storefront/components/{pdp-tabbed-detail,pdp-long-scroll,cart-standard,
   cart-spec-table,cart-receipt-style}.tsx` — critical unlabeled-quantity-input fixes
   (findings #12, #13).
10. `apps/reference-storefront/app/demo/[demoSlug]/admin/{catalog/page,layout}.tsx` +
    `apps/reference-storefront/components/nav-top-bar.tsx` — empty `<th>` + duplicate-banner
    fixes (findings #14, #15).
11. `apps/reference-storefront/components/cms-sections.tsx` — `HeroBanner` subheadline
    `color: "inherit"` fix (finding #16).
12. This document, plus the new-epic-candidate above (finding #17) — not added to
    `epic-backlog.md` directly (a separate row is added there for this audit's own closeout, per
    this task's own instructions, not as a second epic).

All changes are on `fix/a11y-audit-findings`, branched from `master`. Full monorepo check
(`pnpm turbo run typecheck test build --force`) ran clean: **127/127 tasks successful, 0
failures** (258 tests, 1 intentionally skipped live-Postgres test, same as every prior audit in
this repo).
