---
status: today
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

## Root Cause (needs investigation)

The `getViewState()` function returns `idle` for the listener because the conditions for `responder-drawer` or other non-idle states aren't met on the listener's side. Need to trace:
1. What exact liveState values does the listener have when this screenshot was taken?
2. Which `getViewState()` branch fires?
3. Is `ratingPhase` still `idle`? Is `myRatingSubmitted !== partnerRatingSubmitted` false?

**Approach for next session:** Add console logging to `getViewState()` call in the component to capture the exact input → output, then reproduce.

---

## Missing Test Cases (from this session's UAT)

These are the scenarios the current E2E tests do NOT cover:

1. **Before speaker submits → listener should NOT see Speak button** — the test checks after submit, not before
2. **After both submit → mode switcher should be hidden** — no test checks for absence of mode switcher during a round
3. **Speaker clicks Speak → immediately sees drawer** — the test confirms this works, but doesn't verify there's no intermediate "Speak again" state
4. **Listener sees no change before speaker submits** — listener should stay on idle view, not see Speak button inside the mode

---

## Session Context (what we tried, P617 session)

This bug was discovered during a long session that shipped P609 (slider sync), P612-614 (header CTA, toast position, mode switcher props), and P617 (mode switcher lifecycle + getViewState refactor). Key learnings:

**What we tried:**
- P617 added 3-state mode switcher (enabled/disabled/hidden) — visibility condition based on `ratingInitiatedBy`
- Extracted `getViewState()` pure function from 9-branch if/return cascade — 25 unit tests
- Added submission mismatch check before idle check to fix "second round Speak button" bug
- Removed 2-second hold timer for 10/10 detection, added confirmed-state guard
- Fixed E2E test infra (both users verified + terms pre-accepted)

**What we learned:**
- The mode switcher visibility is controlled INSIDE `IdleScreen` (line ~1355), not by `getViewState()`. `getViewState()` only decides WHICH component renders — if it returns `idle`, IdleScreen renders with its own internal mode switcher logic
- The Speak button is part of IdleScreen — if `getViewState()` returns `idle`, the Speak button shows. The question is: should `getViewState()` return something OTHER than `idle` in this state?
- The fundamental design question: what does "entering a mode" mean in terms of liveState? Currently there's no explicit "in-mode" flag — the mode is just `sessionMode: 'guided'` which is always set. "Entering" the mode (from the user's perspective) happens when the speaker clicks Speak and submits — but `getViewState()` treats that as `idle` until submission

**Hypothesis for root cause:**
The concept of "entering a mode" is not represented in liveState. Selecting "Guided mode" sets `sessionMode: 'guided'`, but this doesn't change the view state — users stay on idle with Speak visible. The user expects that selecting a mode + having a story should transition the UI, but the code treats mode selection as a setting, not a phase transition.

**Possible fixes (for next session to evaluate):**
1. **Add `console.log` to getViewState()** — capture exact input → output when the bug manifests
2. **Revisit what "entering a mode" means** — does selecting Guided mode need a new view state? Or is the fix about hiding Speak/mode switcher under certain conditions within IdleScreen?
3. **Consider if the PRD needs revision** — the P617 spec says "mode switcher hidden once users enter a mode (after speaker submits rating)". But the user expects it hidden earlier (when mode is selected + story present)?

---

## Acceptance Criteria

- [ ] After entering Guided mode (story selected, speaker initiated), listener does NOT see Speak button
- [ ] After entering Guided mode, mode switcher is hidden on both sides
- [ ] Speaker clicks Speak → sees drawer immediately (no double-Speak)
- [ ] Listener sees NO change before speaker submits rating
- [ ] After both submit, mode switcher remains hidden during the round
- [ ] getViewState() unit tests added for ALL missing test cases above
