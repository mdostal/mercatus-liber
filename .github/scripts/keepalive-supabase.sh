#!/usr/bin/env bash
#
# free-tier-resilience-and-keepalive epic (fr-03): daily keep-alive/revival
# logic for the one free backend actually live-wired today -- Supabase
# Postgres, shared by the print-shop and northline demos via `DATABASE_URL`
# (confirmed live via https://commerce.mdostal.com/architecture's per-demo
# persistence table on 2026-10-15: print-shop and northline both show
# "Postgres", broadleaf shows "Convex" -- Convex has no comparable
# pause/resume concept to verify, and MongoDB Atlas is not wired into any
# live demo at all, see keepalive.yml's own header comment for why that one
# is deliberately NOT pinged here).
#
# Real, verified (not assumed) provider facts this script's logic depends on,
# researched directly against Supabase's current docs this session:
#   - A Free-plan project auto-pauses after it "does not receive sufficient
#     user database activity over the past week" (supabase.com/docs/guides/
#     platform/free-project-pausing). A plain `select 1` query is exactly the
#     kind of activity the same doc says is enough ("a few user requests to
#     the database each day ... is enough to keep the project from being
#     paused") -- so the ping below IS the preventive keep-alive, not just a
#     health check.
#   - The real Management API call to resume an already-paused project is
#     `POST https://api.supabase.com/v1/projects/{ref}/restore` -- confirmed
#     via Supabase's own API reference (supabase.com/docs/reference/api/
#     v1-restore-a-project: path `/v1/projects/{ref}/restore`, `projects:write`
#     OAuth scope / `project_admin_write` fine-grained permission, empty `{}`
#     response body on success) and independently cross-checked against
#     Make.com's Supabase Management integration, which describes the same
#     action in plain language as "Restores a previously paused project."
#     (This is distinct from the *separate* `v1-restore-pitr-backup`
#     endpoint, which restores a point-in-time database backup, not a
#     paused project -- the two are easy to conflate by name and were
#     checked separately so as not to wire the wrong one.)
#   - Supabase's own dashboard-restore flow documents only a 1-year window
#     after pausing during which a project can be restored at all
#     (supabase.com/docs/guides/platform/free-project-pausing); a restore
#     call that fails outright (non-200) is therefore treated as a real
#     "beyond automated recovery" signal, not retried forever.
#
# Usage: SUPABASE_DATABASE_URL=... SUPABASE_ACCESS_TOKEN=... \
#        SUPABASE_PROJECT_REF=... bash keepalive-supabase.sh
#
# All three env vars above are real GitHub Actions repository secrets the
# human must add -- see keepalive.yml's header and this repo's root
# README.md "Keep-alive job" section for exactly what each one is and where
# to get it. SUPABASE_ACCESS_TOKEN/SUPABASE_PROJECT_REF are optional in the
# sense that the script still runs and still pings without them (so the
# plain keep-alive ping keeps working even before the human adds the resume
# credentials) -- but no resume attempt is possible without both.
#
# Retry pacing (resume is asynchronous on Supabase's side -- a 200 from
# /restore means "resume accepted", not "already back up") is overridable
# for fast dry-run testing by keepalive-supabase.test.sh.
set -uo pipefail

SUPABASE_DATABASE_URL="${SUPABASE_DATABASE_URL:-}"
SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
SUMMARY_FILE="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
RETRY_ATTEMPTS="${KEEPALIVE_RETRY_ATTEMPTS:-6}"
RETRY_SLEEP_SECONDS="${KEEPALIVE_RETRY_SLEEP_SECONDS:-20}"
NOW="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

PING_LOG="$(mktemp)"
RESUME_LOG="$(mktemp)"
trap 'rm -f "$PING_LOG" "$RESUME_LOG"' EXIT

write_summary() {
  {
    echo "### Supabase Postgres keep-alive -- $NOW"
    echo "- backend: Supabase Postgres (print-shop / northline, shared \`DATABASE_URL\`)"
    echo "- outcome: **$1**"
    echo "- detail: $2"
  } >>"$SUMMARY_FILE"
}

if [ -z "$SUPABASE_DATABASE_URL" ]; then
  write_summary "config error" "SUPABASE_DATABASE_URL repository secret is not set -- cannot even attempt a ping. See README.md's 'Keep-alive job' section."
  echo "keepalive: config error: SUPABASE_DATABASE_URL is not set" >&2
  exit 1
fi

ping_db() {
  PGCONNECT_TIMEOUT=10 psql "$SUPABASE_DATABASE_URL" -X -q -t -c "select 1;" >"$PING_LOG" 2>&1
}

# Returns 0 only when the restore call itself returned HTTP 200 ("resume
# accepted" -- see header comment on why that's not the same as "already
# back up"). Returns 2 (not attempted) when credentials for it are missing,
# distinct from 1 (attempted, provider said no).
attempt_resume() {
  if [ -z "$SUPABASE_ACCESS_TOKEN" ] || [ -z "$SUPABASE_PROJECT_REF" ]; then
    return 2
  fi
  local http_code
  http_code="$(curl -sS -o "$RESUME_LOG" -w '%{http_code}' \
    -X POST "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/restore" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" 2>>"$RESUME_LOG")"
  [ "$http_code" = "200" ]
}

outcome=""
detail=""

if ping_db; then
  outcome="healthy"
  detail="Ping succeeded on the first attempt -- backend already awake. This ping itself counts as real database activity, resetting Supabase's 7-day auto-pause clock for another week."
else
  ping_error="$(tr '\n' ' ' <"$PING_LOG")"

  attempt_resume
  resume_rc=$?

  if [ "$resume_rc" = "2" ]; then
    outcome="unrecoverable"
    detail="Initial ping failed (\`${ping_error}\`) and no resume attempt was possible -- SUPABASE_ACCESS_TOKEN and/or SUPABASE_PROJECT_REF repository secrets are not set. Add them (see README.md's 'Keep-alive job' section) so this job can actually call the real Management API restore endpoint next time."
  elif [ "$resume_rc" = "0" ]; then
    # Resume accepted -- Supabase brings a paused project back up
    # asynchronously, so poll with a real wait instead of declaring success
    # or failure off the single /restore response.
    woke="false"
    attempt=1
    while [ "$attempt" -le "$RETRY_ATTEMPTS" ]; do
      sleep "$RETRY_SLEEP_SECONDS"
      if ping_db; then
        woke="true"
        break
      fi
      attempt=$((attempt + 1))
    done

    if [ "$woke" = "true" ]; then
      outcome="woke"
      detail="Initial ping failed (\`${ping_error}\`); the Management API restore call (\`POST /v1/projects/{ref}/restore\`) returned 200, and a follow-up ping succeeded after waiting -- the project resumed."
    else
      outcome="unrecoverable"
      detail="Initial ping failed (\`${ping_error}\`); the Management API restore call returned 200 (resume accepted) but the project was still unreachable after ${RETRY_ATTEMPTS} retries (~$((RETRY_ATTEMPTS * RETRY_SLEEP_SECONDS))s). It may just need more time -- check the Supabase dashboard directly before assuming it's beyond recovery."
    fi
  else
    resume_error="$(tr '\n' ' ' <"$RESUME_LOG")"
    outcome="unrecoverable"
    detail="Initial ping failed (\`${ping_error}\`) and the Management API restore call did not return 200 (\`${resume_error}\`). The project may be deleted or past Supabase's 1-year pause-restore window, or the credentials are wrong -- needs manual investigation in the Supabase dashboard; this is not something this job can self-heal."
  fi
fi

write_summary "$outcome" "$detail"
echo "keepalive: outcome=${outcome}"

if [ "$outcome" = "unrecoverable" ]; then
  exit 1
fi
exit 0
