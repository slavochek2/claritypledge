---
status: all-done
type: bug
rank: 29
severity: high
workstream: C1
date_reported: '2026-08-14'
created_date: '2026-08-14'
tags: [live-session, state-machine, deadlock, test-coverage]
pipeline_ran: [create-bug, reproduce, fix]
completed_at: 2026-08-14
---

# P1080: Guided /live clarify loop can reach a mutual-wait state with no actionable control

## Summary

In the guided `/live` flow, both participants can land in the clarify sub-loop showing each other a waiting indicator, with "Speak freely" as the only control on either screen — the round cannot be continued, only abandoned. Successor to **P525** (Live State Deadlock Prevention, 2026-03-16), which fixed adjacent races and deferred the recovery UI ("P525b") that was never filed.

## Root Cause

**CONFIRMED.** Fixed in `8a70de37`.

`isStateRegression` / `isPhaseRegression` rank the phases on a single linear pass — `idle 0 → waiting 1 → rating 2 → revealed 3 → explain-back 4 → results 5` — and reject any incoming phase ranked below local as a stale Realtime echo, with one exception for `idle` (round reset).

**But the guided round is a cycle, not a line.** From round 2 on, the listener re-enters explain-back after the speaker re-rates below 10, so the write is `results (5) → explain-back (4)`. Ranked backward and not `idle`, it was discarded. The speaker's client never left `results` while the listener advanced, and both then rendered waiting indicators naming the other as the one who must act.

Round 1 is a single monotonic pass, which is why it always worked. The drift poller (`clarity-live-page.tsx:1526`) applies the *same* guard, so the fallback that exists precisely to heal lost updates could never heal this one — which is why 126 production drift events recovered nothing.

Intermittent in production because it is a race: if the speaker's client has not yet reached `results` locally when the write lands, the update applies normally. That is why rounds 3–5 appear in the data at all.

**The original hypothesis in this spec was wrong.** It guessed at `hasExplainBackHappened` being false at `speaker-deciding` (`live-mode-view.tsx:3654`). The evaluator falsified it on the first run: the captured state had `clarificationPhase: undefined` and `ratingPhase: 'explain-back'`, nowhere near `speaker-deciding`. Recorded because the wrong guess was plausible, cited real line numbers, and would have produced a fix in the wrong file had it not been tested first.

### Why it survived P525 and four P671 attempts

`src/tests/live-state-guard.test.ts` asserted the deadlock as correct behavior — `expect(isPhaseRegression('results', 'explain-back')).toBe(true)`. Any fix would have turned that test red and looked like a regression.

Compounding it, `decisions.md` 2026-04-09 records that this guard was retained as defense-in-depth for a cause that was never confirmed: *"That was a hypothesis, never verified against live data… The monotonic guard pattern remains valid as defense-in-depth for Realtime echo ordering but was not the P671 root cause."* An unverified guard, locked in by a test asserting its buggy edge.

### Invariants

- **The `/live` round is a cycle. Any phase-ordering guard must enumerate its round-closing edges** (`→ idle`, `results → explain-back`) or it will strand both participants. A new backward edge means a new entry in `CYCLE_EDGES`, not a new special case in a caller.
- **Rejecting a state update is not fail-safe.** A wrongly-accepted backward edge self-heals — forward transitions are never blocked, so the next write or the 1s poll recovers. A wrongly-rejected one is terminal: the same guard blocks every redelivery. When in doubt about an edge, accept it.
- **Realtime and the drift poller share one guard.** Any change must satisfy both paths, or the poller silently re-discards what Realtime just accepted.
- **`PHASE_ORDER` returns `-1` for unknown phases, and `-1 < anything`** — so an unrecognized `ratingPhase` is rejected as a regression on every delivery path. Adding a phase without adding it to the table produces this same deadlock. (`e2e/p525-celebration-race.spec.ts` writes `ratingPhase: 'celebration'`, which is not in the table nor in the `RatingPhase` type — that spec fails on `main` today for this reason.)

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

Both are prerequisites for *measuring* this fix in production. Neither blocks the fix itself — routed to Follow-ups below rather than held in scope:

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

**Reproduction rate:** intermittent in production (a race — see Root Cause), but **deterministic under the evaluator**: it fails at round 2 on every run, because Playwright drives the clicks fast enough that the speaker's client always reaches `results` before the listener's `explain-back` write lands. That timing difference is why humans reach rounds 3–5 sometimes and the test never does.

## Expected Behavior

At every point in a guided session, each participant has at least one control that advances the round. "Speak freely" is an escape hatch that abandons the structured round; its presence does not satisfy the invariant.

This restates P525's own unmet requirement: *"No user should ever be stuck in a state with no actionable next step in /live."*

## Actual Behavior

Both participants see a waiting indicator naming the other as the one who must act. The only control on either screen is "Speak freely". The round cannot be continued.

## Affected Files

**Changed (the fix):**

- `src/app/lib/live-state-merge.ts` — `PHASE_ORDER` + new `CYCLE_EDGES`; `isPhaseRegression` moved here as the single definition, `isStateRegression` delegates to it
- `src/app/pages/clarity-live-page.tsx:166-176` — its duplicate `isPhaseRegression` (with a second copy of `PHASE_ORDER`) replaced by an import + re-export, so the two merge paths cannot diverge again
- `src/tests/live-state-guard.test.ts` — the assertion pinning the deadlock replaced with positive coverage of the cycle edge, incl. the poller path and the `explainBackDone` reset that rides along with it
- `e2e/p1080-guided-multi-round-never-stuck.spec.ts` — new; the evaluator

**Read during diagnosis, not changed** (the wrong-hypothesis trail — kept so the next reader does not re-walk it):

- `src/app/components/partners/live-mode-view.tsx:2560,3654,3686` — `hasExplainBackHappened` and the two `WaitingIndicator` branches. These *render* the deadlock but do not cause it; both are correct given the state they receive.
- `src/app/pages/clarity-live-page.tsx:2792-2866` — `handleExplainBackRate`. Writes `clarificationPhase` + `explainBackRatings` in one call, so they never diverge; the earlier hypothesis that they could was wrong.

**Still unaddressed (deferred, see Acceptance Criteria):**

- `src/app/pages/clarity-live-page.tsx:718-740` — phase-transition telemetry, `ratingPhase` only
- `src/app/pages/clarity-live-page.tsx:1446-1530` — drift detection; `explainBackRatings` is absent from the drift key list. Not load-bearing for this bug (it always changes alongside keys that *are* watched), but it is a latent gap.

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

- [x] A committed two-party e2e spec drives the guided loop through ≥4 consecutive clarify rounds using only UI clicks — no `advanceSessionState` calls — `e2e/p1080-guided-multi-round-never-stuck.spec.ts`
- [x] The spec asserts, after every state change and for both participants, that ≥1 enabled forward control is visible (excluding "Speak freely") — `assertPairCanProgress`, called at 8 points per round
- [x] The spec has been **observed failing red** against the unfixed code, and the failure output is recorded in this spec (epistemic gate 7) — see Reproduction below; 2/2 runs, identical state
- [x] Two participants complete 4+ guided rounds without either screen reaching a state whose only control is "Speak freely" — green post-fix, 43s
- [x] Existing live-session specs still pass: failing set on this branch is **byte-identical to `main`** (11 pre-existing failures across `p525`/`p617`/`p674`/`p976`, zero new). Full unit suite 2788 passed / 0 failed
- [x] New unit assertions confirmed failing with the fix disabled — 5 red, all unrelated assertions still green

**Dropped, with reason:** *"The same spec covers open (free) mode through ≥4 rounds."* Open mode is structurally not exposed to this bug — the free-mode divergence writes `ratingPhase: 'idle'` (`clarity-live-page.tsx:2845`), and `idle` is the exception the guard already whitelisted. The loop then runs on `freePhase`, which appears in neither `PHASE_ORDER` nor `MONOTONIC_BOOLEAN_FLAGS`, so the rank guard never evaluates it. A free-mode multi-round test would be a regression gate against future changes, not coverage of this defect; filing it as such is honest, folding it in here would have overstated what was fixed.

## Follow-ups (out of scope here — filed to the task inbox)

Not acceptance criteria for this spec; the fix stands without them. Filed via `/note` in `docs/process-learnings.md` so they do not live in memory.

1. **Instrument `clarificationPhase` transitions.** `live_phase_transition` watches `ratingPhase` only (`clarity-live-page.tsx:718-740`), so the round-2+ machine — the one this bug lived in — emits nothing. Until this lands, the fix is verified by test but not observable in production.
2. **Track the good-enough / skip exit from `speaker-deciding`.** Only `live_clarify_started` fires today, so a deliberate exit and a stall are indistinguishable in the data (13 of 40 sub-perfect re-ratings are currently unattributable).
3. **Recovery net — the never-filed "P525b".** Surface a "Reset round" control when a session sits in one phase past a threshold. Additive, bounds user harm independent of any root cause.
4. **Console-error assertion during a full guided session.** The evaluator does not capture console output, so "no console errors across 4 rounds" is **unverified** — stated rather than ticked.

## Reproduction (recorded per epistemic gate 7)

Pre-fix, `e2e/p1080-guided-multi-round-never-stuck.spec.ts`, 2/2 runs, identical state:

```
P1080 never-stuck invariant VIOLATED — neither participant has a forward control after 15000ms.
DEADLOCK at: round 2 — after explain-back done
  speaker action-area : Bob is deciding whether to listen actively... | Speak freely
  listener action-area: Waiting for Alice to evaluate how well you captured their idea... | Speak freely
  ratingPhase         : explain-back
  clarificationPhase  : undefined
  explainBackRound    : 1
  explainBackRatings  : [9]
  explainBackDone     : true
  checkerSubmitted    : true
  responderSubmitted  : true
  sessionMode         : guided
```

Post-fix: `1 passed (43.0s)`.
