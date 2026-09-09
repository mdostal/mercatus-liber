# Design Discussion: demo-store-northline-depth

## 0. Context

Backlog epic 35. Direct instance of the user's explicit critique: "these aren't themed, they
aren't integrated, we hardly have actions, it should have a true menu, a true set of products."
Epic 34 (done, merged) fixed "not themed." This epic fixes the rest, for Northline Home Tech
first (the user named it first of the 3 stores).

**Confirmed by direct inspection, not assumed:**
- `apps/reference-storefront/components/nav-top-bar.tsx` (introduced by epic 34, extracted
  verbatim from the pre-epic-34 layout) renders exactly: brand link · Cart · Search ·
  **"Fall Sale"** (a hardcoded link to `campaign/fall-sale`, a dragon-merch-only campaign that
  does not exist for Northline) · Account · Admin: Plugins · a link back to the framework
  landing page · cross-demo switch links. **Zero category or service-area links exist in the
  nav for any demo.** This is the literal "hardly have actions, it should have a true menu" gap.
- `apps/reference-storefront/lib/seed-northline.ts`: 5 services, 1 category
  (`installation-services`, everything dumped into it), 8 defined service areas but only 1
  (Cedarbrook) actually gets a published CMS location page. This is the literal "a true set of
  products" gap — a real installer business would have several distinct service categories
  (TV/theater, security/cameras, networking, smart-home/automation) and every service area
  should have its own real page, not 1 of 8.

## 1. Scope

**Northline Home Tech only** — the backlog explicitly sequences this before the other 2 demo
stores ("applies to Northline Home Tech first"). Epics 36/37 (Print Shop rebrand, new plant-shop
demo) are separate, later epics; this epic does not touch `dragon-merch` or any new demo slug.

The **hardcoded "Fall Sale" nav link bug is real and in scope for this epic** (it's an existing
functional defect, not a Northline-depth feature) — the nav should link to whatever's actually
real for the active demo, not a dragon-merch-specific campaign slug baked into a shared
component.

## 2. Design questions

**(a) How does the nav become demo-aware without re-forking `NavTopBar`/`NavRail`?**
Resolved: both components already receive `demoSlug` as a prop (added by epic 34). Extend the
prop contract with a `navLinks: Array<{ href: string; label: string }>` array the page
layout builds server-side per demo (categories the demo's `MarketingCatalogService` actually
has, resolved at render time — not hardcoded per-demo branching inside the nav components
themselves, which would defeat the point of a shared, demo-agnostic nav component). The
existing hardcoded "Fall Sale" link is deleted; if a demo has a live campaign, it becomes one
more entry in this same `navLinks` array, built from real CMS/campaign data, not a literal
string.

**(b) Real product/service depth — new subsystem, or richer seed data?**
Resolved: richer seed data only. Every subsystem this needs already exists and is proven
(`marketing-catalog` for categories, `catalog` for multi-tier SKUs via `generateSkus`,
`service-areas` for location pages). This is a seed-data-and-CMS-content depth problem, not an
architecture problem — no new subsystem, no schema change.

## 3. Scope assessment

**Medium.** Bounded to one demo's seed data + shared nav component props + one CMS
content-authoring pass. No new subsystem, no new package, no persistence-model change.
Auto-proceeding to story decomposition per this repo's established medium-scope default.

## 4. Stories

1. **catalog-and-location-depth** — split Northline's 5 services into 4 real categories
   (TV & Home Theater, Security & Cameras, Networking & Fiber, Smart Home & Automation), add
   real tiered variants for at least 2 services (e.g. camera install priced per-camera-count:
   1/4/8-camera packages, not one flat SKU), and publish real CMS location pages for all 8
   service areas (today only 1 of 8 exists), each with distinct, non-templated-feeling content
   (real hours, a locally-flavored blurb, the services actually offered in that specific area
   per its existing `areaIndices` subset).
2. **real-nav-and-actions** — fix the nav contract (§2a): demo-built `navLinks` covering the 4
   new categories + a service-area picker/link, delete the hardcoded "Fall Sale" link from the
   shared nav components, confirm search actually returns Northline results for real queries
   (not just that the search page loads), confirm every nav link resolves to a real, non-404
   page.
3. **verification-and-closeout** — live-verify the full nav across every category/service-area
   link, confirm cart/checkout still works end to end with the new tiered SKUs, confirm
   dragon-merch's nav is unaffected (proving the demo-aware `navLinks` refactor didn't leak
   Northline-specific content into the other demo), update `docs/subsystems/15-service-areas.md`
   if its content-depth claims need updating, close out the backlog row, merge to master.

## 5. Risks

- **Medium** — deleting the hardcoded "Fall Sale" link and replacing it with demo-built
  `navLinks` touches the one shared nav component both demos render through. Mitigation: story
  3's acceptance criteria explicitly requires confirming dragon-merch's own nav still shows its
  real Fall Sale campaign link (now built dynamically from its own real campaign data, not
  hardcoded) — a demo-aware fix, not a regression.

## 6. Open questions

None blocking.
