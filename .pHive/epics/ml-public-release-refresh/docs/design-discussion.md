# Design discussion: Mercatus Liber public release refresh (week of 2026-11-23)

## Ask (verbatim, 2026-11-23)

"deep dive, /grill and /triage the releases for docs, the github page, and the samples around
mercatus liber -- we want to get it live and updated end to end for folks this week as we nail out
some content going into next month and add some occasional checks to the sample pages so they stay
live and i'll go through and re-enable -- get me an artifact together for it"

## Verified state (checked live 2026-11-23, not assumed)

### Samples
- Shared demo `commerce.mdostal.com` (Vercel `mercatus-liber-demo`, git-linked, master): home and
  `/architecture` 200. `/demo/northline` 200 (3.8 s cold), `/demo/broadleaf` 200.
- **`/demo/print-shop` (home, search, lines, a PDP) and `/sitemap.xml` returned 500.** Vercel runtime
  log: `SanityApiError: transaction failed: Insufficient permissions; permission "update" required`
  from `seedCmsPages` -> `cms.updatePage`. Introduced by PR #68 (2026-11-21), which adds a marketing
  tile to an existing home page at request time; production's Sanity token can't update. Fix in
  flight (best-effort insert + regression test), branch `fix/print-shop-seed-readonly-cms`.
- `/docs` on commerce.mdostal.com is 404 (the docs live elsewhere); `/api/health` 404 (no health route).
- Standalone stores `mercatus-liber-{print-shop,northline,broadleaf}.vercel.app` all 200, but their
  Vercel projects have **no git link** (`link: null`) and were last deployed 18 days ago, so they run
  code from about 2026-11-05 (no scheduled lines, no Printful browser, no recent payment fixes). Each pins
  its store with `SINGLE_TENANT_DEMO_SLUG`.
- `keepalive.yml` (every 8 h, all green) only pings Supabase Postgres. Nothing requests a page.

### Docs
- Docs site `mercatus-liber-docs.vercel.app` 200, but its Vercel project has **no git link**; last
  deploy 8 days ago.
- A second Vercel project, `docs`, is git-linked with no root directory and **fails on every PR**.
- Content comes from `docs/`, root README and VISION, plus `apps/docs/content-src/`. Package READMEs,
  where the last two weeks' features are documented (scheduled lines, Printful catalog browser,
  abandoned checkout and consent, statement descriptor, measured products), are not on the site.
- `sample-stores.md` says "Live status, re-checked 2026-11-05".
- GitHub wiki (4 pages) last edited 2026-10-16.

### GitHub page and releases
- Repo public, MIT, description and topics set, homepage commerce.mdostal.com, 0 stars.
- **No git tags, no GitHub Releases.** CHANGELOG.md stops at `[0.57.1] - 2026-11-11`; about 85 commits
  since 2026-10-25, including everything after Nov 11, are not in it. All 59 `package.json` files say
  `0.1.0`. Not on npm (README says so, on purpose).
- No custom social preview image (GitHub's generated card). Discussions off, wiki on.
- Issue and PR templates exist. 0 open issues, 0 open PRs.

## Proposal

### A. Samples live, then monitored
1. Ship the print-shop 500 fix and verify all three shared demos plus sitemap return 200.
2. Decide the Sanity token: give `mercatus-liber-demo` an Editor-scoped token so seeding can write
   (the tile appears), or keep it read-only and add the tile once in Sanity Studio. (Owner's call.)
3. Re-enable the standalone stores by connecting each Vercel project to `mdostal/mercatus-liber`,
   root `apps/reference-storefront`, production branch `master` (the owner does this in the Vercel
   dashboard). Env vars stay, so each keeps its `SINGLE_TENANT_DEMO_SLUG`.
4. Add `sample-health.yml`: a scheduled GitHub Actions job (every 6 h plus manual) that requests a
   checked-in list of URLs and asserts status 200, a size and a content marker for each. The list
   covers every store's home, a product, search and cart; lines on print-shop; sitemap; the docs
   home; the standalone stores. On failure it opens (or comments on) one GitHub issue labelled
   `sample-down`, and closes it on the next green run. Free, versioned, no paid monitor.

### B. Docs current
1. Connect `mercatus-liber-docs` to git (root `apps/docs`, master) and delete the stray `docs`
   project, so PRs stop failing and the docs track master.
2. Content: a "What's new" page covering the features shipped since Nov 11, and a "Packages" section
   synced from `packages/*/README.md` by the existing sync script, so package docs reach the site.
3. Refresh `sample-stores.md`'s live-status line from the health job instead of by hand.
4. Wiki: reduce it to a pointer to the docs site (one place to keep current).

### C. GitHub page and release
1. Write CHANGELOG entries for 2026-11-11 to today. Cut **v0.58.0**: git tag plus a GitHub Release with
   notes.
2. Keep `package.json` versions at 0.1.0 until npm publishing (README already says not on npm), but
   state the repo version (the tag) in the README badge.
3. README: refresh the feature list, the sample store table (standalone vs shared), and the status
   box; add a release badge and a "sample health" badge from the workflow.
4. Social preview: a typographic 1280×640 card in the brand tokens now; swap in a logo later (image
   generation for the logo is still separate work).
5. Turn on Discussions for questions; leave issues for bugs.

### D. Not this week
- npm publishing; the logo; the blog or launch announcement (next month's content); Convex schedule
  deploy.

## Sequencing
A1 -> A4 -> (owner: A2, A3, B1 dashboard steps) -> B2/B3 -> C1 -> C3/C4 -> C5. The release (C1) goes
after the docs, so the release notes can link to live pages.

## Revision after grill round 1 (2026-11-23)

- V1: the tag/CHANGELOG number is the version; package.json stays 0.1.0 "unversioned until npm" (t-007).
- V2: one canonical URL per store in README/docs (t-008); the health checks cover both shared and standalone.
- H1/H2: verified the demo admin returns 404 publicly, so an Editor token is only used by seeding and signed-in admins. The token is the owner's call (t-003).
- H3: standalone projects get production-only builds via Ignored Build Step (t-004).
- H4: checks are GET-only read pages with a recognizable UA and two cold-start retries; curl-style requests don't run PostHog's client JS.
- H5: `docs` project verified 404; deletion is the owner's dashboard action (t-005).
- H6: package README links get rewritten to GitHub (t-006).
- U1: the release can go first (t-007). U2: keepalive (DB) and sample-health (pages) stay separate, different jobs. U3: Discussions off until launch content (t-011). U4: releases attach tarballs (t-007).
- C1: no scheduled commits; docs link the badge (t-010). P1: /architecture check asserts Postgres, Convex and Sanity.
- Shipped: A1 (#78), A4 (#79).
