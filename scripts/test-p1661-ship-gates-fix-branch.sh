#!/usr/bin/env bash
# test-p1661-ship-gates-fix-branch.sh — canary for P1661.
#
# ship-gates.sh must read a fix/pN-* branch exactly as it reads feature/pN-*:
# git-ops.sh resolve_ship_branch ships both, and a gate that sees only feature/
# reads main's copy of the spec (Gate 1.5) and picks one of two branches silently.
#
# Runs in a throwaway clone. Cases:
#   feature  control: feature/ branch, embargoed branch spec, stale review
#   fix      the same history on a fix/ branch: must give the same verdicts
#   wrong    on fix/, a review stamped for ANOTHER branch with the same pN must not count
#   two      a feature/ and a fix/ branch for one pN: gates 2.5 and 2.7 FAIL naming both
#   override the same two branches under --spec-file, or an --only run of an unrelated
#            gate: must NOT fail on local refs (P1246: --spec-file ignores branches)
# Output contract: no redirect tokens in status lines (shell-safety.md).
set -eu

SRC="$(cd "$(dirname "$0")/.." && pwd)"
PN=p999661

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
git clone -q "$SRC" "$work/repo"
cd "$work/repo"
git config user.email canary@example.com
git config user.name canary
# SHIP_GATES_UNDER_TEST names another copy, to prove this canary fails on the pre-fix code.
cp "${SHIP_GATES_UNDER_TEST:-$SRC/scripts/ship-gates.sh}" scripts/ship-gates.sh
git checkout -q -B main
base="$(git rev-parse HEAD)"

# The branch carries an embargoed spec; main carries a public stub of the same spec,
# so a gate reading main instead of the branch reports the wrong disclosure.
printf -- '---\nstatus: qa\ntype: bug\ndisclosure: public\n---\n# stub\n' > "features/${PN}_canary.md"
git add "features/${PN}_canary.md" && git commit -q -m "stub on main"
git checkout -q -b "feature/${PN}-canary"
printf -- '---\nstatus: qa\ntype: bug\ndisclosure: embargo\npipeline_ran: [fix]\n---\n# canary\n\n## Acceptance Criteria\n\n- [x] done\n' > "features/${PN}_canary.md"
echo "x" > src/p1661-canary.txt
git add "features/${PN}_canary.md" src/p1661-canary.txt && git commit -q -m "branch work"
branch_tip="$(git rev-parse HEAD)"
git checkout -q main

# A code review recorded for the branch an hour before its newest commit: stale.
finish="$(git rev-parse --path-format=absolute --git-common-dir)/.finish-reviewed"
stamp_review() {  # stamp_review BRANCH
  local old; old="$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)"
  printf '{"type":"code","pn":"%s","branch":"%s","sha":"%s","timestamp":"%s","issues_found":0,"issues_fixed":0}\n' \
    "$PN" "$1" "$branch_tip" "$old" > "$finish"
}

fails=0
expect() {  # expect NAME PATTERN — PATTERN must appear in the gate output
  local name="$1" want="$2"
  if printf '%s\n' "$out" | grep -qF -- "$want"; then
    echo "ok   ${name}"
  else
    echo "FAIL ${name}: wanted [${want}]"
    printf '%s\n' "$out" | sed 's/^/     /'
    fails=$((fails + 1))
  fi
}
run_gates() { out="$(./scripts/ship-gates.sh "$PN" --only 2.7 2>&1 || true)"; }

# Control: the feature/ branch is read correctly.
stamp_review "feature/${PN}-canary"
run_gates
expect "feature: Gate 1.5 reads the branch spec" "GATE 1.5 EMBARGO"
expect "feature: Gate 2.7 matches the branch review" "[GATE 2.7] PASS"
expect "feature: Gate 2.7b sees the stale review" "[GATE 2.7b] WARN"

# The same history on a fix/ branch.
git branch -q -m "feature/${PN}-canary" "fix/${PN}-canary"
stamp_review "fix/${PN}-canary"
run_gates
expect "fix: Gate 1.5 reads the branch spec" "GATE 1.5 EMBARGO"
expect "fix: Gate 2.7 matches the branch review" "[GATE 2.7] PASS"
expect "fix: Gate 2.7b sees the stale review" "[GATE 2.7b] WARN"

# A FRESH review on fix/ must read as current. The old no-branch arm compared the review's
# sha with main's HEAD and warned on every fix/ branch, so a WARN alone proves nothing.
fresh="$(date -u -v+1H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '1 hour' +%Y-%m-%dT%H:%M:%SZ)"
printf '{"type":"code","pn":"%s","branch":"fix/%s-canary","sha":"%s","timestamp":"%s","issues_found":0,"issues_fixed":0}\n' \
  "$PN" "$PN" "$branch_tip" "$fresh" > "$finish"
run_gates
expect "fix: Gate 2.7b reads a fresh review as current" "[GATE 2.7b] PASS"

# On fix/, a review recorded for a different branch of the same pN must not satisfy 2.7.
stamp_review "feature/${PN}-elsewhere"
run_gates
expect "wrong: a stamp for another branch does not count" "[GATE 2.7] FAIL"
stamp_review "fix/${PN}-canary"

# Two branches for one pN: refuse rather than pick one, and name both.
git branch -q "feature/${PN}-other" "$branch_tip"
check_rc() {  # check_rc NAME WANT_RC ARGS... — compare exit code only
  local name="$1" want="$2" rc=0; shift 2
  out="$(./scripts/ship-gates.sh "$@" 2>&1)" || rc=$?
  if [[ "$rc" -eq "$want" ]]; then echo "ok   ${name}: rc=${rc}"; else
    echo "FAIL ${name}: wanted rc=${want}, got rc=${rc}"; printf '%s\n' "$out" | sed 's/^/     /'; fails=$((fails + 1)); fi
}
check_rc "two branches: refused" 1 "$PN" --only 2.7
expect "two branches: 2.7 names the feature/ branch" "feature/${PN}-other"
expect "two branches: 2.7 names the fix/ branch" "fix/${PN}-canary"
check_rc "two branches: 2.5 refused" 1 "$PN" --only 2.5
expect "two branches: 2.5 says why" "[GATE 2.5] FAIL: several branches match"
run_gates
if printf '%s\n' "$out" | grep -qE "GATE 1.5 (PASS|EMBARGO)"; then
  echo "FAIL two branches: Gate 1.5 still gave a disclosure verdict"; fails=$((fails + 1))
else echo "ok   two branches: Gate 1.5 gives no verdict, only a warning"; fi

# The same ambiguity must not fail a run that does not read the branch.
override="$work/override.md"
printf -- '---\nstatus: qa\ntype: bug\ndisclosure: public\npipeline_ran: [fix]\n---\n# o\n\n## Acceptance Criteria\n\n- [x] done\n' > "$override"
check_rc "override: --spec-file ignores local branches" 0 "$PN" --spec-file "$override" --only 2.5
check_rc "override: an unrelated --only gate is not failed" 0 "$PN" --only 3.5

[[ "$base" == "$(git rev-parse main~1)" ]] || { echo "FAIL harness: main moved unexpectedly"; fails=$((fails + 1)); }
if [[ "$fails" -eq 0 ]]; then echo "P1661 canary: all cases passed"; else echo "P1661 canary: ${fails} case(s) failed"; fi
exit "$fails"
