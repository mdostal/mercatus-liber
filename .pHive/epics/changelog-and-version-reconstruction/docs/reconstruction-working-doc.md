# Reconstruction working doc: epics 26-65 -> CHANGELOG.md / package.json version

Story `cvr-01-research-and-reconstruction`'s entire output. Story `cvr-02` transcribes this
into `CHANGELOG.md`/`package.json` -- it should not need to re-research anything here.

**Zero application code touched to produce this doc.** Only `.pHive/planning/epic-backlog.md`
(read, not edited), `.pHive/epics/*/epic.yaml` (read), `CHANGELOG.md` (read, not edited), and
`package.json` (read, not edited) were consulted.

## 0. Scope correction applied

The story spec says "rows 26-64" (39 epics). Per explicit instruction for this run, the range
is extended to **rows 26-65 (40 epics)**: row 65, `bundles-recommendations-demo-scoping`,
landed on `.pHive/planning/epic-backlog.md` *after* this epic's own planning commit
(`4e49a51`), confirmed by `git log --all -- ".pHive/epics/bundles-recommendations-demo-scoping"`
returning zero commits and no directory existing anywhere in `.pHive/epics/`. It is a real,
small, patch-shaped fix epic -- direct follow-up to row 64's own disclosed finding, same
bug class/shape as epic 17 `commerce-gap-audit`'s on-record `patch` precedent -- so it is
included here with the same rigor as every other row, not appended as an afterthought.

## 1. Baseline and precedent, re-confirmed live (not trusted from the design discussion)

- `package.json`: `"version": "0.6.1"` (`grep -n '"version"' package.json`, confirmed).
- `CHANGELOG.md`: 6 entries, `[0.2.0]` through `[0.6.1]`, all `Added`/one `Changed`, no
  `Fixed`/`Security` category used yet. Bullet voice: **bold feature name**
  (`` `package-name` ``, subsystem N when one exists), 1-3 real sentences.
- `.pHive/epics/commerce-gap-audit/epic.yaml`: `version_bump: patch` -- the audit/bug-fix-epic
  precedent cited throughout this doc for categorizing the 15 no-`epic.yaml` epics below.

## 2. The 25 epics with a real `epic.yaml` `version_bump` -- re-grepped live

`grep -E '^(name|version_bump):' .pHive/epics/*/epic.yaml`, read directly, not from memory.
All 25 match design-discussion.md §3a's table exactly:

| Epic | id | `version_bump` |
|---|---|---|
| 27 | `admin-auth-clerk` | minor |
| 28 | `cms-admin-crud` | patch |
| 29 | `cms-adapter-discoverability` | patch |
| 30 | `create-store-skill` | none |
| 31 | `commerce-landing-and-demo-routing` | minor |
| 32 | `storefront-visual-redesign` | patch |
| 33 | `docs-site` | minor |
| 34 | `storefront-design-system-v2` | minor |
| 35 | `demo-store-northline-depth` | minor |
| 36 | `demo-store-print-shop-rebrand` | minor |
| 37 | `demo-store-plant-shop` | minor |
| 38 | `docs-feature-deep-dive` | minor |
| 39 | `data-backup-restore-and-adapter-portability` | minor |
| 41 | `fulfillment-routing` | minor |
| 42 | `adapter-printful` | minor |
| 43 | `adapter-printify` | minor |
| 44 | `shipping-rate-and-labels` | minor |
| 45 | `seo-aeo-infrastructure` | minor |
| 46 | `analytics-insights-and-import-adapters` | minor |
| 47 | `vision-and-community-roadmap` | patch |
| 55 | `framework-brand-system` | none |
| 57 | `per-demo-backend-diversity` | minor |
| 58 | `full-commerce-persistence-audit` | minor |
| 59 | `sanity-challenge-commerce-copilot` | none |
| 63 | `product-configurator` | none |

## 3. The 15 epics with no `epic.yaml` -- inferred `version_bump`, each with cited evidence

**15, not 14** -- design-discussion.md §3b's list of 14 (26, 40, 48, 49, 50, 51, 52, 53, 54,
56, 60, 61, 62, 64) plus row 65 (`bundles-recommendations-demo-scoping`, the scope-correction
epic, confirmed via `git log --all -- ".pHive/epics/bundles-recommendations-demo-scoping"`
returning zero commits). For epics 26 and 64, `.pHive/epics/<name>/` *does* exist as a
directory (with a `docs/` subfolder each) -- design-discussion.md §3b's "no directory at all"
phrasing is slightly imprecise for these two -- but neither has an `epic.yaml`, confirmed by
`git log --all --oneline -- ".pHive/epics/commerce-gap-audit-2/epic.yaml"
".pHive/epics/commerce-gap-audit-3/epic.yaml"` returning zero commits for both. The
mechanical fact this story depends on (no recorded `version_bump` field) holds for all 15.

Convention applied throughout (per design-discussion.md §3b): new subsystem/package = minor;
a small settings/admin surface, a live bug fix, or a fix-only audit epic = patch (epic 17
`commerce-gap-audit` precedent); a pure-docs/research/verification epic with zero shipped
code = none.

| Epic | id | Inferred `version_bump` | Evidence |
|---|---|---|---|
| 26 | `commerce-gap-audit-2` | **patch** | epic-backlog.md row 26: "every real finding was either already correctly disclosed... or small enough to fix directly (page-view/impression tracking..., a real integration test proving bundles+promotions compose, one missing analytics event mapping..." -- real shipped fixes, no new subsystem. Commit `88e8f7b` ("[gap-audit-2-quick-fixes] page-view/impression tracking, bundles+promotions test, analytics event mapping, CHANGELOG+version bump"). Same audit-epic shape as epic 17 (`patch` precedent). |
| 40 | `commerce-feature-parity-research` | **none** | epic-backlog.md row 40, verbatim: "Research-only epic -- done, findings folded into epics 45-47 below plus the long-term community roadmap (epic 47)." Zero shipped code anywhere in the row text. |
| 48 | `demo-seed-idempotency` | **patch** | epic-backlog.md row 48: real crash fix (`SQLITE_CONSTRAINT_UNIQUE` on restart against persisted storage), commits `d9fb6ba` (print-shop), `8832114` (northline), `25df6f8` (broadleaf) named directly in the row. Live bug fix, no new package -- matches the epic-17 `patch` convention. |
| 49 | `bare-basics-reviews` | **minor** | epic-backlog.md row 49: "New subsystem `@mercatus-liber/reviews`..." Confirmed real test files cited in the row's own 2026-09-22 correction: `packages/reviews/test/reviews.test.ts`, `packages/adapter-postgres/test/reviews.test.ts`, `apps/reference-storefront/test/reviews.test.ts`. New subsystem = minor. |
| 50 | `storefront-views-and-multi-catalog` | **minor** | epic-backlog.md row 50: "`packages/storefront-views` already exists as a genuine new first-class subsystem." New subsystem = minor. |
| 51 | `ims-postgres-alternate` | **minor** | epic-backlog.md row 51: "`@mercatus-liber/adapter-postgres-inventory`... shipped with 9 tests." New adapter package, same shape as `adapter-shopify`/`adapter-postgres`/`adapter-printful` (all on-record `minor` in §2 above). |
| 52 | `adapter-mongodb` | **minor** | epic-backlog.md row 52: "built, tested, wired into `services.ts`'s adapter-priority chain... 13 tests against a fake DB double." New adapter package, same precedent as 51. |
| 53 | `adapter-convex` | **minor** | epic-backlog.md row 53: "built, tested, wired into `services.ts`'s adapter-priority chain... ships real Convex function source." New adapter package, same precedent as 51/52. |
| 54 | `per-store-landing-and-onboarding` | **patch** | epic-backlog.md row 54: a single new `/start` app route (admin login path, live promo code, adapter-status table, curated links) -- no new `packages/*` subsystem. Same shape as epic 25 `admin-adapter-visibility-settings` (on-record `patch`): "no new `packages/*` subsystem... a small hand-maintained descriptor," an app-level settings/orientation surface, not a domain capability. |
| 56 | `real-provider-verification` | **patch** | epic-backlog.md row 56: not a build epic by its own framing, but it shipped real code fixes -- the Sanity `marketingMetaDocId()` collision fix (commit `7af6abe`) and the Clerk `/admin` regression fix (`apps/reference-storefront/lib/clerk-env-check.ts`, a new unit-tested runtime guard wired into `middleware.ts`, plus corrected READMEs). Live bug fixes, no new package -- epic-17 `patch` convention. |
| 60 | `cms-demo-scoping-and-nav-cleanup` | **patch** | epic-backlog.md row 60: a real, live, user-reported cross-demo data-bleed bug fix (`demoSlug` threaded through `packages/cms`/`packages/adapter-sanity`, live Sanity cleanup 209->13 page docs). No new subsystem -- an additive field on an existing one plus a live data fix. Matches the epic-17 `patch` convention for a bug-fix epic. |
| 61 | `marketing-catalog-demo-scoping` | **patch** | epic-backlog.md row 61: direct follow-up to row 60's own disclosed finding, identical `demoSlug` bug-fix pattern applied to `packages/marketing-catalog` across all 4 adapters. Same shape, `patch`. |
| 62 | `checkout-order-paid-crash` | **patch** | epic-backlog.md row 62: a real production-500 crash fix in `packages/adapter-postgres-inventory` (untyped-parameter SQL operator ambiguity), root-caused via stack trace, fixed with an explicit type cast, new real-Postgres integration test added. Live bug fix, `patch`. |
| 64 | `commerce-gap-audit-3` | **patch** | epic-backlog.md row 64: explicitly the same methodology as epic 17/26 ("round-3 gap audit following the same methodology as epics 17/26"), 5 real live production bugs fixed. This is the epic that makes the epic-17 `patch` precedent for "a fix-only audit epic" most directly applicable of any epic in range. |
| 65 | `bundles-recommendations-demo-scoping` | **patch** | epic-backlog.md row 65: "direct follow-up to row 64's own disclosed new-epic-candidate," identical `demoSlug` bug-fix pattern applied to `packages/bundles`/`packages/recommendations`. Same shape as 60/61/62/64, `patch`. |

## 4. `version_bump: none` epics -- fold-forward resolution (design-discussion.md §3c)

5 epics resolve to `none` in range 26-65 -- the 4 named in design-discussion.md §3c (30, 55,
59, 63) plus 40 (`commerce-feature-parity-research`, inferred above, same "zero shipped code"
shape). Each still gets a real `CHANGELOG.md` entry; each folds under the **next** epic in
number order that carries a real bump (none of the 5 is last-in-range, so none needs the
backward-fold fallback):

| `none`-bump epic | Folds under | Folded-under version |
|---|---|---|
| 30 `create-store-skill` | 31 `commerce-landing-and-demo-routing` | `[0.8.0]` |
| 40 `commerce-feature-parity-research` | 41 `fulfillment-routing` | `[0.16.0]` |
| 55 `framework-brand-system` | 56 `real-provider-verification` | `[0.26.2]` |
| 59 `sanity-challenge-commerce-copilot` | 60 `cms-demo-scoping-and-nav-cleanup` | `[0.28.1]` |
| 63 `product-configurator` | 64 `commerce-gap-audit-3` | `[0.28.4]` |

## 5. Epic 27 categorization call: `### Security`, made explicitly

`admin-auth-clerk` (epic 27) is categorized under **`### Security`**, not `### Added`, despite
also shipping a new subsystem (`@mercatus-liber/admin-auth` + `@mercatus-liber/adapter-clerk`).
Reasoning: the epic's own row text is unambiguous that this closed "a genuine,
live-exploitable gap... `/admin` had zero authentication anywhere in the repo... on a real
public deployment (`demo-shop.mdostal.com`'s `/admin` was fully open, full CRUD, no gate)."
This is a textbook authentication-bypass vulnerability -- exactly the class of finding
Keep-a-Changelog's `Security` category exists for -- not merely a new admin capability. `###
Added` would bury the security-relevant nature of the fix under a generic "new feature"
framing a reader scanning for security-relevant history would miss.

## 6. Epic 64/65 categorization call: `### Fixed`, not `### Security` -- made explicitly

Epics 64 (`commerce-gap-audit-3`) and 65 (`bundles-recommendations-demo-scoping`) are both
categorized under **`### Fixed`**, after deliberately considering `### Security` for the
cross-demo data-bleed angle (coupon codes, ad content, service areas, and admin bundle/
recommendation lists all leaking across demo-tenant boundaries on a shared Postgres backend).
Reasoning for `Fixed` over `Security`: this is a shared-backend data-isolation/correctness bug
that affected every visitor automatically and identically -- no attacker action, exploit, or
privilege escalation was required, and no confidential data was exposed to an unauthorized
*separate* party (all 3 demo stores belong to the same single operator; this is a reference
framework's own showcase deployment, not a multi-tenant SaaS with distinct paying customers
whose data must stay confidential from one another). That is a materially different shape
from epic 27's genuine authentication-bypass vulnerability, which is why 27 gets `Security`
and 64/65 do not. `Fixed` is still the correct, standard Keep-a-Changelog category for "a bug
was found and corrected," which is exactly what happened five times over (60, 61, 62, 64, 65).

## 7. Full version sequence, epic-by-epic, starting from `0.6.1`

Computed by walking epics 26-65 in strict number order, applying each epic's resolved bump
(`none`-bump epics contribute no step of their own -- they're folded into the next real-bump
epic's header per §4). Minor bump: increment MINOR, reset PATCH to 0. Patch bump: increment
PATCH only.

| Epic | id | bump (source) | Version header |
|---|---|---|---|
| 26 | `commerce-gap-audit-2` | patch (inferred) | `[0.6.2]` |
| 27 | `admin-auth-clerk` | minor (epic.yaml) | `[0.7.0]` |
| 28 | `cms-admin-crud` | patch (epic.yaml) | `[0.7.1]` |
| 29 | `cms-adapter-discoverability` | patch (epic.yaml) | `[0.7.2]` |
| 30 | `create-store-skill` | none (epic.yaml) | folds into `[0.8.0]` (epic 31) |
| 31 | `commerce-landing-and-demo-routing` | minor (epic.yaml) | `[0.8.0]` |
| 32 | `storefront-visual-redesign` | patch (epic.yaml) | `[0.8.1]` |
| 33 | `docs-site` | minor (epic.yaml) | `[0.9.0]` |
| 34 | `storefront-design-system-v2` | minor (epic.yaml) | `[0.10.0]` |
| 35 | `demo-store-northline-depth` | minor (epic.yaml) | `[0.11.0]` |
| 36 | `demo-store-print-shop-rebrand` | minor (epic.yaml) | `[0.12.0]` |
| 37 | `demo-store-plant-shop` | minor (epic.yaml) | `[0.13.0]` |
| 38 | `docs-feature-deep-dive` | minor (epic.yaml) | `[0.14.0]` |
| 39 | `data-backup-restore-and-adapter-portability` | minor (epic.yaml) | `[0.15.0]` |
| 40 | `commerce-feature-parity-research` | none (inferred) | folds into `[0.16.0]` (epic 41) |
| 41 | `fulfillment-routing` | minor (epic.yaml) | `[0.16.0]` |
| 42 | `adapter-printful` | minor (epic.yaml) | `[0.17.0]` |
| 43 | `adapter-printify` | minor (epic.yaml) | `[0.18.0]` |
| 44 | `shipping-rate-and-labels` | minor (epic.yaml) | `[0.19.0]` |
| 45 | `seo-aeo-infrastructure` | minor (epic.yaml) | `[0.20.0]` |
| 46 | `analytics-insights-and-import-adapters` | minor (epic.yaml) | `[0.21.0]` |
| 47 | `vision-and-community-roadmap` | patch (epic.yaml) | `[0.21.1]` |
| 48 | `demo-seed-idempotency` | patch (inferred) | `[0.21.2]` |
| 49 | `bare-basics-reviews` | minor (inferred) | `[0.22.0]` |
| 50 | `storefront-views-and-multi-catalog` | minor (inferred) | `[0.23.0]` |
| 51 | `ims-postgres-alternate` | minor (inferred) | `[0.24.0]` |
| 52 | `adapter-mongodb` | minor (inferred) | `[0.25.0]` |
| 53 | `adapter-convex` | minor (inferred) | `[0.26.0]` |
| 54 | `per-store-landing-and-onboarding` | patch (inferred) | `[0.26.1]` |
| 55 | `framework-brand-system` | none (epic.yaml) | folds into `[0.26.2]` (epic 56) |
| 56 | `real-provider-verification` | patch (inferred) | `[0.26.2]` |
| 57 | `per-demo-backend-diversity` | minor (epic.yaml) | `[0.27.0]` |
| 58 | `full-commerce-persistence-audit` | minor (epic.yaml) | `[0.28.0]` |
| 59 | `sanity-challenge-commerce-copilot` | none (epic.yaml) | folds into `[0.28.1]` (epic 60) |
| 60 | `cms-demo-scoping-and-nav-cleanup` | patch (inferred) | `[0.28.1]` |
| 61 | `marketing-catalog-demo-scoping` | patch (inferred) | `[0.28.2]` |
| 62 | `checkout-order-paid-crash` | patch (inferred) | `[0.28.3]` |
| 63 | `product-configurator` | none (epic.yaml) | folds into `[0.28.4]` (epic 64) |
| 64 | `commerce-gap-audit-3` | patch (inferred) | `[0.28.4]` |
| 65 | `bundles-recommendations-demo-scoping` | patch (inferred) | `[0.28.5]` |

**Sequence check:** 40 target epics, 35 own a version header (40 minus the 5 `none`-bump
epics), all headers strictly increasing, zero duplicates, zero gaps in epic-number coverage
(26 through 65 inclusive, verified against §9's table below). **Final version: `[0.28.5]`**,
landed by epic 65. This is what `package.json`'s `"version"` field should become in story 2.

Best-evidence dates for each header (from epic-backlog.md's own "Added YYYY-MM-DD" line per
epic -- these are epic-creation dates, the best real evidence available, not necessarily exact
ship dates; story 2 should treat them as a reasonable placeholder, same posture as the existing
6 entries, which are all dated 2026-09-08 regardless of within-day ordering):

`0.6.2`/`0.7.0`/`0.7.1`/`0.7.2` = 2026-09-08 · `0.8.0`..`0.15.0` = 2026-09-09 ·
`0.16.0`..`0.21.2` = 2026-09-09 · `0.22.0`..`0.26.1` = 2026-09-11 · `0.26.2` = 2026-09-11 ·
`0.27.0`/`0.28.0` = 2026-09-16 · `0.28.1` = 2026-09-19/22 (epic 59 dated 09-19, epic 60 dated
09-22 -- use epic 60's real-bump date, 2026-09-22, since that's the epic the header belongs
to) · `0.28.2`..`0.28.5` = 2026-09-22.

## 8. Drafted changelog entries, in final version order

Each entry below is ready to transcribe verbatim into `CHANGELOG.md` by story 2. Folded
`none`-bump epics appear as their own bullet under the version they fold into, explicitly
labeled.

### `[0.6.2]` -- 2026-09-08

#### Fixed

- **Gap-audit-2 quick fixes** (repo-wide): closed three small, real gaps found by a second
  cross-subsystem audit mirroring epic 17's own methodology -- added page-view/impression
  tracking on surfaces that didn't exist when the first audit ran, added a real integration
  test proving `bundles` and `promotions` compose correctly together, and fixed one missing
  analytics event mapping. This same pass authored this repository's first `CHANGELOG.md`
  (covering epics 20-25).

### `[0.7.0]` -- 2026-09-08

#### Security

- **Admin authentication & authorization** (`@mercatus-liber/admin-auth`,
  `@mercatus-liber/adapter-clerk`, subsystem 21): closed a genuine, live-exploitable gap --
  `/admin` had zero authentication anywhere in the repo, fully open CRUD on a real public
  deployment. A new swappable `AdminAuthAdapter` contract ships a zero-infra local-dev default
  and a production-grade Clerk-backed implementation, with a three-role model
  (owner/admin/viewer) resolved via a pure `hasPermission` check against Clerk's own
  `publicMetadata`, enforced two-layered via root `middleware.ts` (authentication) and a
  `requireAdminPermission` guard on every admin mutation (authorization).

### `[0.7.1]` -- 2026-09-08

#### Added

- **CMS page authoring UI** (`@mercatus-liber/cms`): closed a real gap where
  `CmsService.createPage`/`createMarketingPage` already worked but no admin UI or MCP action
  could call them. Added `/admin/cms/new`, `/admin/cms/marketing/new`, and an edit/publish flow
  at `/admin/cms/[id]`, plus a new `"create"` action on the `manage_cms_page` MCP tool, gated
  by the same `requireAdminPermission("mutate")` guard every other admin mutation carries.

### `[0.7.2]` -- 2026-09-08

#### Fixed

- **Sanity CMS adapter wiring** (`@mercatus-liber/adapter-sanity`): fixed a discoverability gap
  where the real, already-tested Sanity CMS adapter (epic 18) was never actually constructed --
  `services.ts` was hardcoded to the in-memory adapter with zero env-var branch. Wired
  `SANITY_PROJECT_ID`/`SANITY_DATASET`/`SANITY_TOKEN` into the standard
  env-var-truthy-picks-the-real-adapter pattern and fixed a stale `/admin/settings` status
  string.

### `[0.8.0]` -- 2026-09-09

#### Added

- **Demo-agnostic landing page & multi-tenant demo routing**: `commerce.mdostal.com`'s root now
  serves a real framework landing page instead of defaulting into one hardcoded demo. Every
  shopper- and admin-facing route moved under `app/demo/[demoSlug]/...`, `lib/services.ts`
  became a per-demo `Map`-keyed service-graph registry, and every cart/session cookie is now
  demo-namespaced so one browser session holds independent state per demo simultaneously.
- **`create-store` scaffolder docs and skill** (`@mercatus-liber/create-store`, epic 30 --
  `version_bump: none`, folded here per §4): a corrected, code-verified README and a new
  `.claude/skills/create-store/SKILL.md` agent-facing procedure for provisioning a new store
  from this monorepo, closeout-verified end to end against a real throwaway scaffold.

### `[0.8.1]` -- 2026-09-09

#### Changed

- **Storefront token & copy refinement** (`@mercatus-liber/theming`): expanded the theme-token
  vocabulary (`--color-muted`, `--color-border`, a 4-step spacing scale, a type scale,
  `--shadow-card`) and refined the default `classic` bundle into a warm ivory/near-black serif
  palette, plus a copy pass removing framework-pitch language that had leaked into the
  dragon-merch demo's own storefront copy.

### `[0.9.0]` -- 2026-09-09

#### Added

- **Documentation site** (`apps/docs`): a real, from-scratch Nextra documentation site with a
  build-time content-sync script pulling `README.md`, `docs/ARCHITECTURE.md`, and every
  `docs/subsystems/*.md` file into the published site, plus hand-authored landing/
  getting-started pages. Deployed live as its own Vercel project.

### `[0.10.0]` -- 2026-09-09

#### Added

- **Structurally distinct storefront templates** (`@mercatus-liber/theming`): registered real
  competing `LayoutTemplate`s for nav/home/category/cart (previously one hardcoded layout
  each) and three new theme bundles (`editorial`/`maximalist`/`datasheet`) sourced from
  independently-designed HTML artifacts, giving 3 of 10 bundles genuinely different
  component-level markup, not just token values, while the other 7 remain byte-for-byte
  unchanged.

### `[0.11.0]` -- 2026-09-09

#### Changed

- **Northline Home Tech depth pass**: replaced Northline's single catch-all service category
  with 4 real categories, added tiered SKUs for camera and home-theater installs, published a
  real CMS location page for all 8 service areas, and gave every demo's nav real server-built
  `navLinks` (categories, service areas, published campaigns) in place of hardcoded links.

### `[0.12.0]` -- 2026-09-09

#### Changed

- **"The Print Shop" demo rebrand**: renamed `dragon-merch` to `print-shop` and replaced its
  catalog with a real embroidery/custom-print business across 4 categories and 8 products,
  adding an additive, optional `customizationNote` field threaded end-to-end from PDP
  personalization input through to the persisted order line.

### `[0.13.0]` -- 2026-09-09

#### Added

- **Broadleaf & Co. demo store**: a brand-new third demo store -- an artisan/handmade-goods
  marketplace with 9 real products across 4 categories (Plants, Ceramics & Planters, Textiles &
  Fiber Arts, Paper & Ephemera), including a tiered-variant product (3 real pot-size SKUs).

### `[0.14.0]` -- 2026-09-09

#### Added

- **Feature deep-dive documentation** (`apps/docs`): 8 real narrative deep-dive pages with code
  snippets pulled directly from the packages they document (Commerce Core, Theming, CMS &
  Marketing, Admin & Access Control, Promotions & Merchandising, BI & Analytics, Plugins &
  AI/Agent Interface, Adapters & Portability), plus a planning-index page publishing every
  epic's own real design-discussion reasoning, not just conclusions.

### `[0.15.0]` -- 2026-09-09

#### Added

- **Catalog persistence, backup, and restore** (`@mercatus-liber/adapter-sqlite`): gave the
  reference storefront's catalog persistence the same env-var-truthy adapter-selection pattern
  every other subsystem already had (`DATABASE_URL` -> Postgres, `SQLITE_FILE_PATH` -> durable
  file-backed SQLite, else ephemeral in-memory), plus a real backup/restore CLI built on
  better-sqlite3's native Online Backup API.

### `[0.16.0]` -- 2026-09-09

#### Added

- **Order fulfillment routing** (`@mercatus-liber/fulfillment`, subsystem 22): a new
  `FulfillmentAdapter` contract and `FulfillmentRoutingRepository`, plus a zero-infra
  manual-fulfillment default modeling this repo's prior implicit self-fulfillment behavior.
  `/admin/orders` now shows each line's routed provider, status, and tracking, with new
  `submitOrderForFulfillmentAction`/`markFulfillmentLineShippedAction` mutations.
- **Commerce feature-parity research** (epic 40 -- `version_bump: none`, folded here per §4):
  a research-only squad surveyed Shopify/BigCommerce/WooCommerce-class platform capabilities
  (app ecosystems, tracking, SEO, subscriptions/loyalty, marketing tools); findings folded
  directly into epics 45-47.

### `[0.17.0]` -- 2026-09-09

#### Added

- **Printful fulfillment adapter** (`@mercatus-liber/adapter-printful`): a real wrapper
  implementing `FulfillmentAdapter` against Printful's v1/v2 APIs (draft-then-confirm order
  lifecycle, mockup generation, fail-closed webhook handling pending a confirmed signature
  scheme), wired into `services.ts` via a `PRINTFUL_API_TOKEN` env-var branch alongside the
  always-registered manual default.

### `[0.18.0]` -- 2026-09-09

#### Added

- **Printify fulfillment adapter** (`@mercatus-liber/adapter-printify`): a second,
  marketplace-model POD provider implementing `FulfillmentAdapter` against Printify's v1 order
  API, with confirmed HMAC-SHA256 webhook verification (unlike Printful's unconfirmable
  signature scheme), wired in additively alongside manual and Printful.

### `[0.19.0]` -- 2026-09-09

#### Added

- **Shipping rates & labels** (`@mercatus-liber/shipping`, `@mercatus-liber/adapter-shippo`,
  subsystem 23): a new `ShippingAdapter` contract with a documented manual-workflow default
  (Pirate Ship publishes no public API) and a real Shippo-backed implementation for rate
  shopping, label purchase, and tracking lookup.

### `[0.20.0]` -- 2026-09-09

#### Added

- **SEO & AEO infrastructure**: real per-page `generateMetadata` (PDP/category/search/home), a
  live-queried `app/sitemap.ts` and `app/robots.ts`, `Product`/`Organization`/`WebSite`/
  `BreadcrumbList` JSON-LD, a real `llms.txt` following the `llmstxt.org` convention, and an
  `FAQPage` block on the landing page -- replacing a prior state where every route shared one
  static "Shop" title.

### `[0.21.0]` -- 2026-09-09

#### Added

- **Analytics insights import** (`@mercatus-liber/analytics`): a new
  `AnalyticsInsightsAdapter` contract sibling to the existing write-only adapter, with real
  PostHog Query API and GA4 Data API implementations surfaced as a "Traffic & Sources" section
  on `/admin/metrics`, each independently gated on its own configuration.

### `[0.21.1]` -- 2026-09-09

#### Added

- **VISION.md & community roadmap**: a real `VISION.md` plus a public roadmap/checklist page on
  the docs site stating plainly what's done, in progress, and explicitly wanted as free
  community-contributed plugins (reviews/UGC at the time, wishlist, gift cards, subscriptions,
  loyalty, i18n, RMA, and more), publishing the project's own design-discussion corpus
  alongside it.

### `[0.21.2]` -- 2026-09-09

#### Fixed

- **Demo seed idempotency crash fix**: fixed a real `SQLITE_CONSTRAINT_UNIQUE` crash that
  permanently bricked a demo for the rest of a process's life on any restart against persisted
  storage, since seed functions always called `createProduct` unconditionally. A new
  check-by-slug-before-create helper (`idempotent-seed.ts`) is now wired into every
  product/category creation call site across all 3 demos.

### `[0.22.0]` -- 2026-09-11

#### Added

- **Product reviews & ratings** (`@mercatus-liber/reviews`, subsystem 24): a new subsystem with
  a real moderation queue -- submitted reviews start `"pending"` and can never leak onto a live
  PDP until published -- a live-computed rating summary, a shopper-facing submission form, and
  an admin moderation UI at `/admin/reviews`.

### `[0.23.0]` -- 2026-09-11

#### Added

- **Storefront views** (`@mercatus-liber/storefront-views`, subsystem 25): a new first-class
  subsystem for curated, addressable storefront "views" -- a category/product subset with its
  own branding/theme/route and an optional time-boxed homepage-takeover mechanic --
  demonstrated with 3 genuinely different real examples across the 3 demo stores.

### `[0.24.0]` -- 2026-09-11

#### Added

- **Postgres inventory adapter** (`@mercatus-liber/adapter-postgres-inventory`): a second, real
  `InventoryAdapter` implementation backed by Postgres (reusing the same `DATABASE_URL`
  infrastructure catalog persistence already uses), proving the inventory subsystem is
  genuinely swappable rather than single-implementation.

### `[0.25.0]` -- 2026-09-11

#### Added

- **MongoDB catalog adapter** (`@mercatus-liber/adapter-mongodb`): a `CatalogPersistenceAdapter`
  implementation backed by MongoDB's document-store model, wired into `services.ts`'s
  adapter-priority chain, proving a genuinely different persistence paradigm from the existing
  relational adapters.

### `[0.26.0]` -- 2026-09-11

#### Added

- **Convex catalog adapter** (`@mercatus-liber/adapter-convex`): a `CatalogPersistenceAdapter`
  implementation backed by Convex's real-time reactive backend, the furthest-paradigm alternate
  offered, shipping real Convex function source for deployment to a user's own project.

### `[0.26.1]` -- 2026-09-11

#### Added

- **Per-demo start/onboarding page**: a real `/start` orientation page per demo store covering
  the admin login path, a live promo code pulled from `PromotionsService`, a link to
  `/admin/metrics`, and a curated rundown of which adapters/subsystems that store demonstrates.

### `[0.26.2]` -- 2026-09-11 (or later, see §7)

#### Fixed

- **Live-provider verification fixes**: flipped Supabase/Postgres, PostHog, and Sanity from
  disclosed-unverified to live-verified in production, fixing a real Sanity `_id`-collision bug
  between marketing-page-meta and page documents (`marketingMetaDocId()` prefix) along the way,
  and root-caused and fixed a Clerk `/admin` regression traced to this repo's own README
  documenting a non-existent, wrong publishable-key env var name, adding a defensive runtime
  guard (`clerk-env-check.ts`) against recurrence.

#### Added

- **Framework brand system** (`.pHive/brand/brand-system.yaml`, epic 55 -- `version_bump: none`,
  folded here per §4): a real token system (Ledger Indigo primary, Garnet accent, Public Sans +
  JetBrains Mono type) applied to the framework landing page, the docs site, and a generated
  favicon -- audited first against all 6 existing storefront themes to guarantee zero
  palette/font collision, with zero cross-bleed into any of the 3 demo stores' own independent
  themes.

### `[0.27.0]` -- 2026-09-16

#### Added

- **Per-demo backend diversity**: real per-demo persistence-backend resolution
  (`resolveDemoPersistenceEnv`, an override tier of `DATABASE_URL`/`MONGODB_URL`/`CONVEX_URL`/
  `SQLITE_FILE_PATH`) plus real category persistence built for all 4 adapter packages, letting
  each demo store run on a genuinely different live backend simultaneously (print-shop on
  Postgres, Broadleaf & Co. on Convex).

### `[0.28.0]` -- 2026-09-16

#### Added

- **Full commerce persistence audit**: real Postgres persistence shipped for all 13 remaining
  subsystems that had been unconditionally in-memory-only (cart, orders, customer accounts,
  promotions, reviews, storefront-views, bundles, recommendations, advertising, service-areas,
  the BI event log, fulfillment routing), plus a new first-class `Catalog` entity and an
  owner-only, per-demo-scoped `reset-demo-data` admin action.

### `[0.28.1]` -- 2026-09-22

#### Added

- **Sanity-powered AI commerce copilot** (`apps/reference-storefront/lib/copilot/`, epic 59 --
  `version_bump: none`, folded here per §4): a real Anthropic-SDK tool-calling loop plus a
  Sanity Context MCP client with `propose_options`/`apply_option` admin mutations, surfaced at
  `admin/copilot`, alongside a new schema-typed CMS section editor and a `content-layout`
  dashboard connecting CMS content to per-page-type layout templates for the first time.

#### Fixed

- **CMS demo-scoping fix**: fixed a real live bug where every demo's nav/sitemap/admin-CMS-list
  showed every OTHER demo's marketing/location pages, since `PageRepository.list()` had no
  demo-scoping concept at all. Added an additive `demoSlug` field threaded through
  `packages/cms` and `packages/adapter-sanity`, and cleaned up 209 duplicate live Sanity page
  documents down to the real 13.

### `[0.28.2]` -- 2026-09-22

#### Fixed

- **Marketing-catalog demo-scoping fix**: fixed a real live bug where print-shop's and
  Northline's shared Postgres `categories` table had no demo-scoping, so each demo's nav showed
  the other's top-level categories mixed in. Added the same additive `demoSlug` pattern epic 60
  established, threaded through all 4 real adapter implementations (Postgres/SQLite/
  MongoDB/Convex).

### `[0.28.3]` -- 2026-09-22

#### Fixed

- **Checkout order-paid crash fix** (`@mercatus-liber/adapter-postgres-inventory`): fixed a
  real production 500 on every paid order against Postgres-backed inventory -- an
  untyped-parameter unary-minus in raw SQL (`-$2`) that Postgres's operator resolver couldn't
  disambiguate (`operator is not unique: - unknown`). Added a real-Postgres integration test
  suite, since a mocked pool double could never have caught this.

### `[0.28.4]` -- 2026-09-22

#### Added

- **Multi-axis product configurator** (epic 63 -- `version_bump: none`, folded here per §4): a
  real, live, interactive variant picker for multi-attribute products -- one `<select>` per
  identifying attribute, progressively enhanced with a `<noscript>` fallback -- wired into all
  3 PDP templates and backed by a new admin SKU-matrix/add-combination surface, demonstrated
  with a real 2-axis (color x size) product.

#### Fixed

- **Round-3 gap audit: cross-demo data bleed fixes**: found and fixed 5 real, high-priority
  live production bugs, all the same shared-Postgres-with-zero-demo-scoping class epics 60/61
  had already fixed twice -- advertising campaigns, promotion/coupon codes, and service areas
  all lacked demo-scoping (one demo's coupon code was genuinely redeemable at another's
  checkout), `catalog.listProducts()` submitted cross-demo URLs to `/sitemap.xml`, and the
  recommendation shelf linked to un-prefixed, 404ing product URLs. Categorized under `Fixed`,
  not `Security` -- see §6 for the explicit reasoning.

### `[0.28.5]` -- 2026-09-22

#### Fixed

- **Bundles & recommendations admin demo-scoping fix**: closed the one remaining gap epic 64's
  audit disclosed but didn't fix -- `/admin/bundles` and `/admin/recommendations` had no
  demo-scoping, so an operator in one demo's admin saw another demo's bundle/recommendation
  rows mixed into their own list. The same additive `demoSlug` pattern was applied a sixth
  time, threaded through `packages/bundles`, `packages/recommendations`, and `adapter-postgres`,
  live-backfilled with zero ambiguous rows remaining. Same shared-backend
  data-isolation/correctness shape as epic 64 -- categorized under `Fixed`, not `Security`, for
  the identical reasoning given in §6.

## 9. Completeness check -- every epic 26-65, exactly once

| # | id | # | id |
|---|---|---|---|
| 26 | `commerce-gap-audit-2` | 46 | `analytics-insights-and-import-adapters` |
| 27 | `admin-auth-clerk` | 47 | `vision-and-community-roadmap` |
| 28 | `cms-admin-crud` | 48 | `demo-seed-idempotency` |
| 29 | `cms-adapter-discoverability` | 49 | `bare-basics-reviews` |
| 30 | `create-store-skill` | 50 | `storefront-views-and-multi-catalog` |
| 31 | `commerce-landing-and-demo-routing` | 51 | `ims-postgres-alternate` |
| 32 | `storefront-visual-redesign` | 52 | `adapter-mongodb` |
| 33 | `docs-site` | 53 | `adapter-convex` |
| 34 | `storefront-design-system-v2` | 54 | `per-store-landing-and-onboarding` |
| 35 | `demo-store-northline-depth` | 55 | `framework-brand-system` |
| 36 | `demo-store-print-shop-rebrand` | 56 | `real-provider-verification` |
| 37 | `demo-store-plant-shop` | 57 | `per-demo-backend-diversity` |
| 38 | `docs-feature-deep-dive` | 58 | `full-commerce-persistence-audit` |
| 39 | `data-backup-restore-and-adapter-portability` | 59 | `sanity-challenge-commerce-copilot` |
| 40 | `commerce-feature-parity-research` | 60 | `cms-demo-scoping-and-nav-cleanup` |
| 41 | `fulfillment-routing` | 61 | `marketing-catalog-demo-scoping` |
| 42 | `adapter-printful` | 62 | `checkout-order-paid-crash` |
| 43 | `adapter-printify` | 63 | `product-configurator` |
| 44 | `shipping-rate-and-labels` | 64 | `commerce-gap-audit-3` |
| 45 | `seo-aeo-infrastructure` | 65 | `bundles-recommendations-demo-scoping` |

40 rows, 26-65 inclusive, each epic number and id appears exactly once (cross-checked against
`.pHive/planning/epic-backlog.md`'s own table row numbers, `grep -n '^| [0-9]'`, which confirms
no duplicate/skipped row number exists in the source file itself either).

## 10. Explicitly out of scope for this story (deferred to cvr-02/cvr-03)

- `CHANGELOG.md` itself is not edited by this story -- §8 above is the full, ready-to-transcribe
  content for story 2.
- `package.json`'s `"version"` field is not edited by this story -- `0.28.5` (§7) is the value
  story 2 should set it to.
- `.pHive/planning/epic-backlog.md` is not edited by this story (per design-discussion.md §3d),
  except this epic's own eventual closeout row, which is a later story's job, not this one's.
