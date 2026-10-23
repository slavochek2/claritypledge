/**
 * @file p1545-strict-letter-reads.test.ts
 * @description P1545: the Artifacts page must tell a failed read from an empty one. The throwing variants
 * reject on a database error; the original readers keep returning empty results (other callers rely on it).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-123' } } }, error: null }) },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));
vi.mock('@sentry/react', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));
vi.mock('@/app/data/db-error-logger', () => ({ logDbError: vi.fn() }));

import {
  getAllSentLetters,
  getAllSentLettersOrThrow,
  getDeliveriesForLetters,
  getDeliveriesForLettersOrThrow,
} from '@/app/data/letters-service';
import { supabase } from '@/lib/supabase';

const failingQuery = () => {
  const result = { data: null, error: { message: 'boom' } };
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order']) chain[m] = vi.fn(() => chain);
  (chain as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return chain;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(supabase.from).mockReturnValue(failingQuery() as never);
  vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'boom' } } as never);
});

describe('strict letter reads', () => {
  it('getAllSentLettersOrThrow rejects on a database error; getAllSentLetters still returns []', async () => {
    await expect(getAllSentLettersOrThrow('user-123')).rejects.toThrow();
    await expect(getAllSentLetters('user-123')).resolves.toEqual([]);
  });

  it('getDeliveriesForLettersOrThrow rejects on an RPC error; getDeliveriesForLetters still returns empty arrays', async () => {
    await expect(getDeliveriesForLettersOrThrow(['a', 'b'])).rejects.toThrow();
    await expect(getDeliveriesForLetters(['a', 'b'])).resolves.toEqual({ a: [], b: [] });
  });

  it('getDeliveriesForLettersOrThrow groups a good answer like the original', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [{ id: 'd1', letter_id: 'a' }], error: null } as never);
    await expect(getDeliveriesForLettersOrThrow(['a', 'b'])).resolves.toEqual({ a: [{ id: 'd1', letter_id: 'a' }], b: [] });
  });
});
