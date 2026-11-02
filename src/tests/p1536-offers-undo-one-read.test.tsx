/**
 * @file p1536-offers-undo-one-read.test.tsx
 * @description P1536 S5 review (metered reads): the offer rows and Undo are asked in the same moment and the state read joins their asks into ONE request per signal
 * (canvas-draft-state-read). The tab coming back is a signal. Counted at the database boundary (`get_canvas_draft_state`), with the REAL hooks and data modules:
 *  - the tab returning, nothing else changed: ONE request (the offers' ask used to be sent a render later than Undo's, so it was a second request)
 *  - the tab returning in the same moment the draft's key changed: ONE request
 *  - a hidden tab asks nothing; the first signal after it asks once, and each hook ASKS once per signal (not twice: the second ask used to depend on a re-render landing in time to join)
 */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasThread } from '@/app/pages/chat/use-canvas-thread';

const rpc = vi.hoisted(() => vi.fn());
const asks = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));
// every ASK (a hook wanting the state), counted apart from the REQUESTS (what reaches the database)
vi.mock('@/app/data/canvas-draft-state-read', async () => {
  const actual = await vi.importActual<typeof import('@/app/data/canvas-draft-state-read')>('@/app/data/canvas-draft-state-read');
  return { ...actual, readCanvasDraftState: (canvasId: string) => { asks(); return actual.readCanvasDraftState(canvasId); } };
});
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

import { useCanvasOffers, openOffersKey } from '@/app/pages/chat/use-canvas-offers';
import { useCanvasUndo } from '@/app/pages/chat/use-canvas-undo';

const thread = (revision: number): CanvasThread => ({
  draft: { id: 'draft-1', canvasId: 'cv-1', state: 'open', revision, runCount: 1 } as CanvasThread['draft'],
  run: { id: `run-${revision}`, state: 'done', kind: 'message' } as CanvasThread['run'],
  running: false, lastDraftAt: null, reload: async () => undefined,
});
const answer = (revision: number) => ({ data: { draft: { id: 'draft-1', revision, runs: [], offers: [], undo_run_id: null }, closed_drafts: [] }, error: null });
const reads = () => rpc.mock.calls.filter(c => c[0] === 'get_canvas_draft_state').length;

function useBoth(t: CanvasThread) {
  const offers = useCanvasOffers({ canvasId: t.draft.canvasId, draftId: t.draft.id, key: openOffersKey(t) });
  useCanvasUndo(t);
  return offers;
}
let vis: ReturnType<typeof vi.spyOn>;
const setVisible = async (v: 'visible' | 'hidden') => { vis.mockReturnValue(v); await act(async () => { document.dispatchEvent(new Event('visibilitychange')); }); };

beforeEach(() => {
  vi.clearAllMocks();
  vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  rpc.mockImplementation(async () => answer(3));
});
afterEach(() => { cleanup(); vis.mockRestore(); });

describe('one request per signal, offers and Undo together', () => {
  it('the first read: one request for both', async () => {
    renderHook(({ t }) => useBoth(t), { initialProps: { t: thread(3) } });
    await act(async () => {});
    expect(reads()).toBe(1);
  });

  it('the tab hidden and back, nothing else changed: exactly ONE more request', async () => {
    renderHook(({ t }) => useBoth(t), { initialProps: { t: thread(3) } });
    await act(async () => {});
    expect(reads()).toBe(1);
    await setVisible('hidden');
    expect(reads()).toBe(1); // hidden asks nothing
    await setVisible('visible');
    await act(async () => {});
    expect(reads()).toBe(2);
  });

  it('the tab coming back in the same moment the draft moved on: still ONE more request', async () => {
    const h = renderHook(({ t }) => useBoth(t), { initialProps: { t: thread(3) } });
    await act(async () => {});
    await setVisible('hidden');
    h.rerender({ t: thread(4) }); // changed while hidden: nothing is asked
    await act(async () => {});
    expect(reads()).toBe(1);
    await setVisible('visible');
    await act(async () => {});
    expect(reads()).toBe(2);
    expect(asks).toHaveBeenCalledTimes(4); // Undo and the offers asked once each at the start, once each on the return: no extra ask from either
  });
});
