# Design Discussion: vision-and-community-roadmap

## 0. Context

Backlog epic 47. `VISION.md` (repo root) already exists with the real content this epic needs --
a "Done" / "In progress" / "Wanted, not started" structure written earlier this session. What's
missing, confirmed by direct inspection: `apps/docs/scripts/sync-content.mjs` syncs `README.md`
and `docs/ARCHITECTURE.md` into the docs site, but **not `VISION.md`** -- it exists only as a
repo file, never actually published live anywhere. Also, since it was written, 7 more epics
completed (34-39, 45) that its own "In progress" section still lists as in-progress -- it's
stale relative to real current state.

## 1. Design questions

**(a) A new roadmap page, or sync the existing VISION.md?**
Resolved: **sync VISION.md itself**, exactly mirroring the existing README/ARCHITECTURE sync
pattern in `sync-content.mjs` -- it already has the exact "done / in progress / wanted, not
started" structure the backlog description asks for. Authoring a second, separate roadmap page
would immediately create the same kind of drift risk the docs-deep-dive epic just resolved for
the mkdocs duplication -- one real source, published live, not two documents to keep in sync
by hand.

**(b) Where does it need to be linked from?**
Resolved: the docs site's own nav (alongside README/Architecture -- confirm Nextra's
auto-discovery already surfaces it once synced, per the established pattern from every other
synced page this session), AND the framework landing page (`commerce.mdostal.com`'s root) --
this is the more likely first-touch point for a prospective adopter or contributor, so a real,
visible "Vision & Roadmap" link belongs in its own nav/footer, not just buried in the docs site.

**(c) Content refresh -- in scope here?**
Resolved: yes, small and necessary. `VISION.md`'s "In progress" section currently lists
`storefront-design-system-v2`, the demo-depth trilogy, fulfillment/shipping, SEO/AEO, analytics,
backup/restore, and the docs deep-dive itself as all still in-progress -- 7 of those are now
actually **done**. A stale "vision" document undermines the entire point of publishing one.
Move genuinely completed items to "Done," leave genuinely not-yet-started items
(fulfillment/shipping epics 41-44, analytics epic 46) under "In progress" or move them
appropriately based on real current `epic-backlog.md` status -- read that file fresh, don't
assume from memory.

## 2. Scope assessment

**Small-medium.** One doc content refresh, one sync-script addition (mirroring an existing
pattern exactly), two nav-link additions. No new subsystem, no schema change.

## 3. Stories

1. **vision-content-refresh-and-sync** -- refresh VISION.md's Done/In-progress sections against
   the real current epic-backlog.md state, add VISION.md to sync-content.mjs's sources
   (-> content/vision.md), verify it builds and renders with real current content.
2. **nav-prominence-and-closeout** -- link `/vision` prominently from the docs site's own nav
   (confirm Nextra auto-discovers it, add an explicit link if not) and from the framework
   landing page's nav/footer, live-verify both, update the backlog, merge.

## 4. Risks

- **Low.** Purely additive sync + content refresh + nav links.

## 5. Open questions

None blocking.
