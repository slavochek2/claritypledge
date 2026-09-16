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

# ── P1323: one more class, scoped to ONE property name ────────────────────────
#
# P1323 made `surface: 'product' | 'public'` a REQUIRED prop on ClarityLandingLayout so that
# adding a route forces the product/public question in the same diff that creates it — chosen
# over an allow-list or deny-list because a list rots silently. The spec sold that as
# "a new page cannot compile without answering."
#
# Measured 2026-09-16, that was FALSE of this pipeline, three ways:
#   1. `npx tsc --noEmit` resolves the root SOLUTION tsconfig and compiles nothing (the P861
#      bug above) — so the spec's own stated proof was a no-op.
#   2. `tsc -p tsconfig.app.json` exits non-zero on ~1065 pre-existing errors, so an
#      exit-code proof cannot discriminate in either direction.
#   3. The gate above covers TS2304/2552/2582 only. A missing required prop is TS2741, and
#      `vite build` uses esbuild, which does not typecheck at all.
# A route added with no `surface` therefore passed pre-commit, passed CI, and built clean.
#
# WHY NOT GATE TS2741 WHOLESALE: app code carries 6 pre-existing TS2741, so a blanket rule
# would fire on its own baseline — the defect this spec's own AC-11b names for a grep ("a
# gate that fires on its own baseline is a gate that gets waived"). Scoping to the property
# NAME gives 0 baseline hits and fires exactly on the failure it exists to catch.
#
# This is narrow on purpose and it is NOT a route list: it names one prop, not the pages that
# must carry it. If `surface` is ever renamed or removed, delete this block — a gate whose
# subject no longer exists is worse than no gate, because it stays green forever.
#
# MATCH WHOLE DIAGNOSTICS, NOT LINES, AND NOT ERROR CODES. Three versions of this block, each
# broken by a different reviewer and each reproduced before it was replaced:
#   v1  matched `TS2741: Property 'surface' is missing` — `<ClarityLandingLayout />` (several props
#       missing at once) is TS2739 instead, and passed with exit 0 (Gemini 3.8).
#   v2  matched TS2739|TS2741 — `createElement(ClarityLandingLayout, {}, child)` is TS2769, and the
#       "missing ... surface" text is on an indented CONTINUATION line carrying no error code at all,
#       so a line-based grep can never see it. Passed with exit 0 (Codex Sol).
# Chasing codes is whack-a-mole. What is stable is the MEANING: a diagnostic about
# ClarityLandingLayoutProps that says `surface` is missing. So join each `path(l,c): error TS…`
# line with the indented lines under it, then match that meaning on the joined text.
#
# SCOPED TO THE TYPE NAME. Other components also have a `surface` prop — the feed cards,
# ShareDialog, and a prototype where it is REQUIRED — so the property name alone would block
# commits over unrelated components.
SURFACE_MISSING="$(awk '
  /^[^ ].*\([0-9]+,[0-9]+\): error TS[0-9]+/ { if (blk != "") print blk; blk = $0; next }
  /^ / { if (blk != "") blk = blk " " $0; next }
  { if (blk != "") print blk; blk = "" }
  END { if (blk != "") print blk }
' <<< "$TSC_OUT" | grep -F "ClarityLandingLayoutProps" | grep -E "(Property .surface. is missing|missing the following properties[^.]*[:,] ?surface\b)" | grep -vE "$TEST_PATHS")"

if [ -n "$SURFACE_MISSING" ]; then
  echo "typecheck-gate: a ClarityLandingLayout is missing its required \`surface\` prop."
  echo "Every page must declare whether it is a 'product' surface (someone USING the thing —"
  echo "it carries the Links menu) or 'public' (someone READING ABOUT it — it does not)."
  echo "See src/app/layouts/clarity-landing-layout.tsx (P1323 R2)."
  printf '%s\n' "$SURFACE_MISSING"
  exit 1
fi

if [ -n "$BROKEN" ]; then
  printf '%s\n' "$BROKEN"
  exit 1
fi
exit 0
