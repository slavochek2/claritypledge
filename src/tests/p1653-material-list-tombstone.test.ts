/**
 * P1653: a page the owner said is not theirs ("Not mine") stays in the database as a tombstone (kind link_rejected, no text) so it is never read again.
 * The material list the owner sees must not show it as a file with 0 characters.
 */
import { describe, expect, it, vi } from 'vitest';

const sb = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() }, rpc: vi.fn(), from: sb.from } }));
vi.mock('@/lib/list-return-cache', () => ({ clearListReturnCache: vi.fn() }));

import { listCanvasMaterial } from '@/app/data/canvas-draft-service';

describe('P1653: the owner\'s material list', () => {
  it('leaves a rejected page out, and keeps files and links', async () => {
    const rows = [
      { id: 'a', kind: 'file', label: 'deck.pdf', chars: 120, created_at: '1' },
      { id: 'b', kind: 'link_rejected', label: 'https://airbnb.com', chars: 0, created_at: '2' },
      { id: 'c', kind: 'link', label: 'https://example.com', chars: 40, created_at: '3' },
    ];
    sb.from.mockReturnValueOnce({ select: () => ({ eq: () => ({ order: async () => ({ data: rows, error: null }) }) }) });
    const list = await listCanvasMaterial('d1');
    expect(list.map((m) => m.id)).toEqual(['a', 'c']);
    expect(list.map((m) => m.kind)).toEqual(['file', 'link']);
  });
});
