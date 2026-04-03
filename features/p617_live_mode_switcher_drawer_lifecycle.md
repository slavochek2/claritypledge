---
status: in-progress
type: change-request
rank: 4
tags:
  - live
  - ux
  - p562
  - redesign
changes: p562
created_date: 2026-03-31T00:00:00.000Z
delivery_stage: uat
reviews:
  ux: null
  architect: null
  alignment: null
---

# P617: /live — Mode Switcher + Drawer Lifecycle Redesign

## Problem Statement

**Current state:** The /live session has a mode switcher (Open mode / Guided mode) and rating drawers, but their visibility lifecycle is unpredictable. The mode switcher appears and disappears at wrong moments, and the drawer flow requires redundant clicks.

**Pain points:**
- Mode switcher stays visible inside a mode (should only show on default screen)
- Mode switcher disappears unpredictably when `ratingInitiatedBy` is set (even for the partner who didn't click Speak)
- After completing a round and returning to idle, the mode switcher sometimes doesn't reappear
- Partner sees a redundant "Speak" button after the speaker initiated — they should not need to click Speak themselves
- No visual feedback that the mode is locked while the speaker is rating

**Who's affected:** All /live session users (both creator and joiner)

---

## Intention (Why This Matters)

**Strategic importance:** The /live session is the core product experience. Confusing mode switching and redundant clicks erode trust in the tool. Users in a real conversation shouldn't be puzzling over UI state.

**Why now:** P562 (free mode) and P600 (polish) shipped the mode switcher, but UAT revealed the lifecycle is broken. Multiple bugs filed (P612-P614) but the root issue is a missing lifecycle spec — individual fixes keep conflicting with each other.

**Impact if not solved:** Users get confused during sessions, lose confidence in the tool, and don't return for a second session. The mode switcher becomes a source of friction instead of a feature.

---

## Business Requirements

**Must-haves:**
- Mode switcher is a one-time decision per session phase — visible on default screen, hidden inside a mode
- Speaker clicking "Speak" opens their drawer immediately (local only — partner is unaware)
- Speaker submitting their rating transitions both users into the selected mode and triggers the partner's drawer
- Mode switcher locks (disabled + tooltip) while the speaker is in their local rating drawer
- Mode switcher reappears reliably when returning to idle after any round (guided or free)

**Success conditions:**
- Zero confusion about which mode is active
- Zero redundant clicks for the partner
- Mode switcher state is always predictable from the session state

**Constraints:**
- Must not break the sealed-bid pattern (both users rate independently, neither sees the other's rating)
- Must work identically for Check ("Did they get it?") and Prove ("Did I get it?") flows
- Must work for both Open and Guided modes

---

## User Stories

**As a speaker initiating a round:**
- I want to click "Speak" and immediately see my rating drawer, so I can rate without waiting
- I want the mode switcher to lock when I'm in my rating drawer, so my partner can't change the mode while I'm rating

**As a listener (partner) waiting for the speaker:**
- I want to stay on the default screen while the speaker is rating, so I'm not interrupted
- I want the mode switcher to be locked (disabled) while the speaker is rating, so I know something is happening but can't disrupt it
- I want to see my rating drawer automatically after the speaker submits, so I don't need to click "Speak" again

**As either user returning from a round:**
- I want the mode switcher to reappear on the default screen, so I can switch modes for the next round if desired
- I want the mode switcher to be reliable — it should always show on the default screen, never inside a mode

---

## Jobs to Be Done

**When I start a /live session with my partner:**
- I want to choose between Open and Guided mode, so we can practice the way that fits our conversation (motivation: flexibility)

**When my partner clicks Speak:**
- I want to wait without confusion, so I'm not wondering what to do (motivation: clarity)
- I want a visual cue that the mode is locked, so I understand why I can't switch (motivation: trust in the UI)

**When a round finishes:**
- I want to seamlessly return to the default screen with mode choice available, so we can continue or switch modes (motivation: flow continuity)

---

## Outcomes (Success Metrics)

- Mode switcher state matches expectations 100% of the time (no unpredictable show/hide)
- Zero redundant Speak clicks for the partner (drawer auto-appears after speaker submits)
- Users can switch modes between rounds without confusion
- No regression to sealed-bid pattern or existing check/prove flows

---

## Acceptance Criteria

- [ ] Mode switcher visible on default/idle screen for both users
- [ ] Mode switcher hidden once users enter a round (after speaker submits rating)
- [ ] Mode switcher locked (disabled + tooltip) while speaker is in their local rating drawer
- [ ] Mode switcher reappears when returning to idle after guided round completion
- [ ] Mode switcher reappears when returning to idle after free mode round completion
- [ ] Mode switcher reappears after "Speak freely" (exit mode without completing round)
- [ ] Mode switcher reappears after "Skip" / "Decline"
- [ ] Speaker clicking "Speak" opens their drawer immediately (partner sees no change except locked mode switcher)
- [ ] Selecting a story auto-opens the drawer for the story owner (no redundant Speak click after story selection)
- [ ] Speaker submitting rating transitions partner into the round (partner sees story card + their drawer, no Speak button)
- [ ] Listener does NOT see the story card until the round starts (speaker submits)
- [ ] No regression to sealed-bid pattern
- [ ] Works for both Check and Prove flows
- [ ] Works for both Open and Guided modes

---

## Screen-by-Screen Flow (canonical reference)

This is the exact screen state at each step. Any implementation that doesn't match this is wrong.

```
Step 1: Both join → clean idle
   USER A (speaker)              USER B (listener)
   ┌─────────────────────┐      ┌─────────────────────┐
   │  [Speak]            │      │  [Speak]             │
   │  + Select story     │      │  + Select story      │
   │  [Open] [Guided]    │      │  [Open] [Guided]     │
   └─────────────────────┘      └─────────────────────┘
   Both: Speak button, story picker, mode switcher (enabled).

Step 2: User A clicks Speak (WITHOUT selecting a story first)
   USER A                        USER B
   ┌─────────────────────┐      ┌─────────────────────┐
   │  ┌─ Drawer ──────┐  │      │  [Speak]             │
   │  │ How well does  │  │      │  + Select story      │
   │  │ B understand?  │  │      │                      │
   │  │ [1-10 scale]   │  │      │  [Open] [Guided]     │
   │  │ [Submit] [Back]│  │      │    (disabled)        │
   │  └────────────────┘  │      │                      │
   └─────────────────────┘      └─────────────────────┘
   User A: drawer opens immediately, no mode switcher.
   User B: stays on idle, mode switcher DISABLED.

Step 2b: User A clicks Speak (WITH selecting a story)
   User A clicks "+ Select story" → picks one →
   drawer opens AUTOMATICALLY (no second Speak click needed)
   USER A                        USER B
   ┌─────────────────────┐      ┌─────────────────────┐
   │  [Story Card]       │      │  [Speak]             │
   │  ┌─ Drawer ──────┐  │      │  + Select story      │
   │  │ How well does  │  │      │                      │
   │  │ B understand?  │  │      │  [Open] [Guided]     │
   │  │ [1-10 scale]   │  │      │    (disabled)        │
   │  │ [Submit] [Back]│  │      │                      │
   │  └────────────────┘  │      │                      │
   └─────────────────────┘      └─────────────────────┘
   User A: story card + drawer, no mode switcher.
   User B: stays on IDLE (no story card yet), switcher DISABLED.

Step 3: User A submits a number → round starts
   USER A                        USER B
   ┌─────────────────────┐      ┌─────────────────────┐
   │  [Story Card]       │      │  [Story Card]        │
   │  Understanding...   │      │  ┌─ Drawer ──────┐   │
   │                     │      │  │ How confident  │   │
   │                     │      │  │ you understand │   │
   │                     │      │  │ A? [1-10]      │   │
   │                     │      │  │ [Submit]       │   │
   │                     │      │  └────────────────┘   │
   └─────────────────────┘      └─────────────────────┘
   Both in round. Mode switcher HIDDEN on both sides.
   User B NOW sees story card + rating drawer.

Step 4: Both submitted → results → celebration → back to idle
   USER A                        USER B
   ┌─────────────────────┐      ┌─────────────────────┐
   │  [Speak]            │      │  [Speak]             │
   │  + Select story     │      │  + Select story      │
   │  [Open] [Guided]    │      │  [Open] [Guided]     │
   └─────────────────────┘      └─────────────────────┘
   Back to Step 1. Mode switcher ENABLED again.
```

---

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Mode switcher — idle | Enabled, blue highlight on active mode | Default screen, no round active |
| Mode switcher — speaker in drawer | Disabled (grayed out), tooltip: "Mode locked — your partner is rating" | While speaker is in local rating drawer |
| Mode switcher — in round | Hidden | After speaker submits, both in round |
| Mode switcher — back to idle | Enabled, reappears | After round completes |
| Story card — listener | NOT visible until round starts | Listener stays on idle while speaker is in drawer |
| Speak button — after story select | NOT visible — drawer auto-opens | Story selection triggers drawer for owner |

---

## Scope Fence

**What NOT to build:**
- New mode types (only Open and Guided exist)
- Changes to the sealed-bid rating mechanism
- Changes to how ratings are stored or synced via Realtime

**What NOT to change:**
- `handleRatingSubmit` core logic (first-submit sets checkerName + ratingPhase)
- `handleCelebrationComplete` dual-ack pattern
- `handleSkip` / `handleFreeSpeakFreely` reset logic
- FreeModeView slider interaction

**Existing mechanisms to reuse:**
- `ratingInitiatedBy` field — already signals "speaker clicked Speak" to partner
- `ratingPhase` state machine — already controls drawer visibility for the responder
- `onSessionModeChange` prop chain — already wired through to IdleScreen (P614 fix)
- Mode switcher render condition (7-condition AND check at line ~1388) — already mostly correct, needs refinement

---

## Technical Architecture

### Technical Analysis

**Current state:** The mode switcher in `IdleScreen` (line 1352 of `live-mode-view.tsx`) uses a monolithic 7-condition AND check:

```
onSessionModeChange && !showRatingDrawer && !waitingForPartnerToContinue
  && liveState.ratingPhase === 'idle' && !liveState.freePhase
  && !liveState.checkerName && !liveState.ratingInitiatedBy
```

This hides the switcher entirely when `ratingInitiatedBy` is set. Per the PRD, it should be *disabled* (grayed + tooltip), not hidden. The partner who didn't click Speak also sees the switcher vanish, which is confusing.

**Key finding — IdleScreen already lives inside the `ratingPhase === 'idle'` branch** (line 748). Several conditions in the 7-AND check are therefore redundant within IdleScreen:
- `liveState.ratingPhase === 'idle'` — always true (render branch guarantees it)
- `!liveState.checkerName` — always falsy during idle (set only after speaker submits, which transitions to `ratingPhase: 'waiting'`)
- `!liveState.freePhase` — handled by the free mode early-return at line 658

The only conditions that *can* be true while `ratingPhase === 'idle'` and affect the mode switcher are:
1. `!onSessionModeChange` — prop not passed (no mode switching available)
2. `showRatingDrawer` — `ResponderWaitingWithDrawer` passes `showRatingDrawer={true}`; but this component is rendered from the `ratingPhase === 'waiting'` branch (line 810), so this is also redundant within the idle branch
3. `waitingForPartnerToContinue` — rendered from a separate early-return at line 682, so also redundant within the idle branch
4. `!liveState.ratingInitiatedBy` — **this is the one that fires during idle**: partner sees `ratingInitiatedBy` set while they're still in the idle screen

**Conclusion:** The only meaningful condition change is splitting `!liveState.ratingInitiatedBy` from "hide" to "disable."

**Existing UI components:**
- `MobileTooltip` at `src/app/components/shared/mobile-tooltip.tsx` — wraps shadcn `Tooltip` with mobile long-press support. Already used in production (P126). Ideal for the disabled tooltip.
- shadcn `Tooltip` at `src/components/ui/tooltip.tsx` — lower-level, desktop-only.

### Architecture Decisions

**AD-1: Simplify the 7-condition to 2 states (visible-enabled vs visible-disabled).**

The mode switcher no longer needs to be *hidden* from within IdleScreen. The render branch structure already handles hiding: IdleScreen only renders during `ratingPhase === 'idle'`, and early-returns for free mode, waitingForPartner, and isLocallyRating already exit before reaching IdleScreen.

New logic:
- **Show enabled** (default): `onSessionModeChange` is truthy and `!liveState.ratingInitiatedBy`
- **Show disabled**: `onSessionModeChange` is truthy and `liveState.ratingInitiatedBy` is set (speaker is in local rating drawer)
- **Hidden**: `onSessionModeChange` is falsy (prop not provided — no mode switching capability)

The redundant conditions (`!showRatingDrawer`, `!waitingForPartnerToContinue`, `ratingPhase === 'idle'`, `!freePhase`, `!checkerName`) are removed because the render branch guarantees them.

**AD-2: Use `MobileTooltip` for the disabled state tooltip.**

`MobileTooltip` already handles desktop hover + mobile long-press. Wrapping the disabled pill in `MobileTooltip` provides the tooltip for both platforms with zero new code. The disabled buttons get `pointer-events-none` (so taps don't trigger mode change) while the wrapping `MobileTooltip` span remains interactive for tooltip trigger.

**AD-3: No new props on IdleScreenProps.**

The disabled state is derived from `liveState.ratingInitiatedBy` which is already available inside `IdleScreen` via the `liveState` prop. No new prop is needed.

**AD-4: Tooltip text is a `[FOUNDER DECISION]`.**

The exact tooltip text when the mode switcher is locked is marked in the UI Contract table. Placeholder for implementation: `"Mode locked — your partner is rating"`. [FOUNDER DECISION: exact tooltip text when mode is locked]

### Security Review

**RLS Policies:**
- ✅ No changes needed. All state changes flow through existing `updateLiveState` → `clarity_sessions.live_state` JSONB. Existing RLS gates access to session participants only.

**Authentication:**
- ✅ No new access patterns. Feature changes when UI renders, not who can trigger state transitions.

**Input Validation:**
- ✅ No new user inputs. Mode switcher already accepts only two values (Open/Guided). Disabled state is purely presentational (`disabled` prop prevents click handlers).

**Data Protection:**
- ✅ No PII concerns. `ratingInitiatedBy` is an existing field for session orchestration. No new data collection or logging.

### Implementation Approach

#### Build Sequence

1. **Refactor mode switcher condition in `IdleScreen`** (line 1352 of `live-mode-view.tsx`):
   - Replace the 7-condition AND with a simpler visibility check: `onSessionModeChange && (...)`.
   - Derive a `modeSwitcherDisabled` boolean: `!!liveState.ratingInitiatedBy`.
   - When enabled: render buttons as today (clickable, blue highlight on active mode).
   - When disabled: wrap the pill in `MobileTooltip`, apply `opacity-50 cursor-not-allowed` to the container, add `disabled` attribute to both buttons.

2. **Import `MobileTooltip`** at the top of `live-mode-view.tsx` (add to existing imports from `../shared/`).

3. **Verify all reset paths clear `ratingInitiatedBy`** (already confirmed — `handleCelebrationComplete`, `handleSkip`, `handleFreeSpeakFreely` all reset it to `undefined`). No changes needed.

4. **Test: mode switcher appears on idle for both users; locks (grays + tooltip) when partner clicks Speak; re-enables after round completes or skip.**

#### Files to Modify

| File | Change | Lines |
|------|--------|-------|
| `src/app/components/partners/live-mode-view.tsx` | Refactor mode switcher condition (line 1352), add `MobileTooltip` import, add disabled styling | ~1352, imports |

No new files. No database changes. No new dependencies.
