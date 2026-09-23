# Design discussion: changelog-and-version-reconstruction

## 0. Prelude

Origin: `.pHive/epics/commerce-gap-audit-3/docs/audit-findings.md` §10, finding 10 of the
round-3 gap audit (2026-09-22). No separate research-brief was written -- the relevant real
state (current `CHANGELOG.md`/`package.json` contents, every affected epic's own
`epic.yaml`, and which epics have no `epic.yaml` at all) was confirmed directly by reading
the actual repo, not assumed from the audit's own summary. Where this design discussion's own
research turned up something the audit finding didn't already say explicitly (see §3b), that
is called out as this epic's own contribution, not attributed to the audit.

## 1. Why this matters

Mercatus Liber is a public, MIT-licensed, open-source repository on GitHub
(`https://github.com/mdostal/mercatus-liber`) -- not an internal tool. `CHANGELOG.md` and
`package.json`'s `"version"` field are two of the first things a developer evaluating whether
to adopt this framework will check, alongside `README.md`/`VISION.md`. Both currently stop
dead at epic 25 (`v0.6.1`, dated 2026-09-08) -- confirmed live: `grep -n "^## \[" CHANGELOG.md`
returns no entry past `[0.6.1]`, and `package.json`'s `"version"` field is still literally
`"0.6.1"`.

In the 39 epics since (26 through 64), this repo shipped, among much else: a full persistence
audit giving 13 subsystems real Postgres persistence (epic 58), three new database adapters
(MongoDB/Convex/Postgres-inventory, epics 51-53), real per-demo backend diversity (epic 57), a
Sanity-powered AI commerce copilot (epic 59), a real brand/design system for the framework
itself (epic 55), a multi-axis interactive product configurator (epic 63), a reviews subsystem
(epic 49), a storefront-views/multi-catalog subsystem (epic 50), fulfillment routing plus two
real dropship adapters (epics 41-43), Shippo-backed shipping/labels (epic 44), real SEO/AEO
infrastructure (epic 45), and at least four live production bug fixes this most recent session
alone (epics 60-62, plus the catalog/recommendation-shelf fix folded into epic 64's own audit).
**None of it is in the changelog or reflected in the version number.** To anyone reading only
`CHANGELOG.md`/`package.json`, this project looks frozen at a small fraction of its real,
shipped, live-verified state -- a materially misleading signal for a project whose own stated
differentiator is that the work is real, not aspirational.

This is not a cosmetic nice-to-have: `CHANGELOG.md`'s own existing preamble (see §2) already
promises "all notable changes to this project are documented in this file" -- a promise
currently broken for 39 of the repo's ~64 epics. Leaving it unaddressed compounds the exact
kind of stale-documentation drift `commerce-gap-audit-3` finding 11 (`VISION.md`/`README.md`)
and finding 12 (`apps/docs/content-src/index.md`) already found and fixed elsewhere this same
session -- this is that same class of gap, just not yet closed.

## 2. What "done well" means here

Read `CHANGELOG.md` in full first (68 lines, six entries, `[0.2.0]` through `[0.6.1]`, all
dated 2026-09-08) to establish the format actually in force, rather than importing a generic
Keep-a-Changelog template wholesale:

- A short, non-linked preamble ("All notable changes to this project are documented in this
  file. Entries are grouped by release, oldest first.") plus one explanatory sentence per wave
  disclosing what's covered and what isn't yet (the existing text cites
  `commerce-gap-audit-2`'s own audit-findings.md for the epics-1-19 gap; this epic's own
  reconstructed entries should similarly stay silent on nothing they cover, and this epic's own
  closeout should update or extend that disclosure sentence rather than leave it describing only
  epics 20-25 once entries past it exist).
- Headers: `## [x.y.z] - YYYY-MM-DD`, oldest first, one version per epic that actually bumped
  the version (an epic with `version_bump: none` gets no header of its own -- see the
  `framework-brand-system`/`product-configurator`/`sanity-challenge-commerce-copilot`
  `epic.yaml` precedent, all three explicitly `none`).
- Subsections used so far: `### Added` and `### Changed` (six entries used `Added` five times,
  `Changed` once, for the additive `Order.createdAt` field alongside epic 24's main feature).
  No `### Fixed`/`### Removed`/`### Security` entry exists yet in this file, but this epic's
  real scope includes several live production bug fixes (epics 60-62 and the finding-4/5 fix
  folded into epic 64) -- `### Fixed` is the correct, standard Keep-a-Changelog category for
  those and should be introduced now, not force-fit into `### Added`/`### Changed`.
- Bullet shape: **bold feature name** (package name in backtick-code, subsystem number when one
  exists, e.g. "subsystem 16"), then 1-3 sentences of real, specific description -- never a bare
  one-liner, never marketing language. Entries for bug-fix epics should name the concrete bug
  fixed, not just "fixed a bug" (matching this project's own established voice throughout
  `README.md`/`VISION.md`/every epic's own design-discussion.md).
- "Done well" for this epic specifically means: **one changelog entry per epic that actually
  bumped the version** (not one per story -- the existing six entries are epic-level, e.g. epic
  24's `checkout-orders` schema addition is folded as a `### Changed` sub-bullet under that
  epic's own `### Added` header, not a separate version), **correctly categorized**
  (Added/Changed/Fixed, and `### Security` if epic 27's admin-auth-clerk entry warrants it --
  worth a real look during story 1, since it closed a genuine, live-exploitable
  zero-authentication gap), **zero duplicated or missing entries** (every epic 26-64 that
  shipped a real version bump gets exactly one entry, in the correct sequence position), and
  **version numbers that are a correct, gapless semver sequence** starting from `0.6.1` and
  applying each epic's own declared bump type in strict epic-number order.

## 3. Scope

### 3a. The 39 target epics (26-64) and what's actually recorded for each

Every row 26-64 of `.pHive/planning/epic-backlog.md` was read (via a full-file `grep`/id-row
pass, not summarized from memory), and every `.pHive/epics/*/epic.yaml` was checked for a
`version_bump` field. Of the 39 target epics, **25 have a real, on-record `version_bump`**
(`grep -E '^(name|version_bump):' .pHive/epics/*/epic.yaml`, read directly, not inferred):

| Epic | `version_bump` | Epic | `version_bump` |
|---|---|---|---|
| 27 `admin-auth-clerk` | minor | 41 `fulfillment-routing` | minor |
| 28 `cms-admin-crud` | patch | 42 `adapter-printful` | minor |
| 29 `cms-adapter-discoverability` | patch | 43 `adapter-printify` | minor |
| 30 `create-store-skill` | none | 44 `shipping-rate-and-labels` | minor |
| 31 `commerce-landing-and-demo-routing` | minor | 45 `seo-aeo-infrastructure` | minor |
| 32 `storefront-visual-redesign` | patch | 46 `analytics-insights-and-import-adapters` | minor |
| 33 `docs-site` | minor | 47 `vision-and-community-roadmap` | patch |
| 34 `storefront-design-system-v2` | minor | 55 `framework-brand-system` | none |
| 35 `demo-store-northline-depth` | minor | 57 `per-demo-backend-diversity` | minor |
| 36 `demo-store-print-shop-rebrand` | minor | 58 `full-commerce-persistence-audit` | minor |
| 37 `demo-store-plant-shop` | minor | 59 `sanity-challenge-commerce-copilot` | none |
| 38 `docs-feature-deep-dive` | minor | 63 `product-configurator` | none |
| 39 `data-backup-restore-and-adapter-portability` | minor | | |

### 3b. Real, verified gap this design discussion found beyond the audit's own finding 10

**14 of the 39 target epics have no `.pHive/epics/<name>/` directory at all, anywhere in this
repo's git history** -- not just no `version_bump` field, no `epic.yaml` file, confirmed by
`git log --all -- ".pHive/epics/<name>"` returning zero commits for each. This is a real fact
the audit's finding 10 didn't itself enumerate, and it materially changes what "read every
epic.yaml `version_bump` field as the source of truth" can literally mean for this epic:

- 26 `commerce-gap-audit-2`, 40 `commerce-feature-parity-research`, 48 `demo-seed-idempotency`,
  49 `bare-basics-reviews`, 50 `storefront-views-and-multi-catalog`, 51 `ims-postgres-alternate`,
  52 `adapter-mongodb`, 53 `adapter-convex`, 54 `per-store-landing-and-onboarding`,
  56 `real-provider-verification`, 60 `cms-demo-scoping-and-nav-cleanup`,
  61 `marketing-catalog-demo-scoping`, 62 `checkout-order-paid-crash`,
  64 `commerce-gap-audit-3`.

For these 14, story 1 (below) cannot mechanically read a `version_bump` field that was never
recorded -- it must instead determine the correct bump from the actual evidence that does
exist: each epic's own `epic-backlog.md` row text (already read in full for all 39 rows during
this design pass), the real commit history on the epic's own named branch (`git log --all
--oneline -- <touched-paths>` per epic, where the branch/commits are still reachable), and
`commerce-gap-audit-2`'s own precedent reasoning (`.pHive/epics/commerce-gap-audit-2/docs/
audit-findings.md`: it treated its own audit-and-quick-fix epic as out of its own reconstructed
range, but epic 17 `commerce-gap-audit` -- the same audit-epic shape -- is on record as
`version_bump: patch`, a real precedent for how an audit/bug-fix epic of this shape has been
categorized before). This must be done using the same conventions the 25 known-bump epics
establish (a new subsystem/package = `minor`; a small settings/admin surface, a live bug fix, or
a fix-only epic = `patch`; a pure-docs/research/verification epic with zero shipped code = `none`)
-- disclosed explicitly in the working doc story 1 produces, never silently guessed and left
unstated. This is real archaeology, not a rubber-stamp: it is exactly the kind of judgment call
that makes this "mechanical but non-trivial," per the audit's own framing.

### 3c. A second real tension this design pass found: `version_bump: none` on epics the task itself expects to see reflected

Three of the 25 known-bump epics -- 30 `create-store-skill`, 55 `framework-brand-system`, 59
`sanity-challenge-commerce-copilot`, and 63 `product-configurator` -- declare
`version_bump: none`. For 30 that's unsurprising (a README + a Claude Code skill file, no
shipped application code). But 55, 59, and 63 are real, substantial, live-verified feature
epics (a full brand/design system applied to two real surfaces; a Sanity-powered AI commerce
copilot; a real interactive multi-axis variant picker) -- and this task's own brief explicitly
names 55 and 63 by number as work that "should be reflected" in this reconstruction. Taken
literally, "an epic with `version_bump: none` gets no header of its own" (§2) would mean these
three get **no changelog entry at all**, which contradicts the plain intent of covering "38
epics of shipped work."

**Resolution for story 1 to apply, not silently decide on its own:** a `version_bump: none`
epic still gets a real `CHANGELOG.md` entry describing what it shipped -- it just doesn't get
its **own** version header. It is folded under the *next* epic in sequence that does carry a
real bump (the same way epic 24's `Order.createdAt` addition was folded as a `### Changed`
sub-bullet under epic 24's own `### Added` header rather than getting a separate version, per
§2) -- except here the fold is across epics, not within one. If a `none`-bump epic is the very
last one in the whole 26-64 range with no later epic to fold into (not the case for 55/59/63,
each of which has later epics in-range that do bump), it folds backward into the prior real
version instead. This must be stated explicitly in story 1's working doc for every `none`-bump
epic, not left as an unstated implementation detail -- a reader of the final `CHANGELOG.md`
should be able to see 55/59/63 documented somewhere, with a clear (even if implicit-via-grouping)
account of why they don't have their own version number.

### 3d. Explicit scope boundaries

- **Documentation-only archaeology over already-shipped, already-merged work.** Zero
  application code changes anywhere in `apps/` or `packages/`. The only two files this epic's
  stories touch are `CHANGELOG.md` and `package.json`'s `"version"` field.
- **`.pHive/planning/epic-backlog.md` is not edited by this epic's reconstruction work itself**
  -- mirroring `commerce-gap-audit-3` finding 9's own disclosed precedent (that audit found a
  stale row but explicitly did not correct it in place, "per this task's own scope"). The one
  exception, consistent with this repo's own established closeout convention (e.g. the most
  recent commit on `master`, `9b53ab4 docs(epic-backlog): add row 64 -- commerce-gap-audit-3
  closeout`), is that this epic's own closeout story adds **one new row for this epic itself**
  once it's done -- the same thing every other closed epic in this backlog already does for
  itself, not a correction to someone else's row.
- **No new `CHANGELOG.md` categories or format conventions invented wholesale** -- this epic
  extends the existing format (adding `### Fixed` where the real bug-fix epics warrant it, and
  `### Security` if epic 27 warrants it) rather than replacing it.
- **No deploy is required as part of this epic** -- confirmed directly (not assumed) by grepping
  the live app for any reference to `package.json`'s version: `apps/reference-storefront`'s
  `/architecture` page, `/admin/settings` (`lib/adapter-info.ts`), `app/icon.tsx`, and a
  repo-wide search for `packageJson`/`pkg.version`/`process.env.npm_package_version` all came
  back with **zero real matches** (the only "version" hits found were unrelated prose, e.g.
  "conversion funnel"). `package.json`'s `"version"` field is metadata only in this repo today --
  nothing live renders it. The closeout story still re-checks this live rather than trusting this
  design discussion's own finding uncritically, per this project's own stated preference for
  verifying rather than assuming.
- **No retroactive changelog for epics 1-19** -- that gap was already disclosed and explicitly
  scoped out by `commerce-gap-audit-2` (epic 26) when it wrote `CHANGELOG.md`'s own current
  preamble; re-litigating that decision is out of scope here too.

## 4. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| The 14 epics with no `epic.yaml` get a fabricated/guessed `version_bump` with no disclosed reasoning | Medium | Story 1's acceptance criteria require every one of the 14 to cite its actual evidence (epic-backlog.md row text and/or real commit history) in the working doc, not a bare guess |
| Version-sequence math error (wrong semver bump applied, or applied out of epic-number order) produces an internally-inconsistent sequence | Medium | Story 2 computes the full sequence in the working doc before touching `package.json`, and story 3's closeout independently re-derives the final version from the changelog's own last header and confirms they match |
| Scope creep into actually fixing something the audit found undone (e.g. epic-backlog.md row 49's stale text, or the bundles/recommendations demo-scoping follow-up) | Low | Both are explicitly out of scope for this epic (documented in commerce-gap-audit-3 findings 9 and 13 as their own, separate, un-started follow-ups) -- this epic's stories only ever touch `CHANGELOG.md`/`package.json`, plus the one epic-backlog.md row for this epic's own closeout |
| A future epic assumes the reconstructed version number is meaningful for actual `npm`/semver-consumer purposes (this package is `"private": true`, never published) | Low | Design discussion states plainly (§3c) that the version field is pure metadata today, not a publish artifact -- no false claim of publish-readiness introduced |

## 5. Scale assessment

**Medium.** Single-layer (documentation), two files touched in the whole repo, but genuinely
non-trivial: 39 epics to research and categorize correctly (14 of them without their
authoritative source field, requiring real judgment grounded in evidence), one gapless semver
sequence to compute and apply correctly, zero duplicated/missing entries required as a hard
acceptance bar. Proceeding directly to story decomposition -- no H/V slicing or structured
outline needed for a scope this contained, matching this session's own `framework-brand-system`/
`product-configurator` precedent for Medium-scope epics.
