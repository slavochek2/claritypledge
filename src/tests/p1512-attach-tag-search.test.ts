import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/app/data/points-service', () => ({ pointsService: {} }));
vi.mock('@/app/data/stories-service', () => ({ storiesService: {} }));

import { filterShareables, type Shareable } from '@/app/data/chat-ui-helpers';

const point = (id: string, title: string, tags: string[], systemTags: string[]): Shareable =>
  ({ kind: 'point', id, title, tags, systemTags, point: { id, statement: title, tags, systemTags } as never }) as Shareable;

const items = [
  point('a', 'Disagreement is information', ['clarity'], ['st1', 'v1']),
  point('b', 'Listening beats winning', ['listening'], ['st2']),
  point('c', 'Plain point', ['clarity', 'listening'], []),
];
const ids = (q: string) => filterShareables(items, q, 'point').map((i) => i.id);

describe('attach picker tag search (same matching as the feed filter)', () => {
  it('finds a point by its system tag, with or without #', () => {
    expect(ids('st1')).toEqual(['a']);
    expect(ids('#st1')).toEqual(['a']);
  });
  it('several #tags match any of them, like the feed', () => {
    expect(ids('#st1 #st2')).toEqual(['a', 'b']);
    expect(ids('#clarity #listening')).toEqual(['a', 'b', 'c']);
  });
  it('words still narrow by text', () => {
    expect(ids('listening winning')).toEqual(['b']);
    expect(ids('')).toHaveLength(3);
  });
});
