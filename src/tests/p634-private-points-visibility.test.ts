/**
 * @file p634-private-points-visibility.test.ts
 * @description P634: Verify private points never leak into feed or profile queries.
 *
 * Tests verify that:
 * 1. getPublicPointsFeed() includes .eq('visibility', 'public') filter
 * 2. getPointsForProfileDisplay() always filters private points (even for owner)
 * 3. getPointsByValidator() filters to public-only
 * 4. getPoint() still works for direct access (RLS handles visibility)
 * 5. getPointsFeed() retains its existing visibility filter
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PointsService } from '@/app/data/points-service.interface';

// Track all method calls in the query chain to verify filters
const callLog: { method: string; args: unknown[] }[] = [];

function trackCall(method: string, ...args: unknown[]) {
  callLog.push({ method, args });
}

// Chainable mock that records every method call
function createChainMock(terminalData: { data: unknown; error: unknown } | null = null) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  const makeMethod = (name: string) => {
    const fn = vi.fn((...args: unknown[]) => {
      trackCall(name, ...args);
      return chain;
    });
    return fn;
  };

  chain.select = makeMethod('select');
  chain.eq = makeMethod('eq');
  chain.in = makeMethod('in');
  chain.contains = makeMethod('contains');
  chain.order = makeMethod('order');
  chain.range = makeMethod('range');
  chain.single = vi.fn(() => {
    trackCall('single');
    return Promise.resolve(terminalData ?? { data: null, error: null });
  });

  // Make the chain itself thenable for queries that await directly
  chain.then = vi.fn((resolve: (val: unknown) => void) => {
    return Promise.resolve(terminalData ?? { data: [], error: null }).then(resolve);
  });

  return chain;
}

const mockGetUser = vi.fn();
let currentChain: ReturnType<typeof createChainMock>;

const mockFrom = vi.fn((_table: string) => {
  trackCall('from', _table);
  return currentChain;
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    auth: {
      getUser: () => mockGetUser(),
    },
  },
}));

vi.mock('@/lib/feed-utils', () => ({
  isSystemTag: (tag: string) => /^(st\d+|v\d+|understanding|misunderstanding)$/.test(tag),
}));

describe('P634: Private points visibility', () => {
  let service: PointsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    callLog.length = 0;
    currentChain = createChainMock({ data: [], error: null });
    const module = await import('@/app/data/points-service-real');
    service = module.realPointsService;
  });

  // =========================================================================
  // getPublicPointsFeed — must filter visibility='public'
  // =========================================================================

  describe('getPublicPointsFeed', () => {
    it('includes visibility=public filter in query', async () => {
      currentChain = createChainMock({ data: [], error: null });

      await service.getPublicPointsFeed(10, 0);

      const eqCalls = callLog.filter(c => c.method === 'eq');
      const hasVisibilityFilter = eqCalls.some(
        c => c.args[0] === 'visibility' && c.args[1] === 'public'
      );
      expect(hasVisibilityFilter).toBe(true);
    });

    it('includes visibility filter even when tag is provided', async () => {
      currentChain = createChainMock({ data: [], error: null });

      await service.getPublicPointsFeed(10, 0, 'motivation');

      const eqCalls = callLog.filter(c => c.method === 'eq');
      const hasVisibilityFilter = eqCalls.some(
        c => c.args[0] === 'visibility' && c.args[1] === 'public'
      );
      expect(hasVisibilityFilter).toBe(true);
    });

    it('includes visibility filter when viewer is provided', async () => {
      currentChain = createChainMock({ data: [], error: null });

      await service.getPublicPointsFeed(10, 0, undefined, 'user-1');

      const eqCalls = callLog.filter(c => c.method === 'eq');
      const hasVisibilityFilter = eqCalls.some(
        c => c.args[0] === 'visibility' && c.args[1] === 'public'
      );
      expect(hasVisibilityFilter).toBe(true);
    });
  });

  // =========================================================================
  // getPointsForProfileDisplay — must ALWAYS filter, even when viewer=owner
  // =========================================================================

  describe('getPointsForProfileDisplay', () => {
    it('includes visibility=public filter when viewer is the profile owner', async () => {
      // First call: point_positions query
      const positionsChain = createChainMock({
        data: [{ point_id: 'p1' }],
        error: null,
      });

      // Second call: points query
      const pointsChain = createChainMock({ data: [], error: null });

      mockFrom.mockImplementation((table: string) => {
        trackCall('from', table);
        if (table === 'point_positions') return positionsChain;
        return pointsChain;
      });

      await service.getPointsForProfileDisplay('user-1', 'user-1');

      // Check that the points query includes visibility=public
      const eqCalls = callLog.filter(c => c.method === 'eq');
      const hasVisibilityFilter = eqCalls.some(
        c => c.args[0] === 'visibility' && c.args[1] === 'public'
      );
      expect(hasVisibilityFilter).toBe(true);
    });

    it('includes visibility=public filter when viewer is different from owner', async () => {
      const positionsChain = createChainMock({
        data: [{ point_id: 'p1' }],
        error: null,
      });
      const pointsChain = createChainMock({ data: [], error: null });

      mockFrom.mockImplementation((table: string) => {
        trackCall('from', table);
        if (table === 'point_positions') return positionsChain;
        return pointsChain;
      });

      await service.getPointsForProfileDisplay('user-1', 'user-2');

      const eqCalls = callLog.filter(c => c.method === 'eq');
      const hasVisibilityFilter = eqCalls.some(
        c => c.args[0] === 'visibility' && c.args[1] === 'public'
      );
      expect(hasVisibilityFilter).toBe(true);
    });
  });

  // =========================================================================
  // getPointsByValidator — must filter visibility='public'
  // =========================================================================

  describe('getPointsByValidator', () => {
    it('includes visibility=public filter', async () => {
      currentChain = createChainMock({ data: [], error: null });

      await service.getPointsByValidator('user-1');

      const eqCalls = callLog.filter(c => c.method === 'eq');
      const hasVisibilityFilter = eqCalls.some(
        c => c.args[0] === 'visibility' && c.args[1] === 'public'
      );
      expect(hasVisibilityFilter).toBe(true);
    });
  });

  // =========================================================================
  // getPointsFeed — should retain existing visibility filter
  // =========================================================================

  describe('getPointsFeed', () => {
    it('retains visibility=public filter', async () => {
      currentChain = createChainMock({ data: [], error: null });

      await service.getPointsFeed(10, 0);

      const eqCalls = callLog.filter(c => c.method === 'eq');
      const hasVisibilityFilter = eqCalls.some(
        c => c.args[0] === 'visibility' && c.args[1] === 'public'
      );
      expect(hasVisibilityFilter).toBe(true);
    });
  });

  // =========================================================================
  // getPoint — must NOT filter (creator needs direct access)
  // =========================================================================

  describe('getPoint', () => {
    it('does NOT include visibility filter (direct access, RLS handles it)', async () => {
      currentChain = createChainMock({
        data: {
          id: 'point-1',
          statement: 'Test',
          first_validator_id: 'user-1',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
          tags: [],
          system_tags: [],
          creator: { id: 'user-1', name: 'Test', slug: 'test', avatar_color: '#000', avatar_url: null },
        },
        error: null,
      });

      await service.getPoint('point-1');

      const eqCalls = callLog.filter(c => c.method === 'eq');
      const hasVisibilityFilter = eqCalls.some(
        c => c.args[0] === 'visibility' && c.args[1] === 'public'
      );
      // getPoint should NOT filter by visibility — it's for direct point detail access
      expect(hasVisibilityFilter).toBe(false);
    });
  });

  // =========================================================================
  // getPointsWithUserPositions — must filter visibility='public'
  // =========================================================================

  describe('getPointsWithUserPositions', () => {
    it('includes visibility=public filter in query', async () => {
      currentChain = createChainMock({
        data: [{ point_id: 'point-1' }],
        error: null,
      });

      await service.getPointsWithUserPositions('user-1');

      const eqCalls = callLog.filter(c => c.method === 'eq');
      const hasVisibilityFilter = eqCalls.some(
        c => c.args[0] === 'visibility' && c.args[1] === 'public'
      );
      expect(hasVisibilityFilter).toBe(true);
    });
  });
});
