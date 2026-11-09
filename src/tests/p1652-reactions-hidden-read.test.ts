/** P1652: paged reads stop between requests once told to, and give no partial answer. */
import { describe, expect, it, vi } from 'vitest';

const q = vi.hoisted(() => {
  const range = vi.fn(async () => ({ data: [], error: null }));
  const chain = { select: () => chain, in: () => chain, order: () => chain, range };
  return { range, chain };
});
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => q.chain, rpc: vi.fn(), channel: vi.fn() } }));

import { listReactions } from '@/app/data/chat-reactions-service';

describe('P1652 listReactions keepGoing', () => {
  const ids = Array.from({ length: 81 }, (_, i) => `m${i}`);

  it('stops before the second chunk and returns null', async () => {
    q.range.mockClear();
    await expect(listReactions(ids, () => false)).resolves.toBeNull();
    expect(q.range).toHaveBeenCalledTimes(1);
  });

  it('control: reads both chunks when allowed', async () => {
    q.range.mockClear();
    await expect(listReactions(ids)).resolves.toEqual([]);
    expect(q.range).toHaveBeenCalledTimes(2);
  });
});
