/**
 * @file letter-snapshot-mapper.test.ts
 * @description P673: Unit tests for snapshotToStoryWithPoints mapper.
 * Verifies the pure transformation from LetterStorySnapshot → StoryWithPoints,
 * including security constraints from the architecture review.
 */

import { describe, it, expect } from 'vitest';
import { snapshotToStoryWithPoints } from '@/app/utils/letter-snapshot-mapper';
import type { LetterStorySnapshot } from '@/app/types';

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

describe('snapshotToStoryWithPoints', () => {
  // =========================================================================
  // BASIC MAPPING
  // =========================================================================

  it('maps point_config.storyText to StoryWithPoints.content', () => {
    const result = snapshotToStoryWithPoints(makeSnapshot(), 'Alice');
    expect(result.content).toBe('Test story content');
  });

  it('maps point_config.storyTitle to StoryWithPoints.title', () => {
    const result = snapshotToStoryWithPoints(makeSnapshot(), 'Alice');
    expect(result.title).toBe('Test Title');
  });

  it('maps point_config.points array to StoryWithPoints.points', () => {
    const result = snapshotToStoryWithPoints(makeSnapshot(), 'Alice');
    expect(result.points).toHaveLength(3);
    expect(result.points[0].id).toBe('p1');
    expect(result.points[0].statement).toBe('First point');
    expect(result.points[0].profileSubjectPosition).toBe('agree');
    expect(result.points[1].id).toBe('p2');
    expect(result.points[1].statement).toBe('Second point');
    expect(result.points[2].id).toBe('p3');
  });

  it('uses senderName param for authorName', () => {
    const result = snapshotToStoryWithPoints(makeSnapshot(), 'Alice');
    expect(result.authorName).toBe('Alice');
  });

  it('uses story_id from snapshot as StoryWithPoints.id', () => {
    const result = snapshotToStoryWithPoints(makeSnapshot({ story_id: 'custom-id' }), 'Alice');
    expect(result.id).toBe('custom-id');
  });

  it('sets sensible defaults for optional fields (authorEarsCount, authorHasPledged)', () => {
    const result = snapshotToStoryWithPoints(makeSnapshot(), 'Alice');
    expect(result.authorEarsCount).toBe(0);
    expect(result.authorHasPledged).toBe(false);
  });

  // =========================================================================
  // SECURITY CONSTRAINT: positionCounts must be empty
  // =========================================================================

  it('sets positionCounts to empty objects for all points', () => {
    const result = snapshotToStoryWithPoints(makeSnapshot(), 'Alice');
    for (const point of result.points) {
      expect(point.positionCounts).toEqual({});
    }
  });

  // =========================================================================
  // SECURITY CONSTRAINT: hidden points must be filtered
  // =========================================================================

  it('filters hidden points from the output', () => {
    const snapshot = makeSnapshot({
      point_config: {
        storyText: 'Story',
        points: [
          { id: 'p1', text: 'Visible', authorPosition: null },
          { id: 'p2', text: 'Hidden', authorPosition: null, hidden: true },
          { id: 'p3', text: 'Also visible', authorPosition: null },
        ],
      },
    });
    const result = snapshotToStoryWithPoints(snapshot, 'Alice');
    expect(result.points).toHaveLength(2);
    expect(result.points.map((p) => p.id)).toEqual(['p1', 'p3']);
  });

  it('returns empty points array when all points are hidden', () => {
    const snapshot = makeSnapshot({
      point_config: {
        storyText: 'Story',
        points: [
          { id: 'p1', text: 'Hidden 1', authorPosition: null, hidden: true },
          { id: 'p2', text: 'Hidden 2', authorPosition: null, hidden: true },
        ],
      },
    });
    const result = snapshotToStoryWithPoints(snapshot, 'Alice');
    expect(result.points).toEqual([]);
  });

  // =========================================================================
  // SECURITY CONSTRAINT: data sourced from point_config only
  // =========================================================================

  it('does not require any fields beyond point_config, story_id, and position', () => {
    const snapshot: LetterStorySnapshot = {
      letter_id: '',
      story_id: 'story-1',
      version_id: '',
      position: 0,
      point_config: { storyText: 'Minimal' },
      visibility: 'published',
    };
    const result = snapshotToStoryWithPoints(snapshot, 'Alice');
    expect(result.content).toBe('Minimal');
    expect(result.points).toEqual([]);
  });

  // =========================================================================
  // EDGE CASES
  // =========================================================================

  it('handles snapshot with 0 points', () => {
    const snapshot = makeSnapshot({
      point_config: { storyText: 'No points story', points: [] },
    });
    const result = snapshotToStoryWithPoints(snapshot, 'Alice');
    expect(result.points).toEqual([]);
  });

  it('handles snapshot with missing storyText gracefully', () => {
    const snapshot = makeSnapshot({
      point_config: { points: [] },
    });
    const result = snapshotToStoryWithPoints(snapshot, 'Alice');
    expect(result.content).toBe('');
  });

  it('handles null authorPosition on points', () => {
    const snapshot = makeSnapshot({
      point_config: {
        storyText: 'Story',
        points: [{ id: 'p1', text: 'Point', authorPosition: null }],
      },
    });
    const result = snapshotToStoryWithPoints(snapshot, 'Alice');
    expect(result.points[0].profileSubjectPosition).toBeNull();
  });

  // =========================================================================
  // VISIBLE POINT COUNT (for anti-point lead logic)
  // =========================================================================

  it('returns correct visible point count for anti-point lead decisions', () => {
    const snapshot = makeSnapshot({
      point_config: {
        storyText: 'Story',
        points: [
          { id: 'p1', text: 'Visible 1', authorPosition: null },
          { id: 'p2', text: 'Hidden', authorPosition: null, hidden: true },
          { id: 'p3', text: 'Visible 2', authorPosition: null },
          { id: 'p4', text: 'Hidden 2', authorPosition: null, hidden: true },
        ],
      },
    });
    const result = snapshotToStoryWithPoints(snapshot, 'Alice');
    expect(result.points).toHaveLength(2);
  });
});
