#!/usr/bin/env bash
# Canary for P1290: push-docs promoted to main while a second REQUIRED check was still
# queued, because the poll waited on one hardcoded CI check name.
#
# WHAT THIS COVERS, and why each case earns its place:
#
#   Part 1 — evaluate_check_context: every non-success state of ONE required context.
#   The load-bearing case is `absent`. On 2026-09-09 `audit-privacy` concluded 09:55:17
#   while `disclosure` had not started until 09:55:40, so at promote time no
#   `disclosure` check-run existed on the SHA at all. Any formulation shaped like "every
#   check-run on this SHA is green" passes that state vacuously (epistemic gate 7b) —
#   which is how the bug survived — so `absent` is asserted separately from `pending`.
#
#   Part 2 — wait_for_required_checks: the POLL LOOP. An earlier draft of this canary
#   tested only the single-context helper and then RE-IMPLEMENTED the loop inside the
#   test to check the green path. That is a fixture asserting its own copy of the logic:
#   it cannot catch an empty wait-list, a red check hidden behind a queued one, or
#   anything about the loop's control flow. A hostile review caught it. The loop now
#   lives in the library precisely so this file can call the real thing.
#
#   Part 3 — fail-closed. An unreadable ruleset must never yield an empty wait-list;
#   empty means "wait for nothing", which promotes instantly and is strictly worse than
#   the bug being fixed.
#
#   Part 4 — portability. `status` is read-only in zsh, which silently empties a verdict.
#
#   Part 6 (P1635) — a repeated ship-to-prod at the same SHA must start a fresh run, not read the old one as stale.
#
#   Part 5 (P1635) — the unit-test job is optional on main, so promotion must PRINT its result and
#   never refuse on it: green, red, still running, absent, and already-required each have a case.
#
# Every RED case is paired with a GREEN one (epistemic gate 7c): a gate whose fixture
# contains only inputs it should reject leaves its false-positive rate unmeasured.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO_ROOT/scripts/lib-datetime.sh"
source "$REPO_ROOT/scripts/lib-required-checks.sh"

PASS=0
FAIL=0
STUB_DIR="$(mktemp -d)"
trap 'rm -rf "$STUB_DIR"' EXIT
export PATH="$STUB_DIR:$PATH"

ok()  { PASS=$((PASS+1)); echo "  ✅ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ❌ $1"; }
check() { if [[ "$3" == "$2" ]]; then ok "$1"; else bad "$1 — expected '$2', got '$3'"; fi; }

SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
NOW=$(date +%s)
iso() { date -u -r "$1" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ; }
FRESH="$(iso "$NOW")"
OLD="$(iso "$((NOW-9000))")"

# `gh` stub. Faithful on the two things the library actually depends on:
#   - it filters by the check_name QUERY PARAMETER (server-side), as the real endpoint
#     does — the library stopped fetching-then-selecting because the unfiltered response
#     pages at 30 and this repo already returns 30 of 33 on one SHA;
#   - it applies the --jq's sort_by(started_at)|last semantics.
# CHECK_RUNS_JSON holds the full array; RULESET_CONTEXTS the ruleset reply (empty =
# simulate an unreadable ruleset).
cat > "$STUB_DIR/gh" <<'STUB'
#!/usr/bin/env bash
args="$*"
case "$args" in
  *rules/branches*)
    [[ -n "${RULESET_CONTEXTS:-}" ]] || exit 1
    printf '%s\n' "$RULESET_CONTEXTS"
    ;;
  *check-runs*)
    # The library calls: gh api -X GET <endpoint> -f check_name=<ctx> -f per_page=100
    # Pull the value of the check_name flag, preserving spaces, by walking argv.
    name=""
    prev=""
    for a in "$@"; do
      case "$prev" in -f) case "$a" in check_name=*) name="${a#check_name=}";; esac;; esac
      prev="$a"
    done
    printf '%s' "${CHECK_RUNS_JSON:-[]}" | CR_NAME="$name" python3 -c '
import sys, json, os
want = os.environ.get("CR_NAME", "")
try:
    runs = json.load(sys.stdin)
except Exception:
    runs = []
m = [r for r in runs if r.get("name") == want]
if not m:
    print("null")
else:
    m.sort(key=lambda r: r.get("started_at") or "")
    print(json.dumps(m[-1]))
'
    ;;
  *) exit 1 ;;
esac
STUB
chmod +x "$STUB_DIR/gh"

run_json() { export CHECK_RUNS_JSON="$1"; }
cr() { # cr <name> <status> <conclusion|null> <head_sha> <started_at>
  printf '{"name":"%s","status":"%s","conclusion":%s,"head_sha":"%s","started_at":"%s"}' \
    "$1" "$2" "$3" "$4" "$5"
}

echo "P1290 canary — required-status-check poll"
echo
echo "── Part 1: one context, every verdict ──"

run_json "[$(cr audit-privacy completed '"success"' "$SHA" "$FRESH")]"
check "green+fresh → success"        "success"  "$(evaluate_check_context "$SHA" audit-privacy "$NOW")"
check "no check-run at all → absent" "absent"   "$(evaluate_check_context "$SHA" disclosure "$NOW")"

run_json "[$(cr disclosure in_progress null "$SHA" "$FRESH")]"
check "still running → pending"      "pending"  "$(evaluate_check_context "$SHA" disclosure "$NOW")"

run_json "[$(cr disclosure completed '"success"' "$SHA" "$OLD")]"
check "green but pre-dates push → stale" "stale" "$(evaluate_check_context "$SHA" disclosure "$NOW")"

run_json "[$(cr disclosure completed '"failure"' "$SHA" "$FRESH")]"
check "red → reports its conclusion" "failure"  "$(evaluate_check_context "$SHA" disclosure "$NOW")"

run_json "[$(cr disclosure completed '"success"' "$SHA" "$OLD"),$(cr disclosure completed '"failure"' "$SHA" "$FRESH")]"
check "newest wins — old green cannot mask new red" "failure" "$(evaluate_check_context "$SHA" disclosure "$NOW")"

echo
echo "── Part 2: the poll loop (the part that actually promotes) ──"
export RC_SLEEP_CMD=:   # drive the loop at full speed

# GREEN (gate 7c): all required contexts green and fresh must promote.
run_json "[$(cr audit-privacy completed '"success"' "$SHA" "$FRESH"),$(cr disclosure completed '"success"' "$SHA" "$FRESH")]"
wait_for_required_checks "$SHA" "$NOW" 100 10 audit-privacy disclosure >/dev/null 2>&1
check "all required green → returns 0 (promote)" "0" "$?"

# RED: the exact P1290 shape — one green, one that has not appeared yet.
run_json "[$(cr audit-privacy completed '"success"' "$SHA" "$FRESH")]"
wait_for_required_checks "$SHA" "$NOW" 40 10 audit-privacy disclosure >/dev/null 2>&1
rc=$?
check "one green + one ABSENT → does NOT promote" "1" "$rc"
check "  and names the blocker" "disclosure=absent" "$RC_BLOCKING"

# RED: a queued context must not hide a red one (H4 — evaluate every context each cycle).
run_json "[$(cr disclosure completed '"failure"' "$SHA" "$FRESH")]"
wait_for_required_checks "$SHA" "$NOW" 40 10 audit-privacy disclosure >/dev/null 2>&1
rc=$?
check "red check behind a QUEUED one → detected as red, not timeout" "2" "$rc"
check "  and names the failing context" "disclosure" "$RC_FAILED_CONTEXT"
check "  and its conclusion" "failure" "$RC_FAILED_CONCLUSION"

# RED: an empty wait-list must never mean "nothing to wait for".
wait_for_required_checks "$SHA" "$NOW" 40 10 >/dev/null 2>&1
check "EMPTY required-check list → refuses to promote" "1" "$?"

# RED: a context name containing a space survives as one context.
run_json "[$(cr audit-privacy completed '"success"' "$SHA" "$FRESH"),$(cr "Secret Scan" completed '"success"' "$SHA" "$FRESH")]"
wait_for_required_checks "$SHA" "$NOW" 40 10 audit-privacy "Secret Scan" >/dev/null 2>&1
check "context name with a space → handled as ONE context" "0" "$?"

echo
echo "── Part 3: fail-closed ──"
unset RULESET_CONTEXTS
fb="$(derive_required_contexts main; echo "rc=$?")"
rc="${fb##*rc=}"
list="$(printf '%s' "$fb" | sed '/^rc=/d;/^[[:space:]]*$/d' | tr '\n' ' ' | sed 's/ *$//')"
check "unreadable ruleset → non-zero return" "1" "$rc"
check "unreadable ruleset → fallback list, never empty" "audit-privacy disclosure schema-ready" "$list"

export RULESET_CONTEXTS=$'audit-privacy\ndisclosure'
check "readable ruleset → derived list" "audit-privacy disclosure" \
  "$(derive_required_contexts main | tr '\n' ' ' | sed 's/ *$//')"

echo
echo "── Part 4: shell portability ──"
# `status` is READ-ONLY in zsh (its alias for $?). Assigning to it aborts the assignment
# and the function returns an empty verdict. This canary runs under bash and
# structurally CANNOT emit that input (gate 7b), so assert it statically instead. Found
# only by sourcing the library from an interactive zsh, 2026-09-09.
reserved=""
for name in status argv options; do
  grep -qE "^[[:space:]]*(local[[:space:]]+)?${name}=" "$REPO_ROOT/scripts/lib-required-checks.sh" \
    && reserved="$reserved $name"
done
check "no zsh-reserved variable names assigned" "" "${reserved# }"

if command -v zsh >/dev/null 2>&1; then
  if zsh -c "source '$REPO_ROOT/scripts/lib-datetime.sh'; source '$REPO_ROOT/scripts/lib-required-checks.sh'" 2>/dev/null; then
    ok "library sources cleanly under zsh"
  else
    bad "library fails to source under zsh"
  fi
fi

echo
echo "── Part 5 (P1635): the optional unit job is PRINTED at promotion, never enforced ──"
# await_unit_check_report is the one function both promote paths call after the required checks
# are green. Each clause of its contract is asserted here, and every RED shape has a GREEN twin:
# a unit job that PASSES must also flow through without noise or refusal (gate 7c).
export RC_SLEEP_CMD=:
export GIT_OPS_UNIT_MAX_WAIT=40 GIT_OPS_UNIT_POLL=10 GIT_OPS_UNIT_ABSENT_GRACE=20
UNIT="$UNIT_CHECK_CONTEXT"

# await_unit_check_report sets globals, so a command substitution would lose them. Run it in
# this shell, with stderr to a file, for the cases that assert the globals.
unit_report_here() {
  await_unit_check_report "$SHA" "$NOW" "promote" "$@" 2>"$STUB_DIR/unit.err"; URC=$?
  UOUT="$(cat "$STUB_DIR/unit.err")"
}

# GREEN: the unit job passed.
run_json "[$(cr "$UNIT" completed '"success"' "$SHA" "$FRESH")]"
unit_report_here audit-privacy disclosure
check "unit job green → returns 0" "0" "$URC"
case "$UOUT" in *PASSED*) ok "  and prints PASSED" ;; *) bad "  green run did not print PASSED: $UOUT" ;; esac
check "  and the branch may be deleted" "0" "$UNIT_JOB_STILL_RUNNING"

# RED, the spec's clause: a red OPTIONAL unit job is printed and promotion is NOT refused.
run_json "[$(cr "$UNIT" completed '"failure"' "$SHA" "$FRESH")]"
unit_report_here audit-privacy disclosure
check "unit job RED → still returns 0 (promotion not refused)" "0" "$URC"
case "$UOUT" in *"concluded failure"*RED*) ok "  and prints that it concluded failure and the suite is RED" ;; *) bad "  red unit job was not printed: $UOUT" ;; esac
check "  and records the verdict" "failure" "$UNIT_JOB_VERDICT"
check "  and a CONCLUDED run does not hold the branch" "0" "$UNIT_JOB_STILL_RUNNING"

# RED: still running at the deadline. Printed, not refused, and the branch is kept.
run_json "[$(cr "$UNIT" in_progress null "$SHA" "$FRESH")]"
unit_report_here audit-privacy disclosure
check "unit job still running at the deadline → returns 0" "0" "$URC"
case "$UOUT" in *"STILL RUNNING"*) ok "  and prints STILL RUNNING" ;; *) bad "  running job not reported: $UOUT" ;; esac
check "  and flags the staging branch as in use" "1" "$UNIT_JOB_STILL_RUNNING"
if unit_job_blocks_staging_delete; then ok "  and unit_job_blocks_staging_delete says do not delete"; else bad "  delete guard did not fire for a running job"; fi

# RED: no run ever appeared (workflow not on this commit). Not silent.
run_json "[]"
unit_report_here audit-privacy disclosure
check "no unit run at all → returns 0" "0" "$URC"
case "$UOUT" in *"no unit job"*"NOT run"*) ok "  and says the full suite was NOT run on this landing" ;; *) bad "  missing unit run was silent: $UOUT" ;; esac
check "  and nothing is running, so the branch is free" "0" "$UNIT_JOB_STILL_RUNNING"

# RED: a green run left over from a PRIOR staging cycle must not read as this push's result.
run_json "[$(cr "$UNIT" completed '"success"' "$SHA" "$OLD")]"
unit_report_here audit-privacy disclosure
case "$UOUT" in *PASSED*) bad "stale green from an earlier cycle was reported as PASSED" ;; *) ok "stale green run is not reported as this push's PASS" ;; esac

# GREEN twin: once the founder makes the unit job required, it is judged by the required poll and
# must not be waited for a second time.
run_json "[]"
unit_report_here audit-privacy disclosure "$UNIT"
case "$UOUT" in *"required check"*) ok "unit job in the REQUIRED list → deferred to the required poll, not waited twice" ;; *) bad "required unit job was re-waited: $UOUT" ;; esac
check "  and never holds the branch" "0" "$UNIT_JOB_STILL_RUNNING"

# The output must stay redirect-safe (shell-safety.md): no word-boundary > < | in a printed line.
run_json "[$(cr "$UNIT" completed '"failure"' "$SHA" "$FRESH")]"
unit_report_here audit-privacy disclosure
if printf '%s\n' "$UOUT" | grep -qE '(^|[[:space:]])[<>|]([[:space:]]|$)'; then bad "printed output carries a bare redirect token"; else ok "printed output carries no bare redirect token"; fi

echo
echo "── Part 5b (P1635): the call sites and the workflow ──"
GITOPS="$REPO_ROOT/scripts/git-ops.sh"
body() { awk -v f="$1" '$0 ~ "^"f"\\(\\) \\{" {on=1} on {print NR": "$0} on && /^}/ {exit}' "$GITOPS"; }
first_line() { printf '%s\n' "$1" | grep -E "$2" | head -1 | cut -d: -f1; }
for fn in cmd_push_docs cmd_ship_to_prod; do
  B="$(body "$fn")"
  POLL="$(first_line "$B" '^[0-9]+:[[:space:]]+wait_for_required_checks ')"
  REPORT="$(first_line "$B" '^[0-9]+:[[:space:]]+await_unit_check_report ')"
  RECHECK="$(first_line "$B" 'promote-time re-check\)')"
  if [ -n "$POLL" ] && [ -n "$REPORT" ] && [ "$REPORT" -gt "$POLL" ] && [ "$REPORT" -lt "$RECHECK" ]; then
    ok "$fn: reports the unit job after the required poll and before the promote-time re-check"
  else bad "$fn: poll=$POLL report=$REPORT recheck=$RECHECK"; fi
  # Every staging delete AFTER the report must sit behind the running-job guard.
  UNGUARDED="$(printf '%s\n' "$B" | awk -v r="${REPORT:-0}" '
    { n=$1; sub(/:$/,"",n); line[NR]=$0; num[NR]=n }
    END { for (i=1;i<=NR;i++) if (num[i]+0 > r && line[i] ~ /--delete/ && line[i] !~ /^[0-9]+:[[:space:]]*#/ && line[i] !~ /echo/) {
            g=0; for (j=i-3;j<i;j++) if (j>=1 && line[j] ~ /unit_job_blocks_staging_delete/) g=1
            if (!g && line[i] !~ /unit_job_blocks_staging_delete/) print line[i] } }')"
  [ -z "$UNGUARDED" ] && ok "$fn: every staging delete after the report is behind the running-job guard" \
    || bad "$fn: unguarded staging delete(s): $UNGUARDED"
done
RECLAIM="$(body reclaim_staging_and_die)"
printf '%s\n' "$RECLAIM" | grep -q 'unit_job_blocks_staging_delete' \
  && ok "reclaim_staging_and_die keeps the branch while the unit job runs" \
  || bad "reclaim_staging_and_die can delete a staging branch under a running unit job"

WF="$REPO_ROOT/.github/workflows/test.yml"
if python3 - "$WF" <<'PY'
import re, sys
t = open(sys.argv[1]).read()
m = re.search(r"^on:\s*\n\s+push:\s*\n(?:\s*#.*\n)*\s+branches:\s*\[(.*?)\]", t, re.M)
sys.exit(0 if m and "'staging/**'" in m.group(1).replace('"', "'") else 1)
PY
then ok "test.yml runs on push to staging/**"; else bad "test.yml does not trigger on staging/**"; fi
# The check name the poll waits for is the workflow's job id; derive it, never trust a copy (gate 7e).
JOBID="$(awk '/^jobs:/{on=1;next} on && /^  [A-Za-z0-9_-]+:/{gsub(/[ :]/,"");print;exit}' "$WF")"
check "test.yml's first job id is the context the promote waits for" "$UNIT_CHECK_CONTEXT" "$JOBID"

# STAGING_BRANCH_PREFIX other than staging/ is refused, the default is accepted.
HOP="$(awk '/^print_staging_hop\(\)/,/^}/' "$GITOPS")"
hop_run() { ( eval "$HOP"; STAGING_BRANCH_PREFIX="$1" print_staging_hop p1 "$SHA" ) 2>&1; }
hop_run "" >/dev/null; check "default prefix → hop guidance printed (rc 0)" "0" "$?"
hop_run "staging/" >/dev/null; check "explicit staging/ → accepted (rc 0)" "0" "$?"
OUT_REL="$(hop_run "release/")"; RC_REL=$?
check "STAGING_BRANCH_PREFIX=release/ → guidance withheld, rc 0 (a landed op must not fail)" "0" "$RC_REL"
case "$OUT_REL" in *"outside staging/"*) ok "  and says why" ;; *) bad "  refusal printed no reason: $OUT_REL" ;; esac
case "$OUT_REL" in *"git push origin"*) bad "  refusal still printed promote commands" ;; *) ok "  and prints no promote commands for the uncovered branch" ;; esac
# Through a CALLER under the shell options git-ops.sh really runs with. A subshell without set -e only
# proves the function's own rc; the defect was in what a bare call does to its caller.
CALLER_OUT="$(bash -c 'set -euo pipefail; eval "$1"; landed() { STAGING_BRANCH_PREFIX=release/ print_staging_hop p1 "$1"; echo "AFTER_HOP deploy_test_on_land runs"; }; landed "$2"' _ "$HOP" "$SHA" 2>/dev/null)"
CALLER_RC=$?
check "a set -euo pipefail caller survives the withheld hop (rc 0)" "0" "$CALLER_RC"
case "$CALLER_OUT" in *"AFTER_HOP"*) ok "  and the statements after it still run" ;; *) bad "  the caller was aborted by the hop refusal" ;; esac


echo
echo "── Part 6 (P1635): a repeated ship-to-prod at the same SHA starts a fresh CI run ──"
# The defect (reproduced with stubs before the fix): staging/pN left on origin at the SAME sha makes the
# next staging push a no-op. Nothing reaches GitHub, no workflow starts, the first attempt's checks read
# `stale` against the new push epoch, and the poll holds main.lock for its whole budget. Here the REAL
# block from cmd_ship_to_prod is extracted and run against a local bare origin whose pre-receive hook
# counts what actually reaches the server. (That a no-op push starts no workflow is GitHub behaviour and
# cannot be shown locally; "reaches the server zero times" is the local stand-in.)
T6="$(mktemp -d)"
RBS="$(awk '/^remote_branch_sha\(\)/,/^}/' "$GITOPS")"
BLOCK6="$(awk '/^cmd_ship_to_prod\(\) \{/{on=1} on && /local existing_staging_sha/{cap=1} cap{print} cap && /ship-to-prod \[3\/6\]: pushing to staging branch/{exit}' "$GITOPS")"
if [[ -z "$BLOCK6" ]]; then bad "could not extract the existing-staging block from cmd_ship_to_prod"; fi
git init -q --bare "$T6/origin.git"
printf '#!/bin/sh\necho x >> "%s/events"\n' "$T6" > "$T6/origin.git/hooks/pre-receive"; chmod +x "$T6/origin.git/hooks/pre-receive"
git init -q "$T6/work"
( cd "$T6/work" && git config user.email t@x && git config user.name t && echo a > f && git add f && git commit -q -m c1 && git remote add origin "$T6/origin.git" )
SHA6="$(git -C "$T6/work" rev-parse HEAD)"
( cd "$T6/work" && echo b > f && git commit -q -am c2 ); OTHER6="$(git -C "$T6/work" rev-parse HEAD)"
events() { if [ -f "$T6/events" ]; then wc -l < "$T6/events" | tr -d ' '; else echo 0; fi; }
run6() { # run6 <sha> : the extracted block, as cmd_ship_to_prod would reach it, die = exit
  ( export REPO_ROOT="$T6/work"; die() { echo "DIE: $*" >&2; exit 1; }
    eval "$RBS"; eval "f() { local local_sha=$1 staging_branch=staging/p1
$BLOCK6
}"; f ) >"$T6/run.out" 2>&1
}
# no ref yet: nothing to delete
run6 "$SHA6"; check "no staging ref on origin → the block deletes nothing" "0" "$(events)"
# first attempt's ref, same sha: the block must delete it so the re-push is a real push
git -C "$T6/work" push -q origin "$SHA6:refs/heads/staging/p1" 2>/dev/null
check "  first attempt reached the server once" "1" "$(events)"
run6 "$SHA6"
check "ref left on origin at the SAME sha → deleted before the re-push (one more event)" "2" "$(events)"
check "  and the ref is gone from origin" "" "$(git -C "$T6/work" ls-remote origin refs/heads/staging/p1 | awk '{print $1}')"
git -C "$T6/work" push -q origin "$SHA6:refs/heads/staging/p1" 2>/dev/null
check "  and the re-push then reaches the server again (a fresh ref, so a fresh CI run)" "3" "$(events)"
# GREEN twin: a ref at a DIFFERENT sha is left for the force-with-lease push, which moves it on its own
git -C "$T6/work" push -q --force origin "$OTHER6:refs/heads/staging/p1" 2>/dev/null
before6="$(events)"
run6 "$SHA6"
check "ref at a DIFFERENT sha → not deleted (the lease push moves it and starts its own run)" "$before6" "$(events)"
# unreachable origin: refuse to push blind rather than risk the no-op
git -C "$T6/work" remote set-url origin "$T6/does-not-exist.git"
run6 "$SHA6"; rc6=$?
check "unreachable origin → the block dies instead of pushing blind" "1" "$rc6"
case "$(cat "$T6/run.out")" in *"cannot reach origin"*) ok "  and says so" ;; *) bad "  silent: $(cat "$T6/run.out")" ;; esac
rm -rf "$T6"

echo
echo "─────────────────────────────"
echo "  passed: $PASS   failed: $FAIL"
[[ "$FAIL" -eq 0 ]] || exit 1
