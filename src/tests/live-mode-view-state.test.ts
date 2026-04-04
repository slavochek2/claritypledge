import { describe, it, expect } from 'vitest';
import { getViewState, ViewStateInput } from '../app/components/partners/live-mode-view';

/**
 * Unit tests for getViewState() — the pure decision function that determines
 * which view to render in LiveModeView. Tests every branch + known bug scenarios.
 */

const BASE_INPUT: ViewStateInput = {
  sessionMode: undefined,
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

function input(overrides: Partial<ViewStateInput>): ViewStateInput {
  return { ...BASE_INPUT, ...overrides };
}

describe('getViewState — branch coverage', () => {
  // Branch 1: Free mode
  it('returns free-mode when sessionMode is free and freePhase is unlocked', () => {
    expect(getViewState(input({
      sessionMode: 'free',
      freePhase: 'unlocked',
      hasFreeSliderHandler: true,
    }))).toEqual({ view: 'free-mode' });
  });

  it('returns free-mode for freePhase success', () => {
    expect(getViewState(input({
      sessionMode: 'free',
      freePhase: 'success',
      hasFreeSliderHandler: true,
    }))).toEqual({ view: 'free-mode' });
  });

  it('does NOT return free-mode when sessionMode is guided', () => {
    // P638: freePhase='unlocked' with guided mode → idle view but modeSwitcherState='hidden'
    // (freePhase lingering from mode switch hides the mode switcher)
    expect(getViewState(input({
      sessionMode: 'guided',
      freePhase: 'unlocked',
      hasFreeSliderHandler: true,
    }))).toEqual({ view: 'idle', modeSwitcherState: 'hidden' });
  });

  // Branch 2: Waiting for partner
  it('returns waiting-for-partner when I acknowledged but partner has not', () => {
    expect(getViewState(input({
      waitingForPartner: true,
      inCelebrationState: false,
    }))).toEqual({ view: 'waiting-for-partner' });
  });

  it('does NOT return waiting-for-partner during celebration', () => {
    expect(getViewState(input({
      waitingForPartner: true,
      inCelebrationState: true,
    }))).toEqual({ view: 'idle', modeSwitcherState: 'enabled' });
  });

  // Branch 3: Local rating
  it('returns local-rating when user clicked Speak', () => {
    expect(getViewState(input({
      isLocallyRating: true,
    }))).toEqual({ view: 'local-rating', showDrawer: false });
  });

  it('returns local-rating with showDrawer when partner already submitted', () => {
    expect(getViewState(input({
      isLocallyRating: true,
      partnerRatingSubmitted: true,
      myRatingSubmitted: undefined,
    }))).toEqual({ view: 'local-rating', showDrawer: true });
  });

  // Branch 4: Idle
  it('returns idle on fresh session', () => {
    expect(getViewState(input({}))).toEqual({ view: 'idle', modeSwitcherState: 'enabled' });
  });

  it('returns idle after round reset', () => {
    expect(getViewState(input({
      ratingPhase: 'idle',
    }))).toEqual({ view: 'idle', modeSwitcherState: 'enabled' });
  });

  // Branch 5: Checker re-rating
  it('returns checker-rating when checker is re-rating', () => {
    expect(getViewState(input({
      ratingPhase: 'rating',
      isChecker: true,
      myRatingSubmitted: undefined,
    }))).toEqual({ view: 'checker-rating' });
  });

  // Branch 5a: Responder drawer
  it('returns responder-drawer when checker submitted and I have not', () => {
    expect(getViewState(input({
      ratingPhase: 'waiting',
      isChecker: false,
      myRatingSubmitted: undefined,
      partnerRatingSubmitted: true,
      checkerRating: undefined,
      responderRating: undefined,
    }))).toEqual({ view: 'responder-drawer' });
  });

  // Branch 5b: Understanding (I submitted, waiting for partner)
  it('returns understanding when I submitted and partner has not', () => {
    expect(getViewState(input({
      ratingPhase: 'waiting',
      isChecker: true,
      myRatingSubmitted: true,
      partnerRatingSubmitted: undefined,
      checkerRating: 7,
    }))).toEqual({ view: 'understanding' });
  });

  // Branch 6: Results/revealed/explain-back
  it('returns understanding for results phase', () => {
    expect(getViewState(input({ ratingPhase: 'results', bothSubmitted: true }))).toEqual({ view: 'understanding' });
  });

  it('returns understanding for revealed phase', () => {
    expect(getViewState(input({ ratingPhase: 'revealed', bothSubmitted: true }))).toEqual({ view: 'understanding' });
  });

  it('returns understanding for explain-back phase', () => {
    expect(getViewState(input({ ratingPhase: 'explain-back' }))).toEqual({ view: 'understanding' });
  });

  // Fallback
  it('returns idle-fallback for unknown ratingPhase', () => {
    expect(getViewState(input({ ratingPhase: 'unknown-phase' }))).toEqual({ view: 'idle-fallback', modeSwitcherState: 'enabled' });
  });
});

describe('getViewState — priority / ordering', () => {
  it('free-mode takes priority over idle', () => {
    expect(getViewState(input({
      sessionMode: 'free',
      freePhase: 'unlocked',
      hasFreeSliderHandler: true,
      ratingPhase: 'idle',
    }))).toEqual({ view: 'free-mode' });
  });

  it('local-rating takes priority over idle', () => {
    expect(getViewState(input({
      isLocallyRating: true,
      ratingPhase: 'idle',
    }))).toEqual({ view: 'local-rating', showDrawer: false });
  });

  it('local-rating takes priority over waiting phase', () => {
    expect(getViewState(input({
      isLocallyRating: true,
      ratingPhase: 'waiting',
      partnerRatingSubmitted: true,
    }))).toEqual({ view: 'local-rating', showDrawer: true });
  });

  it('waiting-for-partner takes priority over idle', () => {
    expect(getViewState(input({
      waitingForPartner: true,
      ratingPhase: 'idle',
    }))).toEqual({ view: 'waiting-for-partner' });
  });
});

describe('getViewState — regression: second round bugs', () => {
  it('second round idle after full reset returns idle (not stuck in results)', () => {
    // After celebration → dual-ack → full reset, all state is cleared
    expect(getViewState(input({
      ratingPhase: 'idle',
      // Everything else is default/undefined — clean reset
    }))).toEqual({ view: 'idle', modeSwitcherState: 'enabled' });
  });

  it('second round: speaker clicked Speak → returns local-rating', () => {
    expect(getViewState(input({
      isLocallyRating: true,
      ratingPhase: 'idle', // Still idle — speaker hasn't submitted yet
    }))).toEqual({ view: 'local-rating', showDrawer: false });
  });

  it('second round: speaker submitted → partner should see responder-drawer', () => {
    // After speaker submits, ratingPhase becomes 'waiting', partner hasn't submitted
    expect(getViewState(input({
      ratingPhase: 'waiting',
      isChecker: false, // I'm the responder
      myRatingSubmitted: undefined, // I haven't submitted
      partnerRatingSubmitted: true, // Speaker (checker) submitted
      checkerRating: undefined, // I don't see checker's rating yet (sealed bid)
      responderRating: undefined, // I haven't rated
    }))).toEqual({ view: 'responder-drawer' });
  });

  it('REGRESSION: partner sees drawer even when ratingPhase still idle (Realtime delay)', () => {
    // The core bug: ratingPhase update hasn't arrived via Realtime yet,
    // but submission flags have. Partner should still see the drawer.
    expect(getViewState(input({
      ratingPhase: 'idle', // ← Still idle due to Realtime delay!
      isChecker: false,
      myRatingSubmitted: undefined, // I haven't submitted
      partnerRatingSubmitted: true, // But partner's submission flag arrived
      checkerRating: undefined,
      responderRating: undefined,
    }))).toEqual({ view: 'responder-drawer' });
  });

  it('second round: both submitted → returns understanding', () => {
    expect(getViewState(input({
      ratingPhase: 'results',
      bothSubmitted: true,
      checkerRating: 8,
      responderRating: 7,
    }))).toEqual({ view: 'understanding' });
  });
});
