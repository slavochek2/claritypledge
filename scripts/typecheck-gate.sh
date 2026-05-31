#!/bin/bash
# scripts/typecheck-gate.sh — P861: block commits that introduce an undeclared
# identifier (the P859 "ReferenceError at runtime" class) in shipping app code.
#
# Background: the old pre-commit type step ran `npx tsc --noEmit`, which resolved
# the root SOLUTION tsconfig (files: [] + project references) and compiled
# NOTHING — always exit 0. App code was never typechecked at commit time, so a
# stray undeclared identifier (P859: `currentUser is not defined`) shipped to
# prod. esbuild strips types without checking, so the build didn't catch it.
#
# Why not `tsc -b` (full strict)? The app project carries ~845 pre-existing type
# errors (mostly strictNullChecks + test-file noise). A full gate would block
# every commit. Strategy A->C (docs/decisions.md, 2026-05-31): gate now on the
# always-crashes-at-runtime class only, broaden toward `tsc -b` later.
#
# Gate class (cannot-find-name family): TS2304, TS2552, TS2582. Scope: non-test
# app code (test files carry their own pre-existing TS2304/2582 from missing
# vitest globals — a separate cleanup on the A->C path).
#
# Exit: 0 = clean, 1 = gate-class error(s) in app code, 2 = tooling error.
#
# Limitation: `tsc -p tsconfig.app.json` typechecks the whole project (tsc has
# no per-file mode), so the gate reflects working-tree state, not just the
# staged diff. After the P861 cleanup the app tree sits at 0 gate-class errors,
# so any new one is attributable to the working change. A staged-diff-precise
# gate (error baseline diff) is the deferred Option B.
#
# Output note: this script echoes raw tsc diagnostics. Its caller (the hook)
# captures stdout into a variable and echoes it — never routes it into eval — so
# the P783 eval-safety contract does not apply. Status lines use ':' separators.

# NOTE: deliberately no `set -o pipefail`. tsc returns exit 2 for normal type
# errors, and `grep -q` closes the pipe early on a match — under pipefail that
# turns the upstream into a SIGPIPE failure and the whole pipeline reports
# non-zero even on a successful match. Here-strings (`<<<`) below avoid pipes for
# the gating decisions, so pipefail is neither needed nor wanted.

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "typecheck-gate: not a git repo"; exit 2; }
cd "$REPO_ROOT" || { echo "typecheck-gate: cannot cd to repo root: $REPO_ROOT"; exit 2; }

TSCONFIG="tsconfig.app.json"
[ -f "$TSCONFIG" ] || { echo "typecheck-gate: $TSCONFIG not found at repo root"; exit 2; }

GATE_CODES='error TS(2304|2552|2582)'
TEST_PATHS='(\.test\.|/tests/|/__tests__/|/test-)'

# Run the real app typecheck. tsc exits non-zero on ANY error (incl. the ~845
# pre-existing ones; it returns 2 when diagnostics are reported), so its exit
# code can't gate us — we filter the output instead.
TSC_OUT="$(npx tsc -p "$TSCONFIG" --noEmit 2>&1)"
TSC_RC=$?

# Distinguish "tsc ran and typechecked the code" (normal) from "tsc could not
# really run". A non-zero exit with NO LOCATED diagnostic — `path(line,col):
# error TS…` — means tsc emitted only global/config errors and never checked the
# source: a missing binary, a bad `--` option (TS5023), or, critically, the same
# empty-tsconfig shape as the original bug (TS18003 "No inputs were found"),
# which carries no file location. Matching bare `error TS` here would let that
# silent no-op through. Require a located diagnostic; otherwise fail closed (2).
if [ "$TSC_RC" -ne 0 ] && ! grep -qE '\([0-9]+,[0-9]+\): error TS[0-9]+' <<< "$TSC_OUT"; then
  echo "typecheck-gate: tsc did not typecheck the source (exit $TSC_RC, no located diagnostics):"
  head -5 <<< "$TSC_OUT"
  exit 2
fi

BROKEN="$(grep -E "$GATE_CODES" <<< "$TSC_OUT" | grep -vE "$TEST_PATHS")"

if [ -n "$BROKEN" ]; then
  printf '%s\n' "$BROKEN"
  exit 1
fi
exit 0
