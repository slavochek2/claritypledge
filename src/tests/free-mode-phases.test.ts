import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * P562: Free Mode Phase Transition Logic — Unit Tests
 *
 * Tests the core phase transition rules for free mode:
 * 1. Valid phase transitions (happy path)
 * 2. Invalid transitions rejected
 * 3. 10/10 detection and timer logic
 * 4. Speak freely exit from any phase
 * 5. Sealed-bid isolation (neither value visible before both submit)
 */

// ===============================================================================
// Phase transition types (mirroring src/app/types/index.ts after P562)
// ===============================================================================

type FreePhase = 'sealed-bid' | 'waiting' | 'reveal' | 'paraphrase' | 'unlocked';

type SessionMode = 'guided' | 'free';

interface FreeModeLiveState {
  sessionMode: SessionMode;
  freePhase?: FreePhase;
  checkerRating?: number;
  responderRating?: number;
  checkerSubmitted?: boolean;
  responderSubmitted?: boolean;
  freeSliderValue?: Record<string, number>;
}

// ===============================================================================
// Phase transition validator (pure function — extracted from expected implementation)
// ===============================================================================

const VALID_TRANSITIONS: Record<string, string[]> = {
  'idle': ['sealed-bid'],
  'sealed-bid': ['waiting', 'idle'], // idle via "Speak freely"
  'waiting': ['reveal', 'idle'],     // idle via partner's "Speak freely" cancelling round
  'reveal': ['paraphrase'],          // auto-transition after 1.5s
  'paraphrase': ['unlocked', 'idle'], // idle via "Speak freely"
  'unlocked': ['idle'],              // idle via "Speak freely" or success
};

function isValidTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

function canExitViaSpeak(phase: FreePhase): boolean {
  // "Speak freely" is available in sealed-bid, paraphrase, and unlocked phases
  // NOT available during waiting (Phase 4) — round is committed
  // NOT available during reveal (Phase 5) — auto-transitions to paraphrase
  return phase !== 'waiting' && phase !== 'reveal';
}

function detectBothAtTen(sliderValues: Record<string, number>): boolean {
  const creator = sliderValues.creator;
  const joiner = sliderValues.joiner;
  return creator === 10 && joiner === 10;
}

function areBothSealed(state: FreeModeLiveState): boolean {
  return state.checkerSubmitted === true && state.responderSubmitted === true;
}

function isFirstSealed(state: FreeModeLiveState): boolean {
  return (
    (state.checkerSubmitted === true && state.responderSubmitted !== true) ||
    (state.responderSubmitted === true && state.checkerSubmitted !== true)
  );
}

// ===============================================================================
// 1. Valid Phase Transitions
// ===============================================================================

describe('P562: Free Mode Phase Transitions — Valid', () => {
  it('idle → sealed-bid (user taps Speak button)', () => {
    expect(isValidTransition('idle', 'sealed-bid')).toBe(true);
  });

  it('sealed-bid → waiting (first user submits)', () => {
    expect(isValidTransition('sealed-bid', 'waiting')).toBe(true);
  });

  it('waiting → reveal (second user submits)', () => {
    expect(isValidTransition('waiting', 'reveal')).toBe(true);
  });

  it('reveal → paraphrase (auto-transition after 1.5s)', () => {
    expect(isValidTransition('reveal', 'paraphrase')).toBe(true);
  });

  it('paraphrase → unlocked (listener clicks "I paraphrased")', () => {
    expect(isValidTransition('paraphrase', 'unlocked')).toBe(true);
  });

  it('unlocked → idle ("Speak freely" or 10/10 success → back to entry)', () => {
    expect(isValidTransition('unlocked', 'idle')).toBe(true);
  });
});

// ===============================================================================
// 2. Invalid Phase Transitions
// ===============================================================================

describe('P562: Free Mode Phase Transitions — Invalid', () => {
  it('idle → reveal is NOT valid (must go through sealed-bid)', () => {
    expect(isValidTransition('idle', 'reveal')).toBe(false);
  });

  it('idle → unlocked is NOT valid (must go through sealed-bid → reveal → paraphrase)', () => {
    expect(isValidTransition('idle', 'unlocked')).toBe(false);
  });

  it('sealed-bid → reveal is NOT valid (must go through waiting)', () => {
    expect(isValidTransition('sealed-bid', 'reveal')).toBe(false);
  });

  it('sealed-bid → unlocked is NOT valid', () => {
    expect(isValidTransition('sealed-bid', 'unlocked')).toBe(false);
  });

  it('waiting → unlocked is NOT valid (must go through reveal → paraphrase)', () => {
    expect(isValidTransition('waiting', 'unlocked')).toBe(false);
  });

  it('reveal → unlocked is NOT valid (must go through paraphrase)', () => {
    expect(isValidTransition('reveal', 'unlocked')).toBe(false);
  });

  it('reveal → idle is NOT valid (reveal auto-transitions to paraphrase only)', () => {
    expect(isValidTransition('reveal', 'idle')).toBe(false);
  });

  it('unlocked → reveal is NOT valid (no going back)', () => {
    expect(isValidTransition('unlocked', 'reveal')).toBe(false);
  });
});

// ===============================================================================
// 3. "Speak Freely" Exit Availability
// ===============================================================================

describe('P562: "Speak freely" exit per phase', () => {
  it('available during sealed-bid (Phase 2-3)', () => {
    expect(canExitViaSpeak('sealed-bid')).toBe(true);
  });

  it('NOT available during waiting (Phase 4) — round is committed', () => {
    expect(canExitViaSpeak('waiting')).toBe(false);
  });

  it('NOT available during reveal (Phase 5) — auto-transitions', () => {
    expect(canExitViaSpeak('reveal')).toBe(false);
  });

  it('available during paraphrase (Phase 6)', () => {
    expect(canExitViaSpeak('paraphrase')).toBe(true);
  });

  it('available during unlocked (Phase 7)', () => {
    expect(canExitViaSpeak('unlocked')).toBe(true);
  });
});

// ===============================================================================
// 4. Sealed-Bid Isolation
// ===============================================================================

describe('P562: Sealed-bid isolation logic', () => {
  it('detects when first user has sealed but second has not', () => {
    const state: FreeModeLiveState = {
      sessionMode: 'free',
      freePhase: 'waiting',
      checkerSubmitted: true,
      responderSubmitted: false,
      checkerRating: 7,
    };

    expect(isFirstSealed(state)).toBe(true);
    expect(areBothSealed(state)).toBe(false);
  });

  it('detects when both have sealed (triggers reveal)', () => {
    const state: FreeModeLiveState = {
      sessionMode: 'free',
      freePhase: 'reveal',
      checkerSubmitted: true,
      responderSubmitted: true,
      checkerRating: 7,
      responderRating: 4,
    };

    expect(isFirstSealed(state)).toBe(false); // Both sealed, not "first only"
    expect(areBothSealed(state)).toBe(true);
  });

  it('neither sealed yet (initial state)', () => {
    const state: FreeModeLiveState = {
      sessionMode: 'free',
      freePhase: 'sealed-bid',
      checkerSubmitted: false,
      responderSubmitted: false,
    };

    expect(isFirstSealed(state)).toBe(false);
    expect(areBothSealed(state)).toBe(false);
  });
});

// ===============================================================================
// 5. 10/10 Detection and Timer Logic
// ===============================================================================

describe('P562: 10/10 detection', () => {
  it('both at 10 detected', () => {
    expect(detectBothAtTen({ creator: 10, joiner: 10 })).toBe(true);
  });

  it('only creator at 10 — not both', () => {
    expect(detectBothAtTen({ creator: 10, joiner: 8 })).toBe(false);
  });

  it('only joiner at 10 — not both', () => {
    expect(detectBothAtTen({ creator: 6, joiner: 10 })).toBe(false);
  });

  it('neither at 10', () => {
    expect(detectBothAtTen({ creator: 5, joiner: 7 })).toBe(false);
  });

  it('both at 0 — not at 10', () => {
    expect(detectBothAtTen({ creator: 0, joiner: 0 })).toBe(false);
  });
});

describe('P562: 2-second hold timer logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('timer fires after 2 seconds when both stay at 10', () => {
    let successTriggered = false;
    const sliderValues = { creator: 10, joiner: 10 };

    // Simulate: both at 10, start 2s timer
    if (detectBothAtTen(sliderValues)) {
      setTimeout(() => {
        // Re-check both still at 10 before triggering success
        if (detectBothAtTen(sliderValues)) {
          successTriggered = true;
        }
      }, 2000);
    }

    // At 1999ms, not yet triggered
    vi.advanceTimersByTime(1999);
    expect(successTriggered).toBe(false);

    // At 2000ms, triggered
    vi.advanceTimersByTime(1);
    expect(successTriggered).toBe(true);
  });

  it('timer resets when one slider moves away from 10', () => {
    let successTriggered = false;
    const sliderValues = { creator: 10, joiner: 10 };
    let timerId: ReturnType<typeof setTimeout> | null = null;

    // Start timer
    if (detectBothAtTen(sliderValues)) {
      timerId = setTimeout(() => {
        if (detectBothAtTen(sliderValues)) {
          successTriggered = true;
        }
      }, 2000);
    }

    // At 1000ms, joiner moves away from 10
    vi.advanceTimersByTime(1000);
    sliderValues.joiner = 8;

    // Cancel the pending timer (simulates client-side reset)
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }

    // Advance past the original 2s — should NOT trigger
    vi.advanceTimersByTime(2000);
    expect(successTriggered).toBe(false);
  });

  it('timer restarts when both return to 10 after reset', () => {
    let successTriggered = false;
    const sliderValues = { creator: 10, joiner: 10 };

    // First attempt — joiner drops at 500ms
    let timerId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (detectBothAtTen(sliderValues)) {
        successTriggered = true;
      }
    }, 2000);

    vi.advanceTimersByTime(500);
    sliderValues.joiner = 7;
    clearTimeout(timerId);
    timerId = null;

    // Joiner returns to 10 at 1000ms
    vi.advanceTimersByTime(500);
    sliderValues.joiner = 10;

    // Restart timer
    if (detectBothAtTen(sliderValues)) {
      timerId = setTimeout(() => {
        if (detectBothAtTen(sliderValues)) {
          successTriggered = true;
        }
      }, 2000);
    }

    // At 2999ms total (1000ms + 1999ms) — not yet
    vi.advanceTimersByTime(1999);
    expect(successTriggered).toBe(false);

    // At 3000ms total (1000ms + 2000ms) — triggered
    vi.advanceTimersByTime(1);
    expect(successTriggered).toBe(true);
  });
});

// ===============================================================================
// 6. Slider Value Validation
// ===============================================================================

describe('P562: Slider value bounds', () => {
  it('slider value must be between 0 and 10', () => {
    const isValidSliderValue = (v: number) => v >= 0 && v <= 10 && Number.isInteger(v);

    expect(isValidSliderValue(0)).toBe(true);
    expect(isValidSliderValue(5)).toBe(true);
    expect(isValidSliderValue(10)).toBe(true);
    expect(isValidSliderValue(-1)).toBe(false);
    expect(isValidSliderValue(11)).toBe(false);
    expect(isValidSliderValue(5.5)).toBe(false);
  });
});
