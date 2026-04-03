---
status: qa
type: bug
rank: 3
tags:
  - live
  - p617
  - regression
created_date: 2026-04-02T00:00:00.000Z
---

# P626: Guided Mode — Speak Button + Mode Switcher Still Visible After Entering Mode

**Severity:** High — core UX confusion, same class as P617
**Found during:** P617 UAT
**Predecessor:** P617 (mode switcher lifecycle redesign)

---

## Problem Statement

After selecting Guided mode and a story being selected, the listener (right window) still sees:
1. The "Speak" button — should not appear since both are inside Guided mode
2. The mode switcher (Open mode / Guided mode) — should be hidden inside a mode

The LEFT window (creator) shows the story card without Speak or mode switcher. The RIGHT window shows both.

**Reproduction:**
1. Two users in /live session
2. Select Guided mode
3. Select a story
4. LEFT (creator): correct — story card, no Speak, no mode switcher
5. RIGHT (listener): BUG — shows Speak button + mode switcher below story card

**Expected:** Both users should see the same view inside the mode — no Speak button, no mode switcher.

---

## Why UAT E2E Tests Passed

The E2E test for "speaker submits → partner sees drawer" verifies the drawer appears AFTER submission. But this bug is about the state BEFORE submission — the listener sees Speak + mode switcher when they should see neither. The test doesn't check for the ABSENCE of Speak on the listener before the speaker submits.

The `getViewState()` unit tests also pass because they test the correct state combinations — but the actual liveState values arriving on the listener's side may differ from what the tests assume (e.g., `ratingPhase` might not transition to the expected value on the listener's render).

---

## Root Cause (confirmed via code analysis)

**Shared root cause:** The code has no concept of "we're inside a round" — only "idle" and "submitted". `ratingPhase` only leaves `'idle'` when the speaker *submits* a number. But from the user's perspective, the round begins when the speaker clicks Speak. That gap is where all 3 bugs manifest.

### Bug 1 — Listener enters round too early
- **File:** `live-mode-view.tsx:1352` — the 7-condition AND gate for mode switcher
- **Mechanism:** `handleStartCheck()` writes `ratingInitiatedBy: name` to shared state on Speak *click* (before submission). Listener receives it via Realtime immediately. The mode switcher uses `!ratingInitiatedBy` as a hard-hide trigger → listener's UI changes before speaker submits.
- **Correct behavior:** Listener should see NO change until speaker submits a number. `ratingInitiatedBy` should disable (gray out) the switcher, not hide it.

### Bug 2 — Speaker sees double Speak
- **File:** `live-mode-view.tsx:1321` (ActionArea Speak in IdleScreen) + `:1756` (RatingCard)
- **Mechanism:** Possible render race — `updateLiveState` is async, `setIsLocallyRating(true)` is sync but batched. In a brief intermediate frame, IdleScreen may still render with the Speak button visible before the drawer fully opens. Also the RatingCard "Back" button could be visually confused with a second Speak.
- **Correct behavior:** After clicking Speak, speaker should go directly to number scale in drawer. No intermediate Speak button.

### Bug 3 — Mode switcher stays visible in round
- **File:** `live-mode-view.tsx:1352` (same 7-condition AND gate)
- **Mechanism:** No state signal for "story selected + mode chosen = in-mode." The switcher only hides when `ratingInitiatedBy` is set or `ratingPhase !== 'idle'`. "Entering a mode" (user's mental model) has no corresponding liveState transition.
- **Correct behavior:** Mode switcher should only be visible on idle screen. Disappears for speaker on Speak click, for listener on speaker submission.

### 5-Why (all 3 bugs)
1. Listener UI changes too early → `ratingInitiatedBy` written on click
2. Why on click? → Added as early signal to "close partner's history view" (`clarity-live-page.tsx:1368`)
3. Why does it affect mode switcher? → Reused as hide condition without updating semantics
4. Why no "in-mode" state? → `sessionMode: 'guided'` is a setting, not a phase transition
5. **Root:** The code has no concept of "we're inside a round" — only "idle" and "submitted"

### Fix approach
- Bugs 1 & 3: Change mode switcher gate at `live-mode-view.tsx:1352` — `ratingInitiatedBy` should *disable* (not hide) the switcher. Hide only on `ratingPhase !== 'idle'`.
- Bug 2: Ensure `isLocallyRating` is set synchronously before any async state update, preventing intermediate IdleScreen render with Speak visible.
- Mode switcher visibility rule: **only visible on idle screen when no round is active**

---

## Missing Test Cases

1. **Before speaker submits → listener should NOT see Speak button**
2. **After both submit → mode switcher should be hidden**
3. **Speaker clicks Speak → immediately sees drawer with number scale (no double-Speak)**
4. **Listener sees NO change before speaker submits rating**
5. **Mode switcher hidden for speaker immediately on Speak click**
6. **Mode switcher hidden for listener only after speaker submits**

---

## Acceptance Criteria

- [ ] After entering Guided mode (story selected, speaker initiated), listener does NOT see Speak button
- [ ] After entering Guided mode, mode switcher is hidden on both sides
- [ ] Speaker clicks Speak → sees drawer immediately (no double-Speak)
- [ ] Listener sees NO change before speaker submits rating
- [ ] After both submit, mode switcher remains hidden during the round
- [ ] getViewState() unit tests added for ALL missing test cases above
