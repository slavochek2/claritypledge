---
status: week
type: bug
rank: 112
severity: medium
workstream: infra
date_reported: '2026-11-06'
created_date: '2026-11-06'
drafted_by: sonnet
exec_model: opus
exec_effort: high
tags: [smoke, csp-smoke, prod-health, mixpanel, recorder, flake]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1648: Prod smokes flake on /live because the page stops the recorder on mount

## Summary

The P1628 assertion "recorder never reached /record on this route" fails intermittently on `/live` only (prod-health run 42128239526 x3 plus issue 34; csp-smoke run 42168577829 x3 plus issue 35), because `/live` deliberately calls `stop_session_recording()` on mount and whether any `/record` is ever posted becomes a race with the recorder bundle's arrival.

## Root Cause

Hypothesis (from the failing runs): `/live` is not a normal recorder route. `src/app/pages/clarity-live-page.tsx:704-709` (P1304: the room code in the URL is a join capability) calls `analytics.stopSessionRecording()` in a mount effect. Every other smoke route has no such call.

Cheapest disproof run: load prod `/live` with the opt-in set, answer `/record` locally, and delay the `mixpanel-recorder` bundle by N ms (scratchpad probe, Playwright, 13s wait, `/record` count per run):

```
bundle delay   0 ms: /record=1 at 0.8s (the flush that stop_session_recording itself triggers)   [passes]
bundle delay  40 ms: 2 of 4 runs /record=0 for the full 13s
bundle delay  80 ms: 4 of 4 runs /record=0
bundle delay 120 ms: 4 of 4 runs /record=0
bundle delay 160 ms: 4 of 4 runs /record=0
bundle delay 200 ms: 4 of 4 runs /record=0
bundle delay 250 ms: 4 of 4 runs /record=0
bundle delay 300 ms: /record=1 at ~10.8s (recorder started after stop; normal 10s flush)
bundle delay 3000/8000 ms: /record=1 at 13.5s / 18.5s
```

Control, same 120 ms delay on `/` (no stop call): `/record=1` at 10.6s in 4 of 4 runs. Opt-in removed: no recorder bundle request on any route.

So on `/live` the only `/record` on the fast path is the flush caused by the stop itself. When the stop lands while the recorder is starting but before it has buffered anything, nothing is flushed and recording is then dead, so no `/record` ever follows. All observed failure signatures match: `bundle requested=true`, no CSP violation, state `timeout`. On a fast local machine the bundle wins the race (10 of 10 pass, `/record` at ~0.8s), so the flake is CI-timing dependent. UNVERIFIED: the exact CI timing (the failing run artifacts had expired, `gh run download` returned "no valid artifacts"); the window was reproduced by injected delay, not observed on a runner.

The other three pages that call stop on mount (`admin-users-page.tsx:63`, `admin-topics-page.tsx:54`, `chat/ChatHomePage.tsx:45`, `transcribe-room-page.tsx:64`) are not in `PROD_HEALTH_ROUTES`, so only `/live` is exposed.

## Invariants

- The smoke must still fail when the recorder opt-in is broken or the recorder is CSP-blocked.
- `/live` must keep stopping the recorder (P1304); the fix is in the check, not the product.

## Reproduction Steps

1. `CSP_SMOKE_URL=https://claritypledge.com npx playwright test e2e/csp-smoke.spec.ts --grep "/live"`: passes on a fast machine.
2. Delay the `mixpanel-recorder` request by 80-250 ms (`page.route` + `route.continue` after a timeout) on `/live`.
3. Observe: no `/record` for the whole 20s wait, assertion throws.

**Reproduction rate:** intermittent in CI (3 of 3 attempts in two consecutive scheduled runs, 0 of 10 locally); 100% under the injected delay window.

## Expected Behavior

`/live` passes whenever the recorder opt-in is wired and the recorder loads without a CSP block, whether or not `/record` was posted.

## Actual Behavior

`recorder never reached /record on this route: ... (state=timeout, recorder bundle requested=true, recorder CSP violations=none)`.

## Affected Files

- `e2e/helpers/prod-health.ts` (`assertExercised`, `waitForFirstFlush`)
- `e2e/csp-smoke.spec.ts`, `e2e/prod-health-smoke.spec.ts` (callers)
- `src/app/pages/clarity-live-page.tsx:704-709` (the deliberate stop, not changed)

## Severity

**Medium** — alert-only workflows open false-positive issues (34, 35) and train people to ignore the smoke; no user impact.

## Fix Approach

Name the routes whose page stops the recorder on mount. On those routes, `timeout` is accepted only if the recorder bundle was requested (proves the opt-in is wired, since without it the bundle is never requested) and no CSP violation was seen; `blocked` and a missing bundle request still fail. Keep the full `flushed` requirement on all other routes.

## Acceptance Criteria

- [ ] `/live` smoke passes 10 of 10 against prod, and under an injected 80-250 ms recorder-bundle delay
- [ ] Known-bad: with the opt-in flag misspelled, `/live` fails (bundle never requested)
- [ ] Known-bad: a recorder CSP violation on `/live` still fails
- [ ] Other routes still fail when `/record` is never posted
- [ ] A test fails if a route in the exempt list stops being one that stops the recorder
