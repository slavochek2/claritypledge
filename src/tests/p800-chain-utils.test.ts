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

// TODO: import { getChainHead, getVersionChain } from '@/app/data/points-service-real';
// These tests define the expected behavior — /dev implements to match.
// Until the implementation exists, tests are structured as executable specifications
// with a mock that will wire up once the source function is importable.

// ── Mock factory ─────────────────────────────────────────────────────────────

/**
 * Creates a fake points table as a map of id → { id, superseded_by }.
 * Used to simulate supabaseAdmin's .from('points').select(...).eq('id', x).maybeSingle().
 */
type FakePoint = { id: string; superseded_by: string | null };

function makeSupabaseMock(points: FakePoint[]) {
  const table = new Map(points.map((p) => [p.id, p]));

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockImplementation((_col: string, id: string) => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data: table.get(id) ?? null,
          error: null,
        }),
        single: vi.fn().mockResolvedValue({
          data: table.get(id) ?? null,
          error: null,
        }),
      })),
    }),
  };
}

// ── Stub implementations ──────────────────────────────────────────────────────
// These stubs replicate the specified behavior so tests can run.
// /dev will replace these with the real implementations from points-service-real.ts.

async function getChainHead(
  startPointId: string,
  supabase: ReturnType<typeof makeSupabaseMock>,
): Promise<{ headId: string; hops: number } | null> {
  // TODO: replace with import from '@/app/data/points-service-real'
  let currentId = startPointId;
  let hops = 0;
  const MAX_HOPS = 100;

  while (hops < MAX_HOPS) {
    const { data, error } = await supabase
      .from('points')
      .select('id, superseded_by')
      .eq('id', currentId)
      .maybeSingle();

    if (error || !data) return null;
    if (data.superseded_by === null) return { headId: currentId, hops };

    currentId = data.superseded_by;
    hops++;
  }

  // Exceeded hard cap — indicates a cycle not caught by trigger or malformed data
  return null;
}

async function getVersionChain(
  pointId: string,
  supabase: ReturnType<typeof makeSupabaseMock>,
  allPoints: FakePoint[], // real impl queries reverse via eq('superseded_by', id)
): Promise<FakePoint[]> {
  // TODO: replace with import from '@/app/data/points-service-real'
  // Walk backward (find predecessor) and forward (follow superseded_by)
  const chain: FakePoint[] = [];

  // Walk backward to root
  let currentId: string | null = pointId;
  const predecessors: FakePoint[] = [];

  while (currentId !== null) {
    const predecessor = allPoints.find((p) => p.superseded_by === currentId) ?? null;
    if (!predecessor) break;
    predecessors.unshift(predecessor);
    currentId = predecessor.id;
  }

  // Add predecessors
  chain.push(...predecessors);

  // Add current point
  const current = allPoints.find((p) => p.id === pointId);
  if (!current) return [];
  chain.push(current);

  // Walk forward to head
  let nextId = current.superseded_by;
  while (nextId !== null) {
    const next = allPoints.find((p) => p.id === nextId) ?? null;
    if (!next) break;
    chain.push(next);
    nextId = next.superseded_by;
  }

  return chain;
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

    const chain = await getVersionChain('lone', mock, points);

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
    const chain = await getVersionChain('mid', mock, points);

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

    const chain = await getVersionChain('head', mock, points);

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

    const chain = await getVersionChain('root', mock, points);

    expect(chain).toHaveLength(2);
    expect(chain[0].id).toBe('root');
    expect(chain[1].id).toBe('head');
  });
});
