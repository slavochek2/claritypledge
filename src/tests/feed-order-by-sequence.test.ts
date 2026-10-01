import { describe, it, expect } from 'vitest';
import { orderBySequence } from '@/lib/feed-utils';

const p = (id: string, systemTags: string[]) => ({ id, systemTags });

describe('orderBySequence', () => {
  // The live #misunderstanding set, newest first, as /feed fetched it on 2026-10-01.
  const newestFirst = [
    p('st5v2', ['misunderstanding', 'st5', 'v2']), p('st1v2', ['misunderstanding', 'st1', 'v2']),
    p('st9', ['misunderstanding', 'st9', 'v1']), p('st8', ['misunderstanding', 'st8', 'v1']),
    p('st7', ['st7']), p('st6', ['st6']), p('st3', ['st3']), p('st4', ['st4']), p('st2', ['st2']),
  ];

  it('orders by st number whatever the fetch order was', () => {
    const want = ['st1v2', 'st2', 'st3', 'st4', 'st5v2', 'st6', 'st7', 'st8', 'st9'];
    expect(orderBySequence(newestFirst).map(x => x.id)).toEqual(want);
    expect(orderBySequence([...newestFirst].reverse()).map(x => x.id)).toEqual(want);
  });

  it('puts the newer version first within one st, and keeps untagged items after, in order', () => {
    const items = [p('free-a', []), p('st1v1', ['st1', 'v1']), p('free-b', ['cmp7']), p('st1v2', ['st1', 'v2'])];
    expect(orderBySequence(items).map(x => x.id)).toEqual(['st1v2', 'st1v1', 'free-a', 'free-b']);
  });

  it('returns the list untouched when nothing carries an st-tag', () => {
    const items = [p('b', []), p('a', ['ikigai1'])];
    expect(orderBySequence(items)).toBe(items);
  });
});
