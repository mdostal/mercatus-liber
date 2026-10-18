# Design discussion: changelog-and-version-reconstruction-ii

## 0. Prelude

Origin: a direct orchestrator request (2026-10-18) to extend the original
`changelog-and-version-reconstruction` epic's (epic-backlog row 66) own reconstruction, which
stopped at `[0.28.6]` / epic 65's own closeout. Read that epic's `docs/design-discussion.md` and
`docs/reconstruction-working-doc.md` in full first -- they are this epic's exact template for
method and voice, cited throughout below rather than re-derived from scratch. This is a
deliberately separate epic, not an edit to the original epic's own directory: its own
`.pHive/epics/changelog-and-version-reconstruction/` is left completely untouched.

## 1. Why this matters

`CHANGELOG.md` and `package.json`'s `"version"` field currently stop dead at `[0.28.6]` / epic
65's own closeout entry (confirmed live: `grep -n '"version"' package.json` returns
`"0.28.6"`, and `grep -n '^## \[' CHANGELOG.md | tail -1` returns `[0.28.6]`). In the 19 epics
since (66 through 85 inclusive, per `.pHive/planning/epic-backlog.md`'s own row numbering),
this repo shipped real work across a wide range: admin a11y/CRUD completeness fixes, a
dependency-security remediation, a brand contrast-token decision and its own follow-up fix, the
final logo actually applied to live surfaces, an integrations catalog and ecosystem gap audit,
a real Shopify-to-native migration tool, free-tier keep-alive automation, a real GitHub wiki,
three independently-deployed sample stores, dropship/merch address plumbing, and -- the same
night this epic was requested -- outbound webhook delivery, a second payment processor
(PayPal), and an accounting/ERP sync adapter (QuickBooks Online). None of it is reflected in
`CHANGELOG.md` or the version number.

Epic 66 (row 66 of the backlog) is itself the original `changelog-and-version-reconstruction`
epic's own closeout -- it is already fully reflected as `CHANGELOG.md`'s `[0.28.6]` entry and is
explicitly **not** re-covered here; this epic's real new range is **67 through 85** (19 epics),
continuing immediately from `[0.28.6]`.

## 2. What "done well" means here

Same posture as the original epic's own §2, re-applied rather than re-litigated:

- The existing preamble gets extended again to disclose the newly-covered range, not replaced.
- Headers: `## [x.y.z] - YYYY-MM-DD`, oldest first, one version per epic that actually bumped
  the version -- a `version_bump: none` epic (or an epic with no recorded bump at all, inferred
  to `none`) gets no header of its own, folded forward into the next real-bump epic per the
  original epic's own §3c resolution, re-applied identically here (see §4 below).
- Categories used: `### Added`, `### Changed`, `### Fixed`, `### Security` -- the same four the
  original reconstruction introduced; no fifth category invented.
- Bullet shape: **bold feature name** (package name in backtick-code where one exists), 1-3
  real, specific sentences -- never a bare one-liner.
- "Done well" here specifically means: one changelog entry per epic that actually bumped the
  version (`none`-bump epics folded, same as the original), correctly categorized, zero
  duplicated/missing entries across epics 67-85, and a version sequence that is a correct,
  gapless, strictly-increasing semver progression continuing from `0.28.6`.

## 3. Scope

### 3a. The 19 target epics (67-85) and what's actually recorded for each

Every row 67-85 of `.pHive/planning/epic-backlog.md` was read in full (via `Read`'s own
offset/limit per row -- each backlog row is one single, very long line, confirmed via
`grep -noE "^\| [0-9]+ \|"`), and every `.pHive/epics/<name>/epic.yaml` that exists for these 19
was checked for a `version_bump` field. Of the 19, only **3 have a real, on-record
`version_bump`** (re-grepped live, not from memory):

| Epic | id | `version_bump` |
|---|---|---|
| 77 | `integrations-catalog-and-ecosystem-audit` | patch |
| 78 | `shopify-migration-import-tool` | minor |
| 84 | `second-payment-processor-adapter` | minor |

### 3b. Real, verified gap this design discussion found: 16 of 19 target epics have no recorded `version_bump`

**10 of the 19 have no `.pHive/epics/<name>/` directory at all** (confirmed: absent from
`ls .pHive/epics/`): 67 `gap-audit-3-test-coverage`, 68 `gap-audit-3-storefront-view-edit`, 69
`dependency-vulnerabilities-xmldom`, 70 `gap-audit-3-bundle-variant-resolution`, 71
`oss-community-health-files`, 72 `dependency-updates-minor-patch`, 74
`ci-node-version-mismatch`, 75 `brand-primary-foreground-contrast-audit`, 76
`apply-final-logo` -- that's 9 -- plus 73 `a11y-audit`, which **does** have a directory
(`.pHive/epics/a11y-audit/docs/audit-findings.md`) but no `epic.yaml` inside it, confirmed via
`find .pHive/epics/a11y-audit -type f`. That's 10 total with zero recorded `version_bump`
field by either path.

**A second, distinct shape not present in the original epic's own gap**: 5 more epics (79
`free-tier-resilience-and-keepalive`, 80 `docs-wiki-examples-architecture`, 81
`separate-deployed-sample-stores`, 82 `dropship-merch-address-wiring`, 83
`outbound-webhook-event-delivery`, 85 `accounting-erp-sync-adapter` -- that's actually 6, not 5)
**do** have a real `epic.yaml` (these were planned via Minerva/`/plan`'s own minimal story-list
schema), but none of those `epic.yaml` files carries a `version_bump` field at all -- confirmed
by `grep -E '^version_bump:'` against each, returning nothing. The original epic's convention
("14 epics with no `epic.yaml` at all") didn't need to distinguish "no file" from "file exists,
field absent" since every one of its own 14 gap epics was the first shape; this epic's own real
gap includes both shapes, and both are treated identically for inference purposes -- the
mechanical fact that matters (no recorded `version_bump`) holds for all 16 (10 + 6).

Convention applied, identical to the original epic's own §3b: new subsystem/package = minor; a
small settings/admin surface, a live bug fix, a security-only fix, or a fix-only audit epic =
patch (epic 17 `commerce-gap-audit`'s own on-record `patch` precedent, re-applied through the
original epic's own epics 26/48/54/56/60/61/62/64/65 inference chain); a pure-docs/research/
verification epic with zero shipped code, or (a real extension of that same principle, made
explicitly here, not silently) a test-only epic with zero shipped *application behavior*
change = none.

### 3c. `version_bump: none` and fold-forward resolution

**One** epic in this range resolves to `none`: 67 `gap-audit-3-test-coverage`. Its own
epic-backlog row text is explicit -- "Test-only, no application behavior changed" -- 21 new
test files closing disclosed coverage gaps in already-shipped code, with zero production
behavior change of any kind. This is treated as the same shape as the original epic's own
`commerce-feature-parity-research` (epic 40, "zero shipped code" = `none`), extended one step:
here code *was* shipped (test files), but zero application *behavior* shipped, which is the
real thing a semver bump is meant to signal. This extension is made explicitly, as its own
disclosed interpretive call, not hidden inside a bare "none" with no reasoning -- see the
working doc §3 for the full citation.

67 folds forward into **68** `gap-audit-3-storefront-view-edit`, the very next epic in the
range, which does carry a real (inferred) bump. 67 is not the last epic in-range, so the
backward-fold fallback never applies.

### 3d. Explicit scope boundaries

Identical to the original epic's own §3d, re-applied for this range:

- **Documentation-only archaeology over already-shipped, already-merged work.** Zero
  application code changes anywhere in `apps/` or `packages/`. The only files this epic's
  stories touch are `CHANGELOG.md`, `package.json`'s `"version"` field, and this epic's own
  `.pHive/epics/changelog-and-version-reconstruction-ii/` directory.
- **`.pHive/planning/epic-backlog.md` is not edited by this epic** -- per this run's own
  explicit orchestrator instruction, the orchestrator adds the backlog row centrally
  afterward, not this epic's own closeout story (a deliberate, explicit departure from the
  original epic's own cvr-03, which did add its own row itself).
- **The original epic's own `.pHive/epics/changelog-and-version-reconstruction/` directory is
  not edited** -- cited throughout this doc and the working doc, never merged into.
- **No new `CHANGELOG.md` categories or format conventions invented** -- this epic reuses
  `Added`/`Changed`/`Fixed`/`Security` exactly as the original established them.
- **Re-verify, don't assume, whether a deploy is needed** -- the original epic's own closeout
  story (cvr-03) explicitly re-grepped `apps/reference-storefront`/`apps/docs` live rather than
  trusting its own design discussion's earlier finding; this epic's own closeout story (cvr2-03)
  does the same re-check against the *current* codebase (which has materially changed since --
  epic 76 replaced `app/icon.tsx` with static `icon.png`/`apple-icon.png` files, for one), not a
  copy-pasted "no deploy needed" conclusion.
- **No retroactive changelog for epics 1-19 or for epics already covered (20-66)** -- both
  already disclosed, out of scope here too.

## 4. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| A `version_bump: none` inference (epic 67) is applied too liberally, silently dropping real shipped behavior from the changelog | Medium | §3c's reasoning is stated explicitly and narrowly (test-only, zero behavior change, confirmed by the epic's own row text), not applied to any other epic in range -- every other epic in 67-85 ships a real, user- or operator-visible behavior change and gets its own patch/minor bump |
| Version-sequence math error produces an internally-inconsistent sequence | Medium | The working doc computes the full sequence before touching `package.json`; the closeout story independently re-derives the final version from `CHANGELOG.md`'s own last header and confirms it matches `package.json` |
| Copying the original epic's "no deploy needed" conclusion without re-checking it against a codebase that has materially changed since (3 new live demo deployments, a logo swap, a single-tenant mode) | Medium | The closeout story re-greps live, explicitly disclosed in §3d above and re-verified again in the working doc's own closeout section |
| Scope creep into actually fixing something a later epic (e.g. 73's deferred finding #17, already closed by epic 75) left open | Low | Out of scope -- this epic's stories only ever touch `CHANGELOG.md`/`package.json`/its own epic directory |

## 5. Scale assessment

**Medium.** Single-layer (documentation), two application files touched in the whole repo
(`CHANGELOG.md`, `package.json`), but genuinely non-trivial: 19 epics to research and
categorize correctly (16 of them without a recorded `version_bump`, requiring real judgment
grounded in each epic's own backlog-row evidence), one gapless semver sequence to compute and
apply correctly continuing from `0.28.6`, zero duplicated/missing entries required as a hard
acceptance bar. Proceeding directly to story decomposition, matching the original epic's own
Medium-scope precedent.
