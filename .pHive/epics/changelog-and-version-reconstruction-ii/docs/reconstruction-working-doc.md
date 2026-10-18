# Reconstruction working doc: epics 67-85 -> CHANGELOG.md / package.json version

Story `cvr2-01-research-and-reconstruction`'s entire output. Story `cvr2-02` transcribes this
into `CHANGELOG.md`/`package.json` -- it should not need to re-research anything here. Mirrors
the original `changelog-and-version-reconstruction` epic's own working doc structure and
convention exactly (cited throughout as "the original doc").

**Zero application code touched to produce this doc.** Only `.pHive/planning/epic-backlog.md`
(read, not edited), `.pHive/epics/*/epic.yaml` (read), `CHANGELOG.md` (read, not edited), and
`package.json` (read, not edited) were consulted.

## 0. Baseline, re-confirmed live (not trusted from the task brief)

- `package.json`: `"version": "0.28.6"` (`grep -n '"version"' package.json`, confirmed).
- `CHANGELOG.md`: last header `## [0.28.6] - 2026-09-22`, that entry documenting the original
  `changelog-and-version-reconstruction` epic's own closeout (epic-backlog row 66). Confirmed
  via `grep -n '^## \[' CHANGELOG.md | tail -1`.
- Epic-backlog row 66 (`changelog-and-version-reconstruction`) is the original epic's own
  closeout row -- already fully reflected in `CHANGELOG.md`'s `[0.28.6]` entry. **Not
  re-covered by this epic.** This epic's real new range is rows **67-85** (19 epics).

## 1. The 3 epics with a real `epic.yaml` `version_bump` -- re-grepped live

| Epic | id | `version_bump` |
|---|---|---|
| 77 | `integrations-catalog-and-ecosystem-audit` | patch |
| 78 | `shopify-migration-import-tool` | minor |
| 84 | `second-payment-processor-adapter` | minor |

## 2. The 16 epics with no recorded `version_bump` -- inferred, each with cited evidence

Two distinct shapes found (design-discussion.md §3b): **9 epics have no `.pHive/epics/<name>/`
directory at all** (67, 68, 69, 70, 71, 72, 74, 75, 76); **1 epic has a directory but no
`epic.yaml`** (73 `a11y-audit`, confirmed via `find .pHive/epics/a11y-audit -type f` returning
only `docs/audit-findings.md`); **6 epics have a real `epic.yaml` with no `version_bump` field
in it at all** (79, 80, 81, 82, 83, 85, confirmed via `grep -E '^version_bump:'` against each
returning nothing). All three shapes are treated identically for inference purposes -- the
mechanical fact that matters (no recorded bump) holds for all 16.

Convention applied throughout (identical to the original doc's §3, re-applied): new
subsystem/package = minor; a small settings/admin surface, a live bug fix, a security-only fix,
or a fix-only audit epic = patch; a pure-docs/research/verification epic with zero shipped
code, or a test-only epic with zero shipped application *behavior* change = none.

| Epic | id | Inferred `version_bump` | Evidence |
|---|---|---|---|
| 67 | `gap-audit-3-test-coverage` | **none** | epic-backlog.md row 67, verbatim: "Test-only, no application behavior changed." 21 new test files close disclosed coverage gaps in already-shipped code (epic 63's variant picker, epic 63's SKU-matrix admin page, epic 55's landing page) -- zero production behavior changed. Extension of the original doc's epic-40 "zero shipped code" = none precedent to "zero shipped behavior," made explicitly here (design-discussion.md §3c). |
| 68 | `gap-audit-3-storefront-view-edit` | **patch** | epic-backlog.md row 68: a real admin CRUD-completeness gap closed (`StorefrontViewsService.updateView` existed with zero call site) via a new edit route/action within the existing `@mercatus-liber/storefront-views` subsystem -- no new package. Same shape as epic 28 `cms-admin-crud` (on-record `patch`): an admin CRUD UI filling a gap in an existing subsystem. |
| 69 | `dependency-vulnerabilities-xmldom` | **patch** | epic-backlog.md row 69: closed 13 real `pnpm audit` advisories via a `pnpm-workspace.yaml` override, zero application code changed. Security-only dependency fix, no new package -- same "fix-only, dependency-only" shape as the original doc's own precedent reasoning for epic-17-style audit epics, categorized `### Security` per §3 below. |
| 70 | `gap-audit-3-bundle-variant-resolution` | **patch** | epic-backlog.md row 70: a real correctness-bug fix (a `BundleTier`'s pinned `skuIds` ignoring the shopper's live variant selection) within the existing `@mercatus-liber/bundles` package -- a new exported function, not a new package. Live bug fix (not yet reachable in production, but a genuine fix to an existing subsystem), matching the epic-17 `patch` convention. |
| 71 | `oss-community-health-files` | **patch** | epic-backlog.md row 71: 6 new GitHub-native metadata/policy files (`CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue/PR templates), zero application code, zero new package. Closer in shape to the original doc's own epic 47 `vision-and-community-roadmap` precedent (on-record `patch` -- a small docs/policy addition) than epics 33/38 (on-record `minor` -- a whole new docs *site* or a full 8-page content pass); this is a bounded set of metadata files, not a new product surface. |
| 72 | `dependency-updates-minor-patch` | **patch** | epic-backlog.md row 72: routine `next`/`@clerk/nextjs`/`stripe`/`react`-etc. minor/patch version bumps, live-deployed. Standard semver convention for a dependency-maintenance pass with no new capability -- same patch-level shape as epic 69's dependency fix, categorized `### Changed` (a maintenance change, not a bug fix) per §3 below. |
| 73 | `a11y-audit` | **patch** | epic-backlog.md row 73: a fix-only audit epic (16 of 17 real a11y findings fixed across contrast tokens, unlabeled inputs, landmarks, heading hierarchy), explicitly the same "audit mirroring epics 17/26/60-65's own methodology" shape, all of which are on-record/inferred `patch` in the original doc. No new subsystem. |
| 74 | `ci-node-version-mismatch` | **patch** | epic-backlog.md row 74: a real, live-broken CI pipeline (both prior GitHub Actions runs on `master` had failed) found and fixed -- a live bug fix, matching the epic-17 convention even though the surface is CI infrastructure rather than application code. |
| 75 | `brand-primary-foreground-contrast-audit` | **patch** | epic-backlog.md row 75: direct fix for row 73's own deferred finding #17, same a11y-fix shape as 73 itself -- a token-level correctness fix within the existing `@mercatus-liber/theming` package, no new subsystem. |
| 76 | `apply-final-logo` | **patch** | epic-backlog.md row 76: applying an already-decided brand asset to 3 existing live surfaces (favicon files, social-preview image, README logo) -- a visual/asset change with no new subsystem, same shape as the original doc's own epic 32 `storefront-visual-redesign` (on-record `patch`: a visual change, no new package). |
| 79 | `free-tier-resilience-and-keepalive` | **patch** | epic-backlog.md row 79: a small, app-level resilience feature (`lib/backend-unreachable.ts`, a new detector wired into the existing catalog-persistence read path) plus a GitHub Actions ops-automation job -- no new `packages/*` subsystem. Same shape as the original doc's own epic 54 `per-store-landing-and-onboarding` (inferred `patch`: "no new packages/* subsystem... an app-level... surface, not a domain capability"). |
| 80 | `docs-wiki-examples-architecture` | **patch** | epic-backlog.md row 80: a GitHub Wiki standup (outside this repo's own package graph entirely) plus one new docs-site reference page and two real link/deploy-config bug fixes -- bounded in scope, no new package, closer to epic 47/71's "docs/policy addition" shape than epic 33's "whole new docs site" (`minor`) shape. |
| 81 | `separate-deployed-sample-stores` | **minor** | epic-backlog.md row 81: a materially new application capability -- an env-gated single-tenant rewrite mode changing how every shopper-facing route resolves -- plus three new, independently-deployed, publicly-reachable Vercel projects. No new `packages/*` subsystem, but a structurally significant new app-level capability, matching the original doc's own epic 31 `commerce-landing-and-demo-routing` precedent (on-record `minor`: a routing-level restructuring with no new package). |
| 82 | `dropship-merch-address-wiring` | **minor** | epic-backlog.md row 82: additive structured-address fields and a new `FulfillmentRecipient` type threaded across multiple existing packages (`checkout-orders`, `fulfillment`, `adapter-printful`, `adapter-printify`), unlocking a real new downstream integration capability (the whole point of the epic, per its own origin in `shop.mdostal.com`'s own ask). A cross-cutting capability addition, not a bare settings tweak -- matching the original doc's own epic 39 `data-backup-restore-and-adapter-portability` precedent (on-record `minor`: a new capability layered onto existing adapters, no brand-new package required for the bump to be `minor`). |
| 83 | `outbound-webhook-event-delivery` | **minor** | epic-backlog.md row 83: a brand-new package, `@mercatus-liber/webhooks`, plus a new Postgres-backed store in `adapter-postgres`. Unambiguous new-subsystem/package = minor, per the original doc's own primary convention. |
| 85 | `accounting-erp-sync-adapter` | **minor** | epic-backlog.md row 85: two brand-new packages, `@mercatus-liber/accounting-sync` and `@mercatus-liber/adapter-quickbooks`. Same new-subsystem/package = minor convention as 83, and as epic 84's own on-record `minor` sibling (both closing the same row-77-recorded candidate list the same night). |

## 3. Epic 69 and 72 categorization calls, made explicitly

**69 `dependency-vulnerabilities-xmldom`** is categorized under **`### Security`**, not
`### Fixed` -- it closed 13 real, numbered `pnpm audit` advisories (11 high, 2 moderate), a
textbook dependency-vulnerability remediation, the correct Keep-a-Changelog category for a
security advisory close, distinct from a correctness bug (which `### Fixed` is reserved for
elsewhere in this doc, e.g. epic 70).

**72 `dependency-updates-minor-patch`** is categorized under **`### Changed`**, not
`### Fixed` or `### Added` -- it is routine version-bump maintenance with no vulnerability and
no new capability, matching the original doc's own single `### Changed` precedent (epic 32's
token/copy refinement) for a non-bug, non-feature modification to already-shipped behavior.

## 4. `version_bump: none` epic -- fold-forward resolution (design-discussion.md §3c)

Only epic **67** `gap-audit-3-test-coverage` resolves to `none` in this range. It folds under
the next epic in number order that carries a real bump:

| `none`-bump epic | Folds under | Folded-under version |
|---|---|---|
| 67 `gap-audit-3-test-coverage` | 68 `gap-audit-3-storefront-view-edit` | `[0.28.7]` |

## 5. Full version sequence, epic-by-epic, starting from `0.28.6`

Computed by walking epics 67-85 in strict number order, applying each epic's resolved bump
(67 contributes no step of its own -- folded into 68's header per §4). Minor bump: increment
MINOR, reset PATCH to 0. Patch bump: increment PATCH only.

| Epic | id | bump (source) | Version header |
|---|---|---|---|
| 67 | `gap-audit-3-test-coverage` | none (inferred) | folds into `[0.28.7]` (epic 68) |
| 68 | `gap-audit-3-storefront-view-edit` | patch (inferred) | `[0.28.7]` |
| 69 | `dependency-vulnerabilities-xmldom` | patch (inferred) | `[0.28.8]` |
| 70 | `gap-audit-3-bundle-variant-resolution` | patch (inferred) | `[0.28.9]` |
| 71 | `oss-community-health-files` | patch (inferred) | `[0.28.10]` |
| 72 | `dependency-updates-minor-patch` | patch (inferred) | `[0.28.11]` |
| 73 | `a11y-audit` | patch (inferred) | `[0.28.12]` |
| 74 | `ci-node-version-mismatch` | patch (inferred) | `[0.28.13]` |
| 75 | `brand-primary-foreground-contrast-audit` | patch (inferred) | `[0.28.14]` |
| 76 | `apply-final-logo` | patch (inferred) | `[0.28.15]` |
| 77 | `integrations-catalog-and-ecosystem-audit` | patch (epic.yaml) | `[0.28.16]` |
| 78 | `shopify-migration-import-tool` | minor (epic.yaml) | `[0.29.0]` |
| 79 | `free-tier-resilience-and-keepalive` | patch (inferred) | `[0.29.1]` |
| 80 | `docs-wiki-examples-architecture` | patch (inferred) | `[0.29.2]` |
| 81 | `separate-deployed-sample-stores` | minor (inferred) | `[0.30.0]` |
| 82 | `dropship-merch-address-wiring` | minor (inferred) | `[0.31.0]` |
| 83 | `outbound-webhook-event-delivery` | minor (inferred) | `[0.32.0]` |
| 84 | `second-payment-processor-adapter` | minor (epic.yaml) | `[0.33.0]` |
| 85 | `accounting-erp-sync-adapter` | minor (inferred) | `[0.34.0]` |

**Sequence check:** 19 target epics, 18 own a version header (19 minus the 1 `none`-bump
epic), all headers strictly increasing, zero duplicates, zero gaps in epic-number coverage (67
through 85 inclusive, verified against §7's completeness table below). **Final version:
`[0.34.0]`**, landed by epic 85. This is what `package.json`'s `"version"` field becomes in
story 2.

Best-evidence dates for each header (from epic-backlog.md's own "Added YYYY-MM-DD" line per
epic):

`0.28.7`..`0.28.16` = 2026-09-23 (epics 68-77's own "Added 2026-09-23" line) ·
`0.29.0`/`0.29.1` = 2026-10-07 (epics 78's "Added 2026-10-07"; note epic 79 is dated
2026-10-15, so `0.29.1` uses 79's own real date, not 78's) ·
`0.29.2`..`0.31.0` = 2026-10-15 (epics 80/81/82's own "Added 2026-10-15") ·
`0.32.0`..`0.34.0` = 2026-10-18 (epics 83/84/85's own "Added 2026-10-18").

Corrected per-header dates (re-checked against each epic's own row, not copy-pasted from a
single range date): `0.28.7`-`0.28.15` = 2026-09-23 (epics 68-76) · `0.28.16` = 2026-10-07
(epic 77) · `0.29.0` = 2026-10-07 (epic 78) · `0.29.1`-`0.30.0` = 2026-10-15 (epics 79-81) ·
`0.31.0` = 2026-10-15 (epic 82) · `0.32.0`-`0.34.0` = 2026-10-18 (epics 83-85).

## 6. Drafted changelog entries, in final version order

Each entry below is ready to transcribe verbatim into `CHANGELOG.md` by story 2.

### `[0.28.7]` -- 2026-09-23

#### Added

- **Storefront-view edit UI** (`@mercatus-liber/storefront-views`): closed a real CRUD gap
  where `StorefrontViewsService.updateView` existed but had no admin UI or call site -- an
  operator could create, publish, or archive a view but never edit one afterward. Added a new
  `/admin/storefront-views/[id]` edit route (a shared `StorefrontViewFormFields` component
  extracted from the existing create form) and a new `updateStorefrontViewAction` server
  action, gated by the same `requireAdminPermission` guard every other admin mutation uses,
  with 6 new tests covering viewer/no-session rejection and real persistence.
- **Gap-audit-3 test-coverage follow-up** (epic 67 -- `version_bump: none`, folded here per §4,
  zero application behavior changed): added 21 real tests closing three disclosed coverage
  gaps from `commerce-gap-audit-3` -- the multi-attribute variant picker (epic 63), the admin
  SKU-matrix page's data-display logic, and the brand-system landing page, none of which had
  any test coverage before this epic.

### `[0.28.8]` -- 2026-09-23

#### Security

- **Dependency vulnerability remediation** (`@xmldom/xmldom`): closed 13 real advisories (11
  high, 2 moderate) reported by `pnpm audit`, all tracing to one deeply-transitive dependency
  pulled in via `apps/docs`'s `nextra` -> `mathjax-full` -> `speech-rule-engine` chain. Pinned
  `@xmldom/xmldom` to `0.9.12` (npm's current `latest`) via `pnpm-workspace.yaml`'s existing
  `overrides:` convention; `pnpm audit` now reports zero vulnerabilities at every severity.

### `[0.28.9]` -- 2026-09-23

#### Fixed

- **Bundle-tier variant resolution** (`@mercatus-liber/bundles`): fixed a real, not-yet-reached
  correctness bug where a `BundleTier`'s pinned `skuIds` were completely independent of the
  shopper's live variant-picker selection. Added `resolveTierCartSkuIds`, resolving each tier
  SKU against the shopper's active selection only when it belongs to the product currently
  being viewed, wired into `addBundleTierToCartAction` -- `BundleTier`'s stored shape is
  unchanged, and 9 new regression tests prove both backward compatibility and the new
  resolution.

### `[0.28.10]` -- 2026-09-23

#### Added

- **OSS community-health scaffolding**: added `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1), and GitHub-native
  `.github/ISSUE_TEMPLATE`/`PULL_REQUEST_TEMPLATE.md` files, grounded in this repo's real dev
  setup, adapter-contribution pattern, and an honestly-scoped pre-1.0 security-support policy
  -- closing a real gap where a project explicitly pitched for "full open source community and
  free plugins" had no GitHub-native contribution scaffolding at all.

### `[0.28.11]` -- 2026-09-23

#### Changed

- **Routine dependency maintenance**: applied 13 genuine minor/patch version bumps
  workspace-wide (`next`, `@clerk/nextjs`, `stripe`, `react`/`react-dom`, `convex`,
  `posthog-js`/`posthog-node`, `turbo`, and others), deliberately leaving 3 real
  major-version jumps (`typescript`, `@types/node`, `@types/better-sqlite3`) untouched for
  their own isolated pass. `pnpm audit` confirmed 0 vulnerabilities at every severity after the
  bump; live-verified post-deploy across all 3 demo stores, Clerk admin auth, and
  Stripe-backed sandbox checkout.

### `[0.28.12]` -- 2026-09-23

#### Fixed

- **First formal accessibility (a11y) audit**: ran axe-core 4.10.2 against the landing page,
  all 3 demo stores, PDPs, category/cart pages, and the required admin surfaces. Fixed 16 of
  17 real, live-confirmed findings -- undercomputed contrast tokens across several theme
  bundles, 2 critical unlabeled add-to-cart/quantity inputs, 4 missing/unlabeled landmark gaps,
  2 heading-hierarchy skips, and an empty admin table header -- live-reverified at 0 axe-core
  violations on 3 production pages post-deploy. One systemic finding (`--color-primary` reused
  as small foreground text) was deliberately documented rather than patched blind, since fixing
  it well needs a real design decision -- see `[0.28.14]`.

### `[0.28.13]` -- 2026-09-23

#### Fixed

- **CI Node-version mismatch**: found this repo's GitHub Actions CI workflow had failed on
  both of its real runs since being added -- `pnpm@11.22.0` requires Node >=22.13, but the
  workflow was pinned to Node 20, crashing before `pnpm install` could even run. Bumped the
  workflow's `node-version` to `24`, corrected `package.json`'s `engines.node` and
  `CONTRIBUTING.md`'s matching claim, then watched a real GitHub Actions run through to a
  genuine `success` conclusion.

### `[0.28.14]` -- 2026-09-23

#### Fixed

- **`--color-primary` foreground-contrast fix** (`@mercatus-liber/theming`): closed the a11y
  audit's deliberately-deferred finding -- `--color-primary` reused directly as small/
  body-sized foreground text failed WCAG AA on 5 of 10 theme bundles. Added an additive,
  per-bundle derived `--color-primary-text` token (darkened until it clears real AA contrast)
  and swapped it in at every real foreground call site, including a fill-swap fallback for the
  two bundles dark enough that no same-hue ink reaches AA; the other 5 passing bundles are
  completely untouched. Live-reverified with axe-core across every affected bundle and
  component on production, 0 violations.

### `[0.28.15]` -- 2026-09-23

#### Added

- **Final brand mark applied** (`.pHive/brand/`): applied the real, human-selected final logo
  (Brass Amber stacked lockup) to all 3 surfaces it had never actually reached -- the reference
  storefront's `icon.png`/`apple-icon.png` (replacing the original generic "M" monogram),
  `.pHive/brand/social-preview.png`, and `docs/assets/logo.png` -- live-verified post-deploy
  via byte-identical content-length/dimension/head-tag checks, not just a successful deploy.

### `[0.28.16]` -- 2026-10-07

#### Added

- **Integrations catalog & ecosystem gap audit**: published a real, code-verified
  `apps/docs/content-src/integrations.md` page (correcting 2 real drift findings along the way
  -- `adapter-shopify` is built but not wired into any live demo, and `adapter-convex`'s own
  epic row was stale), plus a 7-category research pass against real provider docs that
  recorded 3 new-epic-candidates for future pickup: `accounting-erp-sync-adapter`,
  `outbound-webhook-event-delivery`, and `second-payment-processor-adapter` (all three now
  shipped -- see `[0.32.0]` onward below).

### `[0.29.0]` -- 2026-10-07

#### Added

- **Shopify-to-native migration tool** (`@mercatus-liber/migrate-shopify`): a new package
  providing a one-time, cursor-paginated read of a live Shopify store's catalog/variants/
  collections/inventory and a dry-run-by-default, idempotent, resumable native-write path
  through this repo's own `CatalogService`/`MarketingCatalogService`/`InventoryAdapter`, plus a
  real CLI (`migrate-shopify --target sqlite|postgres --confirm`). Live-verified end-to-end
  against a real local fixture HTTP server standing in for Shopify; disclosed as not yet
  verified against a real Shopify account (no credentials available in this environment).

### `[0.29.1]` -- 2026-10-15

#### Added

- **Free-tier backend resilience & keep-alive**: added a narrow, verified-shape
  `backend-unreachable` detector rendering an honest "this demo may be asleep" state (with
  manual retry) instead of a raw 500 for Supabase-paused and MongoDB-unreachable errors
  specifically, recovered a real live Supabase outage affecting print-shop and northline, and
  shipped a daily GitHub Actions keep-alive/revival job (`.github/workflows/keepalive.yml`)
  that pings and, once 3 new repo secrets are added by a human, can call Supabase's real
  project-restore API.

### `[0.29.2]` -- 2026-10-15

#### Added

- **GitHub Wiki, docs-site reference section, and cross-linking**: stood up a real GitHub Wiki
  (Home/FAQ/Troubleshooting/Decisions-Log) and a new `apps/docs/content-src/sample-stores.md`
  reference page, then cross-linked every surface (README, docs-site navbar/footer, wiki) so
  each reaches every other in at most one click.

#### Fixed

- **Vercel deploy ignore + docs-site nav-link fixes**: fixed a real bug where the root
  `.vercelignore` excluded the entire `.pHive/` tree, 404ing every `/planning/<epic>` route in
  production, and fixed the docs site's `projectLink`/`docsRepositoryBase` pointing at a
  nonexistent GitHub org and branch (`mercatus-liber/mercatus-liber` on `main`, corrected to
  the real `mdostal/mercatus-liber` on `master`).

### `[0.30.0]` -- 2026-10-15

#### Added

- **Single-tenant mode & three independently-deployed sample stores**: added an env-gated
  (`SINGLE_TENANT_DEMO_SLUG`) single-tenant rewrite mode to `apps/reference-storefront`,
  byte-identical to existing behavior when unset, then deployed it to three brand-new, real,
  independently-addressable Vercel projects -- `mercatus-liber-print-shop`,
  `mercatus-liber-northline`, `mercatus-liber-broadleaf` -- the first time these demo stores
  have been reachable as genuinely separate sites rather than `/demo/<slug>` paths inside one
  shared deployment. A real Next.js 16 `middleware.ts` -> `proxy.ts` rename bug (hit mid-
  rollout) was found and fixed along the way.

### `[0.31.0]` -- 2026-10-15

#### Added

- **Structured shipping address threaded through fulfillment** (`@mercatus-liber/checkout-orders`,
  `@mercatus-liber/fulfillment`): added real, all-optional structured address fields to
  `ShippingInfo` (street/city/state/postal/country/phone) and a new `FulfillmentRecipient` type
  flowing through `OrderLookup`/`SubmitFulfillmentOrderInput` into
  `FulfillmentService.submitOrder` -- previously dead data now actually reaches whichever
  adapter an order routes to. Re-verified Printful's v2 webhook-signature format live
  (correcting the September research record) and added real address-mapping functions for both
  the Printful and Printify adapters.

### `[0.32.0]` -- 2026-10-18

#### Added

- **Outbound webhook event delivery** (`@mercatus-liber/webhooks`): a new package giving the
  previously purely in-process `EventBus` a real external-subscriber contract --
  HMAC-SHA256-signed HTTP delivery with bounded exponential-backoff retry and a full
  per-attempt delivery log, plus a Postgres-backed subscription/delivery-log store in
  `adapter-postgres`. Not yet wired into any live app, so no deploy was needed.

### `[0.33.0]` -- 2026-10-18

#### Added

- **Second payment processor: PayPal** (`@mercatus-liber/adapter-paypal`): a real
  `PaymentAdapter` implementation against PayPal's Orders v2 API (OAuth2 client-credentials,
  create/capture/get, remote webhook-signature verification), wired into
  `apps/reference-storefront` as a second option behind Stripe in the existing adapter
  priority chain. Dead code in production until PayPal credentials are configured -- no live
  demo has them yet, so no behavior changed and no deploy was triggered.

### `[0.34.0]` -- 2026-10-18

#### Added

- **Accounting/ERP order sync** (`@mercatus-liber/accounting-sync`,
  `@mercatus-liber/adapter-quickbooks`): a new `AccountingSyncAdapter` contract, triggered
  fire-and-forget off the real `checkout.order.paid` event, with a QuickBooks Online reference
  implementation (OAuth2 refresh-token rotation, `SalesReceipt` creation, signed webhooks).
  Registered only when `QUICKBOOKS_REALM_ID` is configured -- unregistered and behaviorally
  inert for every live demo today, so no deploy was triggered. Closes the last of the three
  new-epic-candidates `integrations-catalog-and-ecosystem-audit` recorded (`[0.28.16]`).

## 7. Completeness check -- every epic 67-85, exactly once

| # | id | # | id |
|---|---|---|---|
| 67 | `gap-audit-3-test-coverage` | 77 | `integrations-catalog-and-ecosystem-audit` |
| 68 | `gap-audit-3-storefront-view-edit` | 78 | `shopify-migration-import-tool` |
| 69 | `dependency-vulnerabilities-xmldom` | 79 | `free-tier-resilience-and-keepalive` |
| 70 | `gap-audit-3-bundle-variant-resolution` | 80 | `docs-wiki-examples-architecture` |
| 71 | `oss-community-health-files` | 81 | `separate-deployed-sample-stores` |
| 72 | `dependency-updates-minor-patch` | 82 | `dropship-merch-address-wiring` |
| 73 | `a11y-audit` | 83 | `outbound-webhook-event-delivery` |
| 74 | `ci-node-version-mismatch` | 84 | `second-payment-processor-adapter` |
| 75 | `brand-primary-foreground-contrast-audit` | 85 | `accounting-erp-sync-adapter` |
| 76 | `apply-final-logo` | | |

19 rows, 67-85 inclusive, each epic number and id appears exactly once (cross-checked against
`.pHive/planning/epic-backlog.md`'s own row numbers, `grep -noE '^\| [0-9]+ \|'`, which confirms
no duplicate/skipped row number exists in the source file itself either).

## 8. Live re-check: does anything now reference `package.json`'s version on a live surface?

Re-verified live, not copied from the original epic's own earlier conclusion (which found
nothing, back when `apps/reference-storefront` still had a code-generated `app/icon.tsx`):

- `grep -rn "packageJson\|pkg\.version\|process\.env\.npm_package_version" apps/reference-storefront apps/docs` -- **zero matches**.
- `grep -rn "0\.28\.\|0\.6\.1"` across both apps -- **zero matches** (no hardcoded
  version-shaped literal anywhere).
- `app/(landing)/architecture/page.tsx` and `lib/adapter-info.ts` -- grepped directly for
  `version` (case-insensitive) -- **zero matches**.
- `app/icon.tsx` -- **no longer exists**. Epic 76 (`apply-final-logo`, `[0.28.15]` above)
  replaced it with static `app/icon.png`/`app/apple-icon.png` files -- confirmed via
  `find apps/reference-storefront -name "icon.tsx" -o -name "icon.png"`, which returns only
  `icon.png`. A static image file cannot reference `package.json`'s version field by
  construction, so this surface is if anything *more* clearly clean than before, not less.

**Conclusion: no deploy is needed.** Nothing on any live surface in `apps/reference-storefront`
or `apps/docs` renders `package.json`'s version field today, confirmed by direct re-grep
against the current codebase (not assumed from the original epic's earlier, now-stale
finding). This is re-confirmed a second time in story `cvr2-03`'s own closeout, per this
project's own stated preference for verifying rather than assuming.

## 9. Explicitly out of scope for this story (deferred to cvr2-02/cvr2-03)

- `CHANGELOG.md` itself is not edited by this story -- §6 above is the full, ready-to-transcribe
  content for story 2.
- `package.json`'s `"version"` field is not edited by this story -- `0.34.0` (§5) is the value
  story 2 should set it to.
- `.pHive/planning/epic-backlog.md` is not edited by this story or by this epic at all --
  per this run's own explicit orchestrator instruction, the orchestrator adds the backlog row
  centrally afterward (a deliberate departure from the original epic's own cvr-03, which added
  its own row itself).
