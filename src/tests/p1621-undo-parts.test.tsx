/** @vitest-environment jsdom */
/**
 * @file p1621-undo-parts.test.tsx
 * @description P1621 round 3: the Undo-off status through the PRODUCTION call site (`useCanvasParts`, which builds what the thread panel draws), not through `canvasUndoAfter` alone. The anchor
 * (the newest mirror message) used to be handed over only when Undo's read had failed, so the status could never render.
 */
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/app/data/chat-service';
import type { CanvasThread } from '@/app/pages/chat/use-canvas-thread';

const read = vi.hoisted(() => vi.fn());
vi.mock('@/app/data/canvas-draft-undo', () => ({ readCanvasUndoTarget: read, undoCanvasRun: vi.fn(), nextTargetAfterUndo: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
const paneRef = vi.hoisted(() => ({ canvas: null as unknown }));
vi.mock('@/app/pages/chat/use-canvas-pane', () => ({
  useCanvasPane: () => ({
    canvas: paneRef.canvas, canvasOn: true, uploader: { busy: false, upload: vi.fn() }, read: { status: 'ready', retry: vi.fn() },
    elsewhere: false, sending: false, onSend: vi.fn(), onVoice: undefined,
  }),
}));
vi.mock('@/app/pages/chat/use-held-send', () => ({ sendRouteOf: () => ({}), useHeldSend: () => ({ hold: vi.fn(), pending: false }), sendOfRoute: () => null }));
vi.mock('@/app/pages/chat/use-canvas-open-offers', () => ({ useOpenOfferRows: () => null, withOfferRows: (after: unknown) => after }));

import { UNDO_OFF_BY_HAND_TEXT } from '@/app/pages/chat/canvas-thread-copy';
import { useCanvasParts, type CanvasPartsArgs } from '@/app/pages/chat/use-canvas-parts';

const msg = (id: string, authorId: string, createdAt: string) => ({ id, authorId, createdAt, isDeleted: false } as unknown as ChatMessage);
const args = (): CanvasPartsArgs => ({
  canvasRoot: true, sendPlain: vi.fn(), rootId: 'root', userId: 'me', ownerSlug: 'ana', mirror: {} as never,
  messages: [msg('root', 'me', '2026-11-01'), msg('reply-1', 'mirror', '2026-11-02'), msg('reply-2', 'mirror', '2026-11-03')],
});
const thread = (): CanvasThread => ({
  draft: { id: 'd1', canvasId: 'cv', state: 'open', revision: 4, runCount: 1 } as CanvasThread['draft'],
  run: { id: 'r1', state: 'done', kind: 'message' } as CanvasThread['run'],
  running: false, lastDraftAt: null, reload: async () => undefined,
});

beforeEach(() => { vi.clearAllMocks(); paneRef.canvas = thread(); });
afterEach(cleanup);

describe('Undo off by hand, through useCanvasParts', () => {
  it('the status is placed under the newest mirror message when the server says a hand write closed Undo', async () => {
    read.mockResolvedValue({ draftId: 'd1', revision: 4, runId: null, replyMessageId: null, undoneMessageIds: [], replies: {}, triggers: {}, handClosed: true });
    const { result } = renderHook(() => useCanvasParts(args()));
    await waitFor(() => expect(Object.keys(result.current.after)).toEqual(['reply-2']));
    render(<>{result.current.after['reply-2']}</>);
    expect(screen.getByRole('status')).toHaveTextContent(UNDO_OFF_BY_HAND_TEXT);
  });

  it('CONTROLS: with a run to undo the button shows (no status); closed by no hand, nothing shows', async () => {
    read.mockResolvedValue({ draftId: 'd1', revision: 4, runId: 'r1', replyMessageId: 'reply-1', undoneMessageIds: [], replies: { r1: 'reply-1' }, triggers: {}, handClosed: false });
    const live = renderHook(() => useCanvasParts(args()));
    await waitFor(() => expect(Object.keys(live.result.current.after)).toEqual(['reply-1']));
    render(<>{live.result.current.after['reply-1']}</>);
    expect(screen.getByTestId('canvas-undo')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    cleanup();
    read.mockResolvedValue({ draftId: 'd1', revision: 4, runId: null, replyMessageId: null, undoneMessageIds: [], replies: {}, triggers: {}, handClosed: false });
    const none = renderHook(() => useCanvasParts(args()));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    await new Promise(r => setTimeout(r, 30));
    expect(none.result.current.after).toEqual({});
  });
});
