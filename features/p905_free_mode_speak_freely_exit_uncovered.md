---
status: backlog
type: bug
rank: 67
severity: medium
workstream: C1
date_reported: '2026-06-05'
created_date: '2026-06-05'
tags:
  - e2e
  - live
  - test-debt
  - two-party
  - free-mode
delivery_stage: create-bug
pipeline_ran:
  - create-bug
---

# P905: Free-mode "Speak freely" exit from unlocked sliders has no E2E coverage

## Summary

The "Speak freely" exit from free mode's unlocked-slider phase (`handleFreeDiscussAnother` / P515 skip-negotiation dual-ack state machine) has no two-party E2E test — a regression in this path would ship undetected.

## Root Cause

Test-coverage gap, not a product bug. The pre-P891 `e2e/p562-free-mode.spec.ts` asserted that clicking "Speak freely" in the unlocked phase returned both parties to the entry screen. The P891 rewrite (which updated the suite to the post-`11aadf87` design) asserts the "Speak freely" affordance is *visible* in the unlocked phase but never clicks it, because the exit now routes through the P515 skip-negotiation flow (`onSpeakFreely={() => handleRequestSkip('good-enough')}`, `live-mode-view.tsx` ~879) — a multi-step partner dialog that was out of scope for the P891 test-debt fix. Surfaced by the code-review pass during `/fix p891`.

## Reproduction Steps

(Coverage gap — steps describe the untested flow.)

1. Two participants join a /live session (free/"Open" mode, default)
2. Complete a gap round: speaker bids 8, listener bids 5, listener explains back, speaker re-rates 9 → `freePhase='unlocked'` continuous sliders
3. Speaker clicks "Speak freely" below the slider
4. Partner receives the skip-negotiation dialog; both resolve it
5. Observe: both return to the entry screen; `freePhase` cleared in `live_state`

**Reproduction rate:** n/a — no test exercises steps 3–5.

## Expected Behavior

A two-party E2E test drives steps 1–5 via UI clicks (per `.claude/rules/live.md`, no `advanceSessionState` shortcuts for the interaction under test) and asserts both the UI outcome (entry screen restored on both pages) and the DB ground truth (`freePhase` null/undefined, dual-ack keys cleared).

## Actual Behavior

`e2e/p562-free-mode.spec.ts` (post-P891) only asserts the "Speak freely" text is visible in the unlocked phase. The `handleFreeDiscussAnother` / skip-negotiation dual-ack path is exercised by zero E2E tests.

## Affected Files

- `e2e/p562-free-mode.spec.ts` — extend, or add `e2e/p905-free-mode-speak-freely-exit.spec.ts`
- `src/app/components/partners/live-mode-view.tsx` ~879 — `onSpeakFreely` wiring (under test, not to change)
- `src/app/pages/clarity-live-page.tsx` — `handleRequestSkip('good-enough')` / `handleFreeDiscussAnother` (under test, not to change)

## Severity

**Medium** — no user-facing breakage today; an unprotected dual-ack state machine on a core /live flow is regression-prone (same class as the P525 race and the P879 history omission, both of which shipped).

## Fix Approach

Add a two-party E2E test that reuses P891's `reachUnlockedViaExplainBack` helper (consider exporting it to `e2e/helpers/`), then clicks "Speak freely" on one page, drives the partner's negotiation dialog to acceptance, and asserts entry-screen restoration on both pages + `freePhase` cleared in DB.

## Acceptance Criteria

- [ ] A two-party E2E test drives the unlocked-phase "Speak freely" exit via UI clicks (no DB-merge shortcut for the exit interaction)
- [ ] Test asserts both pages return to the entry screen (mode toggle visible)
- [ ] Test asserts `live_state.freePhase` is cleared and dual-ack keys reset in DB
- [ ] Suite passes on main alongside `e2e/p562-free-mode.spec.ts`
