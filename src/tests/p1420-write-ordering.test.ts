/**
 * P1420 round 3 item 2 — a write queued behind another is recorded under the generation it was
 * CLICKED with, not the newest one when it is finally sent. Uses the real points-service wrapper
 * (over the mock service), so the recording path itself is under test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// The wrapper under test sits over the real service; its network call is stubbed to succeed.
vi.mock('@/app/data/points-service-real', async (orig) => {
  const actual = await orig<typeof import('@/app/data/points-service-real')>();
  return {
    ...actual,
    realPointsService: { ...actual.realPointsService, setPosition: async () => {}, removePosition: async () => {} },
  };
});
import { MemoryEntryStore, _setOfflineEntryStoreForTesting, _resetOwnWritesForTesting } from '@/lib/offline-read-cache';
import { beginPositionWrite, sendPositionWrite, _resetPositionWritesForTesting } from '@/app/data/position-write-outcome';
import { recordOwnPosition } from '@/app/data/own-position-writes';
import type { PointWithUserPosition } from '@/app/types';

const counts = { strongly_agree: 0, agree: 1, somewhat_agree: 0, unsure: 0, somewhat_disagree: 0, disagree: 0, strongly_disagree: 0 };
const p1 = { id: 'p1', statement: 'p1', tags: [], positionCounts: counts, totalPositions: 1,
  userPosition: { id: 'pp', pointId: 'p1', userId: 'viewer-1', position: 'agree', createdAt: 'c', updatedAt: 'u' } } as unknown as PointWithUserPosition;

let store: MemoryEntryStore;
beforeEach(() => {
  store = new MemoryEntryStore();
  _setOfflineEntryStoreForTesting(store);
  _resetOwnWritesForTesting();
  _resetPositionWritesForTesting();
});

describe('round 3 item 2: the generation travels with the write', () => {
  it('queued B, sent after newer C was clicked and confirmed, does not overwrite C in the cache', async () => {
    await store.put({ key: 'u:viewer-1|feed|desc:', type: 'feed', data: { points: [p1], cloudPoints: [] }, storedAt: 1 });
    const b = beginPositionWrite('viewer-1', 'p1'); // clicked first
    const c = beginPositionWrite('viewer-1', 'p1'); // clicked second
    await recordOwnPosition('p1', 'viewer-1', 'unsure', c); // C confirmed first
    await sendPositionWrite('viewer-1', 'p1', 'disagree', b); // B finally sent and answered
    await new Promise((r) => setTimeout(r, 20)); // the service records after its await
    const after = (await store.get('u:viewer-1|feed|desc:'))!.data as { points: PointWithUserPosition[] };
    expect(after.points[0]!.userPosition?.position).toBe('unsure');
  });
});
