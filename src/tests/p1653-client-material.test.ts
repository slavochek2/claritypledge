/**
 * P1653: "Not mine" leaves a tombstone row (kind `link_rejected`) in the draft's material. The owner's material list must never show it,
 * and it must never be mistaken for a file.
 */
import { describe, expect, it, vi } from 'vitest';

const sb = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.order = () => Promise.resolve({ data: sb.rows, error: null });
      return q;
    },
  },
}));
vi.mock('@/lib/list-return-cache', () => ({ clearListReturnCache: vi.fn() }));

import { listCanvasMaterial } from '@/app/data/canvas-draft-service';

const row = (id: string, kind: string, label: string) => ({ id, kind, label, chars: kind === 'link_rejected' ? 0 : 120, created_at: '2026-11-10T08:00:00.000Z' });

describe('P1653 the material list hides a rejected link', () => {
  it('a link_rejected tombstone is not listed, a link and a file are', async () => {
    sb.rows = [row('1', 'link', 'https://example.com/'), row('2', 'link_rejected', 'https://www.airbnb.com/'), row('3', 'file', 'plan.pdf')];
    const items = await listCanvasMaterial('d1');
    expect(items.map((i) => i.id)).toEqual(['1', '3']);
    expect(items.map((i) => i.kind)).toEqual(['link', 'file']);
  });
  it('CONTROL: with no tombstone every row is listed', async () => {
    sb.rows = [row('1', 'link', 'https://example.com/')];
    expect((await listCanvasMaterial('d1')).map((i) => i.id)).toEqual(['1']);
  });
});
