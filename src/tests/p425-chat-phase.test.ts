/**
 * @file p425-chat-phase.test.ts
 * @description Unit tests for P425: ChatPhase state machine transitions and rating band parser
 *
 * Tests the phase enum transitions defined in StoryGuideChat and the rating
 * band logic used to route AI responses.
 *
 * NOTE: These tests target the *logic* of the state machine. When
 * StoryGuideChat.tsx is implemented, import the actual reducer/helpers.
 * Until then, the logic is defined inline here so the tests are runnable
 * and serve as the authoritative specification.
 *
 * Phase sequence (from spec §Architecture Decision):
 *   idle → brain-dump → streaming → rating → iterating → rating (loop)
 *                                          ↘ polish → visibility → saving → saved
 *
 * Rating bands (from spec §Rating Band Responses):
 *   10         → 'perfect'   (exit loop, polish pass)
 *   8–9        → 'high'      (targeted clarification options)
 *   5–7        → 'mid'       (broader clarification + options)
 *   < 5        → 'low'       (re-attempt with re-framing)
 *   non-numeric → 'low'      (defensive fallback)
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Types (mirror spec §Architecture Decision §ChatPhase)
// ---------------------------------------------------------------------------

type ChatPhase =
  | 'idle'
  | 'brain-dump'
  | 'streaming'
  | 'rating'
  | 'iterating'
  | 'polish'
  | 'visibility'
  | 'saving'
  | 'saved';

type RatingBand = 'perfect' | 'high' | 'mid' | 'low';

// ---------------------------------------------------------------------------
// Rating band parser
// ---------------------------------------------------------------------------
// TODO: Replace with import once src/app/components/story-guide/StoryGuideChat.tsx
//       is implemented: import { parseRatingBand } from '@/app/components/story-guide/StoryGuideChat';

/**
 * Parses the numeric rating from a user's message text and classifies it
 * into a rating band used to determine the AI's response strategy.
 *
 * Spec: "AI reads the rating from the user's message" — the user types
 * a number (possibly followed by a comment, e.g. "8 - the emotion is right").
 * Extract the leading integer.
 *
 * Non-numeric or empty input → 'low' (defensive fallback).
 */
function parseRatingBand(input: string): RatingBand {
  const trimmed = input.trim();
  // Extract leading integer (handles "8 - comment", "10", " 5 ")
  const match = trimmed.match(/^(\d+)/);
  if (!match) return 'low';

  const score = parseInt(match[1], 10);
  if (score === 10) return 'perfect';
  if (score >= 8) return 'high';
  if (score >= 5) return 'mid';
  return 'low';
}

// ---------------------------------------------------------------------------
// State machine transition function
// ---------------------------------------------------------------------------
// TODO: Replace with import once StoryGuideChat.tsx is implemented.

interface ChatState {
  phase: ChatPhase;
  iterationCount: number;
}

type ChatAction =
  | { type: 'FIRST_MESSAGE_SENT' }
  | { type: 'AI_STREAMING_STARTED' }
  | { type: 'AI_RESPONSE_RECEIVED'; ratingBand?: RatingBand }
  | { type: 'RATING_SUBMITTED'; band: RatingBand }
  | { type: 'REVISED_DRAFT_RENDERED' }
  | { type: 'POLISH_DRAFT_RENDERED' }
  | { type: 'VISIBILITY_SELECTED' }
  | { type: 'SAVE_TRIGGERED' }
  | { type: 'SAVE_SUCCEEDED' }
  | { type: 'NEW_SESSION_STARTED' }
  | { type: 'ESCAPE_HATCH_SAVE' };

/**
 * Minimal state machine reducer for ChatPhase.
 * Mirrors the transitions described in spec §Architecture Decision §Phase enum.
 */
function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'FIRST_MESSAGE_SENT':
      if (state.phase === 'idle') return { ...state, phase: 'brain-dump' };
      return state;

    case 'AI_STREAMING_STARTED':
      if (state.phase === 'brain-dump' || state.phase === 'iterating') {
        return { ...state, phase: 'streaming' };
      }
      return state;

    case 'AI_RESPONSE_RECEIVED':
      if (state.phase === 'streaming') return { ...state, phase: 'rating' };
      return state;

    case 'RATING_SUBMITTED':
      if (state.phase === 'rating') {
        if (action.band === 'perfect') {
          return { ...state, phase: 'polish' };
        }
        return { ...state, phase: 'iterating', iterationCount: state.iterationCount + 1 };
      }
      return state;

    case 'REVISED_DRAFT_RENDERED':
      if (state.phase === 'iterating') return { ...state, phase: 'rating' };
      return state;

    case 'POLISH_DRAFT_RENDERED':
      if (state.phase === 'polish') return { ...state, phase: 'visibility' };
      return state;

    case 'SAVE_TRIGGERED':
      if (state.phase === 'visibility') return { ...state, phase: 'saving' };
      return state;

    case 'SAVE_SUCCEEDED':
      if (state.phase === 'saving') return { ...state, phase: 'saved' };
      return state;

    case 'NEW_SESSION_STARTED':
      return { phase: 'idle', iterationCount: 0 };

    case 'ESCAPE_HATCH_SAVE':
      // Escape hatch bypasses further rating; jumps to polish
      if (state.phase === 'rating' || state.phase === 'iterating') {
        return { ...state, phase: 'polish' };
      }
      return state;

    default:
      return state;
  }
}

function initialState(): ChatState {
  return { phase: 'idle', iterationCount: 0 };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatPhase state machine', () => {
  // ── Transitions from idle ──────────────────────────────────────────────────

  describe('idle → brain-dump', () => {
    it('transitions to brain-dump on first user message', () => {
      const state = chatReducer(initialState(), { type: 'FIRST_MESSAGE_SENT' });
      expect(state.phase).toBe('brain-dump');
    });

    it('does NOT transition on FIRST_MESSAGE_SENT when not in idle', () => {
      const brainDumpState: ChatState = { phase: 'brain-dump', iterationCount: 0 };
      const state = chatReducer(brainDumpState, { type: 'FIRST_MESSAGE_SENT' });
      expect(state.phase).toBe('brain-dump'); // no change
    });
  });

  // ── brain-dump → streaming ─────────────────────────────────────────────────

  describe('brain-dump → streaming', () => {
    it('transitions to streaming when AI starts streaming from brain-dump', () => {
      const state = chatReducer(
        { phase: 'brain-dump', iterationCount: 0 },
        { type: 'AI_STREAMING_STARTED' }
      );
      expect(state.phase).toBe('streaming');
    });

    it('also transitions to streaming from iterating phase', () => {
      const state = chatReducer(
        { phase: 'iterating', iterationCount: 1 },
        { type: 'AI_STREAMING_STARTED' }
      );
      expect(state.phase).toBe('streaming');
    });
  });

  // ── streaming → rating ─────────────────────────────────────────────────────

  describe('streaming → rating', () => {
    it('transitions to rating when AI response is received', () => {
      const state = chatReducer(
        { phase: 'streaming', iterationCount: 0 },
        { type: 'AI_RESPONSE_RECEIVED' }
      );
      expect(state.phase).toBe('rating');
    });
  });

  // ── rating → iterating (non-10 rating) ────────────────────────────────────

  describe('rating → iterating on non-10 rating', () => {
    it('transitions to iterating on high-band rating (8–9)', () => {
      const state = chatReducer(
        { phase: 'rating', iterationCount: 0 },
        { type: 'RATING_SUBMITTED', band: 'high' }
      );
      expect(state.phase).toBe('iterating');
    });

    it('transitions to iterating on mid-band rating (5–7)', () => {
      const state = chatReducer(
        { phase: 'rating', iterationCount: 0 },
        { type: 'RATING_SUBMITTED', band: 'mid' }
      );
      expect(state.phase).toBe('iterating');
    });

    it('transitions to iterating on low-band rating (< 5)', () => {
      const state = chatReducer(
        { phase: 'rating', iterationCount: 0 },
        { type: 'RATING_SUBMITTED', band: 'low' }
      );
      expect(state.phase).toBe('iterating');
    });

    it('increments iterationCount on each non-10 rating', () => {
      let state: ChatState = { phase: 'rating', iterationCount: 0 };
      state = chatReducer(state, { type: 'RATING_SUBMITTED', band: 'mid' });
      expect(state.iterationCount).toBe(1);

      // Simulate iteration loop: streaming → rating
      state = { ...state, phase: 'rating' };
      state = chatReducer(state, { type: 'RATING_SUBMITTED', band: 'high' });
      expect(state.iterationCount).toBe(2);
    });
  });

  // ── rating → polish on 10 rating ──────────────────────────────────────────

  describe('rating → polish on rating 10', () => {
    it('transitions to polish on perfect-band rating (10)', () => {
      const state = chatReducer(
        { phase: 'rating', iterationCount: 1 },
        { type: 'RATING_SUBMITTED', band: 'perfect' }
      );
      expect(state.phase).toBe('polish');
    });
  });

  // ── iterating → rating on revised draft ───────────────────────────────────

  describe('iterating → rating on revised draft rendered', () => {
    it('transitions back to rating after revised draft appears', () => {
      const state = chatReducer(
        { phase: 'iterating', iterationCount: 1 },
        { type: 'REVISED_DRAFT_RENDERED' }
      );
      expect(state.phase).toBe('rating');
    });
  });

  // ── polish → visibility ───────────────────────────────────────────────────

  describe('polish → visibility on polish draft rendered', () => {
    it('transitions to visibility when polish draft card is rendered', () => {
      const state = chatReducer(
        { phase: 'polish', iterationCount: 2 },
        { type: 'POLISH_DRAFT_RENDERED' }
      );
      expect(state.phase).toBe('visibility');
    });
  });

  // ── visibility → saving ───────────────────────────────────────────────────

  describe('visibility → saving on save triggered', () => {
    it('transitions to saving when user taps save', () => {
      const state = chatReducer(
        { phase: 'visibility', iterationCount: 2 },
        { type: 'SAVE_TRIGGERED' }
      );
      expect(state.phase).toBe('saving');
    });

    it('does NOT transition to saving if not in visibility phase', () => {
      const state = chatReducer(
        { phase: 'rating', iterationCount: 0 },
        { type: 'SAVE_TRIGGERED' }
      );
      expect(state.phase).toBe('rating'); // no change
    });
  });

  // ── saving → saved ────────────────────────────────────────────────────────

  describe('saving → saved on successful save', () => {
    it('transitions to saved when save succeeds', () => {
      const state = chatReducer(
        { phase: 'saving', iterationCount: 2 },
        { type: 'SAVE_SUCCEEDED' }
      );
      expect(state.phase).toBe('saved');
    });
  });

  // ── saved → idle on new session ───────────────────────────────────────────

  describe('saved → idle on new session start', () => {
    it('resets to idle with zero iterationCount on new session', () => {
      const state = chatReducer(
        { phase: 'saved', iterationCount: 3 },
        { type: 'NEW_SESSION_STARTED' }
      );
      expect(state.phase).toBe('idle');
      expect(state.iterationCount).toBe(0);
    });
  });

  // ── Escape hatch ──────────────────────────────────────────────────────────

  describe('escape hatch after 3 iterations', () => {
    it('iterationCount reaches 3 after three non-10 ratings', () => {
      let state: ChatState = initialState();

      // brain-dump → streaming → rating
      state = chatReducer(state, { type: 'FIRST_MESSAGE_SENT' });
      state = chatReducer(state, { type: 'AI_STREAMING_STARTED' });
      state = chatReducer(state, { type: 'AI_RESPONSE_RECEIVED' });

      // 3 iterations of rating → iterating → rating
      for (let i = 0; i < 3; i++) {
        state = chatReducer(state, { type: 'RATING_SUBMITTED', band: 'mid' });
        state = chatReducer(state, { type: 'REVISED_DRAFT_RENDERED' });
      }

      expect(state.iterationCount).toBe(3);
      expect(state.phase).toBe('rating');
    });

    it('escape hatch save from rating phase jumps to polish', () => {
      const state = chatReducer(
        { phase: 'rating', iterationCount: 3 },
        { type: 'ESCAPE_HATCH_SAVE' }
      );
      expect(state.phase).toBe('polish');
    });

    it('escape hatch save from iterating phase also jumps to polish', () => {
      const state = chatReducer(
        { phase: 'iterating', iterationCount: 3 },
        { type: 'ESCAPE_HATCH_SAVE' }
      );
      expect(state.phase).toBe('polish');
    });
  });

  // ── Full happy path walk-through ──────────────────────────────────────────

  describe('full happy path: idle → saved via 1 iteration + rating 10', () => {
    it('follows the complete state sequence', () => {
      let state = initialState();

      state = chatReducer(state, { type: 'FIRST_MESSAGE_SENT' });
      expect(state.phase).toBe('brain-dump');

      state = chatReducer(state, { type: 'AI_STREAMING_STARTED' });
      expect(state.phase).toBe('streaming');

      state = chatReducer(state, { type: 'AI_RESPONSE_RECEIVED' });
      expect(state.phase).toBe('rating');

      // One iteration with rating 7 (mid)
      state = chatReducer(state, { type: 'RATING_SUBMITTED', band: 'mid' });
      expect(state.phase).toBe('iterating');
      expect(state.iterationCount).toBe(1);

      state = chatReducer(state, { type: 'AI_STREAMING_STARTED' });
      expect(state.phase).toBe('streaming');

      state = chatReducer(state, { type: 'AI_RESPONSE_RECEIVED' });
      expect(state.phase).toBe('rating');

      state = chatReducer(state, { type: 'REVISED_DRAFT_RENDERED' });
      expect(state.phase).toBe('rating');

      // Rating 10 → polish
      state = chatReducer(state, { type: 'RATING_SUBMITTED', band: 'perfect' });
      expect(state.phase).toBe('polish');

      state = chatReducer(state, { type: 'POLISH_DRAFT_RENDERED' });
      expect(state.phase).toBe('visibility');

      state = chatReducer(state, { type: 'SAVE_TRIGGERED' });
      expect(state.phase).toBe('saving');

      state = chatReducer(state, { type: 'SAVE_SUCCEEDED' });
      expect(state.phase).toBe('saved');
    });
  });
});

// ---------------------------------------------------------------------------
// Rating band parser tests
// ---------------------------------------------------------------------------

describe('parseRatingBand', () => {
  describe('exact numeric strings', () => {
    it('"10" → perfect', () => {
      expect(parseRatingBand('10')).toBe('perfect');
    });

    it('"9" → high', () => {
      expect(parseRatingBand('9')).toBe('high');
    });

    it('"8" → high', () => {
      expect(parseRatingBand('8')).toBe('high');
    });

    it('"7" → mid', () => {
      expect(parseRatingBand('7')).toBe('mid');
    });

    it('"5" → mid', () => {
      expect(parseRatingBand('5')).toBe('mid');
    });

    it('"4" → low', () => {
      expect(parseRatingBand('4')).toBe('low');
    });

    it('"3" → low', () => {
      expect(parseRatingBand('3')).toBe('low');
    });

    it('"1" → low', () => {
      expect(parseRatingBand('1')).toBe('low');
    });
  });

  describe('numeric with inline comment (real user input patterns)', () => {
    it('"8 - the emotion is right" → high', () => {
      expect(parseRatingBand('8 - the emotion is right')).toBe('high');
    });

    it('"7 but the opening is weak" → mid', () => {
      expect(parseRatingBand('7 but the opening is weak')).toBe('mid');
    });

    it('"10 perfect!" → perfect', () => {
      expect(parseRatingBand('10 perfect!')).toBe('perfect');
    });

    it('"3 completely wrong direction" → low', () => {
      expect(parseRatingBand('3 completely wrong direction')).toBe('low');
    });
  });

  describe('non-numeric input (defensive fallback)', () => {
    it('"not really" → low', () => {
      expect(parseRatingBand('not really')).toBe('low');
    });

    it('empty string → low', () => {
      expect(parseRatingBand('')).toBe('low');
    });

    it('"hmm" → low', () => {
      expect(parseRatingBand('hmm')).toBe('low');
    });

    it('"good" → low', () => {
      expect(parseRatingBand('good')).toBe('low');
    });

    it('"A" → low (option letter — handled separately in actual component)', () => {
      // The user typing "A" / "B" / "C" for options is handled by the options-picker
      // logic, not the rating parser. This test confirms the parser treats letters as non-numeric.
      expect(parseRatingBand('A')).toBe('low');
    });
  });

  describe('boundary values', () => {
    it('score=10 is the only perfect value — 11 is NOT perfect (spec says 10 only)', () => {
      // The spec defines "10 = complete/exit." 11 is out of range but should not be perfect.
      // Defensive: treat >10 as high (still high intent), or just confirm it's not perfect.
      const band = parseRatingBand('11');
      expect(band).not.toBe('perfect');
    });

    it('score=5 is mid (lower bound of mid range)', () => {
      expect(parseRatingBand('5')).toBe('mid');
    });

    it('score=8 is high (lower bound of high range)', () => {
      expect(parseRatingBand('8')).toBe('high');
    });
  });
});
