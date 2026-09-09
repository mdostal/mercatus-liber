# Design Discussion — Epic 33: `docs-site`

## 0. Prelude

**Source:** direct user direction (2026-09-09), confirmed build tool: "New Nextra-based docs
app in this monorepo (Recommended) — Nextra (Next.js + MDX) fits this stack exactly, deploys
as its own Vercel project, renders the existing subsystem docs directly plus new getting-
started/architecture/API pages." No docs/wiki infrastructure exists today — this is a
from-scratch build (confirmed by a fresh audit before this whole redesign push began).

## 1. Goal

A real, rendered, navigable documentation site covering Mercatus Liber's architecture, the 21
subsystem docs, and how to get started (including the `create-store` skill from an earlier
epic), deployable as its own app — without duplicating the existing `docs/` markdown as a
second, driftable source of truth.

## 2. Research findings (grounding)

- **Nextra 4.6.1's peer range (`next: >=14`) has no upper bound** — no evidence of Next.js 16
  incompatibility; a public community template already demonstrates Nextra 4 running on Next
  16 with Turbopack. Plan: try `next@^16` first in the new app; if it misbehaves, the
  documented, low-risk fallback is pinning `apps/docs`'s own `next` dependency to the newest
  15.x line — confirmed genuinely independent per-app, since this repo's root tooling
  (`pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`) makes no shared-Next-version
  assumption across `apps/*`.
- **Nextra has no built-in way to point its content directory outside the app's own project
  tree.** Content must live under `apps/docs/content/` (or `src/content/`). No existing
  symlink/copy pattern exists anywhere in this repo to mirror.
- **Confirmed, current, exact setup**: `nextra` + `nextra-theme-docs` wrapping `next.config`,
  a `[[...mdxPath]]` catch-all route (`generateStaticParamsFor`/`importPage` from `nextra/
  pages`), and a root-level `mdx-components.tsx` — all pulled live from Nextra's own current
  documentation, not memory.
- **No `_meta.js` files are required** — the 22 subsystem docs already use a numeric filename
  prefix (`00-core-schema.md` … `21-admin-auth.md`), and Nextra's fallback sort is alphabetical
  with `index` pinned first, which already produces the correct order for free.
- **Deployment is a completely standard Next.js Vercel app** — Nextra adds no custom build
  pipeline. The one operational note: a Vercel project rooted at `apps/docs` needs "include
  files outside root directory" enabled to reach the repo-root `docs/` folder during build.

## 3. The design question, resolved: a build-time content-sync script, `docs/` stays the single source of truth

**Decision:** keep root `README.md`, `docs/ARCHITECTURE.md`, and `docs/subsystems/*.md`
exactly where they are — the same place every future epic already writes its subsystem docs
during planning — and add a small `apps/docs/scripts/sync-content.mjs` (`fs.cpSync`-based)
that copies them into `apps/docs/content/` as a `predev`/`prebuild` step in `apps/docs/
package.json` only. **Rejected the symlink alternative**: functionally similar, but a
build-time copy is more portable across CI/Vercel environments (no git-symlink-tracking
question, no dependence on a specific Vercel toggle behaving identically for symlinked vs.
copied files) and the research's own recommendation. This is entirely scoped to `apps/docs`'s
own `package.json` — zero root-level workspace config change, matching the pattern every
other new app addition in this repo has followed.

## 4. Scope

New content beyond the synced `docs/` tree: a real landing/index page for the docs site
(not a duplicate of the framework's own commerce.mdostal.com landing page — a docs-specific
"start here" page), and a getting-started page pointing at the `create-store` skill (epic 30)
and the demo storefronts (epic 31) as the concrete "see it running" proof.

## 5. Explicitly out of scope

- **Actual DNS/domain binding and the real Vercel project creation** — this epic builds and
  locally verifies the docs app; connecting it to a real domain (e.g. `docs.mdostal.com`) is
  an operational action in the user's own Vercel account, the same disclosed-gap posture this
  whole session has taken for live credentials/deployments. The commerce.mdostal.com landing
  page's `/docs` link (added in epic 31, explicitly marked as a placeholder pending this epic)
  gets updated to a configurable, documented value rather than a hardcoded guess.
- **API reference generation from code** (e.g. auto-generated TypeDoc pages per package) — a
  real, larger future capability; this epic ships the existing hand-written subsystem docs
  plus new narrative pages, not generated API references.
- **Search** — Nextra ships a default search integration option, but wiring a real search
  index/provider is not required for a first working docs site; noted as a disclosed,
  reasonable v1 gap, not silently skipped.

## 6. Scale assessment

**Medium.** A new, self-contained app (zero changes to any existing app's code beyond the one
landing-page link fix). Three stories: scaffold + content sync, narrative content (getting
started + landing), closeout.

## 7. Version bump

`minor` — a new deployable app in the workspace, no change to any existing package's contract.
