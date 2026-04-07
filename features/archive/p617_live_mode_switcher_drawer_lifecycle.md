---
status: rejected
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
superseded_by: p643
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
- [ ] Speaker submitting rating transitions partner into the round (partner sees story card + their drawer, no Speak button)
- [ ] Listener does NOT see the story card until the round starts (speaker submits). Story card appears first, drawer opens after brief reading moment.
- [ ] Simultaneous Speak: first submitter wins (current behavior). Both may open local drawers — when one submits, the other's becomes the responder drawer.
- [ ] No regression to sealed-bid pattern
- [ ] Works for both Check and Prove flows
- [ ] Works for both Open and Guided modes

---

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [BLOCK] Step 2b auto-drawer on story select is new behavior, underspecified | Removed Step 2b. Story selection stays idle. Owner clicks Speak separately. | Scope creep — core problem is mode switcher lifecycle, not story-drawer coupling. File separate P-number for auto-drawer later. |
| 2 | /challenge-prd | [BLOCK] Simultaneous Speak clicks unaddressed | Added AC: first submitter wins. Both may open local drawers. | Current implicit behavior, documented explicitly. |
| 3 | /challenge-prd | [WARN] Back button from drawer not in ASCII | Added Step 2c: cancellation returns both to Step 1. | Completes the lifecycle. |
| 4 | /challenge-prd | [WARN] Tooltip text placeholder conflict | Committed to "Mode locked — your partner is rating". Removed FOUNDER DECISION tag. | Text already in UI Contract, no reason to defer. |
| 5 | /challenge-prd | [WARN] Listener story card timing | AC updated: story card appears when round starts, drawer opens after brief reading moment. | Listener needs reading time before rating. |
| 6 | /challenge-prd | [WARN] Browser reload orphans ratingInitiatedBy | Accepted risk. Known limitation of existing mechanism. | Low frequency, not in P617 scope. File follow-up if observed in UAT. |

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

Step 2: User A clicks Speak (with or without a story selected)
   USER A                        USER B
   ┌─────────────────────┐      ┌─────────────────────┐
   │  [Story Card]       │      │  [Speak]             │
   │  (if selected)      │      │  + Select story      │
   │  ┌─ Drawer ──────┐  │      │                      │
   │  │ How well does  │  │      │  [Open] [Guided]     │
   │  │ B understand?  │  │      │    (disabled)        │
   │  │ [1-10 scale]   │  │      │                      │
   │  │ [Submit] [Back]│  │      │                      │
   │  └────────────────┘  │      │                      │
   └─────────────────────┘      └─────────────────────┘
   User A: drawer opens immediately, no mode switcher.
   User A sees story card above drawer if a story was selected before Speak.
   User B: stays on idle, mode switcher DISABLED.
   User B does NOT see story card yet (even if selected).

Step 2c: User A clicks Back (cancels from drawer)
   USER A                        USER B
   ┌─────────────────────┐      ┌─────────────────────┐
   │  [Speak]            │      │  [Speak]             │
   │  + Select story     │      │  + Select story      │
   │  [Open] [Guided]    │      │  [Open] [Guided]     │
   └─────────────────────┘      └─────────────────────┘
   Both return to Step 1. ratingInitiatedBy cleared.
   Mode switcher ENABLED again. Story selection preserved if it was set.

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
| Story card — listener | NOT visible until round starts | Listener stays on idle while speaker is in drawer. Appears when speaker submits. |
| Speak button — with story selected | Visible for story owner, hidden for non-owner | Story selection does NOT auto-open drawer. Owner clicks Speak separately. |

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

**AD-0: Two separate mechanisms control two separate actors.**

This is the critical distinction that caused the first failed implementation. Do not confuse them:

- **`isLocallyRating`** (local React state, never shared) — controls the **speaker's** view. When true, `getViewState()` returns `local-rating` and the speaker leaves IdleScreen entirely, entering `RatingScreenWithOptionalDrawer`. The speaker does not see the mode switcher because they are no longer on IdleScreen.
- **`ratingInitiatedBy`** (shared via Supabase Realtime) — controls the **listener's** mode switcher. When set, the listener's mode switcher becomes disabled (grayed + tooltip). The listener stays on IdleScreen — their view does NOT change.

`isLocallyRating` is set on Speak click (local, instant). `ratingInitiatedBy` is also set on Speak click (shared, propagates via Realtime ~200-500ms). On submit, `ratingInitiatedBy` is overwritten (already set, no visible change) alongside `ratingPhase: 'waiting'` which triggers the listener's view transition.

**AD-1: Mode switcher within IdleScreen: 2 states (enabled vs disabled).**

The mode switcher no longer needs to be *hidden* from within IdleScreen. The render branch structure already handles hiding: IdleScreen only renders during `ratingPhase === 'idle'`, and early-returns for free mode, waitingForPartner, and isLocallyRating already exit before reaching IdleScreen.

New logic within IdleScreen:
- **Show enabled** (default): `onSessionModeChange` is truthy and `!liveState.ratingInitiatedBy`
- **Show disabled**: `onSessionModeChange` is truthy and `liveState.ratingInitiatedBy` is set (speaker is in local rating drawer)
- **Hidden**: `onSessionModeChange` is falsy (prop not provided — no mode switching capability)

The redundant conditions (`!showRatingDrawer`, `!waitingForPartnerToContinue`, `ratingPhase === 'idle'`, `!freePhase`, `!checkerName`) are removed because the render branch guarantees them.

**AD-2: Use `MobileTooltip` for the disabled state tooltip.**

`MobileTooltip` already handles desktop hover + mobile long-press. Wrapping the disabled pill in `MobileTooltip` provides the tooltip for both platforms with zero new code. The disabled buttons get `pointer-events-none` (so taps don't trigger mode change) while the wrapping `MobileTooltip` span remains interactive for tooltip trigger.

**AD-3: No new props on IdleScreenProps.**

The disabled state is derived from `liveState.ratingInitiatedBy` which is already available inside `IdleScreen` via the `liveState` prop. No new prop is needed.

**AD-4: Tooltip text confirmed.**

Tooltip text when the mode switcher is locked: "Mode locked — your partner is rating".

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

#### Pre-implementation: Revert wrong P626 commits on w1

The w1 branch has 3 commits from a failed P626 implementation that addressed `ratingInitiatedBy` timing instead of the actual visibility lifecycle. These must be reverted before implementing P617 correctly:
- `c5dea856` fix(p626): listener stays idle until speaker submits...
- `98ed5337` test(p626): E2E verification...
- `34942715` fix(p626): restore 3-state mode switcher...

After revert, w1 should be at `76fd9b50` (the last valid P617 commit).

#### Build Sequence

1. **Ensure `handleStartCheck` and `handleStartProve` write `ratingInitiatedBy` on Speak click** (`clarity-live-page.tsx`). This is the shared signal that disables the listener's mode switcher. `isLocallyRating` (local state) opens the speaker's drawer.

2. **Mode switcher in `IdleScreen`** (`live-mode-view.tsx`):
   - Hidden conditions (return null): `!onSessionModeChange`. All other hide conditions are handled by the render branch structure (IdleScreen only renders when `ratingPhase === 'idle'`).
   - Disabled state: `!!liveState.ratingInitiatedBy` → wrap in `MobileTooltip`, apply `opacity-50 cursor-not-allowed`, `disabled` attribute on buttons.
   - Enabled state: default when `!ratingInitiatedBy`.

3. **Listener does NOT see story card until round starts.** When `ratingInitiatedBy` is set but `ratingPhase === 'idle'`, the listener stays on IdleScreen with no story card visible. The story card for the listener appears only when `getViewState` returns `responder-drawer` (after speaker submits). This may require filtering `selectedStoryData` from the listener's IdleScreen render when `ratingInitiatedBy` is set.

4. **Verify all reset paths clear `ratingInitiatedBy`** (already confirmed — `handleCelebrationComplete`, `handleSkip`, `handleFreeSpeakFreely`, `onCancelLocalRating` all reset it to `undefined`).

5. **Test against ASCII flow Steps 1-4 + Step 2c (cancellation).**

#### Files to Modify

| File | Change |
|------|--------|
| `src/app/components/partners/live-mode-view.tsx` | Mode switcher: 2-state (enabled/disabled). Hide story card for listener when `ratingInitiatedBy` set but not in round. `MobileTooltip` import. |
| `src/app/pages/clarity-live-page.tsx` | Ensure `ratingInitiatedBy` written on Speak click (may already be correct after revert). |

No new files. No database changes. No new dependencies.
