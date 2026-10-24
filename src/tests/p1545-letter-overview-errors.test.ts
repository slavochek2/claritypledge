/**
 * @file p1545-letter-overview-errors.test.ts
 * @description P1545: getLetterOverview tells a failed read from an empty answer. A failed RPC throws
 * (the overview page shows Retry); only a successful empty response is null ("Not authorized").
 */
import { describe, it, expect, vi } from 'vitest';

let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: () => Promise.resolve(rpcResult),
    from: () => {
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'eq']) b[m] = () => b;
      b.maybeSingle = () => Promise.resolve({ data: { mode: 'one-to-one', source_doc_id: 'doc1', sealed_at: null }, error: null });
      return b;
    },
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } }, error: null }) },
  },
}));
vi.mock('@sentry/react', () => ({ captureMessage: vi.fn(), captureException: vi.fn(), addBreadcrumb: vi.fn() }));

import { getLetterOverview } from '@/app/data/letters-service';

describe('getLetterOverview', () => {
  it('throws when the RPC fails', async () => {
    rpcResult = { data: null, error: { code: '500', message: 'boom' } };
    await expect(getLetterOverview('l1')).rejects.toThrow();
  });

  it('returns null for a successful empty response', async () => {
    rpcResult = { data: [], error: null };
    expect(await getLetterOverview('l1')).toBeNull();
  });

  it('CONTROL: a real row returns the payload', async () => {
    rpcResult = {
      data: [{ letter: { id: 'l1', title: 'T', status: 'sealed', sender_id: 'u1', sender: {} }, stories: [], deliveries: [], predictions: [], ratings: [], point_responses: [] }],
      error: null,
    };
    const r = await getLetterOverview('l1');
    expect(r?.letter.id).toBe('l1');
  });
});
