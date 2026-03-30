---
status: all-done
completed_at: '2026-03-30'
type: story
rank: 0.19
tags:
  - epic-story-first
  - live
  - p562
flow: dev
created_date: 2026-03-28T00:00:00.000Z
uat_file: features/uat/p600.md
test_files:
  - e2e/integration/p600-free-mode-rerating.spec.ts
---

# P600: Free Mode Polish — Exit Consistency + Visual Feedback

**Depends on:** P562 (free mode core, on branch `prototype/p562-new-live` in w2)
**Priority:** Ship-blocker for P562 — these are functional gaps, not nice-to-haves

---

## Problem Statement

P562 free mode core works (guided first round → sliders unlock → live updates). Five issues remain before shipping:

1. **"Speak freely" doesn't fully exit free mode** — `handleSkip` (called after confirmation dialog) clears guided mode state but leaves `freePhase`, `freeSliderCreator/Joiner`, `freeRounds` set. Users get stuck in a broken state.

2. **Success screen (10/10) lacks dual-acknowledgment** — One user clicking "Discuss another story" immediately resets for both. Should require both to click "Continue" (same as guided mode celebration).

3. **Live-updating Journey dots not visually distinct** — The live row (current slider positions) uses the same black dots as committed rounds. Should be blue to signal "this is live, not committed."

4. **No feedback when partner moves slider** — In unlocked phase, partner's slider changes update the Journey silently. A brief toast would draw attention to the change. *(REVERTED — too distracting)*

5. **Speaker re-rating skipped in free mode** — P562 transitions directly from listener's "Done explaining" to sliders, skipping the speaker's re-rating after paraphrase. This loses a key data point (speaker's updated belief) and makes the Journey incomplete (only 2 rows instead of 3 before the live sliders).

---

## Acceptance Criteria

### Fix 1: handleSkip clears free mode state
- [x] Add `freePhase: undefined, freeSliderCreator: undefined, freeSliderJoiner: undefined, freeRounds: undefined` to `handleSkip`'s `updateLiveState` call in `clarity-live-page.tsx` (~line 1813)
- [x] After "Speak freely" confirmation in slider phase, both users return cleanly to idle entry screen

### Fix 2: Dual-acknowledgment for success screen
- [x] "Discuss another story" on success screen uses `celebrationAcknowledgedByCreator/Joiner` pattern
- [x] First user to click sees "Waiting for [partner] to continue..."
- [x] Only when both click does state reset to idle
- [x] Reuse `handleCelebrationComplete` with free mode branch that resets to idle (clears all free mode + guided state)

### Fix 3: Blue dots for live row
- [x] In `free-mode-view.tsx`, the live-updating DotBar row uses `text-blue-500` instead of `text-foreground`
- [x] Committed round rows remain black (`text-foreground`)

### Fix 4: Toast on partner slider move (REVERTED — too distracting)
- [x] ~~Implemented then removed~~ — slider toast fired on every partner adjustment, creating visual noise during conversation-heavy phase

### Fix 5: Speaker re-rates after paraphrase before sliders unlock
P562 skipped the speaker re-rating step in free mode (`handleExplainBackDone` transitions directly to `freePhase: 'unlocked'`). This loses the third data point — the speaker's updated belief after hearing the listener's paraphrase.

- [ ] Remove the free-mode bypass in `handleExplainBackDone` — let the guided flow continue (set `explainBackDone: true` so speaker sees re-rating drawer)
- [ ] In `handleExplainBackRate`, when `sessionMode !== 'guided'` AND rating < 10: transition to `freePhase: 'unlocked'` with re-rated value stored in `freeRounds` as a second entry (label: '1')
- [ ] In `handleExplainBackRate`, when `sessionMode !== 'guided'` AND rating === 10: proceed to celebration (existing guided flow handles this)
- [ ] `freeRounds` now contains 2 entries before sliders: row 0 (initial sealed-bid) + row 1 (speaker re-rating after paraphrase)
- [ ] In `free-mode-view.tsx` Journey, the re-rating row displays between committed rows and the live blue dots (no code change needed — it's already iterated from `freeRounds`)

### Fix 6: UAT round 2 fixes (already shipped)
- [x] Removed slider toast (Fix 4 reversal)
- [x] Rewrote FreeModeSuccess to match guided celebration (sparkle + headline + Continue + WaitingIndicator)
- [x] Removed "End session" button from success screen
- [x] Fixed layout order: Journey above story card (P400 Bug 3 parity)
- [x] Fixed content state clearing in all 3 exit paths (handleFreeSpeakFreely, handleFreeDiscussAnother, freeReactiveResetFiredRef)

---

## Technical Notes

**Files to modify:**
- `src/app/pages/clarity-live-page.tsx` — Fix 5 (handleExplainBackDone bypass removal, handleExplainBackRate free-mode branch)
- `src/app/components/partners/free-mode-view.tsx` — Fix 5 display (freeRounds already iterated, may need label adjustment)

**Reuse:**
- `handleExplainBackRate` — existing guided mode handler, add free-mode transition branch
- `handleExplainBackDone` guided mode path (line 2142-2148) — just remove the free-mode early exit
- Re-rating drawer UI — already renders for speaker when `explainBackDone: true` (live-mode-view.tsx line 2499-2544)
- `FreeRoundRecord` type — add second entry with label '1' for re-rating round

**Branch:** `feature/p592-free-mode-polish` in worktree w1

---

## Test Coverage Strategy

**What's Tested:**
- Integration: `freeRounds` contains 2 entries after re-rating transition (row 0: sealed-bid, row 1: re-rating)
- Integration: `freeRounds` survives JSONB merge when slider values update
- UAT: Speaker sees re-rating drawer after listener paraphrases (UAT-5.1)
- UAT: Journey shows 3 rows — 2 committed + 1 live blue (UAT-5.2)
- UAT: Re-rating of 10 triggers celebration, not sliders (UAT-5.3)
- UAT: Listener sees waiting state during speaker re-rating (UAT-5.4)

**What's NOT Tested (rationale):**
- No new E2E test — existing `p562-free-mode.spec.ts` will be updated during `/dev` to account for the re-rating step (it currently expects sliders immediately after "I paraphrased")
- No unit test — no new utility functions; change is in handler logic
- No a11y test — re-rating drawer already exists and is accessible in guided mode
- No smoke test — existing `p562-smoke.spec.ts` covers free mode page load

**Test Files:**
- `e2e/integration/p600-free-mode-rerating.spec.ts` (2 integration tests)
- `features/uat/p600.md` (4 UAT scenarios)

**Existing test impact:**
- `e2e/p562-free-mode.spec.ts` line 116: "I paraphrased" → sliders unlock — this will need a re-rating step inserted between paraphrase and sliders during `/dev`
