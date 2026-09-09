# Design Discussion: data-backup-restore-and-adapter-portability

## 0. Context

Backlog epic 39. User's explicit ask: backup/restore for demo/store data, with adapters
documented so an operator can "roll their own commerce and own store" against their own
separately-hosted database.

**A real, more fundamental finding, confirmed by direct inspection before any design work
here:** `apps/reference-storefront/lib/services.ts` hardcodes
`createSqliteAdapter(":memory:")` with **zero env-var branch to any other adapter** --
unlike CMS (`SANITY_PROJECT_ID`), admin-auth (`CLERK_SECRET_KEY`), and analytics
(`POSTHOG_API_KEY`), which all have real env-var-truthy-picks-the-real-adapter-else-a-fallback
wiring. This means every demo's data today is **entirely in-memory and lost on every server
restart** -- there is nothing to back up yet, because there is no persistent storage option
wired into the app at all, despite `@mercatus-liber/adapter-postgres` being real, tested code
(epic 8) and a file-backed SQLite mode being trivially available from
`@mercatus-liber/adapter-sqlite` itself. This was independently surfaced again by epic 38's
adapters-and-portability.md deep-dive page, which documented persistence as the one subsystem
with **no** env-branch in the reference app.

**This reframes the epic's real scope: wiring real, durable persistence is the actual
prerequisite this epic needs to do first**, not an assumed-solved dependency.

## 1. Design questions

**(a) Persistence env-var wiring -- what are the options?**
Resolved, mirroring the existing 3-state pattern every other adapter-info row already uses
(dev-default / real-option-A / real-option-B): `DATABASE_URL` set and truthy -> real Postgres
adapter (`createPostgresAdapter`); `SQLITE_FILE_PATH` set and truthy (and `DATABASE_URL` unset)
-> file-backed SQLite (`createSqliteAdapter(path)`, the SAME adapter class, just given a real
file path instead of `:memory:` -- zero new adapter code needed, this is purely a
services.ts wiring change); neither set -> today's exact `:memory:` behavior, unchanged, but
now clearly labeled "ephemeral, resets on restart" in `/admin/settings`'s adapter-visibility
row (which today has no persistence row at all -- add one, mirroring the existing
payments/CMS/analytics rows' shape).

**(b) Backup/restore -- one universal mechanism across all adapters, or scoped?**
Resolved: **scoped to the SQLite adapter specifically** (the actual zero-infra default every
demo uses today), not a universal serialization layer across all ~20 subsystems' data models.
Reasoning: Postgres and Shopify-backed deployments already have their own mature, real backup
tooling (`pg_dump`/`pg_restore`; Shopify's own data export) -- this framework reinventing a
worse version of that would contradict the adapter-agnostic philosophy (\"don't rebuild what a
real backend already does well\"), and would be a much larger, riskier undertaking for
questionable value. A real, working SQLite backup/restore (file copy via SQLite's own
`.backup`-equivalent, or a straightforward file-system copy for a closed/checkpointed DB) is a
genuinely useful, honestly-scoped deliverable for the common case (a small operator running the
zero-infra default), with Postgres/Shopify's native tooling explicitly documented as the
answer for those backends, not silently unaddressed.

**(c) Capability matrix -- new page, or extend the existing one?**
Resolved: **extend** `apps/docs/content-src/deep-dive/adapters-and-portability.md` (built by
epic 38, already a real, verified-accurate adapter table) rather than authoring a duplicate.
Add: the new persistence env-var wiring from (a), backup/restore guidance from (b), and a real
"pointing at your own separately-hosted database" walkthrough using the new `DATABASE_URL`/
`SQLITE_FILE_PATH` vars.

## 2. Scope assessment

**Medium.** One real, honestly-scoped feature (persistence wiring + SQLite backup/restore), no
new subsystem, extends existing docs rather than duplicating them.

## 3. Stories

1. **persistence-wiring-and-backup-restore** -- wire `DATABASE_URL`/`SQLITE_FILE_PATH` env-var
   branches into `services.ts` (mirroring the existing adapter-selection pattern), add the
   missing persistence row to `/admin/settings`'s adapter-visibility page, build a real
   SQLite backup (dump the live DB file to a timestamped backup path) and restore (load a
   named backup back into place) mechanism -- a CLI script under `packages/adapter-sqlite` (or
   a sibling location, developer's call after reading that package) is the right shape, not a
   web UI, since this is an operator/ops action, not a shopper- or admin-UI-facing feature.
2. **capability-matrix-docs-extension** -- extend the epic-38 adapters-and-portability.md page
   with the new env-var wiring, backup/restore guidance, and a real "bring your own database"
   walkthrough; update README.md's Configuration section with the new env vars.
3. **verification-and-closeout** -- live-verify real file-backed SQLite persistence survives a
   server restart, a real backup/restore round-trip actually preserves and restores real seeded
   data, docs render correctly, close out the backlog row, merge.

## 4. Risks

- **Medium** -- changing the default persistence wiring touches every demo's data layer.
  Mitigation: the in-memory `:memory:` default behavior is explicitly UNCHANGED when neither env
  var is set -- this is purely additive, opt-in wiring, not a default-behavior change.
- **Low** -- SQLite backup/restore correctness. Mitigation: story 3's live verification requires
  an actual round-trip proof (seed real data, back up, restore into a fresh location, confirm
  the restored data matches), not just "the script ran without erroring."

## 5. Open questions

None blocking.
