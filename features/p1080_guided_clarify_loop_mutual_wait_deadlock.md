---
status: week
type: bug
rank: 29
severity: high
workstream: C1
date_reported: '2026-08-14'
created_date: '2026-08-14'
tags: [live-session, state-machine, deadlock, test-coverage]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1080: Guided /live clarify loop can reach a mutual-wait state with no actionable control

## Summary

In the guided `/live` flow, both participants can land in the clarify sub-loop showing each other a waiting indicator, with "Speak freely" as the only control on either screen — the round cannot be continued, only abandoned. Successor to **P525** (Live State Deadlock Prevention, 2026-03-16), which fixed adjacent races and deferred the recovery UI ("P525b") that was never filed.

## Root Cause

**Under investigation — hypothesis, not confirmed.** Per epistemic gate 2, the disproof runs before this is asserted.

**Hypothesis:** `clarificationPhase === 'speaker-deciding'` is reachable while `explainBackRatings` is empty. The speaker's "Share what's missing" button is gated on `clarificationPhase === 'speaker-deciding' && hasExplainBackHappened` (`live-mode-view.tsx:3654`), where `hasExplainBackHappened = liveState.explainBackRatings.length > 0` (`live-mode-view.tsx:2560`). When that conjunction is false the speaker falls through to a `WaitingIndicator` reading *"{partner} is deciding whether to listen actively…"*. The listener in `speaker-deciding` renders a `WaitingIndicator` unconditionally (*"{checker} is deciding whether to clarify…"*). Both sides then wait on the other; neither branch offers a forward action.

**Cheapest disproof:** a two-party test that drives the guided loop through consecutive clarify rounds with real clicks and asserts each party always has ≥1 non-escape control. If the invariant never breaks, the hypothesis is wrong and the cause is environmental (Realtime delivery) rather than a state-machine reachability bug.

On the normal path the two keys are written in one `updateLiveState` call (`clarity-live-page.tsx:2857-2866`), so they should not diverge. The suspected divergence route is state reconciliation, not the happy path — see Evidence.

## Evidence (production, 180 days)

| Signal | Count | Reading |
|---|---|---|
| Paraphrase re-ratings, round 1 / 2 / 3 / 4 / 5 | 39 / 12 / 6 / 2 / 1 | Rounds 3–5 **are** reached — intermittent, not a hard block |
| `live_state_update_failed` | 0 | Not a failed DB write |
| `live_poll_tick_error` | 0 | Not a poller crash |
| `live_state_drift_detected` | 126 | Local/server divergence is routine; the fallback poller carries the flow |
| `live_phase_transition` (all) | 164 | Denominator for the above |

Symptom description matches P525's problem statement verbatim: *"no way to start a new round, only 'speak freely' with no action button."*

## Instrument gaps found while gathering the above

Both are prerequisites for measuring any fix, and both are in scope:

1. **`live_phase_transition` watches `ratingPhase` only** (`clarity-live-page.tsx:718-740`). The entire round-2+ machine lives in `clarificationPhase` and emits no transition event. The rounds users get stuck in are the unlogged ones.
2. **The "Speak freely" / good-enough exit from `speaker-deciding` is untracked.** Only `live_clarify_started` fires. A deliberate exit and a stall are therefore indistinguishable in the data: of 40 sub-perfect re-ratings, 27 clicked through and the remaining 13 are unattributable.

## Coverage gap

- `grep -rn "clarificationPhase" e2e/` → **0 hits**. The sub-loop has no end-to-end coverage in either direction.
- No e2e test drives `explainBackRound` past `1`; fixtures only ever set `0` or `1`.
- The deepest UI-driven two-party guided test (`e2e/p562-free-mode.spec.ts:42`) runs exactly one explain-back cycle, then diverges into free mode.
- The multi-round tests that exist (`p469`, `p588`) are single-page with injected fixtures — rendering only, no state machine.
- P525's own tests advanced state via `advanceSessionState` DB writes, so they could not observe a transition bug by construction.

## Reproduction Steps

1. Two verified users join the same `/live/{code}` session (creator + joiner).
2. Speaker starts a round; both submit sealed-bid ratings **with a gap** (e.g. 8 and 5).
3. Listener clicks "Explain back what I heard", then "I'm done with active listening".
4. Speaker re-rates **below 10** → `clarificationPhase` becomes `speaker-deciding`.
5. Speaker clicks "Share what's missing", then "I'm done clarifying".
6. Repeat steps 3–5 for further rounds.
7. Observe: at some round, both screens show a waiting indicator simultaneously and neither offers a forward control.

**Reproduction rate:** intermittent — unquantified. Establishing the rate is the first deliverable.

## Expected Behavior

At every point in a guided session, each participant has at least one control that advances the round. "Speak freely" is an escape hatch that abandons the structured round; its presence does not satisfy the invariant.

This restates P525's own unmet requirement: *"No user should ever be stuck in a state with no actionable next step in /live."*

## Actual Behavior

Both participants see a waiting indicator naming the other as the one who must act. The only control on either screen is "Speak freely". The round cannot be continued.

## Affected Files

- `src/app/components/partners/live-mode-view.tsx:3654` — speaker's forward action gated on `clarificationPhase === 'speaker-deciding' && hasExplainBackHappened`; falls through to `WaitingIndicator`
- `src/app/components/partners/live-mode-view.tsx:3686` — listener renders `WaitingIndicator` unconditionally in `speaker-deciding`
- `src/app/components/partners/live-mode-view.tsx:2560` — `hasExplainBackHappened` derivation
- `src/app/pages/clarity-live-page.tsx:2792-2866` — `handleExplainBackRate`, writes `clarificationPhase` + `explainBackRatings` together
- `src/app/pages/clarity-live-page.tsx:1446-1530` — drift detection; `explainBackRatings` is **absent** from the drift key list
- `src/app/pages/clarity-live-page.tsx:718-740` — phase-transition telemetry, `ratingPhase` only

## Severity

**High** — `/live` is the core product experience and the failure ends the structured round for both people at once. Not critical: no data loss, and an escape hatch exists.

## Fix Approach

**Evaluator first — the fix is not attempted until the invariant is mechanized and observed failing.** This ordering is the explicit lesson of `decisions.md` 2026-06-30: a gate sticks only with *"a committed canary (re-runs on every relevant change, demonstrated failing red per epistemic gate 7)"*. P525 shipped a fix and observability without a canary and could not tell whether it worked.

1. **Write the evaluator.** A two-party e2e spec driving guided **and** open mode through ≥4 consecutive rounds with real clicks and **no `advanceSessionState` DB injection**. After every state change, assert the never-stuck invariant for both pages: at least one enabled, visible control that is not "Speak freely".
2. **Run it.** Red → reproduction obtained; the failing assertion names the exact state. Green → the deterministic UI loop is exonerated; re-aim at Realtime delivery (the 126 drift events) and treat the invariant spec as the standing regression gate.
3. **Fix the narrowest cause the evaluator exposes.** No state-machine refactor: P525's breadth is what makes this class of change risky.
4. **Close the instrument gaps** so the fix is measurable: add `clarificationPhase` to phase-transition telemetry, and track the good-enough exit.
5. **Recovery net, independent of root cause** (the deferred P525b): if a session sits in one phase past a threshold, surface a "Reset round" control. Additive — bounds harm whether or not step 3 lands. File separately if step 3 closes cleanly.

## Acceptance Criteria

- [ ] A committed two-party e2e spec drives the guided loop through ≥4 consecutive clarify rounds using only UI clicks — no `advanceSessionState` calls
- [ ] The same spec covers open (free) mode through ≥4 rounds
- [ ] The spec asserts, after every state change and for both participants, that ≥1 enabled forward control is visible (excluding "Speak freely")
- [ ] The spec has been **observed failing red** against the unfixed code, and the failure output is recorded in this spec (epistemic gate 7) — or, if it cannot be made to fail, that result is recorded here and the hypothesis is retired in writing
- [ ] Two participants complete 4+ guided rounds without either screen reaching a state whose only control is "Speak freely"
- [ ] `live_phase_transition` fires on `clarificationPhase` changes, not just `ratingPhase`
- [ ] The good-enough/skip exit from `speaker-deciding` emits a tracked event, so a deliberate exit is distinguishable from a stall
- [ ] No console errors during a full 4-round guided session
- [ ] Existing live-session specs still pass: `p562`, `p674`, `p671`, `p617`, `p525`
