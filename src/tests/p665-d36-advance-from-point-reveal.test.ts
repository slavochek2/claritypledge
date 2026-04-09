/**
 * @file p665-d36-advance-from-point-reveal.test.ts
 * @description Canary regression for D36 infinite loop bug.
 *
 * Bug: advanceFromPointReveal() unconditionally sets phase → 'story-rate'.
 * In the D36 flow (1 visible point, point comes AFTER story), the story is
 * already rated when point-revealed fires — so going to story-rate traps the
 * user forever (Submit disabled, rating already set).
 *
 * Expected fix: when visibleCount === 1 AND prev.rating !== null → phase = 'transition'.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { LetterStorySnapshot } from '@/app/types';

// ── Service mocks (advanceFromPointReveal doesn't call services, but hook imports them) ──
vi.mock('@/app/data/letters-service', () => ({
  submitRating: vi.fn(),
  revealPrediction: vi.fn(),
  submitPointResponse: vi.fn(),
  updateDeliveryStatus: vi.fn(),
  updateDeliveryStatusByToken: vi.fn(),
  submitPointResponseByToken: vi.fn(),
  submitRatingByToken: vi.fn(),
  revealPredictionByToken: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));

import { useLetterReadingState } from '@/app/hooks/useLetterReadingState';

// ── Snapshot builders ────────────────────────────────────────────────────────

// Placeholder story at index 0 — needed because the hook only restores
// sessionStorage when currentStoryIndex > 0 (already-seen story 0 doesn't resume).
function makePlaceholderSnapshot(): LetterStorySnapshot {
  return {
    letter_id: 'letter-1',
    story_id: 'story-0',
    version_id: 'version-0',
    position: 0,
    point_config: {
      storyText: 'Placeholder story (already complete)',
      storyTitle: 'Placeholder',
      points: [],
    },
    visibility: 'published',
  };
}

function makeD36Snapshot(): LetterStorySnapshot {
  return {
    letter_id: 'letter-1',
    story_id: 'story-1',
    version_id: 'version-1',
    position: 1,
    point_config: {
      storyText: 'D36 story text',
      storyTitle: 'D36 Story',
      points: [
        { id: 'p1', text: 'Single point', authorPosition: 'agree' },
      ],
    },
    visibility: 'published',
  };
}

function makeMultiPointSnapshot(): LetterStorySnapshot {
  return {
    letter_id: 'letter-1',
    story_id: 'story-2',
    version_id: 'version-2',
    position: 1,
    point_config: {
      storyText: 'Multi-point story',
      storyTitle: 'Multi Story',
      points: [
        { id: 'p1', text: 'First point', authorPosition: 'agree' },
        { id: 'p2', text: 'Second point', authorPosition: 'disagree' },
      ],
    },
    visibility: 'published',
  };
}

// ── Storage key matches hook logic ───────────────────────────────────────────

const DELIVERY_ID = 'test-delivery-d36';
const STORAGE_KEY = `clarity-letter-reading-${DELIVERY_ID}`;

describe('P665: D36 advanceFromPointReveal — infinite loop regression', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('D36 flow: advanceFromPointReveal goes to transition (not story-rate) when story already rated', () => {
    // Set up sessionStorage: story 0 complete (transition), story 1 is D36 at point-revealed with rating set.
    // currentStoryIndex must be > 0 — hook only restores sessionStorage when index > 0.
    const savedState = {
      currentStoryIndex: 1,
      isComplete: false,
      stories: [
        {
          phase: 'transition',
          rating: 4,
          prediction: 5,
          positions: {},
          currentPointIndex: 0,
        },
        {
          phase: 'point-revealed',
          rating: 5,        // Story already rated (D36: story came first)
          prediction: 6,
          positions: { p1: 'agree' },
          currentPointIndex: 0,
        },
      ],
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));

    const snapshots = [makePlaceholderSnapshot(), makeD36Snapshot()];
    const { result } = renderHook(() =>
      useLetterReadingState(DELIVERY_ID, 'sender-1', snapshots, undefined, true)
    );

    // Verify we're in point-revealed (as set)
    expect(result.current.currentPhase).toBe('point-revealed');

    // Call advanceFromPointReveal — BUG: goes to 'story-rate'; FIXED: goes to 'transition'
    act(() => {
      result.current.advanceFromPointReveal();
    });

    // This is the regression assertion: must be 'transition', NOT 'story-rate'
    expect(result.current.currentPhase).toBe('transition');
  });

  it('2+ point flow: advanceFromPointReveal still goes to story-rate when rating is null', () => {
    // Set up state: 2-point flow, point-revealed BEFORE story (rating is null)
    const savedState = {
      currentStoryIndex: 1,
      isComplete: false,
      stories: [
        {
          phase: 'transition',
          rating: 3,
          prediction: 4,
          positions: {},
          currentPointIndex: 0,
        },
        {
          phase: 'point-revealed',
          rating: null,     // Story NOT yet rated (point-engage came first in 2+ flow)
          prediction: null,
          positions: { p1: 'agree' },
          currentPointIndex: 0,
        },
      ],
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));

    const snapshots = [makePlaceholderSnapshot(), makeMultiPointSnapshot()];
    const { result } = renderHook(() =>
      useLetterReadingState(DELIVERY_ID, 'sender-1', snapshots, undefined, true)
    );

    expect(result.current.currentPhase).toBe('point-revealed');

    act(() => {
      result.current.advanceFromPointReveal();
    });

    // 2+ point flow: should still go to story-rate (unchanged behavior)
    expect(result.current.currentPhase).toBe('story-rate');
  });
});
