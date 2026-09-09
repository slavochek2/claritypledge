#!/usr/bin/env bash
#
# test-reap-e2e-zombies.sh — canary for scripts/reap-e2e-zombies.sh (P1284, item 5).
#
# The reaper kills processes, so its classifier is tested against a FIXTURE
# process table and never against the real one: REAP_PS_FIXTURE and
# REAP_CWD_FIXTURE force the script into a mode where --kill cannot signal
# anything. No real pid is named anywhere in this file.
#
# Both directions are asserted, which is the point (epistemic gate 7b — green
# bounds what was modelled). A reaper that selects nothing is safe and useless;
# a reaper that selects a live session's browser is a session-killer. So every
# fixture row is either a MUST-REAP or a MUST-SPARE, and the counts are checked
# both ways.
#
# Run: ./scripts/test-reap-e2e-zombies.sh

set -uo pipefail
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
REAPER="$REPO/scripts/reap-e2e-zombies.sh"
RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; DIM=$'\033[2m'; NC=$'\033[0m'
PASSED=0; FAILED=0

WORK="$(mktemp -d "${TMPDIR:-/tmp}/reap-test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

GONE="$WORK/a-worktree-that-was-removed"
LIVE="$WORK/a-worktree-that-still-exists"
mkdir -p "$LIVE"

# ── the fixture process table ──────────────────────────────────────────────
# Columns are exactly `ps -eo pid=,ppid=,etime=,command=`.
cat > "$WORK/ps.txt" <<EOF
 9001     1    04:11:02 node /repo/.claude/worktrees/w9/node_modules/.bin/vite
 9002  4242    04:11:02 node /repo/.claude/worktrees/w8/node_modules/.bin/vite
 9003  4242 11-09:09:50 node /repo/tools/kanban/node_modules/.bin/vite
 9004     1    00:00:41 node /repo/.claude/worktrees/w7/node_modules/.bin/vite
 9005     1    02:43:33 npm exec @playwright/mcp@latest --headless
 9006     1    02:43:32 node /Users/x/.npm/_npx/abc/node_modules/.bin/playwright-mcp --headless
 9007     1    06:23:34 node /repo/node_modules/.bin/playwright test e2e/p683.spec.ts
 9008  4242    06:23:34 node /repo/node_modules/.bin/playwright test e2e/live.spec.ts
 9009     1    03:03:24 /Users/x/Library/Caches/ms-playwright/chromium-1234/headless_shell --headless
 9010     1 20-03:31:41 claude --chrome --model opus --dangerously-skip-permissions
 9011     1    05:00:00 /usr/bin/some-unrelated-daemon --port 5173
 9012     1    05:00:00 /bin/sh -c backup job vite marker
 9013     1    05:00:00 /bin/sh -c echo playwright and test data
 9014     1    05:00:00 vite --port 5199 --host
EOF

# cwd table: 9003 is a kanban server whose directory still exists (live parent
# anyway); 9002's worktree was deleted under it.
cat > "$WORK/cwd.txt" <<EOF
9002 $GONE
9003 $LIVE
EOF

run_reaper() {   # run_reaper <args...> — prints output, sets RC
  OUT="$( REAP_PS_FIXTURE="$WORK/ps.txt" REAP_CWD_FIXTURE="$WORK/cwd.txt" \
          "$REAPER" "$@" 2>&1 )"; RC=$?
}

check() {  # check <label> <condition-description> <0|1 result>
  if [[ "$3" -eq 1 ]]; then
    printf '%s✓%s %-64s\n' "$GREEN" "$NC" "$1"; PASSED=$((PASSED+1))
  else
    printf '%s✗%s %-64s\n' "$RED" "$NC" "$1"
    printf '%s\n' "$OUT" | sed 's/^/      /' | tail -20; FAILED=$((FAILED+1))
  fi
}

# Read from a process substitution, never `printf ... | grep -q`: under
# `pipefail` grep -q closes the pipe on the first match and the pipeline can
# report 141 for a SUCCESS (epistemic.md gate 7).
has()     { grep -Fq -- "$1" < <(printf '%s' "$OUT"); }
reaped()  { grep -Eq "^REAPABLE:$1:" < <(printf '%s' "$OUT"); }

echo "═══ reap-e2e-zombies.sh — classifier ═══"

run_reaper --list

echo "${DIM}MUST REAP — provably unowned${NC}"
check "9001 orphaned vite, 4h old"                "" "$( reaped 9001 && echo 1 || echo 0 )"
check "9002 vite whose worktree was deleted"      "" "$( reaped 9002 && echo 1 || echo 0 )"
check "9007 orphaned playwright test runner"      "" "$( reaped 9007 && echo 1 || echo 0 )"
check "9009 orphaned headless browser"            "" "$( reaped 9009 && echo 1 || echo 0 )"
check "9014 a bare 'vite' invocation is still ours" "" "$( reaped 9014 && echo 1 || echo 0 )"

echo "${DIM}MUST SPARE — this is the half that protects live sessions${NC}"
check "9003 vite with a live parent, 11 days old" "" "$( reaped 9003 && echo 0 || echo 1 )"
check "9004 orphaned vite younger than the age floor" "" "$( reaped 9004 && echo 0 || echo 1 )"
check "9005 @playwright/mcp — a live Claude session owns it" "" "$( reaped 9005 && echo 0 || echo 1 )"
check "9006 playwright-mcp — same, even orphaned and old" "" "$( reaped 9006 && echo 0 || echo 1 )"
check "9008 playwright test with a live parent"   "" "$( reaped 9008 && echo 0 || echo 1 )"
check "9010 the claude process itself"            "" "$( reaped 9010 && echo 0 || echo 1 )"
check "9011 an unrelated daemon whose flag says 5173" "" "$( reaped 9011 && echo 0 || echo 1 )"
# P1284 code review (codex, 2026-09-09): the classifier matched " vite" and
# "playwright...test" as substrings ANYWHERE in the command, so an orphaned
# shell that merely mentions either word was classified as ours and --kill would
# have signalled it. The word has to be the program being run, not a passing
# argument. These two are the whole reason the tightening exists.
check "9012 an orphaned shell that merely mentions vite" "" "$( reaped 9012 && echo 0 || echo 1 )"
check "9013 an orphaned shell that merely mentions playwright test" "" "$( reaped 9013 && echo 0 || echo 1 )"

n_reap="$(printf '%s\n' "$OUT" | grep -c '^REAPABLE:' || true)"
check "exactly 5 of the 14 rows are reapable (got ${n_reap})" "" "$( [[ "$n_reap" == 5 ]] && echo 1 || echo 0 )"
check "--list exits non-zero when it found candidates (exit ${RC})" "" "$( [[ "$RC" -ne 0 ]] && echo 1 || echo 0 )"

echo "${DIM}the age floor is a knob, and it moves the answer${NC}"
run_reaper --list --min-age-hours 24
check "at 24h only the 11-day-old orphan classes remain" "" \
  "$( [[ "$(printf '%s\n' "$OUT" | grep -c '^REAPABLE:' || true)" == 1 ]] && echo 1 || echo 0 )"
check "  and it is the deleted-worktree vite, which age never gated" "" \
  "$( reaped 9002 && echo 1 || echo 0 )"

echo "${DIM}a clean machine exits 0${NC}"
: > "$WORK/ps-clean.txt"
printf ' 9010     1 20-03:31:41 claude --chrome --model opus\n' >> "$WORK/ps-clean.txt"
OUT="$( REAP_PS_FIXTURE="$WORK/ps-clean.txt" REAP_CWD_FIXTURE="$WORK/cwd.txt" "$REAPER" 2>&1 )"; RC=$?
check "nothing reapable exits 0 (exit ${RC})" "" "$( [[ "$RC" -eq 0 ]] && echo 1 || echo 0 )"
check "  and says so"                          "" "$( has "0 reapable" && echo 1 || echo 0 )"

echo "${DIM}fixture mode can never signal — the safety interlock itself${NC}"
run_reaper --kill
check "--kill under a fixture degrades to a report" "" "$( has "no signal is sent" && echo 1 || echo 0 )"
check "  and sends no TERM"                        "" "$( has "TERM sent" && echo 0 || echo 1 )"

echo
if [[ $FAILED -eq 0 ]]; then
  echo "${GREEN}test-reap-e2e-zombies: ${PASSED} passed, 0 failed${NC}"; exit 0
else
  echo "${RED}test-reap-e2e-zombies: ${PASSED} passed, ${FAILED} FAILED${NC}"; exit 1
fi
