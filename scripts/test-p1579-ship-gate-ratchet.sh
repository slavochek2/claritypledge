#!/usr/bin/env bash
# test-p1579-ship-gate-ratchet.sh — canary for ship-gates.sh gate 3.8 (P1579).
#
# Runs the gate in a throwaway local clone against REAL history, so the controls are
# not synthetic fixtures (epistemic.md gate 7d):
#   bad   branch = the P1545 tip the 2026-10-27 push was refused on, main = its base
#   good  branch = one docs-only commit on top of main
#   none  no feature branch at all: SKIP, never FAIL and never a silent PASS
#   broken ratchet cannot load: must FAIL as "could not run", never as a pass
#   absent  no ratchet in the repo at all: SKIP by name
# Output contract: no redirect tokens in status lines (shell-safety.md).
set -eu

SRC="$(cd "$(dirname "$0")/.." && pwd)"
BAD_BASE=0981a77b6     # origin/main before the P1545 push
BAD_TIP=f37654208      # the snapshot CI refused: 16 ratchet regressions
GOOD_TIP=cb7a52e4f     # a docs-only commit; its parent is the base

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
git clone -q --no-checkout "$SRC" "$work/repo"
cd "$work/repo"
git checkout -q --detach "$BAD_TIP"
ln -s "$SRC/node_modules" node_modules
cp "$SRC/scripts/ship-gates.sh" scripts/ship-gates.sh
spec="$work/spec.md"
printf -- '---\nstatus: week\ntype: task\n---\n# canary\n' > "$spec"

fails=0
check() {  # check NAME EXPECTED_RC EXPECTED_WORD
  local name="$1" want_rc="$2" want="$3" rc=0 out
  out="$(./scripts/ship-gates.sh p999791 --spec-file "$spec" --only 3.8 2>&1)" || rc=$?
  if [[ "$rc" -eq "$want_rc" ]] && printf '%s\n' "$out" | grep -q "GATE 3.8\] ${want}"; then
    echo "ok   ${name}: rc=${rc} ${want}"
  else
    echo "FAIL ${name}: wanted rc=${want_rc} ${want}, got rc=${rc}"
    printf '%s\n' "$out" | sed 's/^/     /'
    fails=$((fails + 1))
  fi
}

git branch -q -f main "$BAD_BASE"
git branch -q -f feature/p999791-canary "$BAD_TIP"
check "bad branch (P1545 history)" 1 FAIL

git branch -q -f main "${GOOD_TIP}^"
git branch -q -f feature/p999791-canary "$GOOD_TIP"
check "good branch (docs only)" 0 PASS

git branch -q -D feature/p999791-canary
check "no feature branch" 0 SKIP

git branch -q -f feature/p999791-canary "$GOOD_TIP"
mv scripts/lib/quality-ratchet/size.cjs scripts/lib/quality-ratchet/size.cjs.off
check "ratchet cannot load (node exits 1)" 1 "FAIL: quality ratchet could not run"
mv scripts/lib/quality-ratchet/size.cjs.off scripts/lib/quality-ratchet/size.cjs

mv scripts/quality-ratchet.cjs scripts/quality-ratchet.cjs.off
check "no ratchet in repo" 0 SKIP

if [[ "$fails" -ne 0 ]]; then
  echo "test-p1579-ship-gate-ratchet: ${fails} case(s) failed"
  exit 1
fi
echo "test-p1579-ship-gate-ratchet: all 5 cases passed"
