import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

describe('P1614 metered rule 3: the follow-up re-read waits for a visible tab', () => {
  const setVisibility = (v: 'hidden' | 'visible') => Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
  const becomeVisible = () => { setVisibility('visible'); document.dispatchEvent(new Event('visibilitychange')); };
  afterEach(() => setVisibility('visible'));

  it('a thrown call in a hidden tab asks for no re-read until the tab is visible, then asks once', async () => {
    setVisibility('hidden');
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const off = listen();
    await expect(editCanvasDraftPoint('d1', 'p1', 'text', 4)).rejects.toThrow();
    expect(events, 'nothing while hidden').toEqual([]);
    becomeVisible();
    off();
    expect(events).toEqual([{ kind: 'updated', draftId: 'd1' }]);
  });
  it('stale_view and success are deferred the same way', async () => {
    setVisibility('hidden');
    const off = listen();
    rpc.mockResolvedValueOnce({ data: { status: 'refused', code: 'stale_view', revision: 5 }, error: null });
    expect(await editCanvasDraftPoint('d2', 'p1', 't', 4)).toMatchObject({ ok: false, refused: 'stale_view' });
    rpc.mockResolvedValueOnce({ data: { status: 'ok', changed: true, point_id: 'p2', revision: 6 }, error: null });
    await editCanvasDraftPoint('d3', 'p1', 't', 5);
    expect(events).toEqual([]);
    becomeVisible();
    off();
    expect(events.map(e => e.draftId).sort()).toEqual(['d2', 'd3']);
  });
  it('several outcomes for one draft while hidden coalesce into ONE re-read', async () => {
    setVisibility('hidden');
    const off = listen();
    rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(editCanvasDraftPoint('d4', 'p1', 'a', 4)).rejects.toThrow();
    await expect(editCanvasDraftPoint('d4', 'p1', 'b', 4)).rejects.toThrow();
    becomeVisible();
    off();
    expect(events).toEqual([{ kind: 'updated', draftId: 'd4' }]);
  });
  it('a visible tab asks at once (control)', async () => {
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const off = listen();
    await expect(editCanvasDraftPoint('d5', 'p1', 'a', 4)).rejects.toThrow();
    off();
    expect(events).toEqual([{ kind: 'updated', draftId: 'd5' }]);
  });
});

