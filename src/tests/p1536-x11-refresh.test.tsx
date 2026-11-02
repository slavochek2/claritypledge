/**
 * @file p1536-x11-refresh.test.tsx
 * @description P1536 3c X11, review fix 1: what a canvas thread root's "N replies" link (and its card) knows is refreshed on a REAL signal, never by polling:
 *  - the same-tab canvas event for THIS draft ('published' / 'discarded'; 'updated' and another draft's events say nothing)
 *  - the tab becoming visible again (a draft published or discarded in another tab)
 *  - a new reply arriving in the thread (the Publish reply is one), but never while the tab is hidden (metered-services rule 3: a hidden tab makes no requests)
 * and the click is safe on its own: it reads the CURRENT state at tap, so a stale link cannot land wrong; a tap read that stalls falls back to what is known.
 * A read that stalls or is refused leaves no link; a later signal reads again. A failed re-read keeps what was known.
 */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasRootThread } from '@/app/data/canvas-draft-service';

const svc = vi.hoisted(() => ({ getCanvasRootThread: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), ...svc }));

import { emitCanvasDraftEvent } from '@/app/data/canvas-draft-events';
import { TAP_READ_MAX_MS, useCanvasRootThread } from '@/app/pages/chat/use-canvas-root-thread';

const WS = '/p/test-user/canvas/canvas_4?v=canvas_dd2&ws=1';
const open: CanvasRootThread = { state: 'open', draftId: 'd-1', openHref: WS };
const published: CanvasRootThread = { state: 'published', draftId: 'd-1', openHref: null };

function setVisibility(v: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}
const mount = (key = 2) => renderHook(({ k }: { k: number }) => useCanvasRootThread('root-1', 'me', k), { initialProps: { k: key } });

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  svc.getCanvasRootThread.mockResolvedValue(open);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the read, and what a refused or stalled one leaves', () => {
  it('reads once on mount (the request cost of a link at rest: one read, no timer)', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.thread).toEqual(open));
    expect(svc.getCanvasRootThread).toHaveBeenCalledTimes(1);
    expect(svc.getCanvasRootThread).toHaveBeenCalledWith('root-1', 'me');
  });

  it('a refused first read leaves no link; the next signal reads again and the link comes', async () => {
    svc.getCanvasRootThread.mockRejectedValueOnce(new Error('offline'));
    const { result } = mount();
    await waitFor(() => expect(svc.getCanvasRootThread).toHaveBeenCalledTimes(1));
    expect(result.current.thread).toBeNull();
    act(() => setVisibility('visible'));
    await waitFor(() => expect(result.current.thread).toEqual(open));
  });

  it('a first read that never answers leaves no link and is not the thing a later signal waits on', async () => {
    svc.getCanvasRootThread.mockImplementationOnce(() => new Promise(() => undefined));
    const { result } = mount();
    expect(result.current.thread).toBeNull();
    act(() => setVisibility('visible'));
    await waitFor(() => expect(result.current.thread).toEqual(open));
  });

  it('a refused RE-read keeps what was known', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.thread).toEqual(open));
    svc.getCanvasRootThread.mockRejectedValueOnce(new Error('offline'));
    act(() => setVisibility('visible'));
    await waitFor(() => expect(svc.getCanvasRootThread).toHaveBeenCalledTimes(2));
    expect(result.current.thread).toEqual(open);
  });

  it('an older read that answers after a newer one does not replace it', async () => {
    let late: (t: CanvasRootThread) => void = () => undefined;
    svc.getCanvasRootThread.mockImplementationOnce(() => new Promise<CanvasRootThread>((r) => { late = r; }));
    const { result } = mount();
    svc.getCanvasRootThread.mockResolvedValueOnce(published);
    act(() => setVisibility('visible'));
    await waitFor(() => expect(result.current.thread).toEqual(published));
    await act(async () => late(open));
    expect(result.current.thread).toEqual(published);
  });
});

describe('item 1: the link learns that the thread was published or discarded elsewhere', () => {
  it('open card, thread published elsewhere: the tab coming back reads published', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.thread).toEqual(open));
    svc.getCanvasRootThread.mockResolvedValue(published);
    act(() => setVisibility('visible'));
    await waitFor(() => expect(result.current.thread).toEqual(published));
  });

  it('the same-tab event for THIS draft reads again; another draft\'s event and an "updated" do not', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.thread).toEqual(open));
    svc.getCanvasRootThread.mockResolvedValue(published);
    act(() => emitCanvasDraftEvent({ kind: 'published', draftId: 'another-draft' }));
    act(() => emitCanvasDraftEvent({ kind: 'updated', draftId: 'd-1' }));
    await act(async () => {});
    expect(svc.getCanvasRootThread).toHaveBeenCalledTimes(1);
    act(() => emitCanvasDraftEvent({ kind: 'published', draftId: 'd-1' }));
    await waitFor(() => expect(result.current.thread).toEqual(published));
    // now closed: it has nothing more to learn (a closed draft never changes), so a later event reads nothing
    act(() => emitCanvasDraftEvent({ kind: 'discarded', draftId: 'd-1' }));
    await act(async () => {});
    expect(svc.getCanvasRootThread).toHaveBeenCalledTimes(2);
  });

  it('a new reply arriving (the Publish reply is one) reads again; the first value of the key is not a change', async () => {
    const { result, rerender } = mount(2);
    await waitFor(() => expect(result.current.thread).toEqual(open));
    expect(svc.getCanvasRootThread).toHaveBeenCalledTimes(1);
    svc.getCanvasRootThread.mockResolvedValue(published);
    rerender({ k: 3 });
    await waitFor(() => expect(result.current.thread).toEqual(published));
    expect(svc.getCanvasRootThread).toHaveBeenCalledTimes(2);
  });

  it('a hidden tab makes no request (rule 3): a reply arriving while hidden waits for the tab to come back, and then reads once', async () => {
    const { result, rerender } = mount(2);
    await waitFor(() => expect(result.current.thread).toEqual(open));
    act(() => setVisibility('hidden'));
    svc.getCanvasRootThread.mockResolvedValue(published);
    rerender({ k: 3 });
    act(() => emitCanvasDraftEvent({ kind: 'published', draftId: 'd-1' }));
    await act(async () => {});
    expect(svc.getCanvasRootThread).toHaveBeenCalledTimes(1);
    act(() => setVisibility('visible'));
    await waitFor(() => expect(result.current.thread).toEqual(published));
    expect(svc.getCanvasRootThread).toHaveBeenCalledTimes(2);
  });

  it('a CLOSED draft never changes again: a link that read published listens for nothing (no request on tab return, event or reply)', async () => {
    svc.getCanvasRootThread.mockResolvedValue(published);
    const { result, rerender } = mount(2);
    await waitFor(() => expect(result.current.thread).toEqual(published));
    act(() => setVisibility('visible'));
    act(() => emitCanvasDraftEvent({ kind: 'discarded', draftId: 'd-1' }));
    rerender({ k: 3 });
    await act(async () => {});
    expect(svc.getCanvasRootThread).toHaveBeenCalledTimes(1);
  });

  it('no polling: time passing makes no request', async () => {
    vi.useFakeTimers();
    mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000); });
    expect(svc.getCanvasRootThread).toHaveBeenCalledTimes(1);
  });
});

describe('the click reads the CURRENT state at tap', () => {
  it('a stale open link, a draft published meanwhile and no signal seen yet: the tap answers published', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.thread).toEqual(open));
    svc.getCanvasRootThread.mockResolvedValue(published);
    let now: CanvasRootThread | null = null;
    await act(async () => { now = await result.current.resolveNow(); });
    expect(now).toEqual(published);
    expect(result.current.thread).toEqual(published); // and what is drawn catches up
  });

  it('a tap whose read is refused falls back to what is known', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.thread).toEqual(open));
    svc.getCanvasRootThread.mockRejectedValue(new Error('offline'));
    let now: CanvasRootThread | null = null;
    await act(async () => { now = await result.current.resolveNow(); });
    expect(now).toEqual(open);
  });

  it('a tap whose read stalls ends at its deadline and falls back to what is known', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.thread).toEqual(open));
    vi.useFakeTimers();
    svc.getCanvasRootThread.mockImplementation(() => new Promise(() => undefined));
    let now: CanvasRootThread | null | undefined;
    const tap = result.current.resolveNow().then((t) => { now = t; });
    expect(now).toBeUndefined();
    await act(async () => { await vi.advanceTimersByTimeAsync(TAP_READ_MAX_MS + 1); });
    await tap;
    expect(now).toEqual(open);
  });
});
