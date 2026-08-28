---
status: week
type: bug
rank: 85
severity: medium
workstream: infrastructure
date_reported: '2026-08-28'
created_date: '2026-08-28'
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [testing, edge-functions, test-env, safety-net]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1188: Two edge-fn authz regression tests can never pass — their functions are not deployed to test

## Summary

`edge-fn-authz-regression.spec.ts` contains two guard tests that fail 100% of the time against the
test Supabase project, because the functions they target have never been deployed there.

## Root Cause

`dispatch-event-emails` and `enqueue-transcription` exist only on the prod project. The test project
returns **HTTP 404** for both, so the tests' expected 401 can never occur. Confirmed 2026-08-28 by
listing the test project's deployed functions (neither slug present) and by the failure output
(`Expected: 401 / Received: 404`).

The reason they were never deployed follows from the same fact chain: `check-edge-function-secrets.sh
--env test` reports `CRON_SECRET`, `GCP_ENQUEUER_SA_KEY`, `GCS_UPLOAD_SECRET` and `WEBHOOK_SECRET`
missing on the test project, so a test deploy of those functions is blocked by the hygiene gate.

Both tests were added in `66a3ac05` ("test: edge function authz regression coverage (load-bearing)").
The file's own header states its purpose is to prove guards fire on the unhappy path — for these two,
it proves nothing.

## Invariants

- A guard test that cannot reach the code it guards must fail loudly or not exist. Marking these
  `test.skip` without a stated condition would convert a visible red into an invisible gap, which is
  the failure mode the file was written to prevent.

## Reproduction Steps

1. From the repo root: `npx playwright test --project=integration e2e/integration/edge-fn-authz-regression.spec.ts`
2. Observe two failures, both with `Received: 404`:
   - `dispatch-event-emails CRON_SECRET guard › rejects request with wrong Authorization header (401)`
   - `enqueue-transcription WEBHOOK_SECRET guard › rejects request with wrong x-webhook-secret header (401)`

**Reproduction rate:** 100%

## Expected Behavior

Either the suite runs green against test (functions + secrets provisioned there), or the two tests
declare their prod-only dependency explicitly, so a reader can tell an unmet precondition from a
broken guard.

## Actual Behavior

Two permanent reds. Anyone running the suite learns to read "2 failed" as normal, which is exactly
how a real guard regression would go unnoticed in the other 19 tests.

## Affected Files

- `e2e/integration/edge-fn-authz-regression.spec.ts` — the `dispatch-event-emails` and
  `enqueue-transcription` describe blocks
- `scripts/check-edge-function-secrets.sh` — reports the four secrets missing on test
- test Supabase project — neither function deployed

## Severity

**Medium** — no user impact; the cost is a safety net that reports failure indistinguishably from
success, on a file whose entire purpose is catching silently-deleted guards.

## Fix Approach

Two directions, to be decided when the bug is picked up:

1. **Provision test** — set the four missing secrets on the test project and deploy both functions
   there. Makes the tests real, at the cost of test-project secrets that need managing.
2. **Declare the dependency** — a `test.skip` keyed on an explicit precondition (function reachable /
   secret present), so the skip states *why* rather than hiding the gap. Weaker coverage, honest signal.

Related but separate (surfaced in the same review, not filed here): no `e2e/integration/*` spec runs
in CI at all — `.github/workflows/test.yml` runs typecheck, lint and unit tests only. Fixing this bug
does not put these guards in front of a merge.

## Acceptance Criteria

- [ ] `npx playwright test --project=integration e2e/integration/edge-fn-authz-regression.spec.ts`
      reports zero failures
- [ ] If the chosen route is skipping, each skip names the precondition it is waiting on, and the
      skip reason appears in the run output
- [ ] The other 19 tests in the file still pass unchanged
