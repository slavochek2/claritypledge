/** @vitest-environment jsdom */
/**
 * @file p1621-undo-hand-close.test.tsx
 * @description P1621 round 3: a hand save, Edit or Remove closes Undo (it deletes the draft's undo steps). The founder's report: Undo tapped after that, the button vanished, nothing was undone and only
 * a brief toast said anything. Now the Undo spot says "Undo is off because you edited by hand." (the server says so: `handClosed`), promptly after the hand write (the hand write's own re-read event
 * makes the thread re-read once; no polling), under the newest reply, as a status.
 */
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/app/data/chat-service';
import type { CanvasThread } from '@/app/pages/chat/use-canvas-thread';

const read = vi.hoisted(() => vi.fn());
const undo = vi.hoisted(() => vi.fn());
vi.mock('@/app/data/canvas-draft-undo', () => ({ readCanvasUndoTarget: read, undoCanvasRun: undo, nextTargetAfterUndo: vi.fn() }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: toastError }) }));

import { emitCanvasDraftEvent } from '@/app/data/canvas-draft-events';
import { canvasUndoAfter, newestMirrorMessageId } from '@/app/pages/chat/canvas-undo-after';
import { UNDO_OFF_BY_HAND_TEXT } from '@/app/pages/chat/canvas-thread-copy';
import { useCanvasUndo } from '@/app/pages/chat/use-canvas-undo';

const thread = (revision: number, reload = vi.fn(async () => undefined)): CanvasThread => ({
  draft: { id: 'd1', canvasId: 'cv', state: 'open', revision, runCount: 1 } as CanvasThread['draft'],
  run: { id: 'r1', state: 'done', kind: 'message' } as CanvasThread['run'],
  running: false, lastDraftAt: null, reload,
});
const live = (revision: number) => ({ draftId: 'd1', revision, runId: 'r1', replyMessageId: 'reply-1', undoneMessageIds: [], replies: { r1: 'reply-1' }, triggers: {}, handClosed: false });
const closedByHand = (revision: number) => ({ draftId: 'd1', revision, runId: null, replyMessageId: null, undoneMessageIds: [], replies: { r1: 'reply-1' }, triggers: {}, handClosed: true });

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe('the founder\'s report', () => {
  it('Undo tapped after a hand write closed it: nothing is undone, the button goes, and the spot now says why', async () => {
    read.mockResolvedValueOnce(live(3));
    undo.mockResolvedValue({ ok: false, refused: 'stale_view', revision: 4 });
    const { result } = renderHook(() => useCanvasUndo(thread(3)));
    await waitFor(() => expect(result.current.replyId).toBe('reply-1'));
    read.mockResolvedValue(closedByHand(4));   // the re-read the refusal asks for
    await act(async () => { result.current.undo(); });
    await waitFor(() => expect(result.current.replyId).toBeNull());
    expect(toastError).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.handClosed).toBe(true));
  });
});

describe('promptly, with no tap and no polling', () => {
  it('the hand write\'s re-read event makes the thread re-read once; the revision it brings makes the one Undo read, which says the button is off', async () => {
    read.mockImplementation(async (_c: string, _d: string) => live(3));
    const reload = vi.fn(async () => undefined);
    const { result, rerender } = renderHook(({ t }) => useCanvasUndo(t), { initialProps: { t: thread(3, reload) } });
    await waitFor(() => expect(result.current.replyId).toBe('reply-1'));
    expect(read).toHaveBeenCalledTimes(1);
    act(() => emitCanvasDraftEvent({ kind: 'updated', draftId: 'd1' }));   // what a hand save, Edit or Remove emits
    expect(reload).toHaveBeenCalledTimes(1);
    expect(read, 'the thread has not re-read yet: no second Undo read from the event itself').toHaveBeenCalledTimes(1);
    read.mockResolvedValue(closedByHand(4));
    rerender({ t: thread(4, reload) });   // the thread's re-read landed: the draft is at revision 4
    await waitFor(() => expect(result.current.handClosed).toBe(true));
    expect(result.current.replyId).toBeNull();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('an event for another draft, or a published or discarded one, makes no re-read', async () => {
    read.mockResolvedValue(live(3));
    const reload = vi.fn(async () => undefined);
    const { result } = renderHook(() => useCanvasUndo(thread(3, reload)));
    await waitFor(() => expect(result.current.replyId).toBe('reply-1'));
    act(() => { emitCanvasDraftEvent({ kind: 'updated', draftId: 'other' }); emitCanvasDraftEvent({ kind: 'published', draftId: 'd1' }); });
    expect(reload).not.toHaveBeenCalled();
  });

  it('after unmount an event re-reads nothing', async () => {
    read.mockResolvedValue(live(3));
    const reload = vi.fn(async () => undefined);
    const { result, unmount } = renderHook(() => useCanvasUndo(thread(3, reload)));
    await waitFor(() => expect(result.current.replyId).toBe('reply-1'));
    unmount();
    emitCanvasDraftEvent({ kind: 'updated', draftId: 'd1' });
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('review round 3: a hidden tab reads nothing', () => {
  const setVisibility = (state: 'hidden' | 'visible') => {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  afterEach(() => setVisibility('visible'));

  it('writes made while the tab is hidden re-read once, when it comes back; none while hidden', async () => {
    read.mockResolvedValue(live(3));
    const reload = vi.fn(async () => undefined);
    const { result } = renderHook(() => useCanvasUndo(thread(3, reload)));
    await waitFor(() => expect(result.current.replyId).toBe('reply-1'));
    setVisibility('hidden');
    act(() => { for (let i = 0; i < 3; i++) emitCanvasDraftEvent({ kind: 'updated', draftId: 'd1' }); });
    expect(reload).not.toHaveBeenCalled();
    act(() => setVisibility('visible'));
    expect(reload).toHaveBeenCalledTimes(1);
    act(() => setVisibility('visible'));
    expect(reload, 'nothing pending any more').toHaveBeenCalledTimes(1);
  });
});

describe('the Undo spot', () => {
  const msg = (id: string, authorId: string, createdAt: string) => ({ id, authorId, createdAt, isDeleted: false } as unknown as ChatMessage);
  const view = (over: Record<string, unknown>) => ({ replyId: null, waiting: false, busy: false, undo: () => undefined, undoneIds: [], failed: false, retry: () => undefined, handClosed: false, ...over }) as never;

  it('says the sentence as a status under the newest mirror message when Undo was closed by hand', () => {
    const messages = [msg('root', 'me', '2026-11-01'), msg('reply-1', 'mirror', '2026-11-02'), msg('reply-2', 'mirror', '2026-11-03')];
    const afterId = newestMirrorMessageId(messages, 'me', 'root');
    const out = canvasUndoAfter(view({ handClosed: true }), afterId);
    expect(Object.keys(out)).toEqual(['reply-2']);
    render(<>{out['reply-2']}</>);
    expect(screen.getByRole('status')).toHaveTextContent(UNDO_OFF_BY_HAND_TEXT);
    expect(UNDO_OFF_BY_HAND_TEXT).toBe('Undo is off because you edited by hand.');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says nothing while Undo has a run to undo (the button shows), and nothing when it was not closed by hand', () => {
    expect(canvasUndoAfter(view({ replyId: 'reply-1', handClosed: true }), 'reply-2')['reply-2']).toBeUndefined();
    expect(canvasUndoAfter(view({ handClosed: false }), 'reply-2')['reply-2']).toBeUndefined();
  });
});
