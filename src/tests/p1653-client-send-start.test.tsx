/**
 * P1653: the sentences a refused START of a run says, asserted at the send call site (useCanvasActions), where the toast is raised.
 */
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { send, retry, toastError } = vi.hoisted(() => ({ send: vi.fn(), retry: vi.fn(), toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastError } }));
vi.mock('@/app/data/canvas-draft-service', () => ({ sendCanvasWorkspaceMessage: send, retryCanvasRun: retry }));
vi.mock('@/app/data/canvas-voice-service', () => ({ sendCanvasVoiceNote: vi.fn() }));

import { CanvasTapRefused } from '@/app/data/canvas-mark-tap';
import { WORDS } from '../../supabase/functions/_shared/canvas-reply-table';
import { CanvasRetry } from '@/app/pages/chat/CanvasRetry';
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
  it('a Send reads the kind of the run it just made (text), never the previous run: after a voice run the file text still shows, not the voice text', async () => {
    await sendWith('NOT_READY', 'voice'); // the PREVIOUS run was a voice note
    expect(toastError).toHaveBeenLastCalledWith('Send the file again.');
    await sendWith('NOT_READY', 'file');
    expect(toastError).toHaveBeenLastCalledWith('Send the file again.');
  });

  it.each([['voice', 'Still preparing that. It will run when it is ready.'], ['file', 'Send the file again.']])('retry call site: NOT_READY on a retried %s run says its own words', async (inputKind, said) => {
    retry.mockResolvedValueOnce({ ok: true, runId: 'r9', start: { ok: false, code: 'NOT_READY' } });
    const { unmount } = render(<CanvasRetry draft={{ id: 'd1', revision: 3 }} run={{ id: 'r1', inputKind }} reload={async () => {}} />);
    fireEvent.click(screen.getByTestId('canvas-retry-button'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(said));
    unmount();
  });

  it('retry call site: BUSY says it could not start', async () => {
    retry.mockResolvedValueOnce({ ok: true, runId: 'r9', start: { ok: false, code: 'BUSY' } });
    render(<CanvasRetry draft={{ id: 'd1', revision: 3 }} run={{ id: 'r1', inputKind: 'text' }} reload={async () => {}} />);
    fireEvent.click(screen.getByTestId('canvas-retry-button'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('I could not start that a moment ago. Try again.'));
  });
  it('a typed "Not mine" (the composer calls onSend with the body alone) is sent unmarked; only a button passes the marker', async () => {
    send.mockResolvedValue({ ok: true, runId: 'r2', start: null });
    const { result } = renderHook(() => useCanvasActions({ thread: thread(null), available: true }));
    await act(async () => { await result.current.onSend?.('Not mine'); });
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ body: 'Not mine' }));
    expect(send.mock.calls.at(-1)?.[0]).not.toHaveProperty('tap');
    await act(async () => { await result.current.onSend?.('Not mine', 'no'); });
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ body: 'Not mine', tap: 'no' }));
    await act(async () => { await result.current.onSend?.('Yes, this is my business', 'yes'); });
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ body: 'Yes, this is my business', tap: 'yes' }));
  });

  it('a tap the server refuses to mark says the stale-button sentence, reloads, and returns false (nothing ran)', async () => {
    const reload = vi.fn(async () => {});
    send.mockRejectedValueOnce(new CanvasTapRefused());
    const t = { ...thread(null), reload } as unknown as CanvasThread;
    const { result } = renderHook(() => useCanvasActions({ thread: t, available: true }));
    let ok = true;
    await act(async () => { ok = (await result.current.onSend?.('Not mine', 'no')) ?? true; });
    expect(ok).toBe(false);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith(WORDS.staleButton);
    expect(reload).toHaveBeenCalledTimes(1);
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
