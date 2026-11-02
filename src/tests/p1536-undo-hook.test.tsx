/**
 * @file p1536-undo-hook.test.tsx
 * @description P1536 D7 review: `useCanvasUndo` keeps what it has read PER DRAFT. The mounted thread panel can switch from draft A to draft B while a run on B is going; B has not been read,
 * so it gets its one cold read (without it there is no "Undo waits" status), and A's target is never shown for B.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasThread } from '@/app/pages/chat/use-canvas-thread';

const read = vi.hoisted(() => vi.fn());
vi.mock('@/app/data/canvas-draft-undo', () => ({ readCanvasUndoTarget: read, undoCanvasRun: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

import { useCanvasUndo } from '@/app/pages/chat/use-canvas-undo';

const thread = (draftId: string, canvasId: string, runState: string, running: boolean, state = 'open'): CanvasThread => ({
  draft: { id: draftId, canvasId, state, revision: 3, runCount: 1 } as CanvasThread['draft'],
  run: { id: `run-${draftId}`, state: runState, kind: 'message' } as CanvasThread['run'],
  running, lastDraftAt: null, reload: async () => undefined,
});
const target = (draftId: string, replyMessageId: string) => ({ draftId, revision: 3, runId: `run-${draftId}`, replyMessageId, undoneMessageIds: [], replies: {}, triggers: {} });

beforeEach(() => {
  vi.clearAllMocks();
  read.mockImplementation(async (_canvas: string, draftId: string) => target(draftId, `reply-${draftId}`));
});

describe('D7 review: "have read" is per draft', () => {
  it('draft A settled and read; the panel switches to draft B with a run going: B is read once (cold), its status shows under B\'s reply, A\'s reply is not used', async () => {
    const { result, rerender } = renderHook(({ t }) => useCanvasUndo(t), { initialProps: { t: thread('draft-a', 'cv-a', 'done', false) } });
    await waitFor(() => expect(result.current.replyId).toBe('reply-draft-a'));
    expect(read).toHaveBeenCalledTimes(1);
    rerender({ t: thread('draft-b', 'cv-b', 'running', true) });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(read).toHaveBeenLastCalledWith('cv-b', 'draft-b');
    await waitFor(() => expect(result.current.replyId).toBe('reply-draft-b'));
    expect(result.current.waiting).toBe(true);
  });
});

describe('J6 review: a CLOSED draft\'s thread reads its undone marks once, when it is opened', () => {
  const closedTarget = (draftId: string) => ({ draftId, revision: 0, runId: null, replyMessageId: null, undoneMessageIds: ['m-1'], replies: {}, triggers: {} });

  it.each(['published', 'discarded'])('%s: one read on open, the marks show, no Undo and no waiting; re-rendering the same thread reads nothing more', async state => {
    read.mockImplementation(async (_c: string, draftId: string) => closedTarget(draftId));
    const t = thread('draft-a', 'cv-a', 'done', false, state);
    const { result, rerender } = renderHook(({ th }) => useCanvasUndo(th), { initialProps: { th: t } });
    await waitFor(() => expect(result.current.undoneIds).toEqual(['m-1']));
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith('cv-a', 'draft-a');
    expect(result.current.replyId).toBeNull();
    expect(result.current.waiting).toBe(false);
    rerender({ th: { ...t } });
    rerender({ th: thread('draft-a', 'cv-a', 'done', false, state) });
    await new Promise(r => setTimeout(r, 50));
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('a failed read of a closed thread is not a visible "Undo did not load." (there is no Undo to retry); the marks simply stay absent', async () => {
    read.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useCanvasUndo(thread('draft-a', 'cv-a', 'done', false, 'published')));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    await new Promise(r => setTimeout(r, 50));
    expect(result.current.failed).toBe(false);
    expect(result.current.undoneIds).toEqual([]);
  });
});
