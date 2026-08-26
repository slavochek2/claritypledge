#!/usr/bin/env bash
# day-gates.test.sh — exercise every FAIL path of scripts/day-gates.sh.
#
# Usage: ./scripts/day-gates.test.sh
# Exit 0: every case behaved as asserted. Exit 1: at least one case did not.
#
# A gate nobody has watched FAIL is unproven (.claude/rules/epistemic.md gate 7):
# a green run proves the happy path runs, not that the gate fires. So every case
# below is a failure the gate must catch, and the assertion is on the exit code.
#
# Fails closed on purpose: DAY_GATES_TEST=1 makes day-gates.sh refuse to run
# unless both seams are set to fixtures. There is no safe live fallback — the
# token script touches the keychain and the pipeline pushes to an append-only
# calendar with no undo, so a test that quietly hit the real thing would be worse
# than no test at all.
#
# One real dependency: D3 imports the actual events.cadence module (read-only) so
# the source registry and thresholds under test are the real ones, not a copy that
# drifts. Only the tmp surface it reads is fixtured.
#
# Output contract: no >, <, or | at word boundaries (shell-safety.md P783).

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATES="${REPO_ROOT}/scripts/day-gates.sh"
CADENCE_DIR="${DAY_GATES_CADENCE_DIR:-$HOME/Projects/private/personal/beeper-digest/scripts}"

if [[ ! -f "${CADENCE_DIR}/events/cadence.py" ]]; then
  echo "FATAL: events.cadence not found at ${CADENCE_DIR} — cannot run D3 cases." >&2
  echo "       Set DAY_GATES_CADENCE_DIR to the beeper-digest scripts dir." >&2
  exit 2
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/day-gates-test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

pass_count=0
fail_count=0

_ts_ago() {  # hours ago, UTC, in the receipt's stamp format
  python3 -c "
from datetime import datetime, timedelta, timezone
print((datetime.now(timezone.utc) - timedelta(hours=$1)).strftime('%Y-%m-%dT%H:%M:%SZ'))"
}

_date_ago() {  # days ago, UTC, in the cache's run_date format
  python3 -c "
from datetime import datetime, timedelta, timezone
print((datetime.now(timezone.utc) - timedelta(days=$1)).strftime('%Y-%m-%d'))"
}

# Build a fixture dir: healthy caches for all three browser sources, no receipt yet.
# Floors and cadences come from the real cadence.SOURCES (todo_today 3/1d,
# sola 1/3d, facebook 1/7d) — the counts below clear them.
_new_fixture() {
  local fx="${WORK}/$1"
  mkdir -p "${fx}/tmp"
  _write_cache "$fx" todo-today-events-cache.json "$(_date_ago 0)" 5
  _write_cache "$fx" sola-events-cache.json "$(_date_ago 0)" 4
  _write_cache "$fx" facebook-events-cache.json "$(_date_ago 0)" 3
  _write_token_stub "$fx" 0 "BEEPER TOKEN: valid (27.0d left)."
  printf '{"receipt_ts":"","due_sources":{}}\n' 1>"${fx}/tmp/.day-gates-seen"
  echo "$fx"
}

_write_cache() {  # fixture_dir, filename, run_date, event_count
  local fx="$1" name="$2" run_date="$3" count="$4"
  python3 -c "
import json, sys
path, run_date, count = sys.argv[1], sys.argv[2], int(sys.argv[3])
payload = {'run_date': run_date,
           'events': [{'title': f'fixture event {i}'} for i in range(count)]}
with open(path, 'w') as fh:
    json.dump(payload, fh)
" "${fx}/tmp/${name}" "$run_date" "$count"
}

_write_receipt() {  # fixture_dir, hours_ago, created, skipped, failed, [mode], [considered]
  local fx="$1"
  python3 -c "
import json, sys
path, ts, created, skipped, failed, mode, considered = sys.argv[1:8]
c = int(considered) if considered else int(created) + int(skipped) + int(failed)
with open(path, 'w') as fh:
    sources = {name: {'status': 'success', 'detail': ''}
               for name in ('todo_today', 'sola', 'facebook')}
    json.dump({'ts': ts, 'considered': c, 'created': int(created), 'skipped': int(skipped),
               'failed': int(failed), 'degraded': [], 'mode': mode, 'sources': sources,
               'reason': ''}, fh)
" "${fx}/tmp/last-push.json" "$(_ts_ago "$2")" "$3" "$4" "$5" "${6:-full}" "${7:-}"
}

_mark_due() {  # fixture_dir, source key
  python3 - "${1}/tmp/.day-gates-seen" "${1}/tmp" "$2" <<'PY'
import hashlib, json, os, sys
seen_path, tmp_dir, name = sys.argv[1:]
cache = {'todo_today': 'todo-today-events-cache.json',
         'sola': 'sola-events-cache.json',
         'facebook': 'facebook-events-cache.json'}[name]
path = os.path.join(tmp_dir, cache)
digest = None
try:
    digest = hashlib.sha256(open(path, 'rb').read()).hexdigest()
except OSError:
    pass
seen = json.load(open(seen_path))
seen['due_sources'][name] = {'reason': 'due at fixture start', 'cache_sha256': digest}
with open(seen_path, 'w') as fh:
    json.dump(seen, fh)
PY
}

_set_source_status() {  # fixture_dir, source key, status, detail, [mode]
  python3 - "${1}/tmp/last-push.json" "$2" "$3" "$4" "${5:-}" <<'PY'
import json, sys
path, name, status, detail, mode = sys.argv[1:]
data = json.load(open(path))
actions = {
    'todo_today': 'Open Chrome, enable/connect the Claude extension, confirm Todo.Today loads past Cloudflare, then rerun /day.',
    'sola': 'Open Chrome, enable/connect the Claude extension, log in to Sola, then rerun /day.',
    'facebook': 'Open Facebook in Chrome, confirm you are logged in and the event pages load, then rerun /day. If they load but no usable events are written, repair the Facebook extractor/writer first.',
}
data.setdefault('sources', {})[name] = {'status': status, 'detail': detail,
                                         'action': actions[name]}
if mode:
    data['mode'] = mode
with open(path, 'w') as fh:
    json.dump(data, fh)
PY
}

_write_token_stub() {  # fixture_dir, exit_code, message
  local fx="$1"
  {
    printf '#!/usr/bin/env bash\n'
    printf 'echo "%s"\n' "$3"
    printf 'exit %s\n' "$2"
  } 1>"${fx}/token-stub.sh"
  chmod +x "${fx}/token-stub.sh"
}

# run_case NAME FIXTURE_DIR EXPECTED_EXIT [MODE]
run_case() {
  local name="$1" fx="$2" want="$3" mode="${4:-verify}"
  local got=0 out=""
  out="$(DAY_GATES_TEST=1 \
         DAY_GATES_BEEPER_DIR="$fx" \
         DAY_GATES_CADENCE_DIR="$CADENCE_DIR" \
         DAY_GATES_TOKEN_CMD="${fx}/token-stub.sh" \
         "$GATES" "--mode=${mode}" 2>&1)" || got=$?
  LAST_OUT="$out"
  if [[ "$got" == "$want" ]]; then
    echo "PASS  ${name}: exit ${got}"
    pass_count=$((pass_count + 1))
  else
    echo "FAIL  ${name}: expected exit ${want}, got ${got}"
    echo "$out" | sed 's/^/        /'
    fail_count=$((fail_count + 1))
  fi
}

# assert_out NAME PATTERN  — PATTERN must appear in the last case's output
assert_out() {
  if printf '%s\n' "$LAST_OUT" | grep -Fq "$2"; then
    echo "PASS  ${1}"
    pass_count=$((pass_count + 1))
  else
    echo "FAIL  ${1}: output did not contain: $2"
    printf '%s\n' "$LAST_OUT" | sed 's/^/        /'
    fail_count=$((fail_count + 1))
  fi
}

# assert_not_out NAME PATTERN  — PATTERN must NOT appear
assert_not_out() {
  if printf '%s\n' "$LAST_OUT" | grep -Fq "$2"; then
    echo "FAIL  ${1}: output contained forbidden text: $2"
    printf '%s\n' "$LAST_OUT" | sed 's/^/        /'
    fail_count=$((fail_count + 1))
  else
    echo "PASS  ${1}"
    pass_count=$((pass_count + 1))
  fi
}

echo "=== day-gates.sh FAIL-path suite ==="

# ── 1. no receipt at all ────────────────────────────────────────────────────
fx="$(_new_fixture no-receipt)"
run_case "no receipt" "$fx" 1
assert_out "no receipt names the missing artifact" "[D1] FAIL: no push receipt"

# ── 2. stale receipt (yesterday) ────────────────────────────────────────────
fx="$(_new_fixture stale-receipt)"
_write_receipt "$fx" 30 3 12 0
run_case "stale receipt, verify mode" "$fx" 1
assert_out "stale receipt says no push happened this run" "[D1] FAIL: last push was"

# ── 2b. A DAY OFF IS NOT AN ALARM. The real /day cadence is 1-3 days (gaps of
# 3d, 1d, 2d across 08-07/08-10/08-11/08-13), so a 36h start window would have
# fired NOT VERIFIED on two of the last three runs — and a gate that cries wolf
# is how the two previous fixes for this bug class died unnoticed.
run_case "30h gap is not an alarm at the top of the day" "$fx" 0 start
assert_out "start mode reports the age as a fact" "CALENDAR: last push"
assert_not_out "start mode never says the refresh failed" "NOT VERIFIED"

fx="$(_new_fixture three-days-off)"
_write_receipt "$fx" 72 3 12 0
run_case "three days off is still not an alarm" "$fx" 0 start

fx="$(_new_fixture week-stale)"
_write_receipt "$fx" 200 3 12 0
run_case "over a week with no push IS an alarm" "$fx" 1 start
assert_out "the week-stale wording is distinct" "[D1] FAIL: no successful push for"

# ── 3. every write rejected — passes a naive 'Push complete' check ─────────
fx="$(_new_fixture all-rejected)"
_write_receipt "$fx" 0 0 0 60
run_case "all writes rejected" "$fx" 1
assert_out "rejection is named" "[D2] FAIL: 60 of 60 calendar write(s) were REJECTED"

# ── 4. nothing pushed at all — incident #2 in miniature ────────────────────
fx="$(_new_fixture nothing-pushed)"
_write_receipt "$fx" 0 0 0 0
run_case "nothing reached the calendar" "$fx" 1
assert_out "empty push is named" "[D2] FAIL: nothing reached the calendar"

# ── 5. due Sola skipped because Chrome is unavailable ─────────────────────
fx="$(_new_fixture dead-sola)"
_write_cache "$fx" sola-events-cache.json "$(_date_ago 21)" 4
_mark_due "$fx" sola
_write_receipt "$fx" 0 3 12 0 partial
_set_source_status "$fx" sola skipped "Chrome or Claude extension unavailable" partial
run_case "due Sola skipped because Chrome is unavailable" "$fx" 1
assert_out "Sola failure is named" "Sola (4Seas Community) (sola) was due at /day start"
assert_out "Sola failure gives the human action" "Open Chrome, enable/connect the Claude extension, log in to Sola, then rerun /day."
assert_not_out "partial Sola run is never verified" "CALENDAR: VERIFIED"

# ── 5b. due Facebook writer returns no usable events ───────────────────────
fx="$(_new_fixture empty-facebook)"
_write_cache "$fx" facebook-events-cache.json "$(_date_ago 8)" 3
_mark_due "$fx" facebook
_write_receipt "$fx" 0 3 12 0 partial
_set_source_status "$fx" facebook failed "writer returned no usable events" partial
run_case "due Facebook writer failure" "$fx" 1
assert_out "Facebook failure is named" "Facebook (Chiang Mai events, this week) (facebook) was due at /day start"
assert_out "Facebook writer failure is concrete" "writer returned no usable events"
assert_out "Facebook failure gives the human action" "Open Facebook in Chrome, confirm you are logged in and the event pages load"

# ── 5c. every due source completes successfully ────────────────────────────
fx="$(_new_fixture all-due-success)"
_write_cache "$fx" todo-today-events-cache.json "$(_date_ago 1)" 5
_write_cache "$fx" sola-events-cache.json "$(_date_ago 3)" 4
_write_cache "$fx" facebook-events-cache.json "$(_date_ago 7)" 3
_mark_due "$fx" todo_today
_mark_due "$fx" sola
_mark_due "$fx" facebook
_write_cache "$fx" todo-today-events-cache.json "$(_date_ago 0)" 6
_write_cache "$fx" sola-events-cache.json "$(_date_ago 0)" 5
_write_cache "$fx" facebook-events-cache.json "$(_date_ago 0)" 4
_write_receipt "$fx" 0 3 12 0 full
run_case "all due browser sources completed" "$fx" 0
assert_out "all-due success is verified" "CALENDAR: VERIFIED (mode=verify)"

# ── 5d. --push-only forges the same counts without re-reading any source ───
# A real run's steady state is 0 created / N skipped, which `pipeline.py --push-only`
# reproduces off a days-old events.json in seconds, with no Beeper and no Chrome.
fx="$(_new_fixture push-only)"
_write_receipt "$fx" 0 0 134 0 push-only
run_case "push-only receipt is not a verified refresh" "$fx" 1
assert_out "the mode is named" "[D2] FAIL: the last push ran in mode 'push-only'"

# start mode still reports it — a manual repair push is a fact worth surfacing.
run_case "push-only receipt still reports at the top of the day" "$fx" 0 start

# ── 5e. a probe that cannot read must FAIL, never PASS ─────────────────────
# Both of these passed silently once. `|| rc=$?` sat inside the command
# substitution, so the failure code was assigned in the subshell and discarded and
# the parent still saw rc=0; and "read 0 sources" fell through the all-unhealthy
# check into the PASS branch. A probe returning emptiness is a broken probe, not a
# healthy calendar.
fx="$(_new_fixture bad-receipt-json)"
printf 'not json at all\n' 1>"${fx}/tmp/last-push.json"
run_case "malformed receipt JSON" "$fx" 1
assert_out "malformed receipt is named" "[D1] FAIL: push receipt"

fx="$(_new_fixture bad-receipt-ts)"
python3 -c "
import json, sys
with open(sys.argv[1], 'w') as fh:
    json.dump({'ts': 'yesterday-ish', 'created': 3, 'skipped': 12, 'failed': 0,
               'degraded': [], 'mode': 'full', 'reason': ''}, fh)
" "${fx}/tmp/last-push.json"
run_case "unparseable receipt timestamp" "$fx" 1

fx="$(_new_fixture broken-cadence)"
_write_receipt "$fx" 0 3 12 0
got=0
LAST_OUT="$(DAY_GATES_TEST=1 DAY_GATES_BEEPER_DIR="$fx" \
  DAY_GATES_CADENCE_DIR="${WORK}/no-such-cadence-dir" \
  DAY_GATES_TOKEN_CMD="${fx}/token-stub.sh" "$GATES" --mode=verify 2>&1)" || got=$?
if [[ "$got" == "1" ]]; then
  echo "PASS  unreadable cadence registry: exit 1"; pass_count=$((pass_count + 1))
else
  echo "FAIL  unreadable cadence registry: expected exit 1, got ${got}"; fail_count=$((fail_count + 1))
fi
assert_not_out "a blind probe is never a pass" "CALENDAR: VERIFIED"


# ── 5f. one flaky Google write must not turn the whole day red ─────────────
# There is no retry anywhere in the push loop, so a single 500 out of a 135-event
# batch would fire this gate regularly — and a gate that fires regularly is one the
# reader learns to skip.
fx="$(_new_fixture one-flaky-write)"
_write_receipt "$fx" 0 3 130 1
run_case "one rejected write warns, does not fail" "$fx" 0
assert_out "the flaky write is still surfaced" "[D2] WARN: 1 of 134 calendar write(s) rejected"

# ── 5g. events that vanish before any write ────────────────────────────────
# The push loop `continue`s without incrementing any counter when an event has no
# title or no date, so 40-in / 5-out was indistinguishable from a healthy run.
fx="$(_new_fixture vanished-events)"
_write_receipt "$fx" 0 3 12 0 full 40
run_case "vanished events warn" "$fx" 0
assert_out "the shortfall is counted" "25 vanished before any write"

# ── 5h. a receipt dated in the FUTURE is not evidence ──────────────────────
# `${r_age_h%%.*}` turned -0.4 into "-0", which bash arithmetic reads as 0 and
# accepts. Reachable after an NTP correction on wake.
fx="$(_new_fixture future-receipt)"
_write_receipt "$fx" -1 3 12 0
run_case "receipt from the future" "$fx" 1
assert_out "clock skew is named" "in the FUTURE"

# ── 5i. verify must tell "pushed just now" from "pushed earlier today" ─────
# This is the 2026-08-13 incident shape: Step 8 dropped entirely, but an earlier
# push that day left a receipt inside the 6h window. Freshness alone passed it —
# the gate built for the incident did not catch the incident.
fx="$(_new_fixture unchanged-receipt)"
_write_receipt "$fx" 2 3 12 0
run_case "start mode records the stamp" "$fx" 0 start
run_case "verify fails when the receipt never moved" "$fx" 1
assert_out "the unchanged receipt is named" "unchanged since the start of this run"

# a real refresh moves the stamp, and then verify passes
_write_receipt "$fx" 0 4 130 0
run_case "verify passes once a new push lands" "$fx" 0

# ── 6. unattended Beeper-only run is explicitly partial ───────────────────
fx="$(_new_fixture background-partial)"
_write_cache "$fx" todo-today-events-cache.json "$(_date_ago 2)" 5
_mark_due "$fx" todo_today
_write_receipt "$fx" 0 3 12 0 partial
_set_source_status "$fx" todo_today skipped "background run did not open Chrome" partial
run_case "background Beeper-only run is partial" "$fx" 1
assert_out "background mode is named partial" "last push ran in mode 'partial'"
assert_not_out "background partial is never day-verified" "CALENDAR: VERIFIED"

# ── 7. token EXPIRED / UNKNOWN — never reads as refreshed ──────────────────
fx="$(_new_fixture token-expired)"
_write_receipt "$fx" 0 3 12 0
_write_token_stub "$fx" 2 "BEEPER TOKEN: EXPIRED 3.0d ago."
run_case "token expired" "$fx" 1
assert_out "the loud block prints" "CM EVENTS: NOT REFRESHED"
assert_not_out "never reports the calendar verified" "CALENDAR: VERIFIED"

fx="$(_new_fixture token-unknown)"
_write_receipt "$fx" 0 3 12 0
_write_token_stub "$fx" 3 "BEEPER TOKEN: UNKNOWN - no keychain entry."
run_case "token unknown" "$fx" 1
assert_not_out "unknown never reports verified" "CALENDAR: VERIFIED"

# ── 7b. token EXPIRING is a warning, not a failure ─────────────────────────
fx="$(_new_fixture token-expiring)"
_write_receipt "$fx" 0 3 12 0
_write_token_stub "$fx" 1 "BEEPER TOKEN: EXPIRING in 4h."
run_case "token expiring warns only" "$fx" 0
assert_out "the expiry warning prints" "[D4] WARN: Beeper token EXPIRING"

# ── 8. early abort — the ledger must still print ───────────────────────────
# The abort is real, not simulated: a receipt whose `reason` carries a redirect
# token trips _safe_echo mid-D2, through a path that has no idea it is being
# tested. This is the defect ship-gates.sh shipped — abort under set -e, zero
# output, a non-zero code indistinguishable from "never ran".
fx="$(_new_fixture early-abort)"
python3 -c "
import json, sys
with open(sys.argv[1], 'w') as fh:
    json.dump({'ts': sys.argv[2], 'created': 0, 'skipped': 0, 'failed': 0,
               'degraded': [], 'reason': 'aborted: 3 > 0 pending'}, fh)
" "${fx}/tmp/last-push.json" "$(_ts_ago 0)"
run_case "early abort still prints a verdict" "$fx" 3
assert_out "the abort verdict prints" "aborted before completing"
assert_not_out "an abort is never a pass" "CALENDAR: VERIFIED"

# ── 9. happy path ──────────────────────────────────────────────────────────
fx="$(_new_fixture happy)"
_write_receipt "$fx" 0 3 12 0
run_case "happy path" "$fx" 0
assert_out "the verdict is affirmative" "CALENDAR: VERIFIED"
# Healthy checks collapse into one summary line — nine identical PASS lines a day,
# relayed twice per /day, is how a reader learns to skip the whole block.
assert_out "the counts are still reported" "D2 3 created, 12 skipped"
assert_out "the healthy run collapses to one line" "checks passed:"

# ── 10. beeper-digest missing entirely — cannot verify is not verified ─────
fx="${WORK}/absent-dir"
mkdir -p "$fx"
printf '#!/usr/bin/env bash\nexit 0\n' 1>"${WORK}/absent-token.sh"
chmod +x "${WORK}/absent-token.sh"
got=0
LAST_OUT="$(DAY_GATES_TEST=1 DAY_GATES_BEEPER_DIR="${WORK}/does-not-exist" \
  DAY_GATES_TOKEN_CMD="${WORK}/absent-token.sh" "$GATES" 2>&1)" || got=$?
if [[ "$got" == "1" ]]; then
  echo "PASS  missing beeper-digest: exit 1"; pass_count=$((pass_count + 1))
else
  echo "FAIL  missing beeper-digest: expected exit 1, got ${got}"; fail_count=$((fail_count + 1))
fi
assert_not_out "missing repo is never a pass" "CALENDAR: VERIFIED"

# ── 11. the harness itself fails closed ────────────────────────────────────
# Both exit-2 paths must still emit a verdict. They used to print NOTHING at all,
# because the trap was armed below the argument parsing — an agent relaying stdout
# verbatim relayed an empty string, and no CALENDAR: line existed to contradict a
# summary it composed instead.
got=0
LAST_OUT="$(DAY_GATES_TEST=1 "$GATES" 2>/dev/null)" || got=$?
if [[ "$got" == "2" ]]; then
  echo "PASS  test mode without fixtures refuses to run: exit 2"; pass_count=$((pass_count + 1))
else
  echo "FAIL  test mode without fixtures: expected exit 2, got ${got}"; fail_count=$((fail_count + 1))
fi
assert_out "fixture misconfig still prints a verdict" "CALENDAR: NOT VERIFIED"

got=0
LAST_OUT="$("$GATES" --mode=nonsense 2>/dev/null)" || got=$?
if [[ "$got" == "2" ]]; then
  echo "PASS  unknown flag rejected: exit 2"; pass_count=$((pass_count + 1))
else
  echo "FAIL  unknown flag: expected exit 2, got ${got}"; fail_count=$((fail_count + 1))
fi
assert_out "usage error still prints a verdict" "CALENDAR: NOT VERIFIED"
assert_not_out "usage error is never a pass" "CALENDAR: VERIFIED"

echo ""
echo "=== ${pass_count} passed, ${fail_count} failed ==="
[[ "$fail_count" -eq 0 ]] || exit 1
exit 0
