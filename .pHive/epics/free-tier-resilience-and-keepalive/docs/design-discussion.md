# Design discussion: free-tier-resilience-and-keepalive (epic 79)

## 1. Why this epic, and why now

Real user ask, 2026-10-15, after independently verifying production: "the accounts i made
mostly shutdown because they aren't getting traffic and free shit doesn't want to stay up
forever." Verified directly before writing this plan (not assumed): `commerce.mdostal.com`'s
root is fine, `/demo/broadleaf` (Convex-backed) is fine, but `/demo/print-shop` and
`/demo/northline` (both sharing the single `DATABASE_URL`) return real 500s. Live Vercel
function logs show the exact cause: `error: (ENOTFOUND) tenant/user
postgres.dhjnancsmuteowfgfebx not found` -- Supabase's own Supavisor pooler error signature
for a project that has been paused (free-tier auto-pause after inactivity) or deleted, not an
application bug. Separately, a live `mongosh` connection attempt against the
`MONGODB_URI` credential (not currently wired into any live demo) hung for the full 30s
timeout with no response -- consistent with that Atlas cluster also being unreachable, though
unconfirmed whether paused, deleted, or network-blocked.

User's explicit decision when asked how to handle this going forward (not paying for durable
hosting, not re-weighting every store onto never-pause backends): **accept intermittent
downtime on the free-tier backends, but (1) make the failure visible and graceful instead of
a raw 500, (2) build a recurring script that checks on and tries to revive the free
accounts, run "every so often."** They drew an explicit distinction: "our ACTUAL store will
stay up -- but the rest are free and open source and we can re-activate them." Read here as:
whichever deployment becomes this project's own flagship/primary demonstration is this
operator's job to keep genuinely reliable; the various sample/reference stores (the subject
of sibling epic 81, `separate-deployed-sample-stores`) are explicitly accepted as free,
open-source, and allowed to go idle -- the job here is detection, honest disclosure, and a
best-effort automated revival attempt, not a guarantee.

## 2. Scope

**In scope:**
1. Distinguish a backend-unreachable failure (Postgres pool/connection error, Mongo server-
   selection timeout) from every other kind of error in the catalog/persistence read path, and
   render a real, honest "this demo may be asleep -- attempting to wake it, give it a moment"
   state instead of Next.js's raw unstyled error page, with a manual retry action. This must
   not swallow or mask a *different* real bug as if it were just sleep -- only the specific,
   verified connection-refused/pooler-tenant-not-found/timeout error shapes get this treatment.
2. A scheduled, free-to-run keep-alive/revival job -- a GitHub Actions workflow (chosen because
   it's free, runs independent of any paid service or this session, and is versioned in the
   repo) on a daily cron. For each free backend currently wired to a live demo (Supabase
   Postgres; Mongo Atlas only if/when it's ever wired live -- verify current wiring via
   `/architecture` before assuming): attempt a lightweight real read first (this alone prevents
   future auto-pause from inactivity); if that fails, check whether the provider has a real,
   documented Management-API "resume/unpause" call (verify Supabase's actual Management API
   for this directly against its current docs -- do not assume MongoDB Atlas free M0 clusters
   support the same pause/resume semantics paid tiers do, that needs its own direct check) and
   attempt it; log the real outcome (woke it up / already awake / needs manual recreation)
   somewhere durable and visible -- a committed status file, or a GitHub Step Summary, not a
   silent no-op.
3. Fix today's actual outage for print-shop/northline for real: determine honestly whether the
   Supabase project is paused (recoverable) or gone (needs a brand-new free project + re-seed),
   do whichever is true, and live-verify both demo routes return 200 again afterward.
4. Disclose plainly, in whatever status surface this epic builds, when a free account is
   beyond automated recovery (deleted, not just paused) -- never silently paper over that with
   a "looks fine" status.

**Explicitly out of scope:**
- Which store becomes "the ACTUAL store" that gets paid/durable hosting -- that's a real,
  separate decision for whenever a specific store is chosen for that role, not assumed here.
- The separate-deployed-stores re-architecture itself (epic 81) -- this epic treats the
  *current* `/demo/<slug>` shape; the keep-alive mechanism it builds should be written so epic
  81's new deployments can reuse it, not duplicated.

## 3. Risks

| Risk | Mitigation |
|---|---|
| A "wake it up" retry loop masks a real, different bug as transient sleep | Match only the specific, verified connection-refused/pooler-tenant-not-found/timeout error shapes; anything else surfaces as a real error, not a friendly sleep screen |
| The keep-alive job itself becomes something that needs babysitting | GitHub Actions cron, not a dependency on this session or a paid scheduler; failure is visible in the repo's own Actions tab, not silent |
| Guessing at provider Management APIs that don't actually work the way assumed | Verify Supabase's and Atlas's real current resume/pause API shapes directly against their own docs before writing any resume-call code; disclose plainly if no such API exists for the free tier and the job can only ping, not resurrect |

## 4. Scale assessment

**Medium.** Real, bounded technical surface (one error-detection change in the persistence
read path, one new scheduled GitHub Actions workflow, one real live-recovery pass on the
current outage). Proceeding directly to stories.
