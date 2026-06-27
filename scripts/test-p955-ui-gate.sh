#!/usr/bin/env bash
# scripts/test-p955-ui-gate.sh
#
# P955 UI Gate — self-test: exercises the gate's failure path.
#
# Mirrors scripts/test-typecheck-gate.sh (which exercises the typecheck gate
# the same way). This script:
#   1. Runs the p955-gate test suite directly with vitest
#   2. Exits non-zero if any deterministic check fails
#
# Called by pre-commit-checks.sh when UI render-path files are staged.
# Also runnable standalone: bash scripts/test-p955-ui-gate.sh
#
# For the pre-commit wiring, see:
#   scripts/pre-commit-checks.sh — UI gate block (Phase 2c)
#
# Reference: features/p955_ui_build_loop.md § AD-1, § Build Sequence step 3

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

echo ">>> P955 UI gate: running deterministic DOM assertion suite"

if npx vitest run src/tests/p955-gate.test.ts; then
  echo ">>> P955 UI gate: PASSED — all deterministic checks clean"
  exit 0
else
  echo ""
  echo "P955 UI gate BLOCKED — deterministic UI invariant(s) violated."
  echo ""
  echo "Fix the failing checks before committing:"
  echo "  - one-primary:      at most one full-width primary button per view"
  echo "  - no-dead-disabled: no disabled primary/submit in empty/initial state"
  echo "  - no-overflow-320:  no element with hardcoded width > 320px"
  echo "  - touch-target-44:  all interactive elements >= 44px height"
  echo ""
  echo "To inspect failures: npx vitest run src/tests/p955-gate.test.ts"
  echo ""
  echo "Override: The .ui-gate-override sentinel (founder filesystem action)"
  echo "  allows deferring for .ts-only changes (no .tsx in diff)."
  echo "  It is NON-OVERRIDABLE when .tsx files are staged."
  echo "  Agent cannot create the override — founder action required."
  exit 1
fi
