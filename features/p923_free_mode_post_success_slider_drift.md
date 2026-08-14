---
status: backlog
type: bug
rank: 70
severity: low
workstream: live
date_reported: '2026-06-10'
created_date: '2026-06-10'
tags:
  - live
  - free-mode
  - data-integrity
  - p810-followup
  - merge-path
delivery_stage: create-bug
pipeline_ran:
  - create-bug
---

# P923: Free-mode stored slider state can drift off 10 after celebration (P810 follow-up — data integrity)

## Summary

After a genuine mutual-10/10 free-mode round, the persisted `live_state.freeSliderCreator` / `freeSliderJoiner` can still drift to an asymmetric value (e.g. 6) while `freePhase === 'success'`. P810 shipped a *display* fix (render actual stored values) but never addressed the underlying write drift — the DB row can still be wrong for a completed round.

## Root Cause

Verified by code reads + an adversarial review (2026-06-10). The **entry gate is correct** — you cannot reach `freePhase === 'success'` unless both sliders are genuinely 10 (`free-mode-view.tsx:112` `bothAtTen`; `clarity-live-page.tsx:1789` `handleFreeRoundComplete` re-checks the partner key against `confirmedLiveStateRef`). The asymmetry arises **post-entry** via two independent write vectors:

1. **Own slider (debounced stale write):** `handleFreeSliderChange` (`clarity-live-page.tsx:1755`) writes `freeSlider{Creator,Joiner}` via `updateLiveState` with no `freePhase` guard. Own-slider writes are debounced ~300ms (P763, commit `1b317878`), so a stale pre-10 value queued during the drag-to-10 can land *after* `freePhase` flips to `success`.

2. **Partner slider (merge write-back — the dominant vector):** `mergeInFlight` (`src/app/lib/live-state-merge.ts:33-37`) overlays `PARTNER_OWNED_KEYS` (includes `freeSlider*`) into `confirmedLiveStateRef` with no phase guard. The receiving client's next `updateLiveState` call builds `newState = {...confirmedLiveStateRef.current, ...updates}` (`clarity-live-page.tsx:1534`) and, on a full-overwrite write (`:1542-1543` `shouldUseFullOverwrite → updateClaritySessionLiveState`), persists the whole blob — carrying the drifted partner value — to the DB. This path never goes through `handleFreeSliderChange`, so a handler-only guard does not cover it.

## Invariants

- **Entry to `freePhase === 'success'` already requires both sliders === 10.** Do not "fix" this by hardening the entry gate — the gap is purely post-entry writes.
- **Partner-key preservation in the in-flight merge window is load-bearing** (decisions.md P609 / P671 / P741 / P750). Any success-phase change to `mergeInFlight` must NOT drop partner keys during the *normal* (`unlocked`) in-flight window — only when phase is `success`. Read those four decisions before editing `live-state-merge.ts`.

## Reproduction Steps

1. Start a two-party free-mode `/live` session (creator + joiner), both verified.
2. Both participants drag their slider to 10 → `freePhase` becomes `success`, celebration renders.
3. Simulate the race: deliver a stale/late slider value (own debounced pre-10 write, OR a partner `freeSlider*` value arriving via Realtime sync) to one client *after* the success transition.
4. Read `live_state.freeSliderCreator` / `freeSliderJoiner` in the DB.
5. Observe: one value is the stale non-10 number (e.g. 6) for a round that completed at a genuine mutual 10/10.

**Reproduction rate:** Rare in the wild (sub-300ms race), but deterministically forceable in a two-party test by injecting the post-success write.

## Expected Behavior

Once a round reaches `freePhase === 'success'`, the stored `freeSlider{Creator,Joiner}` stay at 10 — no late own-write or partner-sync value mutates them. The persisted row reflects the actual completed state.

## Actual Behavior

A late write (own debounced or partner-merge) overwrites the stored slider to a pre-10 value while the success screen is up; the DB row is left asymmetric for a completed 10/10 round. (Post-P810 the screen renders that drifted value, so in the race the celebration can show "understood perfectly!" above e.g. 6/10.)

## Affected Files

- `src/app/pages/clarity-live-page.tsx:1755` — `handleFreeSliderChange` (own-write vector; needs phase guard)
- `src/app/lib/live-state-merge.ts:33-37` — `mergeInFlight` partner overlay (partner-write-back vector; needs success-phase guard)
- `src/app/pages/clarity-live-page.tsx:1534,1542-1543` — `updateLiveState` full-overwrite write-back (the path that persists the merged partner value)

## Severity

**Low** — Rare race; users barely affected (worst case is a cosmetic incoherent celebration in the race, already display-honest post-P810). The original P810 harm (masking P806's badge-not-firing during debugging) is moot — P806 shipped and the badge fires from a state-watcher. Remaining impact is a data-integrity smell (a completed 10/10 round persisting a non-10 value) that could pollute session history / analytics.

## Fix Approach

Two guard sites (a one-site fix is incomplete — verified):

1. **`handleFreeSliderChange`:** early-return when on the success screen —
   `if (confirmedLiveStateRef.current.freePhase === 'success') return;`
   Use the `=== 'success'` early-return form, NOT a `=== 'unlocked'` gate: during the re-rating preload window `freePhase` is briefly `undefined`/`idle`, and an `=== 'unlocked'` gate would drop a legitimate first slider write there.

2. **`mergeInFlight` (or its call sites `clarity-live-page.tsx:~1264,~1496`):** when `freePhase === 'success'`, drop `freeSliderCreator` / `freeSliderJoiner` from the partner overlay so a late partner value is never merged-then-persisted. Must not alter partner-key behavior during the normal `unlocked` in-flight window (P609/P671/P741/P750).

Optional (ACCEPT/DEFER, not required): conditional celebration headline (no "perfectly" when asymmetric). If the guards hold, stored state stays 10/10, so the asymmetric display path never arises in normal flow — making the headline change unnecessary.

## Acceptance Criteria

- [ ] After a genuine mutual-10 round, stored `live_state.freeSliderCreator` AND `freeSliderJoiner` remain 10 even when a stale/late slider value (own OR partner) arrives after `freePhase === 'success'`.
- [ ] A **two-party** canary exercises the **partner-sync / merge write-back** vector (not just the handler) and asserts the DB value via service-role read — fails on the pre-fix commit, passes post-fix. (Per `.claude/rules/live.md`: a component/unit canary stays green while this bug recurs — the "anti-canary trap.")
- [ ] No regression to partner-key preservation during the normal `unlocked` in-flight window — existing merge tests still pass.
- [ ] No regression to the normal free-mode round (both to 10 → celebration → badge → Continue).

## References

- decisions.md 2026-06-10 [technical] "P810 reframed — celebration 10/10 mismatch is post-success write drift, not UI synthesis"
- `features/done/2026-06-10/p810_celebration_journey_table_lies_about_ratings.md` — shipped the display fix (Option A), not this drift
- Prior merge-path decisions: P609 / P671 / P741 / P750 (partner-key preservation)
- `.claude/rules/live.md` — two-party canary requirement / anti-canary trap
