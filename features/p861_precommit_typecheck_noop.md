---
status: week
type: bug
rank: 1000766
severity: high
workstream: infra
date_reported: '2026-05-31'
created_date: '2026-05-31'
tags: [pre-commit, typescript, ci, tooling]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P861: Pre-commit "TypeScript" check is a no-op — app code is never typechecked

## Summary

`scripts/pre-commit-checks.sh` runs `npx tsc --noEmit` (line 74) as its TypeScript gate. With no `-p` flag it resolves the root `tsconfig.json`, which has `"files": []` and only project `references` — so it compiles **nothing** and always exits 0. App/source code is never typechecked at commit time. The real app typecheck (`tsc -p tsconfig.app.json --noEmit`) currently reports ~1117 error lines.

## Root Cause

Vite's standard split-tsconfig layout: root `tsconfig.json` is a solution file (`files: []` + `references: [tsconfig.app.json, tsconfig.node.json]`). `tsc --noEmit` (without `-b` or `-p`) treats the root as the project and finds zero input files → no diagnostics. The pre-commit hook gates this behind `BUILD_AFFECTING`, so it *looks* like it runs on every source commit, but the command itself is vacuous. `vite build` (esbuild) strips types without checking, so the build doesn't catch type errors either.

## How this surfaced

P859 (`ReferenceError: currentUser is not defined` in `LetterReadingFlow`) was an **undeclared identifier** — a `TS2304` that `tsc -p tsconfig.app.json` flags 6×. It shipped to prod because the pre-commit type gate is a no-op and esbuild doesn't typecheck. A working type gate would have blocked the commit.

## Reproduction Steps

1. `npx tsc --noEmit` → exits 0, prints nothing (the command pre-commit runs).
2. `npx tsc -p tsconfig.app.json --noEmit` → prints ~1117 error lines.
3. Therefore: a commit introducing a fresh type error (e.g. a `TS2304`) passes pre-commit's "TypeScript ✓".

**Reproduction rate:** 100%.

## Expected Behavior

Pre-commit fails when staged source introduces a TypeScript error.

## Actual Behavior

Pre-commit's TypeScript step always passes regardless of type errors in app code.

## Affected Files

- `scripts/pre-commit-checks.sh` — line 74 (`npx tsc --noEmit` → should be `tsc -b` or `tsc -p tsconfig.app.json --noEmit`)

## Severity

**High** — the type-safety gate that should catch a whole class of bugs (undeclared identifiers, type mismatches) is silently inert. But fixing it is gated on triaging ~1117 pre-existing errors, so the gate cannot simply be flipped on without a cleanup plan.

## Fix Approach

Two-phase, needs founder sequencing (the cleanup is large):
1. **Assess:** run `tsc -p tsconfig.app.json --noEmit`, categorize the ~1117 errors (how many files, how many are real vs config-strictness).
2. **Decide:** either (a) ratchet — baseline current errors, fail only on *new* ones; or (b) fix-then-enforce — clear the errors, then switch pre-commit to `tsc -b`. Option (a) is the realistic first step given the volume.

This is a tracking ticket — not auto-fixed with P859 (scope + requires a cleanup strategy decision).

## Acceptance Criteria

- [ ] Pre-commit fails when staged app code introduces a new TypeScript error (verified by staging a deliberate `TS2304` and seeing the commit blocked).
- [ ] Existing pre-existing errors are handled via an explicit strategy (baseline/ratchet or full cleanup) — not silently ignored.
- [ ] `docs/decisions.md` records the chosen strategy.
