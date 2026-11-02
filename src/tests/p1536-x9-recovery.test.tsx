/**
 * @file p1536-x9-recovery.test.tsx
 * @description P1536 3c X9 review fixes, the client's half of recovery (hook level, fake timers).
 *  - A voice run waits for its transcript: the client's lease arithmetic matches the server's (30 minutes while the transcript has not landed, 3 minutes
 *    from `readyAt` once it has), so "Updating…" does not drop at 3 minutes and the poll does not call the server's expire step in a loop.
 *  - The client's start request is a real retry: a start answered NOT_READY (the transcript was pending) is asked again with a growing pause, so a
 *    transcript that landed with its dispatch lost is begun by an open tab, and it is never hammered.
 */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const svc = vi.hoisted(() => ({ byThread: vi.fn(), latestRun: vi.fn(), lastDone: vi.fn(), startQueued: vi.fn(), state: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/app/data/canvas-draft-service', async () => ({
  ...(await vi.importActual<object>('@/app/data/canvas-draft-service')),
  getCanvasDraftByThread: svc.byThread,
  getLatestCanvasRun: svc.latestRun,
  getLastDoneCanvasDraftRunAt: svc.lastDone,
  startQueuedCanvasRun: svc.startQueued,
  getCanvasDraftState: svc.state,
}));

import { useCanvasThread } from '@/app/pages/chat/use-canvas-thread';

const T0 = new Date('2026-11-02T10:00:00.000Z');
const MIN = 60_000;
const draftRow = { id: 'draft-1', versionId: 'ver-d', canvasId: 'cv-1', baseVersionId: null, conversationId: 'c', threadRootId: 'root-1', state: 'open', runCount: 0, revision: 3, closedAt: null, canvasName: 'canvas', versionName: 'canvas_dabc123' };
const voiceRun = (over: Record<string, unknown> = {}) => ({ id: 'run-1', kind: 'message', state: 'queued', errorCode: null, createdAt: T0.toISOString(), startedAt: null, inputKind: 'voice', readyAt: null, ...over });
const settle = async (ms: number) => {
  for (let spent = 0; spent < ms; spent += 1_000) await act(async () => { await vi.advanceTimersByTimeAsync(Math.min(1_000, ms - spent)); });
};

let current: Record<string, unknown> | null;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  current = voiceRun();
  svc.byThread.mockImplementation(async () => draftRow);
  svc.latestRun.mockImplementation(async () => current);
  svc.lastDone.mockResolvedValue(null);
  svc.startQueued.mockResolvedValue({ ok: false, code: 'NOT_READY' });
  svc.state.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('a voice run waiting for its transcript (the client\'s lease matches the server\'s)', () => {
  it('is still Updating… at 10 minutes, and the server\'s expire step is not called in a loop meanwhile', async () => {
    const { result } = renderHook(() => useCanvasThread('root-1', 0));
    await settle(10 * MIN);
    expect(result.current.thread?.running, 'still going: the transcript has not landed').toBe(true);
    expect(svc.state, 'no state read for a run that is not past its own lease').not.toHaveBeenCalled();
  });

  it('past the 30-minute wait the poll reaches the server read that ends it', async () => {
    const { result } = renderHook(() => useCanvasThread('root-1', 0));
    await settle(30 * MIN + 6_000);
    expect(svc.state).toHaveBeenCalledWith('cv-1');
    expect(result.current.thread?.running).toBe(false);
  });

  it('once the transcript has landed, the lease is 3 minutes from the landing, not from the run', async () => {
    current = voiceRun({ readyAt: new Date(T0.getTime() + 20 * MIN).toISOString() });
    vi.setSystemTime(new Date(T0.getTime() + 21 * MIN));
    const { result } = renderHook(() => useCanvasThread('root-1', 0));
    await settle(2_000);
    expect(result.current.thread?.running, '21 minutes after the run, 1 after the landing: going').toBe(true);
    expect(svc.state).not.toHaveBeenCalled();
    await settle(3 * MIN);
    expect(svc.state, '4 minutes after the landing: past its lease').toHaveBeenCalledWith('cv-1');
  });

  it('CONTROL: a text run keeps its 3-minute lease from creation', async () => {
    current = voiceRun({ inputKind: 'text' });
    const { result } = renderHook(() => useCanvasThread('root-1', 0));
    await settle(3 * MIN + 6_000);
    expect(svc.state).toHaveBeenCalledWith('cv-1');
    expect(result.current.thread?.running).toBe(false);
  });
});

/** The tab's visibility, as the page reports it. */
const setVisible = (v: boolean) => {
  Object.defineProperty(document, 'visibilityState', { value: v ? 'visible' : 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};
const landed = (agoMs: number) => voiceRun({ readyAt: new Date(Date.now() - agoMs).toISOString() });

describe('the client\'s start request: only when something can start (a landed transcript whose dispatch was lost)', () => {
  beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0.5); setVisible(true); });
  afterEach(() => { vi.restoreAllMocks(); setVisible(true); });

  it('while the transcript is pending the client makes NO start call at all, for as long as the wait lasts (the poll is what notices)', async () => {
    renderHook(() => useCanvasThread('root-1', 0));
    await settle(25 * MIN);
    expect(svc.startQueued).not.toHaveBeenCalled();
  });

  it('a transcript that lands at minute 20 still recovers: a short grace after the landing, then one ask that begins the run, then nothing', async () => {
    renderHook(() => useCanvasThread('root-1', 0));
    await settle(20 * MIN);
    expect(svc.startQueued).not.toHaveBeenCalled();
    svc.startQueued.mockResolvedValue({ ok: true, runId: 'run-1', kind: 'message' });
    current = landed(0);                                                  // the transcript lands; its dispatch is lost
    await settle(6_000);
    expect(svc.startQueued, 'inside the grace the database\'s own dispatch has the floor').not.toHaveBeenCalled();
    await settle(12_000);
    expect(svc.startQueued).toHaveBeenCalledTimes(1);
    expect(svc.startQueued).toHaveBeenCalledWith('draft-1');
    current = voiceRun({ state: 'running', startedAt: new Date().toISOString(), readyAt: new Date().toISOString() });
    await settle(5 * MIN);
    expect(svc.startQueued, 'nothing more once the run is going').toHaveBeenCalledTimes(1);
  });

  it('when the dispatch works (the run is running within the grace) the client never asks', async () => {
    renderHook(() => useCanvasThread('root-1', 0));
    await settle(60_000);
    current = landed(0);
    await settle(3_000);
    current = voiceRun({ state: 'running', startedAt: new Date().toISOString(), readyAt: new Date().toISOString() });
    await settle(2 * MIN);
    expect(svc.startQueued).not.toHaveBeenCalled();
  });

  it('is bounded: a start the server keeps refusing as busy is asked 3 times at most, and the lease (3 minutes from the landing) ends the rest', async () => {
    svc.startQueued.mockResolvedValue({ ok: false, code: 'BUSY' });
    current = landed(0);
    renderHook(() => useCanvasThread('root-1', 0));
    await settle(3 * MIN);
    expect(svc.startQueued.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(svc.startQueued.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('a refusal that is not "try again" is the server\'s answer and is never asked again', async () => {
    svc.startQueued.mockResolvedValue({ ok: false, code: 'GONE' });
    current = landed(0);
    renderHook(() => useCanvasThread('root-1', 0));
    await settle(3 * MIN);
    expect(svc.startQueued).toHaveBeenCalledTimes(1);
  });

  it('a hidden tab makes zero start calls, however long the run has been stranded, and asks once (spread by jitter) when it is shown again', async () => {
    current = landed(0);
    renderHook(() => useCanvasThread('root-1', 0));
    setVisible(false);
    await settle(3 * MIN);
    expect(svc.startQueued, 'hidden: nothing, however long').not.toHaveBeenCalled();
    svc.startQueued.mockResolvedValue({ ok: true, runId: 'run-1', kind: 'message' });
    current = landed(20_000);                                             // (still inside its 3-minute lease, its ask long due)
    setVisible(true);
    await settle(1_000);
    expect(svc.startQueued, 'not in the instant the tab returns: jitter first').not.toHaveBeenCalled();
    await settle(6_000);
    expect(svc.startQueued).toHaveBeenCalledTimes(1);
  });

  it('two tabs do not fire together: the first ask of each is spread by jitter', async () => {
    const at = async (random: number) => {
      cleanup();
      vi.clearAllMocks();
      vi.setSystemTime(T0);
      current = landed(0);
      svc.startQueued.mockResolvedValue({ ok: false, code: 'GONE' });
      (Math.random as unknown as ReturnType<typeof vi.fn>).mockReturnValue(random);
      renderHook(() => useCanvasThread('root-1', 0));
      for (let t = 0; t < 40_000 && svc.startQueued.mock.calls.length === 0; t += 500) await settle(500);
      return Date.now() - T0.getTime();
    };
    const first = await at(0.05);
    const second = await at(0.95);
    expect(second - first, 'the two tabs\' first asks differ by seconds, not milliseconds').toBeGreaterThanOrEqual(3_000);
  });

  it('CONTROL: a typed run keeps what it had: one ask after the 8-second grace, and no second one', async () => {
    current = voiceRun({ inputKind: 'text', readyAt: null });
    svc.startQueued.mockResolvedValue({ ok: false, code: 'NOT_READY' });
    renderHook(() => useCanvasThread('root-1', 0));
    await settle(60_000);
    expect(svc.startQueued).toHaveBeenCalledTimes(1);
  });
});
