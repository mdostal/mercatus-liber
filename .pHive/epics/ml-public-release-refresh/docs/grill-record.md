# Grill Record — ml-public-release-refresh

**Source draft:** .pHive/epics/ml-public-release-refresh/docs/design-discussion.md
**CONTEXT.md substrate:** present
**inconsistency_risk_signals:** absent (heuristic pass; the draft's verified-state section is the evidence)
**round_number:** 1
**unresolved_count:** 14
**Generated:** 2026-11-23T18:40:00Z

## Summary

- Vocabulary mismatches: 2 findings
- Hidden assumptions: 6 findings
- Unresolved tensions: 4 findings
- Convention violations: 1 finding
- Posture mismatches: 1 finding

## Vocabulary mismatches

- **V1**: "release" and "version" mean three things. The CHANGELOG numbers releases (0.57.1), every
  `package.json` says 0.1.0, and C1 proposes a git tag v0.58.0. C2 keeps package versions at 0.1.0
  "until npm".
  - Draft location: C1, C2
  - Reference: CHANGELOG.md header; `packages/*/package.json`
  - Question for planner: Which number is the version a reader or consumer should quote? Should
    the tag, the CHANGELOG heading and the README badge all be that one number, with package.json
    explicitly called "unversioned until npm"?

- **V2**: "samples", "demos", "sample stores", "standalone" and "shared" are used interchangeably,
  but these are five deployments: one shared app with three paths, plus three standalone projects.
  The A4 URL list and the README table have to name the same set.
  - Draft location: A, A3, A4, C3
  - Question for planner: Is the canonical public URL for each store the standalone one or the
    shared path, so checks, README and docs agree on which one "the sample" is?

## Hidden assumptions

- **H1**: Assumes the print-shop fix restores everything. The same read-only Sanity token also
  sits behind print-shop's admin CMS editor (`updatePage` in `lib/actions.ts`) and the copilot's
  CMS edits, so those admin features are probably broken in production too. Not verified.
  - Draft location: A1, A2
  - Why this matters: A green page check would hide a broken admin demo that the README advertises
    ("everything a person can do in the admin, an agent can do").
  - Question for planner: Should A2 be decided before launch rather than left optional, and should
    the checks include one admin write path, or explicitly exclude admin?

- **H2**: Assumes an Editor-scoped Sanity token on a public demo server is acceptable. Demo admin
  is publicly reachable (it is a demo), so anyone could then rewrite the print-shop's Sanity content.
  - Draft location: A2
  - Why this matters: A defaced public sample during launch week.
  - Question for planner: Is the demo admin gated (dev password or Clerk) in production? If not, does
    the reset-demo-data path cover Sanity, or should writes stay off with the tile added once by hand?

- **H3**: Assumes connecting the 3 standalone projects and docs to git is free and harmless. Each
  git-linked project builds a preview for every PR. The repo would go from 2 to 5 builds per
  push on one Vercel account (build-minute and concurrency limits), and every PR gets 5 status checks.
  - Draft location: A3, B1
  - Question for planner: Production-branch-only deploys (an "Ignored Build Step" for previews) for
    the standalone projects? Which plan limits apply?

- **H4**: Assumes a status-code and marker check is reliable on cold serverless pages
  (northline took 3.8 s cold) and has no side effects.
  - Draft location: A4
  - Why this matters:
    - Flaky timeouts would open `sample-down` issues for nothing, so people learn to ignore them.
    - Requesting cart or checkout pages may create carts or set cookies.
    - Every check would count as a PostHog visit, inflating demo analytics.
  - Question for planner: What timeouts and retries does a failure need before an issue opens? Should
    the list be GET-only read pages? Should checks send a recognizable User-Agent that analytics
    filters out?

- **H5**: Assumes the stray `docs` Vercel project can simply be deleted. Verified: its production
  URL returns 404, so it serves nothing. But deletion is irreversible, and the owner hasn't said
  whether `docs` was meant to become the real one (it has the git link; `mercatus-liber-docs` has
  the URL).
  - Draft location: B1
  - Question for planner: Keep the project that holds the public URL (`mercatus-liber-docs`) and
    delete `docs`, or move the domain? Either way it's the owner's dashboard action, not the agent's.

- **H6**: Assumes the docs site picks up package READMEs cleanly. They contain repo-relative links
  (`../core`, `src/...`) and code fences written for GitHub, and some are long; the sync script
  rewrites nothing today.
  - Draft location: B2
  - Question for planner: Is link rewriting to GitHub URLs needed, or should package pages link out to
    GitHub instead of being copied?

## Unresolved tensions

- **U1**: "Live and updated end to end this week" against "the release goes after the docs".
  The docs and dashboard steps depend on the owner. If they slip, the release slips.
  - Draft location: Sequencing
  - Question for planner: Can the release tag go first, with notes linking to GitHub paths, so it
    doesn't wait on dashboard work?

- **U2**: Two scheduled jobs with different cadences (keepalive every 8 h, health every 6 h) and
  overlapping purposes.
  - Draft location: A4; existing keepalive.yml
  - Question for planner: One workflow with two jobs on one schedule, or keep them separate? The
    keepalive's own design notes argued for latency to real visitors.

- **U3**: Discussions on (C5) adds a surface someone has to answer during a content push, while
  the issue-based health alerts land in the same notifications.
  - Draft location: C5, A4
  - Question for planner: Is anyone going to answer Discussions this month? If not, leave them off.

- **U4**: The shop consumes commit-named tarballs from this session's scratchpad, while the release
  proposes tags and GitHub Releases with no assets.
  - Draft location: C1
  - Question for planner: Should each release attach the package tarballs, so consumers (the shop,
    outside folks) get them from a stable public place instead of a scratchpad?

## Convention violations

- **C1**: The draft's sample-stores status line is "re-checked by hand" today, and B3 proposes the
  health job update it. Repo convention (`apps/docs/scripts/sync-content.mjs`) is that docs are
  generated from committed sources at build time; a workflow committing to master on a schedule
  would be new and noisy.
  - Draft location: B3
  - Question for planner: Point the docs at the workflow's status badge or run history, and don't
    rewrite a doc on a schedule?

## Posture mismatches

- **P1**: The project memory says the sample stores exist to show multi-backend variety live, per
  demo. The draft checks for "up" but not for the variety. If the standalone stores are relinked and
  start sharing the shared demo's env by mistake, every check stays green while the variety
  disappears.
  - Draft location: A3, A4
  - Reference: memory "Multi-backend showcase intent"
  - Question for planner: Should each store's check assert its own backend marker? For example,
    `/architecture` already shows the per-demo backends, so each check could match "Convex" for
    broadleaf.
