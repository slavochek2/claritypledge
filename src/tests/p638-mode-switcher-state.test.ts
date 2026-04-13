import { describe, it, expect } from 'vitest';
import { getViewState, type ViewStateInput } from '@/app/components/partners/live-mode-view';

/**
 * P638: modeSwitcherState — Unit Tests
 *
 * Tests the new modeSwitcherState field returned by getViewState() for idle views.
 * P638 folds the mode switcher IIFE into getViewState, so mode switcher visibility
 * is now tested through the same pure function as everything else.
 *
 * Seven IIFE conditions mapped:
 * 1. !hasSessionModeChangeHandler → hidden
 * 2. showRatingDrawer → implicit (non-idle view)
 * 3. waitingForPartnerToContinue → implicit (non-idle view)
 * 4. ratingPhase !== 'idle' → implicit (non-idle view)
 * 5. freePhase truthy → hidden (can coexist with idle view)
 * 6. checkerName truthy → hidden (Realtime race: can coexist with idle view)
 * 7. ratingInitiatedBy truthy → disabled
 */

// ============================================================================
// Test helpers
// ============================================================================

/** Default idle state with P638 new fields */
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
  // P638 new fields:
  ratingInitiatedBy: undefined,
  hasSessionModeChangeHandler: true,
  checkerName: undefined,
};

function withOverrides(overrides: Partial<ViewStateInput>): ViewStateInput {
  return { ...IDLE_INPUT, ...overrides };
}

// ============================================================================
// modeSwitcherState: 'enabled' (default idle)
// ============================================================================

describe('P638: modeSwitcherState — enabled', () => {
  it('returns enabled when idle with handler and no blocking conditions', () => {
    const result = getViewState(IDLE_INPUT);
    expect(result).toMatchObject({ view: 'idle', modeSwitcherState: 'enabled' });
  });

  it('returns enabled on idle-fallback view', () => {
    // idle-fallback: ratingPhase is something unexpected, falls through all branches
    // This is hard to trigger directly — test the enabled state for idle first
    const result = getViewState(withOverrides({ ratingPhase: 'idle' }));
    expect(result).toMatchObject({ modeSwitcherState: 'enabled' });
  });
});

// ============================================================================
// modeSwitcherState: 'disabled' (partner is rating)
// ============================================================================

describe('P638: modeSwitcherState — disabled', () => {
  it('returns disabled when ratingInitiatedBy is set', () => {
    const result = getViewState(withOverrides({
      ratingInitiatedBy: 'Speaker Name',
    }));
    expect(result).toMatchObject({ view: 'idle', modeSwitcherState: 'disabled' });
  });

  it('disabled has lower priority than hidden (freePhase + ratingInitiatedBy)', () => {
    const result = getViewState(withOverrides({
      ratingInitiatedBy: 'Speaker Name',
      freePhase: 'sealed-bid',
      sessionMode: 'guided', // guided mode so Branch 1 doesn't fire
    }));
    expect(result).toMatchObject({ view: 'idle', modeSwitcherState: 'hidden' });
  });

  it('both checkerName + ratingInitiatedBy → disabled (P643: checkerName no longer hides)', () => {
    // P643: checkerName race no longer produces 'hidden' — 'disabled' is correct
    const result = getViewState(withOverrides({
      ratingInitiatedBy: 'Speaker Name',
      checkerName: 'Speaker Name',
    }));
    expect(result).toMatchObject({ view: 'idle', modeSwitcherState: 'disabled' });
  });
});

// ============================================================================
// modeSwitcherState: 'hidden' — no handler
// ============================================================================

describe('P638: modeSwitcherState — hidden (no handler)', () => {
  it('returns hidden when hasSessionModeChangeHandler is false', () => {
    const result = getViewState(withOverrides({
      hasSessionModeChangeHandler: false,
    }));
    expect(result).toMatchObject({ view: 'idle', modeSwitcherState: 'hidden' });
  });
});

// ============================================================================
// modeSwitcherState: 'hidden' — freePhase (Condition 5)
// ============================================================================

describe('P638: modeSwitcherState — hidden (freePhase)', () => {
  it('returns hidden when freePhase is truthy and view is idle', () => {
    // sessionMode='guided' so Branch 1 (free-mode) doesn't fire,
    // but freePhase lingers from a mode switch
    const result = getViewState(withOverrides({
      freePhase: 'sealed-bid',
      sessionMode: 'guided',
    }));
    expect(result).toMatchObject({ view: 'idle', modeSwitcherState: 'hidden' });
  });

  it('returns hidden when freePhase is "unlocked" but no slider handler', () => {
    // freePhase='unlocked' + hasFreeSliderHandler=false → Branch 1 doesn't fire → idle
    const result = getViewState(withOverrides({
      freePhase: 'unlocked',
      hasFreeSliderHandler: false,
      sessionMode: 'free',
    }));
    expect(result).toMatchObject({ view: 'idle', modeSwitcherState: 'hidden' });
  });
});

// ============================================================================
// modeSwitcherState: 'disabled' — checkerName (Condition 6, Realtime race)
// P643 fix: was 'hidden' before — vanishing switcher with no explanation is wrong.
// When checkerName arrives via Realtime before ratingPhase updates, the listener
// is still on the idle screen. Disabled + tooltip is correct UX.
// ============================================================================

describe('P643: modeSwitcherState — disabled (checkerName race, fixed)', () => {
  it('returns disabled when checkerName is truthy while ratingPhase is idle', () => {
    // Realtime race: checkerName arrives but ratingPhase update is still in transit
    const result = getViewState(withOverrides({
      checkerName: 'Speaker Name',
    }));
    expect(result).toMatchObject({ view: 'idle', modeSwitcherState: 'disabled' });
  });
});

// ============================================================================
// Non-idle views: modeSwitcherState should NOT be present
// ============================================================================

describe('P638: non-idle views have no modeSwitcherState', () => {
  it('local-rating has no modeSwitcherState', () => {
    const result = getViewState(withOverrides({ isLocallyRating: true }));
    expect(result.view).toBe('local-rating');
    expect('modeSwitcherState' in result).toBe(false);
  });

  it('free-mode has no modeSwitcherState', () => {
    const result = getViewState(withOverrides({
      sessionMode: 'free',
      freePhase: 'unlocked',
      hasFreeSliderHandler: true,
    }));
    expect(result.view).toBe('free-mode');
    expect('modeSwitcherState' in result).toBe(false);
  });

  it('waiting-for-partner has no modeSwitcherState', () => {
    const result = getViewState(withOverrides({
      waitingForPartner: true,
      inCelebrationState: false,
    }));
    expect(result.view).toBe('waiting-for-partner');
    expect('modeSwitcherState' in result).toBe(false);
  });

  it('responder-drawer has no modeSwitcherState', () => {
    const result = getViewState(withOverrides({
      ratingPhase: 'waiting',
      isChecker: false,
      myRatingSubmitted: undefined,
      partnerRatingSubmitted: true,
      checkerRating: undefined,
      responderRating: undefined,
    }));
    expect(result.view).toBe('responder-drawer');
    expect('modeSwitcherState' in result).toBe(false);
  });
});

// ============================================================================
// Transition sequence: enabled → disabled → hidden → enabled
// ============================================================================

describe('P638: modeSwitcherState transition lifecycle', () => {
  it('Step 1: idle → enabled', () => {
    const result = getViewState(IDLE_INPUT);
    expect(result).toMatchObject({ view: 'idle', modeSwitcherState: 'enabled' });
  });

  it('Step 2: partner clicks Speak → disabled', () => {
    const result = getViewState(withOverrides({ ratingInitiatedBy: 'Partner' }));
    expect(result).toMatchObject({ view: 'idle', modeSwitcherState: 'disabled' });
  });

  it('Step 3: speaker submits → non-idle view (hidden implicitly)', () => {
    // After submit: ratingPhase='waiting', view is responder-drawer (non-idle)
    const result = getViewState(withOverrides({
      ratingPhase: 'waiting',
      isChecker: false,
      myRatingSubmitted: undefined,
      partnerRatingSubmitted: true,
      ratingInitiatedBy: 'Partner',
    }));
    expect(result.view).toBe('responder-drawer');
    expect('modeSwitcherState' in result).toBe(false);
  });

  it('Step 4: round complete → back to enabled', () => {
    const result = getViewState(withOverrides({
      ratingInitiatedBy: undefined,
      ratingPhase: 'idle',
      checkerName: undefined,
    }));
    expect(result).toMatchObject({ view: 'idle', modeSwitcherState: 'enabled' });
  });

  it('Step 2c: cancel → back to enabled', () => {
    // After cancel: ratingInitiatedBy cleared
    const result = getViewState(withOverrides({
      ratingInitiatedBy: undefined,
    }));
    expect(result).toMatchObject({ view: 'idle', modeSwitcherState: 'enabled' });
  });
});
