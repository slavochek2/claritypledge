/**
 * @file p800-chain-utils.test.ts
 * @description P800: Unit tests for getChainHead and getVersionChain logic.
 *
 * These tests define the expected behavior. /dev implements to match these specs.
 * Tests use a mock Supabase client — no network calls.
 *
 * Chain model:
 *   root → mid → head   (root.superseded_by = mid, mid.superseded_by = head, head.superseded_by = null)
 *   getChainHead(root) → { headId: head.id, hops: 2 }
 *   getVersionChain(mid) → [root, mid, head]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getChainHead, getVersionChain } from '@/app/data/points-service-real';

// ── Mock factory ─────────────────────────────────────────────────────────────

type FakePoint = { id: string; superseded_by: string | null };

/**
 * Creates a fake points table supporting both forward (eq('id', x)) and
 * backward (eq('superseded_by', x)) queries used by getChainHead/getVersionChain.
 */
function makeSupabaseMock(points: FakePoint[]) {
  const byId = new Map(points.map((p) => [p.id, p]));
  const bySuccessor = new Map(
    points.filter((p) => p.superseded_by !== null).map((p) => [p.superseded_by!, p])
  );

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockImplementation((col: string, val: string) => {
        const row = col === 'superseded_by' ? (bySuccessor.get(val) ?? null) : (byId.get(val) ?? null);
        return {
          maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
          single: vi.fn().mockResolvedValue({ data: row, error: null }),
          limit: vi.fn().mockResolvedValue({ data: row ? [row] : [], error: null }),
        };
      }),
    }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('P800 — getChainHead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns same id when point has no superseded_by (single-point chain)', async () => {
    const points: FakePoint[] = [{ id: 'head-only', superseded_by: null }];
    const mock = makeSupabaseMock(points);

    const result = await getChainHead('head-only', mock);

    expect(result).not.toBeNull();
    expect(result?.headId).toBe('head-only');
    expect(result?.hops).toBe(0);
  });

  it('walks chain of depth 2 and returns the head', async () => {
    const points: FakePoint[] = [
      { id: 'p1', superseded_by: 'p2' },
      { id: 'p2', superseded_by: null },
    ];
    const mock = makeSupabaseMock(points);

    const result = await getChainHead('p1', mock);

    expect(result).not.toBeNull();
    expect(result?.headId).toBe('p2');
    expect(result?.hops).toBe(1);
  });

  it('walks chain of depth 3 and returns the head with correct hop count', async () => {
    const points: FakePoint[] = [
      { id: 'root', superseded_by: 'mid' },
      { id: 'mid', superseded_by: 'head' },
      { id: 'head', superseded_by: null },
    ];
    const mock = makeSupabaseMock(points);

    const result = await getChainHead('root', mock);

    expect(result).not.toBeNull();
    expect(result?.headId).toBe('head');
    expect(result?.hops).toBe(2);
  });

  it('returns null after 100 hops (hard cap — cycle protection)', async () => {
    // Simulate a chain that never terminates by always returning a non-null superseded_by.
    const infiniteMock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'looping-point', superseded_by: 'looping-point' },
            error: null,
          }),
          limit: vi.fn().mockResolvedValue({
            data: [{ id: 'looping-point', superseded_by: 'looping-point' }],
            error: null,
          }),
        }),
      }),
    };

    const result = await getChainHead('looping-point', infiniteMock as unknown as ReturnType<typeof makeSupabaseMock>);

    expect(result).toBeNull();
  });

  it('returns null when point is not found', async () => {
    const mock = makeSupabaseMock([]); // empty table

    const result = await getChainHead('nonexistent-id', mock);

    expect(result).toBeNull();
  });
});

describe('P800 — getVersionChain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('single point with no predecessors and no successors returns array of length 1', async () => {
    const points: FakePoint[] = [{ id: 'lone', superseded_by: null }];
    const mock = makeSupabaseMock(points);

    const chain = await getVersionChain('lone', mock);

    expect(chain).toHaveLength(1);
    expect(chain[0].id).toBe('lone');
  });

  it('chain [root, mid, head] returns all 3 elements in ancestor-to-head order', async () => {
    const points: FakePoint[] = [
      { id: 'root', superseded_by: 'mid' },
      { id: 'mid', superseded_by: 'head' },
      { id: 'head', superseded_by: null },
    ];
    const mock = makeSupabaseMock(points);

    // Starting from the middle point
    const chain = await getVersionChain('mid', mock);

    expect(chain).toHaveLength(3);
    expect(chain[0].id).toBe('root');
    expect(chain[1].id).toBe('mid');
    expect(chain[2].id).toBe('head');
  });

  it('chain from head walks backward correctly', async () => {
    const points: FakePoint[] = [
      { id: 'root', superseded_by: 'head' },
      { id: 'head', superseded_by: null },
    ];
    const mock = makeSupabaseMock(points);

    const chain = await getVersionChain('head', mock);

    expect(chain).toHaveLength(2);
    expect(chain[0].id).toBe('root');
    expect(chain[1].id).toBe('head');
  });

  it('chain from root walks forward correctly', async () => {
    const points: FakePoint[] = [
      { id: 'root', superseded_by: 'head' },
      { id: 'head', superseded_by: null },
    ];
    const mock = makeSupabaseMock(points);

    const chain = await getVersionChain('root', mock);

    expect(chain).toHaveLength(2);
    expect(chain[0].id).toBe('root');
    expect(chain[1].id).toBe('head');
  });
});
