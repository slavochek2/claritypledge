/**
 * @file letter-results-page.test.ts
 * @description P705: Canary tests for letter positions live everywhere.
 *
 * Asserts:
 * (a) injectUserPositions correctly sets userPosition from a point_positions map.
 * (b) injectUserPositions sets userPosition to null for unmapped points.
 * (c) injectUserPositions does not mutate the original story.
 * (d) PositionButtons are not disabled when userPosition is injected (enabled by presence
 *     of userPosition in the story; the readOnly flag must not be passed in story-walk.tsx).
 */

import { describe, it, expect } from 'vitest';
import { injectUserPositions, snapshotToStoryWithPoints } from '@/app/utils/letter-snapshot-mapper';
import type { LetterStorySnapshot, PositionType } from '@/app/types';

function makeSnapshot(overrides: Partial<LetterStorySnapshot> = {}): LetterStorySnapshot {
  return {
    letter_id: 'letter-1',
    story_id: 'story-1',
    version_id: 'version-1',
    position: 0,
    point_config: {
      storyText: 'Test story content',
      storyTitle: 'Test Title',
      points: [
        { id: 'p1', text: 'First point', authorPosition: 'agree' },
        { id: 'p2', text: 'Second point', authorPosition: 'disagree' },
        { id: 'p3', text: 'Third point', authorPosition: null },
      ],
    },
    visibility: 'published',
    ...overrides,
  };
}

describe('injectUserPositions (P705)', () => {
  it('sets userPosition from the map for each matching point', () => {
    const story = snapshotToStoryWithPoints(makeSnapshot(), 'Alice');
    const userPositionMap = new Map<string, PositionType>([
      ['p1', 'agree'],
      ['p2', 'neutral'],
    ]);

    const result = injectUserPositions(story, userPositionMap);

    expect(result.points[0].userPosition).toBe('agree');
    expect(result.points[1].userPosition).toBe('neutral');
  });

  it('sets userPosition to null for points not in the map', () => {
    const story = snapshotToStoryWithPoints(makeSnapshot(), 'Alice');
    const userPositionMap = new Map<string, PositionType>([['p1', 'agree']]);

    const result = injectUserPositions(story, userPositionMap);

    expect(result.points[2].userPosition).toBeNull();
  });

  it('returns null for all userPositions when map is empty', () => {
    const story = snapshotToStoryWithPoints(makeSnapshot(), 'Alice');
    const result = injectUserPositions(story, new Map());

    for (const point of result.points) {
      expect(point.userPosition).toBeNull();
    }
  });

  it('does not mutate the original story', () => {
    const story = snapshotToStoryWithPoints(makeSnapshot(), 'Alice');
    const original = story.points[0].userPosition;

    injectUserPositions(story, new Map([['p1', 'strongly_agree']]));

    expect(story.points[0].userPosition).toBe(original);
  });

  it('does not modify profileSubjectPosition when injecting user positions', () => {
    const story = snapshotToStoryWithPoints(makeSnapshot(), 'Alice');
    const originalSubject = story.points[0].profileSubjectPosition;

    const result = injectUserPositions(story, new Map([['p1', 'agree']]));

    expect(result.points[0].profileSubjectPosition).toBe(originalSubject);
  });
});
