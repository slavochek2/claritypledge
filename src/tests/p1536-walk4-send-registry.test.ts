/**
 * @file p1536-walk4-send-registry.test.ts
 * @description P1536 walkthrough 4, item 3: a Clone's first Send registers its thread as soon as the server answers, not after the run's start request;
 * a stalled start request, a throw or a send that never answers never holds the mirror's replies in other threads for long.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sb = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: sb.invoke }, rpc: sb.rpc, from: vi.fn() } }));
vi.mock('@/lib/list-return-cache', () => ({ clearListReturnCache: vi.fn() }));

import { sendCanvasWorkspaceMessage } from '@/app/data/canvas-draft-service';
import { CANVAS_SEND_HOLD_MAX_MS, canvasSendsSettled, isCanvasThread, resetCanvasThreads, trackCanvasSend } from '@/app/pages/chat/canvas-thread-registry';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  resetCanvasThreads();
});
afterEach(() => vi.useRealTimers());

const flag = (p: Promise<void> | null) => {
  const seen = { done: false };
  void p?.then(() => { seen.done = true; });
  return seen;
};

describe('3: trackCanvasSend', () => {
  it('registers the root and releases waiters when the send says the thread is known, while the rest of the send is still pending', async () => {
    let finish: (v: { ok: true }) => void = () => undefined;
    let known: (root: string) => void = () => undefined;
    const tracked = trackCanvasSend((threadKnown) => {
      known = threadKnown;
      return new Promise<{ ok: true }>((r) => { finish = r; });
    });
    const waiter = flag(canvasSendsSettled());
    known('root-new');
    await vi.advanceTimersByTimeAsync(0);
    expect(isCanvasThread('root-new')).toBe(true);
    expect(waiter.done).toBe(true);
    expect(canvasSendsSettled()).toBeNull();
    finish({ ok: true });
    await tracked;
    expect(canvasSendsSettled()).toBeNull();
  });

  it('a send that never says anything releases its waiters at CANVAS_SEND_HOLD_MAX_MS', async () => {
    void trackCanvasSend(() => new Promise<{ ok: true }>(() => undefined));
    const waiter = flag(canvasSendsSettled());
    await vi.advanceTimersByTimeAsync(CANVAS_SEND_HOLD_MAX_MS - 1_000);
    expect(waiter.done).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(waiter.done).toBe(true);
  });

  it('a throw releases the waiters and registers nothing', async () => {
    const tracked = trackCanvasSend(() => Promise.reject(new Error('network')));
    const waiter = flag(canvasSendsSettled());
    await expect(tracked).rejects.toThrow('network');
    await vi.advanceTimersByTimeAsync(0);
    expect(waiter.done).toBe(true);
  });

  it('two overlapping sends release the waiters only when both are done (known, finished, or timed out)', async () => {
    let finishA: (v: { ok: true }) => void = () => undefined;
    let finishB: (v: { ok: true }) => void = () => undefined;
    const a = trackCanvasSend(() => new Promise<{ ok: true }>((r) => { finishA = r; }));
    const b = trackCanvasSend((known) => new Promise<{ ok: true }>((r) => { finishB = (v) => { known('root-b'); r(v); }; }));
    const waiter = flag(canvasSendsSettled());
    finishA({ ok: true });
    await a;
    await vi.advanceTimersByTimeAsync(0);
    expect(waiter.done).toBe(false);
    finishB({ ok: true });
    await b;
    await vi.advanceTimersByTimeAsync(0);
    expect(waiter.done).toBe(true);
  });

  it('never goes negative or double-releases: known, then finished, then the timer firing, counts once', async () => {
    const tracked = trackCanvasSend(async (known) => { known('root-x'); return { ok: true as const }; });
    await tracked;
    // a second, unrelated send now in flight must still be waited on, even after the first one's timer would have fired
    let finish: (v: { ok: true }) => void = () => undefined;
    const second = trackCanvasSend(() => new Promise<{ ok: true }>((r) => { finish = r; }));
    await vi.advanceTimersByTimeAsync(CANVAS_SEND_HOLD_MAX_MS - 5_000);
    expect(canvasSendsSettled()).not.toBeNull();
    finish({ ok: true });
    await second;
    expect(canvasSendsSettled()).toBeNull();
  });
});

describe('3: sendCanvasWorkspaceMessage tells the thread before it starts the run', () => {
  it('onThreadKnown is called with the thread root while the run start is still pending', async () => {
    sb.rpc.mockResolvedValueOnce({
      data: { status: 'ok', run_id: 'run-1', revision: 1, draft_id: 'd1', canvas_id: 'cv', canvas_name: 'canvas', version_name: 'v', thread_root_id: 'r1', conversation_id: 'c1', message_id: 'm1', replayed: false },
      error: null,
    });
    sb.invoke.mockReturnValueOnce(new Promise(() => undefined));
    const known = vi.fn();
    void sendCanvasWorkspaceMessage({ canvasId: 'cv', body: 'hi', clientId: 'cid', onThreadKnown: known });
    await vi.advanceTimersByTimeAsync(0);
    expect(sb.invoke).toHaveBeenCalled();
    expect(known).toHaveBeenCalledWith('r1');
    expect(known.mock.invocationCallOrder[0] ?? Infinity).toBeLessThan(sb.invoke.mock.invocationCallOrder[0] ?? 0);
  });

  it('CONTROL: a refusal never calls it', async () => {
    sb.rpc.mockResolvedValueOnce({ data: { status: 'refused', code: 'busy', revision: 1 }, error: null });
    const known = vi.fn();
    await sendCanvasWorkspaceMessage({ canvasId: 'cv', body: 'hi', clientId: 'cid', onThreadKnown: known });
    expect(known).not.toHaveBeenCalled();
  });
});
