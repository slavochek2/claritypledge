---
status: qa
type: bug
rank: 1000959.0
severity: high
date_reported: '2026-08-09'
created_date: '2026-08-09'
tags: [testing, playwright, e2e, ci]
flow: inline
delivery_stage: fix
pipeline_ran: [create-bug, fix]
---

# P1033: Playwright test collection crashes for the entire suite on an invalid fixture parameter name

## Summary

`npx playwright test` (no path filter) exits 1 with zero tests executed — collection aborts on
`e2e/p591-story-supporting-images.spec.ts:358`, where a `test.skip(...)` destructures a fixture
parameter named `_page` that Playwright's fixture validator does not recognize. The test being
`.skip`'d does not exempt it: Playwright validates fixture signatures at collection time, before
skip status is applied, so one bad parameter name blocks 100% of the suite — locally and in CI.

## Root Cause

`e2e/p591-story-supporting-images.spec.ts:358`:

```ts
test.skip('author can change image on existing story', async ({ _page }) => {
```

`_page` is not a registered Playwright fixture (the correct name is `page`). Playwright's test
function signature is validated against known fixtures during collection, independent of
`.skip()` — the underscore-prefix convention some codebases use to mark an intentionally-unused
parameter does not apply to Playwright fixture destructuring, since the name itself is the
fixture lookup key.

## Reproduction Steps

1. From the repo root (main, clean checkout): `npx playwright test --reporter=line`
2. Observe immediate failure, exit code 1, zero tests run
3. Output: `Test has unknown parameter "_page".` pointing at
   `e2e/p591-story-supporting-images.spec.ts:406` (the line Playwright reports is a comment near
   the destructure, not the destructure itself — the arrow function body, not the signature, is
   what gets cited)
4. Confirmed on `main` HEAD (`git log --oneline -1` at time of discovery), unrelated to any
   in-flight branch work

**Reproduction rate:** 100% (any no-path-filter `playwright test` invocation).

## Expected Behavior

A full, unfiltered `npx playwright test` run collects and executes every non-skipped test; a
`.skip()`'d test with a malformed signature should either be ignored or produce a warning scoped
to that file — not abort collection for the entire suite.

## Actual Behavior

The entire suite fails to start. Every `/fix` or `/dev` full-suite regression check silently
cannot get a real signal from an unfiltered run; the failure has to be diagnosed and worked
around per-run (e.g., by excluding this file) rather than being a real gate.

## Affected Files

- `e2e/p591-story-supporting-images.spec.ts:358` — `test.skip('author can change image on
  existing story', async ({ _page }) => {` — invalid fixture parameter name

## Severity

**High** — blocks 100% of local and CI full-suite Playwright runs, not just this one test. Not
**critical** — a path-filtered run (single file or glob) is unaffected, and the app itself has no
runtime impact; this is a test-tooling gap only.

## Fix Approach

Rename the destructured parameter from `_page` to `page` (or drop it entirely if the skipped
test body — currently a placeholder awaiting GCS-mocking support per its own `TODO` comment —
doesn't reference it). One-line fix at `e2e/p591-story-supporting-images.spec.ts:358`.

**Surface spread check:** `grep -rn "async ({ _page" e2e/` to confirm this is the only occurrence
of the pattern before closing.

## Acceptance Criteria

- [x] `npx playwright test --reporter=line` (no path filter) from repo root starts collecting and
      running tests instead of aborting with `Test has unknown parameter "_page".`
- [x] The affected test (`author can change image on existing story`) remains `.skip()`'d — no
      behavior change to test coverage, only to whether it blocks collection
- [x] No other file in `e2e/` has the same malformed-fixture-parameter pattern

## Evidence

Failure path exercised before the fix (epistemic gate 7 — a gate not seen failing is unproven):

```
$ npx playwright test --reporter=list      # BEFORE
Test has unknown parameter "_page".
   at p591-story-supporting-images.spec.ts:406
EXIT=1                                      # zero tests collected, zero run
```

After the one-token fix (`async ({ _page })` → `async ()` — the skipped body references no
fixture, so the parameter is dropped rather than renamed):

```
$ npx playwright test --list                # AC1, collection
EXIT=0 · Total: 2730 tests in 401 files · 0 occurrences of "unknown parameter"

$ npx playwright test --reporter=line -g "home page loads without error boundary"
EXIT=0 · 1 passed (9.3s)                    # AC1, full unfiltered collection AND execution

$ grep -n "author can change image on existing story" e2e/p591-story-supporting-images.spec.ts
358:  test.skip('author can change image on existing story', async () => {   # AC2, still .skip()'d

$ grep -rn "async ({ _" e2e/                # AC3
(no matches)
```

The `-g` run carries the load for AC1: a title filter does not narrow **collection**, so all 401
files across all projects were parsed before the single matching test executed.
