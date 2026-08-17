/**
 * @file p1083-ready-service.test.ts
 * @description Unit coverage for ready-service.ts's own guarantees: a read failure
 * (network error or a Supabase error response) resolves to an empty array rather
 * than throwing or rejecting, and a write failure is swallowed — never thrown —
 * so it can never block the caller's navigation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import { getReadyDistribution, submitReadyValue } from '@/app/data/ready-service';

beforeEach(() => {
  mockFrom.mockReset();
});

describe('P1083 — ready-service', () => {
  it('getReadyDistribution returns the fetched values on success', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [{ value: 3 }, { value: 8 }], error: null }),
        }),
      }),
    });
    await expect(getReadyDistribution()).resolves.toEqual([3, 8]);
  });

  it('getReadyDistribution resolves to [] on a Supabase error response, never rejects', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'RLS denied' } }),
        }),
      }),
    });
    await expect(getReadyDistribution()).resolves.toEqual([]);
  });

  it('getReadyDistribution resolves to [] on a thrown/network failure, never rejects', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockRejectedValue(new Error('network down')),
        }),
      }),
    });
    await expect(getReadyDistribution()).resolves.toEqual([]);
  });

  it('submitReadyValue never throws synchronously, even when the insert rejects', () => {
    mockFrom.mockReturnValue({
      insert: vi.fn().mockRejectedValue(new Error('insert failed')),
    });
    expect(() => submitReadyValue(6)).not.toThrow();
  });

  it('submitReadyValue passes the given value straight through to insert', () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ insert: insertSpy });
    submitReadyValue(9);
    expect(insertSpy).toHaveBeenCalledWith({ value: 9 });
  });

  it('getReadyDistribution caps the query at exactly 200 rows — not an unbounded or huge limit', async () => {
    // expect.any(Number) would let a regression to Number.MAX_SAFE_INTEGER (or
    // Infinity, which is also typeof 'number') pass silently — bind the real
    // value (adversarial review finding, 2026-08-17: mutation-tested, three
    // independent reviewers proved the looser assertion vacuous).
    const limitSpy = vi.fn().mockResolvedValue({ data: [], error: null });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: limitSpy }) }),
    });
    await getReadyDistribution();
    expect(limitSpy).toHaveBeenCalledWith(200);
  });

  it('getReadyDistribution orders by most-recent-first, so a capped read never silently keeps the oldest slice', async () => {
    const orderSpy = vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnValue({ order: orderSpy }) });
    await getReadyDistribution();
    expect(orderSpy).toHaveBeenCalledWith('created_at', { ascending: false });
  });
});
