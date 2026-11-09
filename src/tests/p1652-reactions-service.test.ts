/**
 * P1652 (item 5, 7): the reactions service reads every page of a capped response in a stable order, and maps a null add row to null.
 */
import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({
  total: 0,
  ranges: [] as Array<[number, number]>,
  orderBy: [] as string[],
  rpcData: null as unknown,
}));
vi.mock('@/lib/supabase', () => {
  const builder = {
    select: () => builder,
    in: () => builder,
    order: (col: string) => { h.orderBy.push(col); return builder; },
    range: async (from: number, to: number) => {
      h.ranges.push([from, to]);
      const n = Math.max(0, Math.min(h.total, to + 1) - from);
      return { data: Array.from({ length: n }, (_, i) => ({ id: `r${from + i}`, message_id: 'm1', profile_id: 'p', emoji: '👍' })), error: null };
    },
  };
  return { supabase: { from: () => builder, rpc: async () => ({ data: h.rpcData, error: null }) } };
});

import { addReaction, listReactions } from '@/app/data/chat-reactions-service';

describe('chat reactions service', () => {
  it('reads pages until one comes back short, in a stable order', async () => {
    h.total = 2500;
    h.ranges = [];
    h.orderBy = [];
    const rows = await listReactions(['m1']);
    expect(rows).toHaveLength(2500);
    expect(h.ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(h.orderBy.every((c) => c === 'id')).toBe(true);
  });

  it('control: a short first page is one read', async () => {
    h.total = 3;
    h.ranges = [];
    expect(await listReactions(['m1'])).toHaveLength(3);
    expect(h.ranges).toHaveLength(1);
  });

  it('an exact multiple of the page size ends with an empty page', async () => {
    h.total = 1000;
    h.ranges = [];
    expect(await listReactions(['m1'])).toHaveLength(1000);
    expect(h.ranges).toEqual([[0, 999], [1000, 1999]]);
  });

  it('a null or all-null add row is null, a real row is mapped', async () => {
    h.rpcData = null;
    expect(await addReaction('m1', '👍')).toBeNull();
    h.rpcData = { id: null, message_id: null, profile_id: null, emoji: null };
    expect(await addReaction('m1', '👍')).toBeNull();
    h.rpcData = { id: 'x', message_id: 'm1', profile_id: 'p', emoji: '👍' };
    expect(await addReaction('m1', '👍')).toEqual({ id: 'x', messageId: 'm1', profileId: 'p', emoji: '👍' });
  });
});
