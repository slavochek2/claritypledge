import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock('@/lib/list-return-cache', () => ({ clearListReturnCache: vi.fn() }));
vi.mock('@/app/data/db-error-logger', () => ({ throwDbError: (_c: string, e: { message?: string }, m: string) => { throw new Error(`${m}: ${e?.message}`); } }));

import { addCanvasDraftPoint } from '@/app/data/canvas-draft-add-call';
import { subscribeCanvasDraftEvents, type CanvasDraftEvent } from '@/app/data/canvas-draft-events';

const events: CanvasDraftEvent[] = [];
beforeEach(() => { rpc.mockReset(); events.length = 0; });
const listen = () => subscribeCanvasDraftEvents(e => events.push(e));

describe('P1621 addCanvasDraftPoint', () => {
  it('sends the contract arguments and returns the new point', async () => {
    rpc.mockResolvedValueOnce({ data: { status: 'ok', changed: true, point_id: 'p9', revision: 7 }, error: null });
    const off = listen();
    expect(await addCanvasDraftPoint('d1', 'canvas:problem', 'words', 6, 'c1')).toEqual({ ok: true, changed: true, pointId: 'p9', revision: 7 });
    off();
    expect(rpc).toHaveBeenCalledWith('canvas_draft_add_point', { p_draft: 'd1', p_box: 'canvas:problem', p_statement: 'words', p_expected_revision: 6, p_client_id: 'c1' });
    expect(events).toEqual([{ kind: 'updated', draftId: 'd1' }]);
  });
  it('a replay answers changed:false', async () => {
    rpc.mockResolvedValueOnce({ data: { status: 'ok', changed: false, point_id: 'p9', revision: 7 }, error: null });
    expect(await addCanvasDraftPoint('d1', 'canvas:problem', 'words', 6, 'c1')).toMatchObject({ ok: true, changed: false, pointId: 'p9' });
  });
  it('duplicate and busy are typed refusals with no re-read; box_full and stale_view re-read once, since the screen is behind', async () => {
    const off = listen();
    for (const code of ['duplicate', 'busy']) {
      rpc.mockResolvedValueOnce({ data: { status: 'refused', code, revision: 6 }, error: null });
      expect(await addCanvasDraftPoint('d1', 'canvas:problem', 't', 6, 'c')).toEqual({ ok: false, refused: code, revision: 6 });
    }
    expect(events).toEqual([]);
    rpc.mockResolvedValueOnce({ data: { status: 'refused', code: 'box_full', revision: 6 }, error: null });
    expect(await addCanvasDraftPoint('d1', 'canvas:problem', 't', 6, 'c')).toEqual({ ok: false, refused: 'box_full', revision: 6 });
    expect(events).toHaveLength(1);
    rpc.mockResolvedValueOnce({ data: { status: 'refused', code: 'stale_view', revision: 8 }, error: null });
    expect(await addCanvasDraftPoint('d1', 'canvas:problem', 't', 6, 'c')).toMatchObject({ ok: false, refused: 'stale_view' });
    off();
    expect(events).toHaveLength(2);
  });
  it('a thrown rpc error and a rejected request throw AND ask the page to re-read', async () => {
    const off = listen();
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'boom' } });
    await expect(addCanvasDraftPoint('d1', 'canvas:problem', 't', 4, 'c')).rejects.toThrow();
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(addCanvasDraftPoint('d2', 'canvas:problem', 't', 4, 'c')).rejects.toThrow('Failed to fetch');
    off();
    expect(events.map(e => e.draftId).sort()).toEqual(['d1', 'd2']);
  });
});
