---
status: week
type: task
rank: 69
workstream: infrastructure
created_date: '2026-10-23'
tags: [e2e, tests, flaky, offline]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
---

# P1560: Nine e2e failures — six stale tests, one slow-connection remount, two unconfirmed

Promoted from the task inbox, 2026-10-23.

## Problem

Nine e2e tests in four files fail on every run against TEST, at any worker count (seen 2026-10-22, reproduced 2026-10-23). A red suite hides new regressions.

Diagnosis (2026-10-23, claims re-checked against the code):

| Test | Cause |
|---|---|
| `03-login-flow:114` | Signup name field is now `id="signup-name"` (P1229); test looks for `input#name` |
| `03-login-flow:129` | Login form is `noValidate` (P1229 D15): inline error, no browser focus on the field |
| `p273-verification-gate:38` | A signed-out reader's position is kept locally with no gate toast (P502) |
| `p273-verification-gate:132` | `/create` signed out goes to `/signup?redirect=%2Fcreate` (P458), test expects bare `/signup` |
| `p1420-clear-position-lost-response:105`, `:131` | The P1540 reachability probe (`GET /auth/v1/health`) logs a 401 console line the test does not list as induced |
| `p1420-clear-position-lost-response:164` | Card remounts once on a slow connection (expect 0). Probably real; suspected P1540 reconnect re-read, unconfirmed |
| `p1351-header-contexts:246`, `p273-verification-gate:84`, `:143` | Only ever failed with ECONNRESET/EHOSTUNREACH during the Supabase incident of 2026-10-23 |

> Founder framing, verbatim: *"I guess we're all good so I don't know what is the small spec but let's fix all"*

## Appetite

Blast radius: tests only, except `:164`, which may touch the offline/reconnect path for every reader. Reversibility: git revert. Decision density: zero.

## Solution

1. Update the six stale tests to the shipped behaviour each row above names. Assert the new behaviour, do not just delete the assertion.
2. `p1420:164`: find what remounts the card on a slow connection and fix the code so it does not. The test stays as it is.
3. Re-run the three network-only failures on a healthy TEST DB. If any fail deterministically, diagnose like step 2.

## Invariants

- Tests are specs: the `:164` test (no unmount) is not weakened to pass.
- The 401 allowance in p1420 is scoped to that probe's console line, not to every 401.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| TEST DB still unstable, network failures recur | MITIGATE | Run each twice; a failure with a network error is not counted as a pass or a code defect |
| `:164` fix changes reconnect timing for readers | MITIGATE | Run the P1369/P1540 offline unit tests and the whole p1420 file |

- Do NOT change the P1540 probe's behaviour beyond what `:164` needs.
- Do NOT touch other test files.

## Done-When

- [ ] All 9 tests pass on two consecutive runs against TEST
- [ ] `p1420:164` passes by a code change, test assertions unchanged
- [ ] Offline/reconnect unit tests still pass

## Related

P1229, P502, P458, P1540, P1541
