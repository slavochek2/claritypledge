/**
 * @file p749-hidden-points-snapshot-mapper.test.ts
 * @description P749: Canary tests for the hidden-points leak.
 *
 * Letter snapshots carry hidden-point info in two shapes that must both filter:
 *
 *   (a) Per-point boolean: `points: [{ id, hidden: true }]` — current mapper handles this.
 *   (b) Top-level array : `point_config.hidden = ['p1']` — what the seal RPC writes today.
 *                          The mapper must filter these too (back-compat for already-sealed letters
 *                          and for the count helper).
 *
 * Without back-compat handling, hidden points leak into:
 *   - the receiver's sealed letter (mapper output)
 *   - the cover point count (countTotalPoints)
 *
 * Cases A/B/C must FAIL before the fix lands. Case A is a sanity check on the
 * existing per-point filter (must already pass). Case D (builder symmetry) is
 * added once docStoryToSnapshot is extracted into the mapper.
 */

import { describe, it, expect } from 'vitest';
import { snapshotToStoryWithPoints, docStoryToSnapshot } from '@/app/utils/letter-snapshot-mapper';
import { countTotalPoints } from '@/app/utils/letter-reading-utils';
import type { LetterStorySnapshot, DocStory } from '@/app/types';

function makePerPointHiddenSnapshot(): LetterStorySnapshot {
  return {
    letter_id: 'l1',
    story_id: 's1',
    version_id: 'v1',
    position: 0,
    point_config: {
      storyText: 'body',
      storyTitle: 't',
      points: [
        { id: 'p1', text: 'hidden one', authorPosition: null, hidden: true },
        { id: 'p2', text: 'visible one', authorPosition: null },
      ],
    },
    visibility: 'public',
  };
}

function makeTopLevelHiddenSnapshot(): LetterStorySnapshot {
  return {
    letter_id: 'l1',
    story_id: 's1',
    version_id: 'v1',
    position: 0,
    point_config: {
      storyText: 'body',
      storyTitle: 't',
      points: [
        { id: 'p1', text: 'hidden one', authorPosition: null },
        { id: 'p2', text: 'visible one', authorPosition: null },
      ],
      hidden: ['p1'],
    },
    visibility: 'public',
  };
}

describe('P749 — hidden points leak', () => {
  // Case A — sanity: the existing per-point filter still works.
  it('Case A: filters per-point hidden:true (sanity, already passes)', () => {
    const result = snapshotToStoryWithPoints(makePerPointHiddenSnapshot(), 'Alice');
    expect(result.points.map(p => p.id)).toEqual(['p2']);
  });

  // Case B — the bug: top-level config.hidden array must also filter.
  // Pre-fix: mapper returns both points → fails.
  it('Case B: filters top-level config.hidden array (seal RPC shape)', () => {
    const result = snapshotToStoryWithPoints(makeTopLevelHiddenSnapshot(), 'Alice');
    expect(result.points.map(p => p.id)).toEqual(['p2']);
  });

  // Case C — symmetric back-compat for the cover count helper.
  it('Case C: countTotalPoints honors top-level config.hidden array', () => {
    const total = countTotalPoints([makeTopLevelHiddenSnapshot()]);
    expect(total).toBe(1);
  });

  // Case D — builder/reader round-trip. docStoryToSnapshot must populate per-point
  // hidden from docStory.point_config.hidden so the existing reader filter fires
  // on preview snapshots. Locks in the full builder→reader contract that prevents
  // shape drift from re-introducing the leak.
  it('Case D: docStoryToSnapshot → snapshotToStoryWithPoints round-trip filters hidden points', () => {
    const docStory = {
      doc_id: 'd1',
      story_id: 's1',
      position: 0,
      created_at: '',
      point_config: { hidden: ['p1'] },
      story: {
        id: 's1',
        title: 't',
        content: 'body',
        visibility: 'public',
        points: [
          { id: 'p1', statement: 'hidden one', visibility: 'public', userPosition: null },
          { id: 'p2', statement: 'visible one', visibility: 'public', userPosition: null },
        ],
      },
    } as unknown as DocStory;

    const snapshot = docStoryToSnapshot(docStory);
    const result = snapshotToStoryWithPoints(snapshot, 'Alice');
    expect(result.points.map(p => p.id)).toEqual(['p2']);
  });
});
