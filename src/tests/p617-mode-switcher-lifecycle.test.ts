import { describe, it, expect } from 'vitest';
import { getViewState, type ViewStateInput } from '@/app/components/partners/live-mode-view';

/**
 * P617: Mode Switcher + Drawer Lifecycle — Unit Tests
 *
 * Tests the getViewState() pure function for P617-relevant branches:
 * 1. Speaker clicks Speak → isLocallyRating → view: 'local-rating'
 * 2. Listener stays on idle while speaker is in local drawer
 * 3. Speaker submits → responder-drawer for listener
 * 4. Cancellation → back to idle
 * 5. Round complete → back to idle
 *
 * NOTE: After P638, modeSwitcherState IS returned by getViewState on idle views.
 * See p638-mode-switcher-state.test.ts for modeSwitcherState-specific tests.
 * These tests verify the VIEW transitions that P617 depends on.
 */

// ============================================================================
// Test helpers
// ============================================================================

/** Default idle state — both users on default screen */
const IDLE_INPUT: ViewStateInput = {
  sessionMode: 'guided',
  freePhase: undefined,
  hasFreeSliderHandler: false,
  waitingForPartner: false,
  inCelebrationState: false,
  isLocallyRating: false,
  ratingPhase: 'idle',
  isChecker: false,
  myRatingSubmitted: undefined,
  partnerRatingSubmitted: undefined,
  bothSubmitted: false,
  checkerRating: undefined,
  responderRating: undefined,
  // P638: New fields for modeSwitcherState
  ratingInitiatedBy: undefined,
  hasSessionModeChangeHandler: true,
  checkerName: undefined,
};

function withOverrides(overrides: Partial<ViewStateInput>): ViewStateInput {
  return { ...IDLE_INPUT, ...overrides };
}

// ============================================================================
// Step 1: Both idle — mode switcher visible (view = idle)
// ============================================================================

describe('P617: Step 1 — Both users idle', () => {
  it('returns idle when ratingPhase is idle and no one is locally rating', () => {
    expect(getViewState(IDLE_INPUT)).toEqual({ view: 'idle', modeSwitcherState: 'enabled' });
  });

  it('returns idle in free mode config without free slider handler', () => {
    // sessionMode = 'free' but no slider handler → not free-mode view
    const result = getViewState(withOverrides({ sessionMode: 'free', hasFreeSliderHandler: false }));
    expect(result).toEqual({ view: 'idle', modeSwitcherState: 'enabled' });
  });
});

// ============================================================================
// Step 2: Speaker clicks Speak → local-rating (speaker leaves IdleScreen)
// ============================================================================

describe('P617: Step 2 — Speaker clicks Speak', () => {
  it('returns local-rating when isLocallyRating is true', () => {
    const result = getViewState(withOverrides({ isLocallyRating: true }));
    expect(result).toEqual({ view: 'local-rating', showDrawer: false });
  });

  it('showDrawer=false when partner has NOT submitted yet', () => {
    const result = getViewState(withOverrides({
      isLocallyRating: true,
      myRatingSubmitted: undefined,
      partnerRatingSubmitted: undefined,
    }));
    expect(result).toEqual({ view: 'local-rating', showDrawer: false });
  });

  it('showDrawer=true when partner already submitted (simultaneous Speak)', () => {
    // Both clicked Speak. Partner submitted first. I haven't submitted yet.
    const result = getViewState(withOverrides({
      isLocallyRating: true,
      myRatingSubmitted: undefined,
      partnerRatingSubmitted: true,
    }));
    expect(result).toEqual({ view: 'local-rating', showDrawer: true });
  });

  it('listener view stays idle — ratingInitiatedBy does not affect getViewState', () => {
    // ratingInitiatedBy is NOT an input to getViewState. It only affects
    // mode switcher enabled/disabled inside IdleScreen's render (JSX logic).
    // This test confirms the listener's VIEW is idle when isLocallyRating=false.
    const result = getViewState(withOverrides({
      isLocallyRating: false,
      ratingPhase: 'idle',
    }));
    expect(result).toEqual({ view: 'idle', modeSwitcherState: 'enabled' });
  });
});

// ============================================================================
// Step 3: Speaker submits → listener gets responder-drawer
// ============================================================================

describe('P617: Step 3 — Speaker submits rating', () => {
  it('listener gets responder-drawer when partner submitted and I have not', () => {
    // After speaker submits: ratingPhase transitions to 'waiting',
    // partnerRatingSubmitted=true, myRatingSubmitted=undefined
    const result = getViewState(withOverrides({
      ratingPhase: 'waiting',
      isChecker: false,
      myRatingSubmitted: undefined,
      partnerRatingSubmitted: true,
      checkerRating: undefined,
      responderRating: undefined,
    }));
    expect(result).toEqual({ view: 'responder-drawer' });
  });

  it('speaker sees understanding screen after submitting', () => {
    const result = getViewState(withOverrides({
      ratingPhase: 'waiting',
      isChecker: true,
      myRatingSubmitted: true,
      partnerRatingSubmitted: undefined,
      checkerRating: 7,
      responderRating: undefined,
    }));
    expect(result).toEqual({ view: 'understanding' });
  });

  it('submission mismatch: listener sees responder-drawer even during idle ratingPhase', () => {
    // Branch 4a fires BEFORE idle check: Realtime may not have updated ratingPhase yet,
    // but submission flags arrive first
    const result = getViewState(withOverrides({
      ratingPhase: 'idle',
      isChecker: false,
      myRatingSubmitted: undefined,
      partnerRatingSubmitted: true,
      checkerRating: undefined,
      responderRating: undefined,
    }));
    expect(result).toEqual({ view: 'responder-drawer' });
  });
});

// ============================================================================
// Step 2c: Speaker cancels (Back) → both return to idle
// ============================================================================

describe('P617: Step 2c — Speaker cancels from drawer', () => {
  it('returns idle when isLocallyRating cleared and ratingPhase is idle', () => {
    // After cancel: isLocallyRating=false, ratingInitiatedBy=undefined (cleared)
    const result = getViewState(withOverrides({
      isLocallyRating: false,
      ratingPhase: 'idle',
    }));
    expect(result).toEqual({ view: 'idle', modeSwitcherState: 'enabled' });
  });
});

// ============================================================================
// Step 4: Round complete → celebration → back to idle
// ============================================================================

describe('P617: Step 4 — Round complete, return to idle', () => {
  it('waiting-for-partner during celebration ack phase', () => {
    const result = getViewState(withOverrides({
      waitingForPartner: true,
      inCelebrationState: false,
    }));
    expect(result).toEqual({ view: 'waiting-for-partner' });
  });

  it('returns idle after celebration completes and state resets', () => {
    const result = getViewState(withOverrides({
      waitingForPartner: false,
      inCelebrationState: false,
      ratingPhase: 'idle',
      isLocallyRating: false,
      bothSubmitted: false,
      checkerRating: undefined,
      responderRating: undefined,
    }));
    expect(result).toEqual({ view: 'idle', modeSwitcherState: 'enabled' });
  });
});

// ============================================================================
// Free mode: mode switcher reappears after free round
// ============================================================================

describe('P617: Free mode → back to idle', () => {
  it('returns free-mode view when freePhase is unlocked with slider handler', () => {
    const result = getViewState(withOverrides({
      sessionMode: 'free',
      freePhase: 'unlocked',
      hasFreeSliderHandler: true,
    }));
    expect(result).toEqual({ view: 'free-mode' });
  });

  it('returns idle after free round completes (freePhase cleared)', () => {
    const result = getViewState(withOverrides({
      sessionMode: 'free',
      freePhase: undefined,
      hasFreeSliderHandler: true,
      ratingPhase: 'idle',
    }));
    expect(result).toEqual({ view: 'idle', modeSwitcherState: 'enabled' });
  });
});

// ============================================================================
// Priority: isLocallyRating overrides other states
// ============================================================================

describe('P617: Branch priority — isLocallyRating vs other states', () => {
  it('local-rating takes priority over idle ratingPhase', () => {
    const result = getViewState(withOverrides({
      isLocallyRating: true,
      ratingPhase: 'idle',
    }));
    expect(result.view).toBe('local-rating');
  });

  it('free-mode takes priority over isLocallyRating', () => {
    // Edge case: shouldn't happen in practice, but verifies branch ordering
    const result = getViewState(withOverrides({
      isLocallyRating: true,
      sessionMode: 'free',
      freePhase: 'unlocked',
      hasFreeSliderHandler: true,
    }));
    expect(result.view).toBe('free-mode');
  });

  it('waiting-for-partner takes priority over isLocallyRating', () => {
    const result = getViewState(withOverrides({
      isLocallyRating: true,
      waitingForPartner: true,
      inCelebrationState: false,
    }));
    expect(result.view).toBe('waiting-for-partner');
  });
});
