/**
 * @file p1508-canvas-strict-reads.test.ts
 * @description P1508 review fix — the canvas shows ONE page error, never a partial grid. A failed
 * read of the linked stories or of the viewer's own positions must throw, not come back as
 * "0 stories" / "not voted". Other callers of the shared stories read keep their old rule.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Result = { data: unknown; error: unknown };
/** Per-table queue of results; each awaited query takes the next one. */
const results = vi.hoisted(() => new Map<string, Array<{ data: unknown; error: unknown }>>());

function chain(table: string) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'in', 'eq', 'neq', 'is', 'contains', 'overlaps', 'order', 'range']) {
    q[m] = () => q;
  }
  q.then = (resolve: (r: Result) => unknown) => {
    const next = results.get(table)?.shift() ?? { data: [], error: null };
    return Promise.resolve(next).then(resolve);
  };
  return q;
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: (table: string) => chain(table) } }));
vi.mock('@/app/prototypes/events/banner-utils', () => ({ getBannerUrl: () => null }));

import { realStoriesService } from '@/app/data/stories-service-real';
import { realPointsService } from '@/app/data/points-service-real';

const failure = { data: null, error: { message: 'boom', code: '500' } };
const pointRow = {
  id: 'p1', statement: 'A bet', first_validator_id: 'owner', created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z', tags: ['claritypledge'], system_tags: ['canvas:problem'],
  visibility: 'public', superseded_by: null, creator: null,
};

beforeEach(() => results.clear());

describe('getStoriesForPoints', () => {
  it('strict: a failed read throws', async () => {
    results.set('story_points', [failure]);
    await expect(realStoriesService.getStoriesForPoints(['p1'], undefined, { strict: true })).rejects.toThrow();
  });

  it('default: a failed read still returns an empty map (feed, stake, profile unchanged)', async () => {
    results.set('story_points', [failure]);
    await expect(realStoriesService.getStoriesForPoints(['p1'])).resolves.toEqual(new Map());
  });
});

describe('getCanvasPoints', () => {
  it("throws when the viewer's own positions cannot be read", async () => {
    results.set('points', [{ data: [pointRow], error: null }]);
    results.set('point_positions', [{ data: [], error: null }, failure]); // counts ok, own positions fail
    await expect(realPointsService.getCanvasPoints('owner', 'claritypledge', 'viewer')).rejects.toThrow();
  });

  it('throws when the points read fails', async () => {
    results.set('points', [failure]);
    await expect(realPointsService.getCanvasPoints('owner', 'claritypledge')).rejects.toThrow();
  });

  it("returns the viewer's own position when every read succeeds", async () => {
    results.set('points', [{ data: [pointRow], error: null }]);
    results.set('point_positions', [
      { data: [{ point_id: 'p1', position: 'agree' }], error: null },
      { data: [{ id: 'pp1', point_id: 'p1', user_id: 'viewer', position: 'agree', reasoning: null, created_at: 'x', updated_at: 'y' }], error: null },
    ]);
    const [p] = await realPointsService.getCanvasPoints('owner', 'claritypledge', 'viewer');
    expect(p.userPosition?.position).toBe('agree');
    expect(p.totalPositions).toBe(1);
  });
});

describe('getCanvasPositions', () => {
  it('throws when the positions cannot be read (the canvas shows its page error, never "nobody positioned")', async () => {
    results.set('point_positions', [failure]);
    await expect(realPointsService.getCanvasPositions(['p1'])).rejects.toThrow();
  });

  it('groups everyone\'s positions, with the person, by point', async () => {
    const row = (point_id: string, user_id: string, position: string) => ({
      id: `${point_id}-${user_id}`, point_id, user_id, position, reasoning: null, created_at: 'x', updated_at: 'y',
      user: { id: user_id, name: `Name ${user_id}`, slug: user_id, avatar_color: null, avatar_url: null, ears_count: 0, has_pledged: false },
    });
    results.set('point_positions', [{ data: [row('p1', 'a', 'agree'), row('p1', 'b', 'disagree'), row('p2', 'a', 'unsure')], error: null }]);
    const byPoint = await realPointsService.getCanvasPositions(['p1', 'p2', 'p3']);
    expect(byPoint.get('p1')?.map(p => [p.userName, p.position])).toEqual([['Name a', 'agree'], ['Name b', 'disagree']]);
    expect(byPoint.get('p2')).toHaveLength(1);
    expect(byPoint.get('p3')).toEqual([]);
  });
});
