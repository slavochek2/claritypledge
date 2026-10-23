/**
 * @file p1545-strict-docs-read.test.ts
 * @description P1545: the Artifacts page must tell a failed drafts read from an empty one.
 * getDocsByUserOrThrow rejects on a database error; getDocsByUser keeps returning [] (drafts tab relies on it).
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
vi.mock('@/app/data/db-error-logger', () => ({
  logDbError: vi.fn(),
  throwDbError: (_where: string, _e: unknown, msg: string) => { throw new Error(msg); },
}));

import { docsService } from '@/app/data/docs-service';
import { supabase } from '@/lib/supabase';

const query = (result: { data: unknown; error: unknown }) => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'in', 'neq']) chain[m] = vi.fn(() => chain);
  (chain as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return chain;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('strict docs read', () => {
  it('getDocsByUserOrThrow rejects on a database error; getDocsByUser still returns []', async () => {
    vi.mocked(supabase.from).mockReturnValue(query({ data: null, error: { message: 'boom' } }) as never);
    await expect(docsService.getDocsByUserOrThrow('user-123')).rejects.toThrow();
    await expect(docsService.getDocsByUser('user-123')).resolves.toEqual([]);
  });

  it('getDocsByUserOrThrow rejects when a count query fails, instead of showing wrong counts', async () => {
    const docs = { data: [{ id: 'd1', owner_id: 'user-123', title: 'T' }], error: null };
    vi.mocked(supabase.from).mockImplementation(((table: string) =>
      table === 'clarity_docs' ? query(docs) : query({ data: null, error: { message: 'boom' } })) as never);
    await expect(docsService.getDocsByUserOrThrow('user-123')).rejects.toThrow();
  });

  it('getDocsByUserOrThrow returns the docs on a good answer', async () => {
    const docs = { data: [{ id: 'd1', owner_id: 'user-123', title: 'T' }], error: null };
    vi.mocked(supabase.from).mockImplementation(((table: string) =>
      table === 'clarity_docs' ? query(docs) : query({ data: [], error: null })) as never);
    const out = await docsService.getDocsByUserOrThrow('user-123');
    expect(out.map(d => d.id)).toEqual(['d1']);
  });
});
