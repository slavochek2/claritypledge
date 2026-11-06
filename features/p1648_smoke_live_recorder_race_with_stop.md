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
delivery_stage: fix
pipeline_ran: [create-bug, fix]
date_resolved: '2026-11-06'
root_cause: /live stops the recorder on mount (P1304), so a /record post there is a race with the recorder bundle; the smoke required one
resolution: on routes that stop the recorder on mount, 'timeout' passes only when the recorder bundle finished loading with an ok response and no recorder CSP violation was seen; drift guarded by an AST check of the mount effect
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

- [x] `/live` smoke passes 10 of 10 against prod, and under an injected 80-250 ms recorder-bundle delay
- [x] Known-bad: with the opt-in flag misspelled, `/live` fails (bundle never requested)
- [x] Known-bad: a recorder CSP violation on `/live` still fails
- [x] Other routes still fail when `/record` is never posted
- [x] A test fails if a route in the exempt list stops being one that stops the recorder
- [x] Known-bad: a recorder bundle that was requested but never loaded (aborted, stalled or 4xx/5xx) on `/live` still fails

## Resolution evidence (2026-11-06)

Reproduce gate: no separate `/reproduce` run. The injected-delay probe in Root Cause is the reproduction, and the browser-level delayed test below is the canary. With the exemption removed (`RECORDER_STOPPED_ON_MOUNT_ROUTES = []`) it fails against prod (1 of 1 unexpected), and with it the test passes.

Review round 1 (Gemini Argon, GLM, Codex) left three findings. Each now has a test that fails without its fix:

| Finding | Fix | Fails without it |
|---|---|---|
| 1. Exemption accepted "bundle requested" | `requestfinished` + `response().ok()` sets `bundleLoaded`; exemption keys on it | `p1628-recorder-watch.test.ts`: the stalled and 404 cases fail (2 failed) when the check is switched back to `bundleRequested` |
| 2. Drift guard matched comments | AST check: `analytics.stopSessionRecording()` must be a top-level statement of a `useEffect(..., [])` | Old regex returns `true` on the real page with the call commented out; new check rejects 5 mutations of the real page (line/block comment, conditional, deps added, string) |
| 3. No browser-level test | `e2e/p1648-live-recorder-exemption.spec.ts` (runs only with `P1648_SMOKE_URL`) | Delayed case fails without the exemption (above) |

Browser controls against prod (`P1648_SMOKE_URL=https://claritypledge.com`): 4 of 4 as expected. Delayed start passes (188 ms delay: `timeout`, bundle loaded, 0 `/record`). Misspelled opt-in fails (bundle never requested). CSP block fails (`blocked`; reporting directives stripped so nothing reached prod's CSP report endpoint). Aborted bundle fails (requested, not loaded).

**10× against prod with an injected 80–250 ms bundle delay: 10 of 10 passed** (delays 236, 145, 224, 196, 147, 210, 192, 197, 134, 185 ms). In every run the state was `timeout` with the bundle loaded and 0 `/record`, so the race reproduced each time and the exemption carried it.

Regular smokes against prod, unchanged routes: `csp-smoke` 8 of 8, `prod-health-smoke` 8 of 8. `tsc --noEmit` clean, eslint clean, unit tests 15 of 15.

Not covered: the new browser spec does not run in the default e2e suite or in CI (opt-in env var), so it guards on demand, not on every change.
