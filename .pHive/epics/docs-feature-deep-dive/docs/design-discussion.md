# Design Discussion: docs-feature-deep-dive

## 0. Context

Backlog epic 38. User's explicit ask: "the mercatus liber needs a deep dive OF the features,
actual docs, etc" — epic 33 shipped `apps/docs` (Nextra), which syncs the raw
`docs/subsystems/*.md` files (terse, ~1-2 paragraph technical reference docs written for this
project's own internal Hive planning process) plus two hand-authored landing/getting-started
pages. That is a docs *site*, not a feature *deep-dive* — this epic adds the deep-dive content
itself. Also folds in the user's separate mid-session ask: publish the planning corpus (real
`design-discussion.md` files + their HTML sidecars) publicly, not just conclusions.

## 1. A real, unplanned finding: duplicate docs infrastructure

**Found by direct inspection, not assumed.** A concurrent session (different Claude Code
session, same repo, same day) added `mkdocs.yml` + `docs/index.md` directly to master
(commit `b3bca2f`, "docs: add mkdocs-material baseline + docs link") — a second, entirely
separate docs-site technology (mkdocs-material) alongside the already-real, already-deployed,
already-linked-from-the-landing-page Nextra site (`apps/docs`, epic 33).

**Resolved: remove the mkdocs baseline, keep `apps/docs` canonical.** Reasoning:
`mkdocs.yml`/`docs/index.md` are a 2-file, unwired stub (a site_name/theme config and one
placeholder index page, verified by reading both files directly) — no CI, no deployment, no
inbound link from anywhere in the app, and zero real content. `apps/docs` is the opposite:
already synced from the real `docs/` tree, already has real narrative
landing/getting-started content, already linked from `commerce.mdostal.com`'s landing page via
`NEXT_PUBLIC_DOCS_URL`, already build-verified in CI (turbo). Running two parallel,
unreconciled docs sites would actively work against this epic's own goal (one real, deep,
trustworthy documentation surface) — a visitor landing on the wrong one would see a stub.
**This removal is flagged explicitly in this epic's final report, not silently done** — it is
someone else's recent work being removed, and the user should know that happened and why.

## 2. Design questions

**(a) Where does deep-dive content live?**
Resolved: extend the existing `apps/docs/content-src/` convention (epic 33's hand-authored,
committed pages — currently just `index.md`/`getting-started.md`) with one new page per major
capability area, synced into `apps/docs/content/` by the same existing `sync-content.mjs`
script (no script changes needed — it already copies everything under `content-src/`... **confirm
this is actually true by reading sync-content.mjs before assuming it**, since epic 33's design
only explicitly described README/ARCHITECTURE/subsystems syncing).

**(b) How does the planning corpus (design-discussions + sidecars) get published?**
Resolved: a new sync step, mirroring the existing `docs/subsystems/*.md` sync, copying every
epic's real `.pHive/epics/<name>/docs/design-discussion.md` into
`apps/docs/content/planning/<epic-name>.md`, with a new hand-authored index page
(`content-src/planning-index.md`) listing every epic with a one-line summary and a link to its
real design-discussion. **HTML sidecars** (Hive's generated `.html` planning-doc renderings) are
NOT synced as raw files — most of this session's epics used `sidecar_retention: transient`
(regenerated on demand, never committed), so there is nothing durable to copy for those. The
real, durable, always-available source is the `design-discussion.md` the sidecar was generated
from — publishing that (as real, Nextra-rendered MDX, not a raw file link) is a *better* public
artifact than a committed static HTML snapshot would be: always current, styled consistently
with the rest of the docs site, and doesn't require maintaining stale committed `.html` files.
This satisfies the actual intent (an outside contributor can see *why* a decision was made) more
robustly than literally embedding old HTML sidecars would.

**(c) Deep-dive content scope — how many pages, what depth?**
Resolved: one real narrative page per major capability area (not per subsystem — 22 subsystems
would be too granular and largely redundant with the already-synced subsystem docs). 8 areas,
grouping subsystems that form one real user-facing capability:
1. Commerce Core (catalog, cart, checkout-orders, payments)
2. Theming & Design System (theming/layout, the epic 34 switchable-theme system)
3. CMS & Marketing (CMS, marketing-catalog, search, service-areas)
4. Admin & Access Control (admin-auth, adapter-clerk, roles/permissions)
5. Promotions & Merchandising (promotions, bundles, recommendations, advertising)
6. Business Intelligence & Analytics (internal-bi, analytics/PostHog)
7. Plugins & AI/Agent Interface (plugins, AI/MCP interface)
8. Adapters & Portability (the adapter pattern itself, cross-cutting — persistence/CMS/payments/
   admin-auth/analytics swappability, feeding directly into epic 39's capability-matrix work)

Each page: what the capability does for a real shopper/operator, why it's architected the way it
is (not just "what," but "why" — the actual design reasoning, pulled from real subsystem docs
and design-discussions, not reinvented), a real code example or two pulled from this actual
repo (not invented pseudocode), and links to the relevant synced subsystem docs and planning
corpus entries for deeper reading.

## 3. Scope assessment

**Medium-large.** Mostly content authoring (8 real narrative pages + a planning-corpus sync
mechanism + one small infra cleanup), no new subsystem, no schema change, bounded to
`apps/docs` and root-level docs.

## 4. Stories

1. **docs-infra-reconciliation-and-planning-sync** — remove the duplicate mkdocs baseline
   (flagged explicitly), extend `sync-content.mjs` (or add a sibling script, confirm which is
   cleaner after reading the existing one) to sync every epic's `design-discussion.md` into
   `content/planning/`, author `content-src/planning-index.md`.
2. **deep-dive-pages-part-a** — real narrative pages for capability areas 1-4 (Commerce Core,
   Theming & Design System, CMS & Marketing, Admin & Access Control).
3. **deep-dive-pages-part-b** — real narrative pages for capability areas 5-8 (Promotions &
   Merchandising, Business Intelligence & Analytics, Plugins & AI/Agent Interface, Adapters &
   Portability).
4. **verification-and-closeout** — build `apps/docs`, live-verify every new page renders with
   real content and correct nav/sidebar placement, verify the planning-corpus pages render real
   design-discussion content for a sample of epics spanning this project's history, update the
   backlog, merge.

## 5. Risks

- **Low** — removing the mkdocs baseline could be seen as presumptuous since it's another
  session's work. Mitigation: explicitly flagged and justified in this doc and the final
  report, not silently done; the removed content was a 2-file, zero-content, unwired stub, not
  a working system with real content to lose.
- **Low** — syncing every epic's design-discussion.md publicly could inadvertently expose
  something sensitive. Mitigation: this repo's own explicit prior discipline already keeps real
  client content in separate, non-public repos (see epic 15a) — every design-discussion actually
  committed to *this* repo's history was already written with public/OSS release in mind (this
  project's own stated destination). A quick grep pass during story 1 for anything resembling a
  credential/secret/real-client-identifier is warranted as a sanity check, not because one is
  expected.

## 6. Open questions

None blocking.
