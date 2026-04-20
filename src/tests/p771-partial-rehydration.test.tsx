/**
 * @file p771-partial-rehydration.test.tsx
 * @description Unit tests for the P771 partial-rehydration fix.
 *
 * Bug: advanceFromStoryReveal and advanceFromRemainingPointReveal unconditionally
 * set phase='remaining-point-engage' without checking prev.positions.
 * If the next point is already answered, the UI would show a Submit form → 409.
 *
 * Fix: isPointAnswered guard in both transition functions emits
 * 'remaining-point-revealed' when the target point is already in positions.
 *
 * Pattern: renderHook + sessionStorage seeding (p665 pattern).
 * Do NOT mock readingState — use real hook.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { LetterStorySnapshot } from '@/app/types';

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

// ── Constants ────────────────────────────────────────────────────────────────

const DELIVERY_ID = 'test-delivery-p771';
const STORAGE_KEY = `clarity-letter-reading-${DELIVERY_ID}`;

const POINT_A_ID = 'point-a-p771';
const POINT_B_ID = 'point-b-p771';
const POINT_C_ID = 'point-c-p771';

// ── Snapshot builders ────────────────────────────────────────────────────────

function makePlaceholderSnapshot(): LetterStorySnapshot {
  return {
    letter_id: 'letter-p771',
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

function makeTwoPointSnapshot(): LetterStorySnapshot {
  return {
    letter_id: 'letter-p771',
    story_id: 'story-1',
    version_id: 'version-1',
    position: 1,
    point_config: {
      storyText: 'Two-point story for P771 test',
      storyTitle: 'Two-Point Story',
      points: [
        { id: POINT_A_ID, text: 'Point A', authorPosition: 'agree' },
        { id: POINT_B_ID, text: 'Point B', authorPosition: 'disagree' },
      ],
    },
    visibility: 'published',
  };
}

function makeThreePointSnapshot(): LetterStorySnapshot {
  return {
    letter_id: 'letter-p771',
    story_id: 'story-1',
    version_id: 'version-1',
    position: 1,
    point_config: {
      storyText: 'Three-point story for P771 test',
      storyTitle: 'Three-Point Story',
      points: [
        { id: POINT_A_ID, text: 'Point A', authorPosition: 'agree' },
        { id: POINT_B_ID, text: 'Point B', authorPosition: 'disagree' },
        { id: POINT_C_ID, text: 'Point C', authorPosition: 'neutral' },
      ],
    },
    visibility: 'published',
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function seedSessionStorage(overrides: {
  phase: string;
  rating: number | null;
  prediction: number;
  positions: Record<string, string>;
  currentPointIndex: number;
}) {
  const savedState = {
    currentStoryIndex: 1,
    isComplete: false,
    stories: [
      {
        phase: 'transition',
        rating: 4,
        prediction: 3,
        positions: {},
        currentPointIndex: 0,
      },
      overrides,
    ],
  };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('P771: partial-rehydration — isPointAnswered guard in phase transitions', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('Scenario 1: visibleCount=2, idx-1 pre-answered → advanceFromStoryReveal → remaining-point-revealed', () => {
    // pointB (idx 1) is pre-answered; user just submitted pointA (idx 0).
    // Phase after story rating: story-revealed, ready to call advanceFromStoryReveal.
    seedSessionStorage({
      phase: 'story-revealed',
      rating: 3,
      prediction: 0,
      positions: { [POINT_B_ID]: 'disagree' }, // pointB answered, pointA just submitted
      currentPointIndex: 0,
    });

    const snapshots = [makePlaceholderSnapshot(), makeTwoPointSnapshot()];
    const { result } = renderHook(() =>
      useLetterReadingState(DELIVERY_ID, 'sender-1', snapshots),
    );

    expect(result.current.currentPhase).toBe('story-revealed');

    act(() => {
      result.current.advanceFromStoryReveal();
    });

    // Post-fix: detects pointB answered → remaining-point-revealed
    // Pre-fix: unconditionally → remaining-point-engage
    expect(result.current.currentPhase).toBe('remaining-point-revealed');
  });

  it('Scenario 2: visibleCount=3, idx-1 and idx-2 pre-answered → both transitions go to revealed', () => {
    // pointB (idx 1) and pointC (idx 2) are pre-answered; user submitted pointA.
    seedSessionStorage({
      phase: 'story-revealed',
      rating: 4,
      prediction: 0,
      positions: { [POINT_B_ID]: 'disagree', [POINT_C_ID]: 'agree' },
      currentPointIndex: 0,
    });

    const snapshots = [makePlaceholderSnapshot(), makeThreePointSnapshot()];
    const { result } = renderHook(() =>
      useLetterReadingState(DELIVERY_ID, 'sender-1', snapshots),
    );

    // advanceFromStoryReveal → idx 1 (pointB) is answered → remaining-point-revealed
    act(() => {
      result.current.advanceFromStoryReveal();
    });
    expect(result.current.currentPhase).toBe('remaining-point-revealed');

    // advanceFromRemainingPointReveal → idx 2 (pointC) is answered → remaining-point-revealed
    act(() => {
      result.current.advanceFromRemainingPointReveal();
    });
    expect(result.current.currentPhase).toBe('remaining-point-revealed');
  });

  it('Scenario 3: visibleCount=2, no pre-answers → advanceFromStoryReveal → remaining-point-engage (regression)', () => {
    // Normal flow: neither point is pre-answered. Behavior must be unchanged.
    seedSessionStorage({
      phase: 'story-revealed',
      rating: 3,
      prediction: 0,
      positions: {},
      currentPointIndex: 0,
    });

    const snapshots = [makePlaceholderSnapshot(), makeTwoPointSnapshot()];
    const { result } = renderHook(() =>
      useLetterReadingState(DELIVERY_ID, 'sender-1', snapshots),
    );

    act(() => {
      result.current.advanceFromStoryReveal();
    });

    // Unchanged: no pre-answers → remaining-point-engage
    expect(result.current.currentPhase).toBe('remaining-point-engage');
  });

  it('Scenario 4: visibleCount=3, only idx-2 pre-answered (non-contiguous) → idx-1 engage, idx-2 revealed', () => {
    // pointA (idx 0) submitted. pointC (idx 2) pre-answered. pointB (idx 1) not answered.
    // After advanceFromStoryReveal → remaining-point-engage for idx 1 (not pre-answered).
    // After user engages idx 1 and calls advanceFromRemainingPointReveal → revealed for idx 2.
    seedSessionStorage({
      phase: 'story-revealed',
      rating: 3,
      prediction: 0,
      positions: { [POINT_C_ID]: 'agree' }, // only idx 2 answered
      currentPointIndex: 0,
    });

    const snapshots = [makePlaceholderSnapshot(), makeThreePointSnapshot()];
    const { result } = renderHook(() =>
      useLetterReadingState(DELIVERY_ID, 'sender-1', snapshots),
    );

    // idx 1 (pointB) not answered → remaining-point-engage
    act(() => {
      result.current.advanceFromStoryReveal();
    });
    expect(result.current.currentPhase).toBe('remaining-point-engage');

    // Simulate user submitting pointB (now positions has pointB).
    // We can't call submitPointResponse (mocked), so advance directly from remaining-point-revealed.
    // Seed the state transition manually by reading from remaining-point-revealed.
    // Re-seed sessionStorage to reflect pointB now answered, in remaining-point-revealed phase.
    sessionStorage.clear();
    seedSessionStorage({
      phase: 'remaining-point-revealed',
      rating: 3,
      prediction: 0,
      positions: { [POINT_B_ID]: 'disagree', [POINT_C_ID]: 'agree' },
      currentPointIndex: 1,
    });

    const { result: result2 } = renderHook(() =>
      useLetterReadingState(DELIVERY_ID, 'sender-1', snapshots),
    );

    // idx 2 (pointC) answered → remaining-point-revealed
    act(() => {
      result2.current.advanceFromRemainingPointReveal();
    });
    expect(result2.current.currentPhase).toBe('remaining-point-revealed');
  });
});
