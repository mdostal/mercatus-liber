# Commerce gap audit round 3 — findings (2026-09-22)

Same methodology as epics 17 (`commerce-gap-audit`) and 26 (`commerce-gap-audit-2`): read real
code, not memory; browse the real live production deployment; run the real test suite. Read
`.pHive/planning/epic-backlog.md` rows 1–63 in full first. Run after epic 63 (`product-
configurator`) merged and deployed, and after this session's four live bug fixes (Clerk
`/admin` regression, CMS cross-demo bleed / epic 60, category cross-demo bleed / epic 61,
checkout-completion crash / epic 62).

**Operational note, disclosed up front because it materially shaped how this audit ran:** partway
through this session, files this audit had just edited and staged were found silently reverted
on disk, and a commit (`55a1154`) appeared on this audit's own working branch that this session
did not create. Both are the same class of hazard epic 56's own history already disclosed once
("this branch was briefly, accidentally committed onto a concurrent, unrelated branch... due to
another agent switching branches in the same shared working directory") — a second, concurrent
agent instance was genuinely operating in this exact repo checkout, on this exact branch, at the
same time as this session, independently pursuing the same audit brief. Its one commit
(`55a1154`) was read in full and independently verified (typecheck/test/build, live-route
spot-checks) before being counted as part of this audit's real output below; nothing from it was
taken on faith. This is reported plainly as a real environment condition, not swept under a rug.

## Summary

| # | Finding | Severity | Disposition |
|---|---|---|---|
| 1 | Advertising campaigns had no demo-scoping — either demo's ad content rendered on the other's pages | **HIGH — live production bug** | **FIXED** (`75a2168`) |
| 2 | Promotion/coupon codes had no demo-scoping — either demo's code was redeemable at the other's checkout | **HIGH — live production bug** | **FIXED** (`75a2168`) |
| 3 | Service areas had no demo-scoping — print-shop's `/locations` page showed all 11 cities from both businesses | **HIGH — live production bug** | **FIXED** (`97f24de`) |
| 4 | `catalog.listProducts()` had no demo-scoping — `/sitemap.xml` and 5 admin product-picker dropdowns listed every demo's products | **HIGH — SEO + admin-facing live bug** | **FIXED** (`55a1154`, verified) |
| 5 | `RecommendationShelf` "customers also bought" cards linked to a bare `/products/<slug>` with no demo prefix — 404 on every click, all 3 demos | **HIGH — live production bug** | **FIXED** (`55a1154`, verified) |
| 6 | Every admin mutation action in `lib/actions.ts` audited for `requireAdminPermission` gating | — | **NOT A GAP** — all 21 real mutations correctly guarded, guard-first |
| 7 | `StorefrontViewsService.updateView` — real, exported, zero call site, zero test | Low | **Documented, not fixed** |
| 8 | Test coverage gaps: `variant-picker.tsx`, admin SKU-matrix page render, landing page | Low–Medium | **Documented, not fixed** |
| 9 | `epic-backlog.md` row 49's "no dedicated test file exists for reviews" note is stale | Low | **Documented, not fixed** (can't edit `epic-backlog.md` per this task's own scope) |
| 10 | `CHANGELOG.md`/`package.json` version frozen at epic 25 (`0.6.1`, 2026-09-08) — 38 epics of shipped work since (including this session's brand system, product-configurator, and 4 bug fixes) are undocumented | Medium | **New-epic-candidate**: `changelog-and-version-reconstruction` |
| 11 | `VISION.md`'s "Where things stand today" section is substantially stale — frozen around epic ~53, claims "only epic 48 remains genuinely open," reviews/storefront-views/adapters still listed "in progress" though done, zero mention of epics 54–63 | Medium | **Documented, not fixed** (too large/risky a rewrite to do safely mid-audit given the concurrent-agent hazard above; recommend a dedicated follow-up pass) |
| 12 | `apps/docs/content-src/index.md` said "two live demo storefronts" (there are three) and "22 total" subsystem docs through `21-admin-auth` (there are 26, through `25-storefront-views`) | Low | **FIXED** (`d5a4229`) |
| 13 | Bundle tier selector vs. product-configurator composability: no live product has both a bundle and multiple variant SKUs; if one did, a bundle tier's hardcoded `skuIds` would silently ignore whatever variant the shopper picked | Low (currently unreachable) | **Documented, not fixed** |
| 14 | Live demo store browse (all 3, every major route) | — | **NOT A GAP** — all 200s, no other visible brokenness found |

## 1–3. Advertising / promotions / service-areas demo-scoping (this session's own work)

Reading `apps/reference-storefront/lib/services.ts` confirmed print-shop and Northline Home
Tech both resolve to the same shared production Postgres backend (`DATABASE_URL`) — Northline's
own MongoDB adapter remains blocked on Atlas Network Access (epic 57), so it silently falls back
to the same Postgres pool print-shop uses, with no per-demo schema/table separation. Epics 60/61
already found and fixed this exact bug class for CMS pages and marketing categories. This audit
found the identical bug, never fixed, in three more subsystems built on the same shared-Postgres
persistence model:

- **Advertising** (`packages/advertising`): `CampaignRepository.list()`/
  `AdvertisingService.getActiveCreativeForSlot()` had no demo filter. **Confirmed live** against
  `commerce.mdostal.com` before the fix: repeated fetches of `/demo/print-shop` returned
  Northline's own "Whole-Home WiFi Mesh Installs" ad creative (linking to
  `/demo/northline/products/whole-home-wifi-mesh-install`) 6 times out of 20 fetches.
- **Promotions** (`packages/promotions`): `PromotionRepository.list()`/`PromotionsService.evaluate()`'s
  coupon lookup had no demo filter. Confirmed by direct code inspection and a new regression test:
  print-shop's real `STITCH15` code and Northline's real `NORTHLINE15` code are both unconditional,
  cart-scope, unlimited-use 15%-off codes with zero SKU targeting to naturally exclude a
  cross-demo redemption — either code was genuinely redeemable at the other demo's checkout.
- **Service areas** (`packages/service-areas`): `ServiceAreaRepository.list()` had no demo
  filter. **Confirmed live**: `/demo/print-shop/locations` listed all 11 cities from both
  businesses (print-shop's own Portland OR / Austin TX / Chicago IL local-pickup areas, plus
  every one of Northline's 8 installer service areas), and print-shop's nav showed a "Service
  Areas" link purely because Northline's areas made the unscoped `length > 0` check pass.

**Fix**, identical shape to epics 60/61's own precedent in all three: an additive, optional
`demoSlug?: string` field on the entity, an optional `{ demoSlug }` filter on `list()`, threaded
through the in-memory repository, the Postgres adapter (`ALTER TABLE ... ADD COLUMN IF NOT
EXISTS`, safe against the already-live production tables), every real call site (`AdSlot` in
`cms-sections.tsx`, the checkout `PricingAdjuster` wrapper in `services.ts`, `buildNavLinks()` and
the `/locations` index page in `layout.tsx`, admin list pages, both `createCampaign`/
`createPromotion` admin actions), and all 3 demos' seed files. Single-slug lookups
(`getServiceAreaBySlug`, etc.) deliberately left unscoped, mirroring epic 60/61's own convention.
New demo-scoping regression tests added in `packages/advertising/test`, `packages/promotions/test`,
`packages/service-areas/test`, and `packages/adapter-postgres/test` (both the in-memory and
Postgres-fake-pool layers), each proving two demos' data never bleeds into the other's scoped
results and that an unscoped call is unaffected (backward compatible).

Committed as `75a2168` (advertising + promotions) and `97f24de` (service areas) on
`fix/gap-audit-3-demo-scoping-ads-promotions`.

## 4–5. Catalog/sitemap product-listing bleed + broken recommendation links

Found and fixed by the concurrent agent session disclosed above (commit `55a1154`), independently
verified by this session before being counted:

- **`catalog.listProducts()` had no demo-scoping either** — the same root cause as findings 1–3,
  in a fourth subsystem. `app/sitemap.ts`'s per-demo product entries and 5 admin product-picker
  dropdowns (`admin/catalog`, `admin/content-layout`, `admin/cms/new`, `admin/cms/marketing/new`,
  `admin/cms/[id]`) all listed every demo's products, not just their own — print-shop's
  `/sitemap.xml` carried real `/demo/print-shop/products/<northline-product-slug>` entries,
  submitting broken URLs to search engines. The fix deliberately avoids adding a second,
  competing `demoSlug` field to `Product` next to the real, already-built `Catalog` entity
  (epic 58) every demo's products are genuinely assigned to — it resolves each demo's own
  `Catalog` by slug and calls the already-existing but never-actually-called-from-a-real-route
  `CatalogService.listProductsInCatalog(catalogId)`, closing exactly the "built, tested, never
  wired up" pattern this audit was asked to look for, for a different function than the original
  `resolveSelection` precedent.
- **`RecommendationShelf` broken links** — a separate, genuinely live bug found by browsing: every
  "customers also bought" card on every PDP/cart page, on all 3 demos, linked to a bare
  `/products/<slug>` with no `/demo/<demoSlug>` prefix, 404ing on every click. Fixed by threading
  `demoSlug` into the component; a new `recommendation-shelf.test.ts` regression test added.

Independently re-verified by this session: `pnpm turbo run typecheck test build --force` — 127/127
tasks green, zero cache hits, run against the combined state of all three commits on this branch.

## 6. Security audit — clean

A full read of `apps/reference-storefront/lib/actions.ts` (all 38 exported actions),
`lib/copilot-actions.ts`, the one API route handler (`app/api/demo/[demoSlug]/copilot/route.ts`),
`middleware.ts`, and `app/demo/[demoSlug]/admin/layout.tsx` found **no gap**. All 21 real admin
mutations call `requireAdminPermission(demoSlug, "mutate")` (or `"manage_users"`/
`"reset_demo_data"` for the 2 owner-only actions) as the literal first statement, guard-first, no
exceptions. The 15 shopper-facing actions are deliberately ungated by design (cart/checkout/review
submission), each already documented as such. `middleware.ts`'s Clerk gate and the admin layout's
dev-default fallback are both intact. This mirrors epic 26/56's own repeated finding: the
admin-auth surface, once fixed for real in epic 27, has stayed genuinely solid across every
subsequent audit.

## 7. Dead code: `StorefrontViewsService.updateView`

`updateView(id, patch)` is a real, exported service method — but it has **zero call site**
anywhere in `apps/reference-storefront` (no edit action in `lib/actions.ts`, no `[id]` edit route
under `admin/storefront-views/`) **and zero test coverage** anywhere in the repo (confirmed by a
repo-wide grep for `updateView` across every `*.test.ts`). An admin can create, publish, or
archive a storefront view, but never edit one after creation — the only workaround is archive
and recreate. Same shape as the pre-session `resolveSelection` precedent this audit was
specifically asked to look for, just smaller in impact (a real UX completeness gap, not a
correctness bug — no live view is ever wrong, just un-editable). **Not fixed**: building a real
edit action + form is a reasonably-sized, self-contained addition, but not urgent enough to
justify scope creep in this pass; low priority for a future small story, not worth its own epic.

## 8. Test coverage gaps in recently-added code

- `components/variant-picker.tsx` (product-configurator epic 63, pc-01): **no dedicated test
  file** anywhere in `apps/reference-storefront/test/`. Coverage today is indirect — package-level
  `pdp`/`catalog` unit tests plus epic 63's own live-verification against production — not an
  app-level render/interaction test.
- The admin SKU-matrix page (`admin/products/[productId]/skus/`, epic 63 pc-03): its mutation
  action's admin-auth gating **is** tested (`test/admin-mutation-guard.test.ts`), but the page's
  own rendering/data-display logic has no test.
- The brand-system landing page (`app/(landing)/**`, epic 55): **zero test coverage of any
  kind** — no file in `test/` matches "landing" or "brand".

None of these are blocking — all three were live-verified end-to-end against a real production
deployment when their own epics closed out (per epic-backlog.md rows 55/63) — but they're real,
disclosed gaps in the app-level automated-test safety net, consistent with this project's own
stated preference for defense in depth. Not fixed here (would need real new test files, not a
quick patch); worth a small follow-up story, not a new epic.

## 9. Stale test-coverage claim in `epic-backlog.md` row 49

Row 49 (`bare-basics-reviews`) still reads: *"No dedicated test file exists for reviews yet
(`apps/reference-storefront/test/` has no `review*.test.ts`) — a real, disclosed gap, not
blocking."* This is now **false** — three real test files exist:
`packages/reviews/test/reviews.test.ts`, `packages/adapter-postgres/test/reviews.test.ts`, and
`apps/reference-storefront/test/reviews.test.ts` (9 tests, proving the pending/rejected-never-
leaks invariant end-to-end). Same class of drift as rows 47/54/59, which this session's earlier
work already corrected — but this task's own instructions explicitly say not to add rows to
`epic-backlog.md`, so this is documented here rather than corrected in place. **Recommend**: a
follow-up doc-only commit (mirroring the `e8ba6ad`/`adacc54` precedent) to fix row 49's own text.

## 10. `CHANGELOG.md` / version — new-epic-candidate: `changelog-and-version-reconstruction`

`CHANGELOG.md` and `package.json`'s `"version"` (`0.6.1`) both stop at epic 25 (2026-09-08),
exactly where epic 26 (`commerce-gap-audit-2`) left them, on record as intentionally scoped-out
archaeology at the time. Confirmed unchanged since: `grep -n "^## \[" CHANGELOG.md` shows no
entries past `0.6.1`. In the 38 epics since (26–63), this repo shipped, among much else: a full
persistence audit giving 13 subsystems real Postgres persistence (epic 58), 3 new database
adapters (MongoDB/Convex/Postgres-inventory, epics 51–53), per-demo backend diversity (epic 57),
a real Sanity-powered AI copilot (epic 59), a real brand/design system (epic 55), a
multi-axis product configurator (epic 63), and 4 live production bug fixes this session alone —
**none of it is in the changelog or reflected in the version number.** This is real, disclosed,
out-of-scope-for-a-quick-fix debt, same posture epic 26 itself took — the scope (38 epics'
worth of entries, correctly sequenced version bumps) is a real, bounded, well-defined piece of
work, not a rubber-stamp "everything's fine." **Justification for a dedicated epic**: reading
every affected epic-backlog row and its linked `version_bump` declaration, writing one changelog
entry per epic in the established format, and bumping `package.json` through the correct sequence
is mechanical but non-trivial (38 rows), and doing it well (accurate categorization, no
duplicated/missing entries) deserves a dedicated pass rather than a rushed audit-time patch.
Epic-id-style name: `changelog-and-version-reconstruction`. Depends on: none (pure documentation
archaeology over already-shipped, already-merged work).

## 11. `VISION.md` drift — documented, then observed being fixed concurrently (not by this session)

**Update, same session, before this document's final commit:** while this document was being
written, `README.md` and `VISION.md` were both observed with real, substantial uncommitted
working-tree changes (`git diff --stat`: README.md +24/-8, VISION.md +105/-42) that directly
address the exact drift described below — a refreshed "Where things stand today" section citing
epics through 63, a corrected "only epic 48 remains open" claim, and real per-demo backend-
diversity/Sanity-copilot/bug-fix content. This is the same concurrent-agent session disclosed at
the top of this document, not this audit's own work, and was **not committed as of this
document's own last commit** — so it's reported here as an observed-in-progress fix, not claimed
as done. If it lands, the finding below is resolved without this audit needing to touch it; if it
doesn't, the finding stands as originally written.

`VISION.md`'s "Where things stand today" section is substantially stale: it opens with "only
backlog epic 48 remains genuinely open" (false — epics 56, 57, and 59 are all still explicitly
"in progress" per `epic-backlog.md`, and epics 49–63 in general are mostly unmentioned), still
lists reviews (epic 49), storefront-views (epic 50), and the Mongo/Convex/Postgres-inventory
adapters (epics 51–53) under "**In progress**" though all are long done, and its "Deliberately
deferred" note about per-store landing pages and the brand system (epics 54–55) is stale now that
both are done. There is zero mention anywhere in the file of epics 56–63: per-demo backend
diversity, the full persistence audit, the Sanity AI copilot, the brand system's real shipped
form, the product configurator, or any of this session's 4 live bug fixes. **Not fixed in this
pass**: correctly rewriting a "Where things stand today" section spanning 15+ epics is
substantial prose work, and — given this audit's own disclosed concurrent-agent hazard (finding
above) — attempting a large edit to a file another live session might also be touching right now
carries real risk of a lost or conflicting write. **Recommend**: a dedicated, single-session
`VISION.md` refresh pass (same shape as epic 47's original `vision-and-community-roadmap` epic),
run when no other session is concurrently active in this checkout.

## 12. Docs-site index page — fixed

`apps/docs/content-src/index.md` said "run one of the **two** live demo storefronts" (there are
three: print-shop, northline, broadleaf) and "one doc per subsystem (**22** total)... from
`00-core-schema` through `21-admin-auth`" (`docs/subsystems/` actually has 26 files today, through
`25-storefront-views` — fulfillment/shipping/reviews/storefront-views were all added by later
epics and never reflected here). Confirmed by direct inspection (`ls docs/subsystems | wc -l`)
before editing. Fixed directly — a 3-line, text-only change, verified via
`pnpm turbo run build --filter=@mercatus-liber/docs`. Committed as `d5a4229`.

## 13. Bundle tier selector vs. product-configurator: a real, currently-unreachable composability gap

Direct question from this audit's brief: "does a bundle tier selector work correctly for a
multi-SKU product?" Read `apps/reference-storefront/app/demo/[demoSlug]/products/[slug]/page.tsx`
in full: `bundles.getBundleForProduct(viewModel.product.id)` resolves by product id (correct), but
each `BundleTier`'s `skuIds` array is a **fixed list chosen at bundle-creation time** — completely
independent of whatever SKU the shopper's variant picker (epic 63) currently has selected. Checked
every seeded bundle in all 3 demos: **no product today has both a bundle and multiple variant
SKUs** (print-shop's bundle is on a single-SKU-per-tier service product;
`embroidered-performance-polo`, the one multi-variant product, has no bundle). So this is not a
live, reachable bug today — but if an admin ever created a bundle on a multi-variant product, a
"Product Only" tier would always add whatever specific SKU (e.g. a specific color/size) was
hardcoded when the bundle was created, silently ignoring the shopper's actual variant selection.
**Not fixed**: no live data is affected, and a real fix would need a genuine design decision (does
a bundle tier reference a product + let the variant picker resolve the SKU at add-to-cart time, or
does it stay SKU-pinned by design?) that shouldn't be freehanded inside an audit pass. Documented
here so it's not rediscovered from scratch later; worth a design-discussion note attached to
whichever future epic first wants to combine the two features on one product.

Checked the same question for the other 3 merchandising subsystems while here:
**recommendations** resolve by `sourceProductId` (never `skuId`), so they're unaffected by variant
selection by construction — no gap. **Promotions**' product-scope `targetSkuIds` matching against a
cart's real line-item `skuId`s already works correctly per-variant (confirmed by
`bundle-promotion-integration.test.ts`, epic 26's own regression test, still green) — no gap.
**Reviews** are keyed by `productId` only (one rating pool per product, not per variant) — this is
an intentional design choice (`docs/subsystems/24-reviews.md`, not re-litigated here), not a bug.

Separately, `packages/bundles`' own admin list page (`/admin/bundles`,
`bundles.listBundles()`) and `packages/recommendations`' own admin list page
(`/admin/recommendations`, `recommendations.listRules()`) share the exact same unscoped-`list()`
root cause as findings 1–5 above — an operator in print-shop's admin currently sees Northline's
bundles/recommendation rules mixed into their own list. This is real, but **lower severity than
findings 1–5**: it's admin-only (no shopper-facing surface bleeds, since both resolve by
`productId`/`skuId` on the PDP itself, which is always correctly scoped), and it's the same
mechanical fix already applied 4 times above. **Not fixed directly in this pass** (time-boxed
after the 4 higher-severity live fixes); folded into the same `changelog-and-version-
reconstruction`-adjacent housekeeping bucket is the wrong home for it — instead, **recommend a
small, focused follow-up** applying the identical `demoSlug` pattern to `packages/bundles` and
`packages/recommendations`, the same 30-minute shape as each of findings 1–3 above.

## 14. Live demo store browse — clean

All 3 demos, every major route, fetched live against `commerce.mdostal.com` after this session's
own fixes: `/`, `/demo/{print-shop,northline,broadleaf}`, a PDP on each, `/cart` on each, search,
`/start` on each, `/architecture`, `/sitemap.xml`, `/robots.txt`, `/llms.txt` — all 200. Category
nav confirmed clean post-epic-61 (each demo shows exactly its own categories, zero cross-bleed).
The product-configurator's variant picker (`vp-form`) confirmed present and rendering on
`embroidered-performance-polo`. No other visible brokenness, half-finished surface, or obviously
wrong content found beyond what's captured in findings 1–5 above.

## What this audit actually changed

1. `packages/advertising`, `packages/promotions` — demo-scoping fix (types/service/in-memory-repo/
   Postgres adapter), plus every real call site and both demos' seed files. New tests in both
   packages' own test dirs and `packages/adapter-postgres/test`. Commit `75a2168`.
2. `packages/service-areas` — same fix shape, for service areas. New tests in
   `packages/service-areas/test` and `packages/adapter-postgres/test`. Commit `97f24de`.
3. (Independently verified, not authored by this session — see the operational note at the top)
   `lib/demos.ts`, `app/sitemap.ts`, 5 admin product-picker pages, `components/recommendation-
   shelf.tsx`, `app/demo/[demoSlug]/{cart,products/[slug]}/page.tsx`, plus a new
   `recommendation-shelf.test.ts` — demo-scoped product listings + fixed broken recommendation
   links. Commit `55a1154`.
4. `apps/docs/content-src/index.md` — fixed stale demo-count/subsystem-count claims. Commit
   `d5a4229`.
5. This document, plus the two new-epic-candidates above
   (`changelog-and-version-reconstruction`, and the smaller bundles/recommendations demo-scoping
   follow-up) — not added to `epic-backlog.md` directly, per this task's own instruction.

All 4 commits live on `fix/gap-audit-3-demo-scoping-ads-promotions`, branched from `master`,
**not merged and not pushed** — left for a follow-up review, per this task's own instructions.
Full monorepo check (`pnpm turbo run typecheck test build --force`) verified clean — 127/127
tasks, zero cache hits — against the combined state of all four commits together, most recently
right before writing this document.

**Not done, disclosed clearly, left for that follow-up review**: live Postgres backfill of
`demo_slug` on the already-seeded production `campaigns`/`promotions`/`service_areas` rows (same
shape as epics 60/61's own live backfill scripts), and the actual merge + production deploy.
