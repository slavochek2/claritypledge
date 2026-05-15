/**
 * @file p837-compose-persists-default-point-order.test.ts
 * @description P837 canary — composer must persist its displayed point order
 * into doc_stories.point_config.order before sealing, so the sealed snapshot's
 * leading-point matches the composer/preview's leading-point even when the
 * author never manually reordered (point_config.order = []).
 *
 * Symptom: when point_config.order is empty, composer renders points in
 * PostgREST physical-heap order (anti-point first, by happenstance), while the
 * seal RPC bakes snapshot.point_config.points in `created_at` ASC order
 * (regular-point first). Reader honors points[0] as the pre-story lead → flip
 * is wrong on the recipient side. P767 mapper sort is a no-op when order=[].
 *
 * Fix contract (computeDefaultPointOrderUpdates):
 *   For each story whose point_config.order is empty/missing AND whose
 *   displayed points length >= 2, return { storyId, order: pointIds } where
 *   pointIds reflects the composer's currently-displayed order. The seal
 *   handler then writes these back via docsService.updatePointConfig before
 *   calling sealLetter, so the snapshot inherits the order.
 *
 * Canary gate (P835 pattern):
 *   Before fix: dynamic import fails (module does not exist) → guarded by
 *               `it.fails`, so the suite stays green while the bug is open.
 *   After fix:  helper exists + returns the expected updates → assertions
 *               pass → `it.fails` flips RED → developer must remove `.fails`
 *               and convert these to plain `it()`.
 */

import { describe, it, expect } from 'vitest';

type Story = {
  story_id: string;
  point_config: { order?: string[] | null } | null;
  story: { points: Array<{ id: string }> };
};

function makeStory(opts: {
  storyId: string;
  pointIds: string[];
  order?: string[] | null;
}): Story {
  return {
    story_id: opts.storyId,
    point_config: opts.order === undefined ? null : { order: opts.order ?? [] },
    story: {
      points: opts.pointIds.map((id) => ({ id })),
    },
  };
}

// String built at runtime so Vite cannot statically analyze the import target.
// This lets module-not-found surface as a runtime rejection inside `it.fails`
// rather than blocking the whole test file at transform time.
const HELPER_PATH = ['@', 'app', 'utils', 'compose-default-point-order'].join(
  '/'
);

async function loadHelper() {
  const mod = (await import(/* @vite-ignore */ HELPER_PATH)) as {
    computeDefaultPointOrderUpdates: (
      stories: Story[]
    ) => Array<{ storyId: string; order: string[] }>;
  };
  return mod.computeDefaultPointOrderUpdates;
}

describe('P837 — computeDefaultPointOrderUpdates', () => {
  it.fails(
    'Canary: persists displayed order for a story with 2 points and empty order (the bug scenario)',
    async () => {
      const compute = await loadHelper();
      const stories = [
        makeStory({
          storyId: 'story-1',
          pointIds: ['anti-id', 'regular-id'],
          order: [],
        }),
      ];
      expect(compute(stories)).toEqual([
        { storyId: 'story-1', order: ['anti-id', 'regular-id'] },
      ]);
    }
  );

  it.fails(
    'Canary: persists when point_config.order is missing entirely (null point_config)',
    async () => {
      const compute = await loadHelper();
      const stories = [
        makeStory({
          storyId: 'story-1',
          pointIds: ['anti-id', 'regular-id'],
          order: undefined,
        }),
      ];
      expect(compute(stories)).toEqual([
        { storyId: 'story-1', order: ['anti-id', 'regular-id'] },
      ]);
    }
  );

  it.fails(
    'Regression guard (P767): does NOT touch stories where author already set point_config.order',
    async () => {
      const compute = await loadHelper();
      const stories = [
        makeStory({
          storyId: 'story-1',
          pointIds: ['p1', 'p2'],
          order: ['p2', 'p1'],
        }),
      ];
      expect(compute(stories)).toEqual([]);
    }
  );

  it.fails(
    'Single-point story: skips (order is meaningless for length 1)',
    async () => {
      const compute = await loadHelper();
      const stories = [
        makeStory({ storyId: 'story-1', pointIds: ['only-point'], order: [] }),
      ];
      expect(compute(stories)).toEqual([]);
    }
  );

  it.fails(
    'Zero-point story: skips (defensive, no points to order)',
    async () => {
      const compute = await loadHelper();
      const stories = [
        makeStory({ storyId: 'story-1', pointIds: [], order: [] }),
      ];
      expect(compute(stories)).toEqual([]);
    }
  );

  it.fails(
    'Mixed: persists only stories that need it, leaves others alone',
    async () => {
      const compute = await loadHelper();
      const stories = [
        makeStory({ storyId: 'a', pointIds: ['a1', 'a2'], order: [] }),
        makeStory({
          storyId: 'b',
          pointIds: ['b1', 'b2'],
          order: ['b2', 'b1'],
        }),
        makeStory({ storyId: 'c', pointIds: ['c1'], order: [] }),
        makeStory({
          storyId: 'd',
          pointIds: ['d1', 'd2', 'd3'],
          order: undefined,
        }),
      ];
      expect(compute(stories)).toEqual([
        { storyId: 'a', order: ['a1', 'a2'] },
        { storyId: 'd', order: ['d1', 'd2', 'd3'] },
      ]);
    }
  );
});
