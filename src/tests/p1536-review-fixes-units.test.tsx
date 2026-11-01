/**
 * @file p1536-review-fixes-units.test.tsx
 * @description P1536 review fixes (2026-11-01), the hook-level and pure items. The routed items are in p1536-review-fixes.test.tsx.
 *  - 3  a queued run that never starts: it counts as active for its 3-minute lease, the client starts it once more, and the poll reaches the
 *       server's expire step so the run ends `failed` (Try again) instead of being stranded
 *  - 4  rename race: a stale answer never overwrites a newer title; a rollback restores the last CONFIRMED title
 *  - 6  the mirror card's state is never the part that truncates
 *  - 13 a remembered Clone intent does not outlive a draft that appeared meanwhile
 *  - 14 a retried Send / upload reuses its client id until its outcome is known (a lost response never doubles the message or the paid run)
 *  - 15 the Back target never passes a backslash address
 */
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';

const svc = vi.hoisted(() => ({
  send: vi.fn(),
  upload: vi.fn(),
  byThread: vi.fn(),
  latestRun: vi.fn(),
  lastDone: vi.fn(),
  startQueued: vi.fn(),
  state: vi.fn(),
  rename: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: svc.toastError, success: vi.fn() }) }));
vi.mock('@/app/data/canvas-draft-service', async () => ({
  ...(await vi.importActual<object>('@/app/data/canvas-draft-service')),
  sendCanvasWorkspaceMessage: svc.send,
  uploadCanvasMaterial: svc.upload,
  getCanvasDraftByThread: svc.byThread,
  getLatestCanvasRun: svc.latestRun,
  getLastDoneCanvasDraftRunAt: svc.lastDone,
  startQueuedCanvasRun: svc.startQueued,
  getCanvasDraftState: svc.state,
}));
vi.mock('@/app/data/canvas-service', () => ({ canvasService: { renameCanvas: svc.rename } }));

import { useCanvasThread, RUN_POLL_MS } from '@/app/pages/chat/use-canvas-thread';
import { useCanvasActions } from '@/app/pages/chat/use-canvas-actions';
import { useCanvasUploads } from '@/app/pages/chat/use-canvas-uploads';
import { useCanvasRename } from '@/app/pages/canvas/use-canvas-rename';
import { useCloneCanvas } from '@/app/pages/canvas/use-clone-canvas';
import { fromOf } from '@/app/pages/canvas/canvas-workspace-back';
import { CanvasVersionCard } from '@/app/pages/chat/CanvasVersionCard';
import { versionStateLine } from '@/app/pages/chat/canvas-thread-copy';
import { canvasRetryTrailing } from '@/app/pages/chat/canvas-retry-trailing';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  vi.clearAllMocks();
});

// ── 3: a queued run that never starts ────────────────────────────────────────────────────────────────────────────

const draftRow = { id: 'draft-1', versionId: 'ver-d', canvasId: 'cv-1', baseVersionId: null, conversationId: 'c', threadRootId: 'root-1', state: 'open', runCount: 0, revision: 3, closedAt: null, canvasName: 'canvas', versionName: 'canvas_dabc123' };
const run = (state: string, createdAt: Date, startedAt: Date | null = null) => ({ id: 'run-1', kind: 'message', state, errorCode: state === 'failed' ? 'abandoned' : null, createdAt: createdAt.toISOString(), startedAt: startedAt ? startedAt.toISOString() : null });

describe('3: a queued run that is never claimed (S2 lifecycle: active = queued within its 3-minute lease, then failed by the expire step)', () => {
  const T0 = new Date('2026-11-01T10:00:00.000Z');
  let current: Record<string, unknown> | null;
  // One second at a time, each in its own act: React renders (and sets the poll and the restart timer) between the steps, as it does for a person.
  const settle = async (ms: number) => {
    for (let spent = 0; spent < ms; spent += 1_000) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(Math.min(1_000, ms - spent));
      });
    }
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    current = run('queued', T0);
    svc.byThread.mockImplementation(async () => draftRow);
    svc.latestRun.mockImplementation(async () => current);
    svc.lastDone.mockResolvedValue(null);
    svc.startQueued.mockResolvedValue({ ok: false, code: 'FAILED' });
    // the server's read runs the expire step: a queued run past its lease becomes failed
    svc.state.mockImplementation(async () => {
      if (current?.state === 'queued' && Date.now() - Date.parse(String(current.createdAt)) >= 3 * 60_000) current = run('failed', new Date(String(current.createdAt)));
    });
  });

  it('a start that did not land is started once more, and the run still reads as going (Updating…)', async () => {
    const { result } = renderHook(() => useCanvasThread('root-1', 0));
    await settle(100);
    expect(result.current.thread?.running).toBe(true);
    await settle(9_000);
    expect(svc.startQueued).toHaveBeenCalledTimes(1);
    expect(svc.startQueued).toHaveBeenCalledWith('draft-1');
    expect(result.current.thread?.running).toBe(true);
  });

  it('it is still Updating… at 2 minutes (the start is asked for once, never in a loop), and keeps being read', async () => {
    const { result } = renderHook(() => useCanvasThread('root-1', 0));
    await settle(120_000);
    expect(result.current.thread?.running).toBe(true);
    expect(svc.startQueued).toHaveBeenCalledTimes(1);
    expect(svc.latestRun.mock.calls.length).toBeGreaterThan(10); // the poll did not stop at the grace
  });

  it('past the lease the poll reaches the server read that expires it: the run is failed, the spot is free, and Try again is offered', async () => {
    const { result } = renderHook(() => useCanvasThread('root-1', 0));
    await settle(3 * 60_000 + RUN_POLL_MS * 2);
    expect(svc.state).toHaveBeenCalledWith('cv-1');
    expect(result.current.thread?.run?.state).toBe('failed');
    expect(result.current.thread?.running).toBe(false);
    const trailing = canvasRetryTrailing(result.current.thread, { messages: [{ id: 'm1', authorId: 'u1', threadRootId: 'root-1', createdAt: '2026-11-01T09:59:00.000Z', kind: 'message', isDeleted: false }] as never, userId: 'u1', rootId: 'root-1' });
    expect(trailing?.afterId).toBe('m1');
    // and it stops polling once nothing is going
    const reads = svc.latestRun.mock.calls.length;
    await settle(RUN_POLL_MS * 5);
    expect(svc.latestRun.mock.calls.length).toBe(reads);
  });

  it('a voice note still waiting for its transcript (NOT_READY) is not a failure: the run stays going', async () => {
    svc.startQueued.mockResolvedValue({ ok: false, code: 'NOT_READY' });
    const { result } = renderHook(() => useCanvasThread('root-1', 0));
    await settle(60_000);
    expect(svc.startQueued).toHaveBeenCalledTimes(1);
    expect(result.current.thread?.running).toBe(true);
    expect(svc.toastError).not.toHaveBeenCalled();
  });

  it('CONTROL: a run that was claimed (running) is never started again and is unaffected before its own lease', async () => {
    current = run('running', T0, T0);
    const { result } = renderHook(() => useCanvasThread('root-1', 0));
    await settle(4 * 60_000);
    expect(svc.startQueued).not.toHaveBeenCalled();
    expect(svc.state).not.toHaveBeenCalled();
    expect(result.current.thread?.running).toBe(true);
  });
});

// ── 4: rename race ───────────────────────────────────────────────────────────────────────────────────────────────

const ownerReady = { isOwner: true, canvasId: 'cv-1', title: null } as unknown as CanvasReady;
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('4: rename race', () => {
  it('saves never overlap: the second goes only after the first answered, so the database ends on the newest', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    svc.rename.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useCanvasRename(ownerReady, 'canvas'));
    act(() => result.current.save('First'));
    act(() => result.current.save('Second'));
    expect(svc.rename).toHaveBeenCalledTimes(1); // the second waits, so it can never commit before the first
    expect(result.current.title).toBe('Second'); // shown at once all the same
    await act(async () => first.resolve('First'));
    expect(svc.rename).toHaveBeenCalledTimes(2);
    expect(svc.rename.mock.calls[1]![1]).toBe('Second');
    expect(result.current.title).toBe('Second'); // the first answer never shows over the newer title
    await act(async () => second.resolve('Second'));
    expect(result.current.title).toBe('Second');
  });

  it('three quick saves send the first and the newest only', async () => {
    const first = deferred<string>();
    const last = deferred<string>();
    svc.rename.mockReturnValueOnce(first.promise).mockReturnValueOnce(last.promise);
    const { result } = renderHook(() => useCanvasRename(ownerReady, 'canvas'));
    act(() => result.current.save('First'));
    act(() => result.current.save('Second'));
    act(() => result.current.save('Third'));
    await act(async () => first.resolve('First'));
    await act(async () => last.resolve('Third'));
    expect(svc.rename.mock.calls.map(c => c[1])).toEqual(['First', 'Third']);
    expect(result.current.title).toBe('Third');
  });

  it('a FAILURE of the first save neither rolls back nor toasts over the newer title, and the newer one still goes', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    svc.rename.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useCanvasRename(ownerReady, 'canvas'));
    act(() => result.current.save('First'));
    act(() => result.current.save('Second'));
    await act(async () => first.reject(new Error('refused')));
    expect(result.current.title).toBe('Second');
    expect(svc.toastError).not.toHaveBeenCalled();
    expect(svc.rename).toHaveBeenCalledTimes(2);
    await act(async () => second.resolve('Second'));
    expect(result.current.title).toBe('Second');
  });

  it('a refused second save restores the last CONFIRMED title', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    svc.rename.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useCanvasRename(ownerReady, 'canvas'));
    act(() => result.current.save('First'));
    act(() => result.current.save('Second'));
    await act(async () => first.resolve('First'));
    await act(async () => second.reject(new Error('refused')));
    expect(result.current.title).toBe('First');
    expect(svc.toastError).toHaveBeenCalledTimes(1);
  });

  it('a refused only save goes back to the title the page read', async () => {
    const only = deferred<string>();
    svc.rename.mockReturnValueOnce(only.promise);
    const { result } = renderHook(() => useCanvasRename(ownerReady, 'canvas'));
    act(() => result.current.save('First'));
    await act(async () => only.reject(new Error('refused')));
    expect(result.current.title).toBe('Canvas');
    expect(svc.toastError).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: a single save shows at once and the stored (trimmed) title replaces it', async () => {
    const only = deferred<string>();
    svc.rename.mockReturnValueOnce(only.promise);
    const { result } = renderHook(() => useCanvasRename(ownerReady, 'canvas'));
    act(() => result.current.save(' Plan '));
    expect(result.current.title).toBe(' Plan ');
    await act(async () => only.resolve('Plan'));
    expect(result.current.title).toBe('Plan');
  });
});

// ── 6: the mirror card never truncates its state ──────────────────────────────────────────────────────────────────

describe('6: the mirror card names the state first-class', () => {
  const published = { title: 'Canvas', label: 'v1 · Nov 1, 2026', state: 'published' as const, draft: false, href: '/x', openHref: '/x' };

  it('Published is in its own element that does not shrink or truncate; the date is the part that truncates', () => {
    render(<MemoryRouter><CanvasVersionCard data={published} /></MemoryRouter>);
    expect(screen.getByTestId('canvas-version-state')).toHaveTextContent('v1 · Nov 1, 2026 · Published');
    const word = screen.getByTestId('canvas-version-state-name');
    expect(word).toHaveTextContent('Published');
    expect(word.className).toContain('shrink-0');
    expect(word.className).not.toContain('truncate');
    expect(screen.getByTestId('canvas-version-state-lead').className).toContain('truncate');
  });

  it('a draft reads "v2 · Draft" (J-W5), a discarded one "Discarded draft"', () => {
    expect(versionStateLine({ state: 'draft', label: 'Draft', nextSeq: 2 })).toBe('v2 · Draft');
    expect(versionStateLine({ state: 'draft', label: 'Draft' })).toBe('Draft');
    expect(versionStateLine({ state: 'discarded', label: 'Discarded' })).toBe('Discarded draft');
    render(<MemoryRouter><CanvasVersionCard data={{ title: 'Canvas 4', label: 'Draft', nextSeq: 2, state: 'draft', draft: true, href: '/x', openHref: '/x' }} /></MemoryRouter>);
    expect(screen.getByText('Canvas 4')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-version-state')).toHaveTextContent('v2 · Draft');
    expect(screen.getByTestId('canvas-version-state-name').className).toContain('shrink-0');
  });
});

// ── 13: a remembered Clone intent ─────────────────────────────────────────────────────────────────────────────────

describe('13: a Clone intent does not outlive a draft that appeared in another tab', () => {
  const published = (draft: unknown) => ({
    isOwner: true, publishedNone: false, version: 'canvas_d111111', draft,
    versions: [{ name: 'canvas_d111111', seq: 1, draft: false, publishedAt: '2026-10-01T10:00:00Z', createdAt: '2026-10-01T10:00:00Z' }],
  }) as unknown as CanvasReady;
  const drafted = { id: 'draft-1', version: 'canvas_dabc123', baseSeq: 1, runCount: 1, revision: 2, threadRootId: 'root-1', changedBoxes: [] };

  it('the same-base draft that showed up on a re-read is no longer "pending"', async () => {
    const { result, rerender } = renderHook((p: { ready: CanvasReady }) => useCloneCanvas({
      eligible: true, active: true, ready: p.ready, setParams: vi.fn(), state: null, openDraft: vi.fn(), reload: vi.fn(),
    }), { initialProps: { ready: published(null) } });
    await waitFor(() => expect(result.current.pending).not.toBeNull());
    rerender({ ready: published(drafted) });
    await waitFor(() => expect(result.current.pending).toBeNull());
  });
});

// ── 14: a retried send reuses its client id ──────────────────────────────────────────────────────────────────────

describe('14: Send and upload keep one client id until their outcome is known', () => {
  const sent = { ok: true, runId: 'run-1', revision: 4, draftId: 'draft-1', canvasId: 'cv-1', canvasName: 'canvas', versionName: 'canvas_dabc123', threadRootId: 'root-1', conversationId: 'c', messageId: 'm1', replayed: false, start: null };
  const thread = { draft: { id: 'draft-1', canvasId: 'cv-1', revision: 3, state: 'open' }, reload: vi.fn(async () => undefined) } as never;
  const idOf = (i: number): string => (svc.send.mock.calls[i]![0] as { clientId: string }).clientId;

  it('after a lost response, sending the same text again replays the same id; after an answer, the next one is new', async () => {
    const { result } = renderHook(() => useCanvasActions({ thread, available: true }));
    svc.send.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(sent).mockResolvedValueOnce(sent);
    await act(async () => { await result.current.onSend!('shorter wording'); });
    await act(async () => { await result.current.onSend!('shorter wording'); });
    expect(idOf(1)).toBe(idOf(0));
    await act(async () => { await result.current.onSend!('shorter wording'); }); // the same words, sent on purpose after the answer
    expect(idOf(2)).not.toBe(idOf(0));
  });

  it('a different text is a different message', async () => {
    const { result } = renderHook(() => useCanvasActions({ thread, available: true }));
    svc.send.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(sent);
    await act(async () => { await result.current.onSend!('one'); });
    await act(async () => { await result.current.onSend!('two'); });
    expect(idOf(1)).not.toBe(idOf(0));
  });

  it('a file whose announcement was lost is announced again with the same id', async () => {
    const draft = { id: 'draft-1', canvasId: 'cv-1', revision: 3 };
    const { result } = renderHook(() => useCanvasUploads(draft, async () => undefined));
    svc.send.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(sent);
    svc.upload.mockResolvedValue({ ok: true, label: 'plan.pdf', chars: 10 });
    const file = new File(['x'], 'plan.pdf', { type: 'application/pdf' });
    await act(async () => { await result.current.upload(file); });
    await act(async () => { await result.current.upload(file); });
    expect(idOf(1)).toBe(idOf(0));
  });

  it('a different file with the same name and size is a new announcement, not a replay of the lost one', async () => {
    const draft = { id: 'draft-1b', canvasId: 'cv-1', revision: 3 };
    const { result } = renderHook(() => useCanvasUploads(draft, async () => undefined));
    svc.send.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(sent);
    svc.upload.mockResolvedValue({ ok: true, label: 'plan.pdf', chars: 10 });
    await act(async () => { await result.current.upload(new File(['x'], 'plan.pdf', { type: 'application/pdf', lastModified: 1000 })); });
    await act(async () => { await result.current.upload(new File(['y'], 'plan.pdf', { type: 'application/pdf', lastModified: 2000 })); });
    expect(idOf(1)).not.toBe(idOf(0));
  });
});

// ── 15: the Back target ──────────────────────────────────────────────────────────────────────────────────────────

describe('15: fromOf passes only in-app paths', () => {
  it.each([['/\\evil.com'], ['/ \\evil.com'], ['//evil.com'], ['https://evil.com'], ['evil.com'], ['/\tevil.com']])('%j is refused', (from) => {
    expect(fromOf({ from })).toBeNull();
  });
  it.each([['/p/ana/canvas/canvas?v=x'], ['/artifacts?tab=canvases'], ['/']])('CONTROL: %j is kept', (from) => {
    expect(fromOf({ from })).toBe(from);
  });
});
