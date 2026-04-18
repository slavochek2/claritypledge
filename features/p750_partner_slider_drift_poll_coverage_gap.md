---
status: week
type: bug
rank: 1000750.0
severity: high
workstream: live
date_reported: '2026-04-18'
created_date: '2026-04-18'
tags: [live, free-mode, realtime, drift-poll, regression]
changes: p741
flow: fix
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P750: Partner slider drift-poll coverage gap

## Summary

In /live Speak Freely mode, partner slider dots intermittently fail to update on the other browser — sometimes instant, sometimes 3–5 s delay, sometimes permanently stuck until session restart. The 1 s drift-poll fallback does not cover `freeSliderCreator`/`freeSliderJoiner`, so when Supabase Realtime drops a slider event the client never catches up.

## Root Cause

The drift-poll detector in `src/app/pages/clarity-live-page.tsx:1294-1319` compares 16 specific state fields to decide whether the server has an update the client missed. `freeSliderCreator` and `freeSliderJoiner` are not in that list. When Supabase Realtime drops a slider event (Brave shield, tab throttling, flaky WSS), the 1 s poll fires, finds no drift on the fields it checks, and does nothing — local state stays stale indefinitely.

The sibling test `src/tests/p637-drift-detection-completeness.test.ts:120-121` already enumerates these two fields under `KNOWN_UNCOVERED` with comment *"Live slider position — real-time, high drift risk."* That assumption (Realtime alone is enough) is exactly what this bug disproves.

**Sibling to P741** (shipped today, commit `379ff781`, merged via `32b581b2`): P741 correctly fixed the *in-flight merge race* — preserving partner-owned keys when a Realtime event lands during a local write. It did not touch the *drift-poll fallback* that is supposed to catch missed Realtime events. This is the other half of the coverage story.

## Reproduction Steps

1. Deploy feature branch to a Vercel preview.
2. Open preview `/live` in Chrome (account A) and Brave (account B), same session.
3. Both reach `freePhase: 'unlocked'` (Speak Freely).
4. In Brave DevTools → Network, right-click → "Block request URL" for `realtime/v1/websocket` on the Supabase domain. This forces Realtime events to drop; drift-poll is now the only channel.
5. Move slider in Chrome to 7.
6. Observe Brave: partner-dots row for Chrome's slider stays at previous value indefinitely.

**Reproduction rate:** 100% with Realtime blocked (deterministic). In the wild: intermittent — depends on whether Realtime happens to drop the event.

## Expected Behavior

A missed Realtime slider event is caught by the next drift-poll tick (≤1 s) and applied to local state. Partner slider dots update within 1–2 s even when Realtime fails.

## Actual Behavior

Partner slider dots remain at stale value indefinitely. The 1 s drift-poll runs but its comparator doesn't include slider fields, so `serverHasUpdate` stays false and `setLiveState` is never called for the slider delta. Session restart is the only recovery.

## Affected Files

- `src/app/pages/clarity-live-page.tsx:1293-1319` — drift-poll comparator (missing `freeSliderCreator`/`freeSliderJoiner` drift checks)
- `src/app/pages/clarity-live-page.tsx:1328-1338` — Mixpanel `live_state_drift_detected` payload (should include the two new drift flags for observability)
- `src/tests/p637-drift-detection-completeness.test.ts:120-121` — `KNOWN_UNCOVERED` entries to remove after fix
- `src/app/lib/live-state-merge.ts` — `mergeInFlight` helper, unchanged (reference only; P741 path is correct)
- `src/tests/p609-free-slider-sync.test.ts` — reference pattern for the canary test

## Severity

**High** — partner-awareness is a core primitive of Speak Freely mode; stale sliders break the calibration signal users rely on. Does not self-heal, cross-browser reproducible, affects anyone on a throttled tab or shield-enabled browser.

## Fix Approach

Plan at `~/.claude/plans/create-a-plan-for-flickering-cake.md`. Three-part fix:

1. **`src/app/pages/clarity-live-page.tsx`** — add two drift variables alongside the existing 16:
   ```ts
   const freeSliderCreatorDrift = serverState.freeSliderCreator !== localState.freeSliderCreator;
   const freeSliderJoinerDrift = serverState.freeSliderJoiner !== localState.freeSliderJoiner;
   ```
   Append both to the `serverHasUpdate` OR chain. Add the two flags to the `live_state_drift_detected` Mixpanel payload.

2. **`src/tests/p637-drift-detection-completeness.test.ts`** — remove lines 120-121 (the two `KNOWN_UNCOVERED` entries). Test should now pass because the comparator covers these fields.

3. **`src/tests/p750-drift-poll-slider-catchup.test.ts` (new)** — canary test that:
   - Arranges `localState.freeSliderCreator = 3`, `serverState.freeSliderCreator = 7`.
   - Simulates the `serverHasUpdate` comparator.
   - Asserts `serverHasUpdate === true` and that the non-in-flight branch produces `nextState.freeSliderCreator === 7`.
   - Must fail on current code, pass after fix.

**Out of scope (file separately):** bootstrap coverage for `freeSliderCreator`/`freeSliderJoiner` in `bootstrapState` at line 2772; extracting the comparator to `src/app/lib/drift-detection.ts`; Realtime connection robustness (Brave shield/WSS reconnect).

No change to `mergeInFlight`, `isPhaseRegression`, or the Realtime subscription handler — P741 already handles the in-flight branch correctly.

## Acceptance Criteria

- [ ] Canary test `p750-drift-poll-slider-catchup.test.ts` fails on main, passes after fix
- [ ] `src/tests/p637-drift-detection-completeness.test.ts` passes with `freeSliderCreator`/`freeSliderJoiner` removed from `KNOWN_UNCOVERED`
- [ ] `src/tests/p609-free-slider-sync.test.ts` and any `p741-*.test.ts` still pass — no regression to in-flight merge behavior
- [ ] Manual Chrome↔Brave repro with Realtime blocked: partner slider updates propagate within 2 s via drift-poll
- [ ] `npx tsc --noEmit` clean
- [ ] No changes to `mergeInFlight`, `isPhaseRegression`, or the Realtime subscription handler
- [ ] No console errors during /live Speak Freely flow on either browser
