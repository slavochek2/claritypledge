/**
 * P1653: the sentences a refused START of a run says, asserted at the send call site (useCanvasActions), where the toast is raised.
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { send, toastError } = vi.hoisted(() => ({ send: vi.fn(), toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastError } }));
vi.mock('@/app/data/canvas-draft-service', () => ({ sendCanvasWorkspaceMessage: send }));
vi.mock('@/app/data/canvas-voice-service', () => ({ sendCanvasVoiceNote: vi.fn() }));

import { useCanvasActions } from '@/app/pages/chat/use-canvas-actions';
import type { CanvasThread } from '@/app/pages/chat/use-canvas-thread';

const thread = (inputKind: string | null) => ({
  draft: { id: 'd1', canvasId: 'c1', revision: 3, state: 'open', conversationId: 'conv' },
  run: { id: 'r1', inputKind },
  reload: async () => {},
}) as unknown as CanvasThread;

async function sendWith(code: string, inputKind: string | null = null) {
  send.mockResolvedValueOnce({ ok: true, runId: 'r2', start: { ok: false, code } });
  const { result } = renderHook(() => useCanvasActions({ thread: thread(inputKind), available: true }));
  await act(async () => { await result.current.onSend?.('hello there'); });
}

beforeEach(() => { vi.clearAllMocks(); });

describe('P1653 refused start, at the send call site', () => {
  it('BUSY from the edge says it could not start', async () => {
    await sendWith('BUSY');
    expect(toastError).toHaveBeenCalledWith('I could not start that a moment ago. Try again.');
  });
  it('NOT_READY says the voice text for a voice run and the file text otherwise', async () => {
    await sendWith('NOT_READY', 'voice');
    expect(toastError).toHaveBeenLastCalledWith('Still preparing that. It will run when it is ready.');
    await sendWith('NOT_READY', 'file');
    expect(toastError).toHaveBeenLastCalledWith('Send the file again.');
  });
  it('a code with no sentence says nothing', async () => {
    await sendWith('GONE');
    expect(toastError).not.toHaveBeenCalled();
  });
  it('a lowercase busy refusal keeps its existing words', async () => {
    send.mockResolvedValueOnce({ ok: false, refused: 'busy', revision: 3 });
    const { result } = renderHook(() => useCanvasActions({ thread: thread(null), available: true }));
    await act(async () => { await result.current.onSend?.('hello there'); });
    expect(toastError).toHaveBeenCalledWith('A draft is already being written. It will show here when it is done.');
  });
});
