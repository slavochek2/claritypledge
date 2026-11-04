import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock('@/lib/list-return-cache', () => ({ clearListReturnCache: vi.fn() }));
vi.mock('@/app/data/db-error-logger', () => ({ throwDbError: (_c: string, e: { message?: string }, m: string) => { throw new Error(`${m}: ${e?.message}`); } }));

import { editCanvasDraftPoint } from '@/app/data/canvas-draft-edit-call';
import { subscribeCanvasDraftEvents, type CanvasDraftEvent } from '@/app/data/canvas-draft-events';

const events: CanvasDraftEvent[] = [];
beforeEach(() => { rpc.mockReset(); events.length = 0; });
const listen = () => subscribeCanvasDraftEvents(e => events.push(e));

describe('P1614 editCanvasDraftPoint re-reads the canvas after every outcome that may have written', () => {
  it('a thrown rpc error (a lost answer) throws AND asks the page to re-read, as stale_view does', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'boom' } });
    const off = listen();
    await expect(editCanvasDraftPoint('d1', 'p1', 'text', 4)).rejects.toThrow();
    off();
    expect(events).toEqual([{ kind: 'updated', draftId: 'd1' }]);
  });
  it('a rejected request (network down) does the same', async () => {
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const off = listen();
    await expect(editCanvasDraftPoint('d1', 'p1', 'text', 4)).rejects.toThrow('Failed to fetch');
    off();
    expect(events).toEqual([{ kind: 'updated', draftId: 'd1' }]);
  });
  it('controls: stale_view and success each ask once; busy asks for nothing', async () => {
    const off = listen();
    rpc.mockResolvedValueOnce({ data: { status: 'refused', code: 'stale_view', revision: 5 }, error: null });
    expect(await editCanvasDraftPoint('d1', 'p1', 't', 4)).toMatchObject({ ok: false, refused: 'stale_view' });
    expect(events).toHaveLength(1);
    rpc.mockResolvedValueOnce({ data: { status: 'ok', changed: true, point_id: 'p2', revision: 6 }, error: null });
    expect(await editCanvasDraftPoint('d1', 'p1', 't', 5)).toMatchObject({ ok: true, pointId: 'p2' });
    expect(events).toHaveLength(2);
    rpc.mockResolvedValueOnce({ data: { status: 'refused', code: 'busy', revision: 6 }, error: null });
    expect(await editCanvasDraftPoint('d1', 'p1', 't', 6)).toMatchObject({ ok: false, refused: 'busy' });
    off();
    expect(events, 'busy changed nothing, so no re-read').toHaveLength(2);
  });
});
