#!/usr/bin/env bash
#
# fr-03's own "test" step: dry-runs keepalive-supabase.sh's real control-flow
# logic against fake/injected provider responses -- no real Supabase
# credentials touched, nothing real called. Stubs `psql` and `curl` on PATH
# so the script under test runs completely unmodified, exactly as it would
# in the real workflow.
#
# Scenarios, matching this story's own acceptance bar:
#   1. ping succeeds                              -> outcome "healthy"
#   2. ping fails, resume succeeds, re-ping succeeds -> outcome "woke"
#   3. ping fails, resume call itself fails         -> outcome "unrecoverable"
#   4. ping fails, resume succeeds, re-ping never succeeds -> "unrecoverable"
#      (resume "accepted" is not the same as "actually back up" -- see
#      keepalive-supabase.sh's own header comment)
#
# Run: bash .github/scripts/keepalive-supabase.test.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNDER_TEST="$SCRIPT_DIR/keepalive-supabase.sh"
STUB_DIR="$(mktemp -d)"
trap 'rm -rf "$STUB_DIR"' EXIT

failures=0

# --- fake `psql` ---
# Reads FAKE_PSQL_MODE: "ok" always succeeds; "fail" always fails;
# "fail_then_ok" fails on its first invocation (per test run, tracked via a
# counter file) and succeeds on every call after that -- models "resume
# worked, the next poll sees it back up."
cat >"$STUB_DIR/psql" <<'EOF'
#!/usr/bin/env bash
counter_file="${FAKE_PSQL_COUNTER_FILE:-/tmp/fake-psql-counter}"
case "${FAKE_PSQL_MODE:-ok}" in
  ok) exit 0 ;;
  fail) echo "FATAL: tenant or user not found (fake)" >&2; exit 1 ;;
  fail_then_ok)
    count=0
    [ -f "$counter_file" ] && count="$(cat "$counter_file")"
    count=$((count + 1))
    echo "$count" >"$counter_file"
    if [ "$count" -le 1 ]; then
      echo "FATAL: tenant or user not found (fake)" >&2
      exit 1
    fi
    exit 0
    ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$STUB_DIR/psql"

# --- fake `curl` ---
# Reads FAKE_CURL_HTTP_CODE and writes it as curl's own `-w '%{http_code}'`
# would, ignoring every real argument (including -o, which the real script
# relies on only to capture body text we don't need to fake here).
cat >"$STUB_DIR/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s' "${FAKE_CURL_HTTP_CODE:-200}"
EOF
chmod +x "$STUB_DIR/curl"

run_case() {
  local name="$1" expected_outcome="$2" expected_exit="$3"
  shift 3
  rm -f /tmp/fake-psql-counter
  local summary
  summary="$(mktemp)"
  env -i \
    PATH="$STUB_DIR:$PATH" \
    HOME="$HOME" \
    SUPABASE_DATABASE_URL="postgres://fake" \
    GITHUB_STEP_SUMMARY="$summary" \
    KEEPALIVE_RETRY_ATTEMPTS=2 \
    KEEPALIVE_RETRY_SLEEP_SECONDS=0 \
    "$@" \
    bash "$UNDER_TEST"
  local actual_exit=$?

  if ! grep -q "outcome: \*\*${expected_outcome}\*\*" "$summary"; then
    echo "FAIL [$name]: expected outcome '${expected_outcome}', summary was:"
    sed 's/^/    /' "$summary"
    failures=$((failures + 1))
  elif [ "$actual_exit" != "$expected_exit" ]; then
    echo "FAIL [$name]: expected exit code ${expected_exit}, got ${actual_exit}"
    failures=$((failures + 1))
  else
    echo "PASS [$name]: outcome=${expected_outcome}, exit=${actual_exit}"
  fi
  rm -f "$summary"
}

run_case "ping succeeds" "healthy" 0 \
  FAKE_PSQL_MODE=ok

run_case "ping fails, resume succeeds, re-ping succeeds" "woke" 0 \
  FAKE_PSQL_MODE=fail_then_ok FAKE_CURL_HTTP_CODE=200 \
  SUPABASE_ACCESS_TOKEN=fake-token SUPABASE_PROJECT_REF=fake-ref

run_case "ping fails, resume call itself fails -> unrecoverable" "unrecoverable" 1 \
  FAKE_PSQL_MODE=fail FAKE_CURL_HTTP_CODE=403 \
  SUPABASE_ACCESS_TOKEN=fake-token SUPABASE_PROJECT_REF=fake-ref

run_case "ping fails, resume accepted but re-ping never recovers -> unrecoverable" "unrecoverable" 1 \
  FAKE_PSQL_MODE=fail FAKE_CURL_HTTP_CODE=200 \
  SUPABASE_ACCESS_TOKEN=fake-token SUPABASE_PROJECT_REF=fake-ref

run_case "ping fails, no resume credentials configured -> unrecoverable" "unrecoverable" 1 \
  FAKE_PSQL_MODE=fail

rm -f /tmp/fake-psql-counter

if [ "$failures" -gt 0 ]; then
  echo "$failures scenario(s) failed."
  exit 1
fi
echo "All keepalive-supabase.sh dry-run scenarios passed."
