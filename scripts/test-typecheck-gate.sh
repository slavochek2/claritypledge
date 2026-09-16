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
# P1323: a .tsx sibling, because the surface-prop scenarios need JSX.
CANARY_TSX="$REPO_ROOT/src/__typecheck_gate_canary__.tsx"
PASS=0
FAIL=0

cleanup() { rm -f "$CANARY" "$CANARY_TSX"; }
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

# ── P1323: the required `surface` prop on ClarityLandingLayout ───────────────────
#
# 3. BLOCKS a layout with no `surface`. Asserting exit 1 alone is NOT enough here: this
#    canary tree could hit the gate for an unrelated reason and still exit 1. So the output
#    must also NAME the surface rule — otherwise a passing scenario 3 would not prove that
#    THIS rule fired, only that something did.
printf '%s\n' \
  "import { ClarityLandingLayout } from '@/app/layouts/clarity-landing-layout';" \
  "export const noSurface = <ClarityLandingLayout><div /></ClarityLandingLayout>;" \
  > "$CANARY_TSX"
GATE_RC=0; GATE_OUT="$("$GATE" 2>&1)" || GATE_RC=$?
if [ "$GATE_RC" -eq 1 ] && grep -qF "missing its required \`surface\` prop" <<< "$GATE_OUT"; then
  echo "  OK   blocks-missing-surface — gate blocked and named the surface rule (exit 1)"
  PASS=$((PASS+1))
elif [ "$GATE_RC" -eq 2 ]; then
  echo "  FAIL blocks-missing-surface — gate tooling error (exit 2); cannot confirm it detected the missing prop"
  FAIL=$((FAIL+1))
else
  echo "  FAIL blocks-missing-surface — expected BLOCK naming the surface rule, got exit $GATE_RC:"
  head -10 <<< "$GATE_OUT"
  FAIL=$((FAIL+1))
fi
rm -f "$CANARY_TSX"

# 4. DOES NOT FIRE on a DIFFERENT missing required prop. This is the discriminating control.
#    App code carries pre-existing TS2741 errors for other props; a surface rule that matched
#    TS2741 wholesale would block every commit on its own baseline. Scenario 3 cannot see that
#    defect — it only proves the rule fires — so this one proves it fires on `surface` ONLY.
printf '%s\n' \
  "function NeedsSomeOtherProp(_props: { somethingElse: string }) { return null; }" \
  "export const otherMissing = <NeedsSomeOtherProp />;" \
  > "$CANARY_TSX"
GATE_RC=0; GATE_OUT="$("$GATE" 2>&1)" || GATE_RC=$?
if [ "$GATE_RC" -eq 0 ]; then
  echo "  OK   ignores-other-missing-prop — a non-surface TS2741 does not trip the rule (exit 0)"
  PASS=$((PASS+1))
else
  echo "  FAIL ignores-other-missing-prop — the surface rule fired on an unrelated prop (exit $GATE_RC):"
  head -10 <<< "$GATE_OUT"
  FAIL=$((FAIL+1))
fi
rm -f "$CANARY_TSX"

# 5. BLOCKS the MULTI-prop form. `<ClarityLandingLayout />` is missing children AND surface,
#    which tsc reports as TS2739, not TS2741 — the form a first version of the gate let
#    through with exit 0 (adversarial review, Gemini 3.8).
printf '%s\n' \
  "import { ClarityLandingLayout } from '@/app/layouts/clarity-landing-layout';" \
  "export const bothMissing = <ClarityLandingLayout />;" \
  > "$CANARY_TSX"
GATE_RC=0; GATE_OUT="$("$GATE" 2>&1)" || GATE_RC=$?
if [ "$GATE_RC" -eq 1 ] && grep -qF "missing its required \`surface\` prop" <<< "$GATE_OUT"; then
  echo "  OK   blocks-missing-surface-multi-prop — TS2739 form blocked and named (exit 1)"
  PASS=$((PASS+1))
else
  echo "  FAIL blocks-missing-surface-multi-prop — expected BLOCK naming the surface rule, got exit $GATE_RC:"
  head -10 <<< "$GATE_OUT"
  FAIL=$((FAIL+1))
fi
rm -f "$CANARY_TSX"

# 5b. BLOCKS the createElement form: TS2769, where "missing ... surface" is on a CONTINUATION
#     line with no error code. A line-based match cannot see it (Codex Sol reproduced exit 0).
printf '%s\n' \
  "import { createElement } from 'react';" \
  "import { ClarityLandingLayout } from '@/app/layouts/clarity-landing-layout';" \
  "export const viaCreate = createElement(ClarityLandingLayout, {}, 'x');" \
  > "$CANARY_TSX"
GATE_RC=0; GATE_OUT="$("$GATE" 2>&1)" || GATE_RC=$?
if [ "$GATE_RC" -eq 1 ] && grep -qF "missing its required \`surface\` prop" <<< "$GATE_OUT"; then
  echo "  OK   blocks-missing-surface-createElement — TS2769 multi-line form blocked and named (exit 1)"
  PASS=$((PASS+1))
else
  echo "  FAIL blocks-missing-surface-createElement — expected BLOCK naming the surface rule, got exit $GATE_RC:"
  head -10 <<< "$GATE_OUT"
  FAIL=$((FAIL+1))
fi
rm -f "$CANARY_TSX"

# 5c. BLOCKS an INVALID value: a conditional that can be undefined is TS2322 against
#     ClarityLayoutSurface, not a "missing" diagnostic, and silently disables the menu at runtime.
printf '%s\n' \
  "import { ClarityLandingLayout } from '@/app/layouts/clarity-landing-layout';" \
  "declare const flag: boolean;" \
  "export const badValue = <ClarityLandingLayout surface={flag ? 'product' : undefined}><div /></ClarityLandingLayout>;" \
  > "$CANARY_TSX"
GATE_RC=0; GATE_OUT="$("$GATE" 2>&1)" || GATE_RC=$?
if [ "$GATE_RC" -eq 1 ] && grep -qF "missing its required \`surface\` prop" <<< "$GATE_OUT"; then
  echo "  OK   blocks-invalid-surface-value — TS2322 against ClarityLayoutSurface blocked and named (exit 1)"
  PASS=$((PASS+1))
else
  echo "  FAIL blocks-invalid-surface-value — expected BLOCK naming the surface rule, got exit $GATE_RC:"
  head -10 <<< "$GATE_OUT"
  FAIL=$((FAIL+1))
fi
rm -f "$CANARY_TSX"

# 6. DOES NOT FIRE on a DIFFERENT component whose required prop is ALSO named `surface`.
#    Scenario 4 proves the rule ignores other property names; this proves it ignores other
#    COMPONENTS. The repo really has such a component (a prototype with `surface: string`),
#    so a property-name-only match would block unrelated commits.
printf '%s\n' \
  "function OtherSurfaceThing(_props: { surface: string }) { return null; }" \
  "export const otherComponent = <OtherSurfaceThing />;" \
  > "$CANARY_TSX"
GATE_RC=0; GATE_OUT="$("$GATE" 2>&1)" || GATE_RC=$?
if [ "$GATE_RC" -eq 0 ]; then
  echo "  OK   ignores-surface-on-other-component — scoped to ClarityLandingLayoutProps (exit 0)"
  PASS=$((PASS+1))
else
  echo "  FAIL ignores-surface-on-other-component — the rule fired on an unrelated component (exit $GATE_RC):"
  head -10 <<< "$GATE_OUT"
  FAIL=$((FAIL+1))
fi
rm -f "$CANARY_TSX"

echo "typecheck-gate canary: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
