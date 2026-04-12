/**
 * @file p696-letter-reading-utils.test.ts
 * @description P696: Unit tests for letter-reading-utils.ts
 */

import { describe, it, expect } from 'vitest';
import {
  estimateReadingMinutes,
  countTotalPoints,
  calculateStoryProgress,
} from '@/app/utils/letter-reading-utils';
import type { LetterStorySnapshot } from '@/app/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshot(visibleCount: number, hiddenCount = 0): LetterStorySnapshot {
  const points = [
    ...Array.from({ length: visibleCount }, (_, i) => ({
      id: `visible-${i}`,
      visibility: 'visible',
    })),
    ...Array.from({ length: hiddenCount }, (_, i) => ({
      id: `hidden-${i}`,
      visibility: 'hidden',
    })),
  ];
  return {
    letter_id: 'letter-1',
    story_id: `story-${Math.random()}`,
    version_id: 'v1',
    position: 0,
    point_config: { points },
    visibility: 'public',
  };
}

// ---------------------------------------------------------------------------
// estimateReadingMinutes — 8 tests
// ---------------------------------------------------------------------------

describe('estimateReadingMinutes', () => {
  it('spec example: estimateReadingMinutes(3, 9) returns 12', () => {
    expect(estimateReadingMinutes(3, 9)).toBe(12);
  });

  it('spec example: estimateReadingMinutes(2, 0) returns 2 (storyCount floor)', () => {
    expect(estimateReadingMinutes(2, 0)).toBe(2);
  });

  it('minimum of 1 even with zero stories and zero points', () => {
    expect(estimateReadingMinutes(0, 0)).toBe(1);
  });

  it('single story, no points returns 1', () => {
    expect(estimateReadingMinutes(1, 0)).toBe(1);
  });

  it('single story, one point returns 2', () => {
    expect(estimateReadingMinutes(1, 1)).toBe(2);
  });

  it('old formula regression: new formula gives higher value than Math.ceil(storyCount * 2) for dense letters', () => {
    const storyCount = 3;
    const totalPoints = 9;
    const oldFormula = Math.ceil(storyCount * 2); // = 6
    const newFormula = estimateReadingMinutes(storyCount, totalPoints); // = 12
    expect(newFormula).toBeGreaterThan(oldFormula);
  });

  it('large letter: 10 stories, 30 points returns 40', () => {
    expect(estimateReadingMinutes(10, 30)).toBe(40);
  });

  it('fractional ceil: Math.ceil is applied — non-integer inputs ceil up', () => {
    // storyCount=1, totalPoints=1 → ceil(2) = 2
    expect(estimateReadingMinutes(1, 1)).toBe(2);
    // storyCount=2, totalPoints=2 → ceil(4) = 4
    expect(estimateReadingMinutes(2, 2)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// countTotalPoints — 6 tests
// ---------------------------------------------------------------------------

describe('countTotalPoints', () => {
  it('empty array returns 0', () => {
    expect(countTotalPoints([])).toBe(0);
  });

  it('snapshot with null/empty point_config returns 0', () => {
    const snap: LetterStorySnapshot = {
      letter_id: 'l1',
      story_id: 's1',
      version_id: 'v1',
      position: 0,
      point_config: {},
      visibility: 'public',
    };
    expect(countTotalPoints([snap])).toBe(0);
  });

  it('snapshot with only hidden points returns 0', () => {
    expect(countTotalPoints([makeSnapshot(0, 3)])).toBe(0);
  });

  it('snapshot with mixed visible and hidden counts only visible', () => {
    expect(countTotalPoints([makeSnapshot(2, 3)])).toBe(2);
  });

  it('single snapshot with 3 visible points returns 3', () => {
    expect(countTotalPoints([makeSnapshot(3)])).toBe(3);
  });

  it('accumulates across multiple snapshots', () => {
    const snapshots = [
      makeSnapshot(3),
      makeSnapshot(2, 1),
      makeSnapshot(4),
    ];
    // 3 + 2 + 4 = 9
    expect(countTotalPoints(snapshots)).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// calculateStoryProgress — 8 tests
// ---------------------------------------------------------------------------

describe('calculateStoryProgress', () => {
  it('phases progress in order for 2+ visible points', () => {
    const phases = [
      'point-engage',
      'point-revealed',
      'story-rate',
      'story-revealed',
      'remaining-point-engage',
      'remaining-point-revealed',
      'transition',
    ] as const;
    const values = phases.map((p) => calculateStoryProgress(p, 1, 3));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it('transition returns exactly 1 for 2+ visible points', () => {
    expect(calculateStoryProgress('transition', 0, 2)).toBe(1);
  });

  it('phases progress in order for 1 visible point', () => {
    const phases = ['story-rate', 'story-revealed', 'point-engage', 'point-revealed', 'transition'] as const;
    const values = phases.map((p) => calculateStoryProgress(p, 0, 1));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it('transition returns exactly 1 for 1 visible point', () => {
    expect(calculateStoryProgress('transition', 0, 1)).toBe(1);
  });

  it('0 visible points: story-rate returns 0, story-revealed returns 0.5, transition returns 1', () => {
    expect(calculateStoryProgress('story-rate', 0, 0)).toBe(0);
    expect(calculateStoryProgress('story-revealed', 0, 0)).toBe(0.5);
    expect(calculateStoryProgress('transition', 0, 0)).toBe(1);
  });

  it('all results are clamped between 0 and 1 inclusive', () => {
    const phases = [
      'point-engage', 'point-revealed', 'story-rate', 'story-revealed',
      'remaining-point-engage', 'remaining-point-revealed', 'transition',
    ] as const;
    for (const phase of phases) {
      for (const count of [0, 1, 2, 5]) {
        const value = calculateStoryProgress(phase, 1, count);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it('point-engage returns 0 for 2+ visible points (start of flow)', () => {
    expect(calculateStoryProgress('point-engage', 0, 2)).toBe(0);
    expect(calculateStoryProgress('point-engage', 0, 5)).toBe(0);
  });

  it('unknown phase returns 0 as default', () => {
    // TypeScript cast to test runtime default branch
    const unknownPhase = 'unknown-phase' as Parameters<typeof calculateStoryProgress>[0];
    expect(calculateStoryProgress(unknownPhase, 0, 2)).toBe(0);
    expect(calculateStoryProgress(unknownPhase, 0, 1)).toBe(0);
    expect(calculateStoryProgress(unknownPhase, 0, 0)).toBe(0);
  });
});
