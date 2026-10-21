#!/usr/bin/env bash
# check-test-db-latency.sh — P1524 part 2.
#
# Answers one question for /day: does the TEST database still answer a simple REST read quickly?
# The test project stopped responding once during the 2026-10 free-plan overrun (P1522) and
# nothing reported it until a run hung.
#
# Read-only: one anon GET of a single id from `events`, three samples, the median reported.
# A median, so one cold-start sample does not warn on its own.
#
# Exit contract, matching the other day-cp checks:
#   0 — every sample answered 200 and the median is at or under the threshold.
#   1 — a finding: median over the threshold, or a sample that was not HTTP 200.
#   2 — could not run: the test URL or anon key is missing from .env.local.
# The last line of stdout is `TESTDB: <token>`, which day-cp.md turns into the CHECK line.
# Output contract (.claude/rules/shell-safety.md): no redirect tokens in status lines.
#
# TESTDB_WARN_MS overrides the 2000 ms threshold — set it to 1 to watch the check fire (gate 7).
# TESTDB_URL overrides the project URL — set it to an unroutable host to watch the 200 path fail.
# TESTDB_ENV_FILE overrides the env file — set it to /dev/null to watch the not-run path.
set -uo pipefail

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
# .env.local lives in the main checkout; worktrees carry a symlink to it.
ENV_FILE="${TESTDB_ENV_FILE:-$ROOT/.env.local}"
WARN_MS="${TESTDB_WARN_MS:-2000}"

envval() { grep -m1 "^$1=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"'; }
URL="${TESTDB_URL:-$(envval VITE_SUPABASE_URL)}"
KEY="$(envval VITE_SUPABASE_ANON_KEY)"
if [ -z "$URL" ] || [ -z "$KEY" ]; then
  echo "TESTDB: not-run the test project URL or anon key is not in .env.local"
  exit 2
fi

SAMPLES=()
for _ in 1 2 3; do
  # Key in a header file, never in argv (credentials.md); %{time_total} is seconds.
  out=$(curl -s -o /dev/null -m 10 -w '%{http_code} %{time_total}' \
    -H @<(printf 'apikey: %s\nAuthorization: Bearer %s\n' "$KEY" "$KEY") \
    "$URL/rest/v1/events?select=id&limit=1")
  code=${out%% *}
  ms=$(awk -v s="${out##* }" 'BEGIN{printf "%d", s*1000}')
  if [ "$code" != "200" ]; then
    [ "$code" = "000" ] && why="did not answer within 10 seconds" || why="answered HTTP $code"
    echo "TESTDB: problem the test database $why"
    exit 1
  fi
  SAMPLES+=("$ms")
done

MEDIAN=$(printf '%s\n' "${SAMPLES[@]}" | sort -n | sed -n 2p)
echo "samples_ms=${SAMPLES[*]}"
if [ "$MEDIAN" -gt "$WARN_MS" ]; then
  echo "TESTDB: problem the test database took ${MEDIAN} ms to answer, over ${WARN_MS} ms"
  exit 1
fi
echo "TESTDB: ok the test database answered in ${MEDIAN} ms"
exit 0
