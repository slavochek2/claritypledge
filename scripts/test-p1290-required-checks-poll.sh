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
check "unreadable ruleset → fallback list, never empty" "audit-privacy disclosure" "$list"

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
echo "─────────────────────────────"
echo "  passed: $PASS   failed: $FAIL"
[[ "$FAIL" -eq 0 ]] || exit 1
