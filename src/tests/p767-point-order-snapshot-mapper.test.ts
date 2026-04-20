import { describe, it, expect } from 'vitest';
import { snapshotToStoryWithPoints, docStoryToSnapshot } from '@/app/utils/letter-snapshot-mapper';
import type { LetterStorySnapshot, DocStory } from '@/app/types';

function makeOrderedSnapshot(order: string[]): LetterStorySnapshot {
  return {
    letter_id: 'l1',
    story_id: 's1',
    version_id: 'v1',
    position: 0,
    visibility: 'public',
    point_config: {
      storyText: 'story',
      storyTitle: 'title',
      points: [
        { id: 'pA', text: 'A', authorPosition: null },
        { id: 'pB', text: 'B', authorPosition: null },
      ],
      order,
    },
  };
}

describe('P767 — point order in snapshot mapper', () => {
  it('Canary A1: honors point_config.order when present', () => {
    const result = snapshotToStoryWithPoints(makeOrderedSnapshot(['pB', 'pA']), 'Author');
    expect(result.points.map(p => p.id)).toEqual(['pB', 'pA']);
  });

  it('Canary A2: falls back to insertion order when order is empty', () => {
    const result = snapshotToStoryWithPoints(makeOrderedSnapshot([]), 'Author');
    expect(result.points.map(p => p.id)).toEqual(['pA', 'pB']);
  });

  it('Canary A3: falls back to insertion order when order is absent', () => {
    const snapshot: LetterStorySnapshot = {
      letter_id: 'l1', story_id: 's1', version_id: 'v1', position: 0, visibility: 'public',
      point_config: {
        storyText: 'story',
        points: [
          { id: 'pA', text: 'A', authorPosition: null },
          { id: 'pB', text: 'B', authorPosition: null },
        ],
      },
    };
    const result = snapshotToStoryWithPoints(snapshot, 'Author');
    expect(result.points.map(p => p.id)).toEqual(['pA', 'pB']);
  });

  it('Canary A4: appends points missing from order at end in insertion order', () => {
    // order only lists pB; pA (unlisted) should appear after
    const snapshot: LetterStorySnapshot = {
      letter_id: 'l1', story_id: 's1', version_id: 'v1', position: 0, visibility: 'public',
      point_config: {
        storyText: 'story',
        points: [
          { id: 'pA', text: 'A', authorPosition: null },
          { id: 'pB', text: 'B', authorPosition: null },
          { id: 'pC', text: 'C', authorPosition: null },
        ],
        order: ['pB'],
      },
    };
    const result = snapshotToStoryWithPoints(snapshot, 'Author');
    expect(result.points.map(p => p.id)).toEqual(['pB', 'pA', 'pC']);
  });

  it('Canary A5: filters hidden points before applying order; hidden ids in order do not break sort', () => {
    // points: [pA, pB, pC]; pB hidden; order=['pC','pB','pA']
    // expected: ['pC', 'pA'] — pB absent, remaining sorted by order
    const snapshot: LetterStorySnapshot = {
      letter_id: 'l1', story_id: 's1', version_id: 'v1', position: 0, visibility: 'public',
      point_config: {
        storyText: 'story',
        points: [
          { id: 'pA', text: 'A', authorPosition: null },
          { id: 'pB', text: 'B', authorPosition: null },
          { id: 'pC', text: 'C', authorPosition: null },
        ],
        hidden: ['pB'],
        order: ['pC', 'pB', 'pA'],
      },
    };
    const result = snapshotToStoryWithPoints(snapshot, 'Author');
    expect(result.points.map(p => p.id)).toEqual(['pC', 'pA']);
  });

  it('Canary B: preview path (docStoryToSnapshot round-trip) honors point_config.order', () => {
    const docStory = {
      doc_id: 'd1',
      story_id: 's1',
      position: 0,
      created_at: '',
      point_config: { order: ['pB', 'pA'] },
      story: {
        id: 's1',
        title: 'title',
        content: 'story',
        imageUrl: undefined,
        visibility: 'public',
        points: [
          { id: 'pA', statement: 'A', visibility: 'public', userPosition: null },
          { id: 'pB', statement: 'B', visibility: 'public', userPosition: null },
        ],
      },
    } as unknown as DocStory;

    const result = snapshotToStoryWithPoints(docStoryToSnapshot(docStory), 'Author');
    expect(result.points.map(p => p.id)).toEqual(['pB', 'pA']);
  });
});
