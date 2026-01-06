# B31

**Status:** Planning (post-mortem from failed attempt)
**Created:** 2026-01-04
**Type:** Bug Fix / Architecture Improvement

## The Problem

When the listener clicks "Speak Freely" during a live meeting, the speaker should see a dialog asking "Allow {listener} to skip active listening?" with Accept/Decline options. **This dialog was not appearing.**

### Root Cause Analysis

The `UnderstandingScreen` component has **10+ distinct return branches** handling different phases (waiting, gap-revealed, calibrated, explain-back, results, perfect, etc.). The negotiation dialogs were rendered inside these branches, meaning:

1. Listener clicks "Speak Freely" → triggers `onSharePerspective` → sets `roleSwitchNegotiation.state = 'pending'`
2. Speaker's component re-renders, but they're on a **different branch** of UnderstandingScreen
3. The dialog code exists in a branch the speaker isn't currently rendering
4. **Result:** Speaker never sees the dialog

**Visual representation:**

```
LiveModeView
├─ IdleScreen
├─ RatingScreen
├─ ResponderWaitingWithDrawer
└─ UnderstandingScreen
     ├─ return (phase: waiting) ← dialogs rendered here
     ├─ return (phase: gap-revealed) ← and here
     ├─ return (phase: calibrated) ← and here
     ├─ return (phase: explain-back, checker) ← and here
     ├─ return (phase: explain-back, responder, done) ← etc.
     ├─ return (phase: explain-back, responder, not done)
     ├─ return (phase: perfect)
     ├─ return (phase: results, clarifying)
     └─ return (phase: results, default)
```

Speaker is on "results" branch, listener triggers negotiation from "explain-back" branch → dialog never shows to speaker.

## What Was Attempted

### Approach: Lift NegotiationDialogs to LiveModeView Level

The theory was sound: if dialogs are rendered at the LiveModeView parent level (outside UnderstandingScreen), they'll show regardless of which branch is active.

**Changes made:**
1. Created a new `NegotiationDialogs` component at top of file
2. Added early return optimization when no dialogs are active
3. Computed dialog visibility flags at LiveModeView level
4. Added `{negotiationDialogs}` to **all 8 return statements** in LiveModeView

```typescript
// Added to each return in LiveModeView:
return (
  <>
    <IdleScreen ... />
    {skipNotificationDialog}
    {confirmSkipDialog}
    {negotiationDialogs}  // ← Added to all 8 returns
  </>
);
```

### What Went Wrong

**The refactoring was incomplete or introduced regressions.** Tests were flaky (passing on retry but failing initially), which masked the fact that the fix didn't actually work. User testing revealed the feature is now "more broken than before."

Potential issues with the approach:

1. **Incomplete removal from UnderstandingScreen:** The dialogs may still exist in some branches of UnderstandingScreen, causing conflicts or double-rendering
2. **State computation timing:** The negotiation state flags (`showPendingNegotiationDialog`, etc.) are computed at LiveModeView render time, but may not have the correct `isChecker` value for the user who should see the dialog
3. **Callback wiring:** The `onLetThemSpeak`, `onAskToExplainFirst`, etc. callbacks may not be correctly passed or may have stale closures
4. **Role detection bug:** `isChecker` is determined by `liveState.checkerName === currentUserName`, which may not be reliable in all negotiation states

## What Was Learned

### 1. Flaky E2E Tests Are Red Flags, Not Successes

Tests that pass on retry but fail initially indicate timing/race conditions. When fixing UI state bugs, flaky tests should be investigated, not celebrated. The retry mechanism masked the fact that the fix wasn't working.

### 2. Architecture Changes Require Comprehensive Testing

Moving a component from one location to another (lifting dialogs from UnderstandingScreen to LiveModeView) affects:
- When the component renders
- What props/state it has access to
- Timing of when state changes are visible

A refactoring this significant needs:
- Manual testing of ALL user flows (both speaker and listener perspectives)
- Verification that the old code is completely removed
- E2E tests that specifically test the dialog visibility, not just the happy path

### 3. Branch-Heavy Components Are Architectural Debt

Having 10+ distinct return branches in a single component makes bugs like this inevitable. When different branches need shared behavior (like showing dialogs), the architecture fights against you.

### 4. Fix the Bug Before Refactoring the Architecture

The attempted fix tried to:
1. Fix the dialog visibility bug
2. Improve the architecture (lifting dialogs)
3. Add performance optimizations (early return)

This violated the principle of making one change at a time. A better approach:
1. First, confirm the exact branch where the bug occurs
2. Minimal fix: add dialog rendering to that specific branch
3. Test thoroughly
4. THEN refactor architecture in a separate PR

## How to Fix It Better

### Option A: Minimal Fix (Recommended First Step)

1. **Revert the lifting change** - restore dialogs to UnderstandingScreen
2. **Identify exact branch** - determine which specific return branch the speaker is on when the dialog should show
3. **Add dialogs to that branch only** - minimal, targeted fix
4. **Write specific E2E test** - test that listener clicking "Speak Freely" shows dialog to speaker

### Option B: Complete Refactor (After Minimal Fix Works)

If lifting is the right long-term architecture:

1. **Complete removal from UnderstandingScreen** - grep for all Dialog components and negotiation state handling
2. **Single source of truth** - dialogs only at LiveModeView level
3. **Explicit state machine** - consider using a state machine (like XState) to make the negotiation flow explicit
4. **E2E test matrix** - test all combinations of:
   - Speaker phase (idle, waiting, gap-revealed, explain-back, results, perfect)
   - Listener action (Speak Freely from each possible screen)
   - Expected dialog on speaker's screen

### Option C: Component Redesign (Long-term)

The real problem is the 10+ branch architecture. Consider:

1. **Split UnderstandingScreen** into separate components for each phase
2. **Use a router-like pattern** - phase determines which component renders
3. **Global dialog context** - dialogs managed at app level, not component level
4. **Event-based communication** - listener action dispatches event, speaker subscribes

## Definition of Done

The P30 feature is complete when:

- [ ] Listener clicks "Speak Freely" → Speaker sees "Allow to skip?" dialog (verified manually)
- [ ] Speaker clicks "Accept" → Both return to idle
- [ ] Speaker clicks "Suggest explaining back" → Listener sees counter-dialog
- [ ] E2E test passes on first run (not flaky)
- [ ] No regressions in other live meeting flows
- [ ] Build passes
- [ ] Lint passes

## Files Involved

- `src/app/components/partners/live-mode-view.tsx` - Main file with the bug
- `src/app/pages/clarity-live-page.tsx` - Parent that manages state

## E2E Test (Created in Failed Attempt - Reusable)

The E2E test below was created during the failed attempt and can be reused. It's in worktree-1 at `e2e/speak-freely-button.spec.ts`:

```typescript
// Key test structure - copy this to new worktree
test('Listener sees "Speak Freely" button and triggers speaker confirmation dialog', async ({ browser }) => {
  // Two browser contexts for speaker/listener
  const speakerContext = await browser.newContext();
  const listenerContext = await browser.newContext();

  // ... setup meeting, both join ...

  // Speaker rates, listener rates → gap revealed
  // Listener clicks "Listen actively" → explain-back mode
  // Listener clicks "I'm done with active listening"

  // CRITICAL ASSERTION - This is the bug:
  // While speaker has drawer open, listener clicks "Speak Freely"
  await listenerPage.getByRole('button', { name: 'Speak Freely' }).click();

  // Speaker should see dialog EVEN with drawer open
  const speakerDialog = speakerPage.getByText('Allow Diana to skip active listening?');
  await expect(speakerDialog).toBeVisible({ timeout: 10000 }); // THIS FAILS
});
```

**To copy the full test to a new worktree:**
```bash
cp ~/Documents/claritypledge-1/e2e/speak-freely-button.spec.ts ~/Documents/claritypledge-N/e2e/
```

## How to Reproduce the Bug

**Manual testing steps (use two browser windows):**

1. Open `/live` in Browser A (Speaker - "Alice")
2. Click "Start Meeting", copy room code
3. Open `/live/{code}` in Browser B (Listener - "Bob")
4. Both join the meeting
5. **Speaker clicks "Did you understand me?"** → sees rating card
6. Speaker rates 6, clicks Submit
7. **Listener sees rating drawer** → rates 8, clicks Submit
8. Gap revealed - Listener sees "Help Alice feel more understood"
9. **Listener clicks "Listen actively"** → enters explain-back mode
10. Listener clicks "I'm done with active listening"
11. **Speaker sees rating drawer** asking "How well did Bob capture..."
12. **WHILE speaker has drawer open**, listener clicks "Speak Freely"
13. **BUG:** Speaker should see dialog "Allow Bob to skip active listening?" but doesn't

**Key insight:** The bug occurs specifically when speaker is in the explain-back rating phase (drawer open) and listener triggers negotiation.

## Debugging Tips

```typescript
// Add these console.logs to live-mode-view.tsx to trace the issue:

// In LiveModeView, before any return:
console.log('[LiveModeView] Rendering', {
  ratingPhase: liveState.ratingPhase,
  isChecker,
  negotiation: liveState.roleSwitchNegotiation,
  showPendingNegotiationDialog,
});

// In UnderstandingScreen, at the top:
console.log('[UnderstandingScreen] phase:', phase, 'isChecker:', isChecker);
```

**Watch for:**
- Is `roleSwitchNegotiation.state` updating to `'pending'` when listener clicks?
- Is speaker's `isChecker` correct when negotiation state changes?
- Which branch of UnderstandingScreen is speaker rendering?

## Starting Fresh

The main branch (`polymet-clarity-pledge-app`) has clean code without the broken lifting attempt. Start from there:

```bash
cd ~/Documents/claritypledge-N  # Pick an unused worktree
git fetch origin && git checkout main && git reset --hard origin/main && git checkout -B worktree-N
```

## References

- Previous work: P23 (Live Clarity Meeting), P26 (Speak Freely button label change)
- Related: Worktree port configuration (playwright.config.ts changes)
- Failed attempt: worktree-1 (claritypledge-1) - do not merge
