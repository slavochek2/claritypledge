#!/bin/bash
# scripts/test-typecheck-gate.sh — canary for scripts/typecheck-gate.sh (P861).
#
# Proves the pre-commit TypeScript gate actually BLOCKS an undeclared identifier
# in shipping app code (the P859 ReferenceError class) and ALLOWS clean code.
# This is the regression guard: it fails if the gate ever reverts to a no-op
# (e.g. back to the root-tsconfig `tsc --noEmit` that compiled nothing).
#
# Run by the pre-commit hook whenever typecheck-gate.sh, this file, or
# pre-commit-checks.sh is staged. Hermetic: writes one temp file under src/ that
# is removed on exit (trap), so the app tree is left untouched.
set -u

REPO_ROOT="$(git rev-parse --show-toplevel)"
GATE="$REPO_ROOT/scripts/typecheck-gate.sh"
CANARY="$REPO_ROOT/src/__typecheck_gate_canary__.ts"
PASS=0
FAIL=0

cleanup() { rm -f "$CANARY"; }
trap cleanup EXIT

# 1. BLOCKS: an undeclared identifier in non-test app code → gate exits exactly
#    1 (gate-class hit). Exit 2 (tooling failure) must NOT count as a pass — that
#    would let a broken/no-op gate masquerade as "it blocked" (review HIGH).
printf 'export const broken = thisIdentifierIsNotDefined_p861;\n' > "$CANARY"
GATE_RC=0; "$GATE" >/dev/null 2>&1 || GATE_RC=$?
if [ "$GATE_RC" -eq 1 ]; then
  echo "  OK   blocks-undeclared-identifier — gate blocked (exit 1)"
  PASS=$((PASS+1))
elif [ "$GATE_RC" -eq 2 ]; then
  echo "  FAIL blocks-undeclared-identifier — gate tooling error (exit 2); cannot confirm it detected the identifier"
  FAIL=$((FAIL+1))
else
  echo "  FAIL blocks-undeclared-identifier — expected BLOCK (exit 1), got exit $GATE_RC"
  FAIL=$((FAIL+1))
fi
rm -f "$CANARY"

# 2. ALLOWS: with no canary file the app tree is clean of the gate class → gate
#    exits exactly 0. Doubles as the regression guard for the P861 import fixes.
GATE_RC=0; "$GATE" >/dev/null 2>&1 || GATE_RC=$?
if [ "$GATE_RC" -eq 0 ]; then
  echo "  OK   allows-clean-tree — gate passed on clean app code (exit 0)"
  PASS=$((PASS+1))
else
  echo "  FAIL allows-clean-tree — gate did not pass on clean app code (exit $GATE_RC):"
  "$GATE" 2>&1 | head -10
  FAIL=$((FAIL+1))
fi

echo "typecheck-gate canary: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
