/**
 * @file p1536-walk4-first-read.test.tsx
 * @description P1536 walkthrough 4, item 2: a first draft read that never answers ends as a failed read (Retry), so the Publish spot and the send slot
 * do not wait for it forever; a late answer still replaces the error, and Retry starts the wait again.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasDraft } from '@/app/data/canvas-draft-service';

const svc = vi.hoisted(() => ({
  getCanvasDraftByThread: vi.fn(),
  getLatestCanvasRun: vi.fn(),
  getCanvasDraftState: vi.fn(),
  getLastDoneCanvasDraftRunAt: vi.fn(),
  startQueuedCanvasRun: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), ...svc }));

import { FIRST_READ_MAX_MS, useCanvasThread } from '@/app/pages/chat/use-canvas-thread';
import { sendSlotOf } from '@/app/pages/chat/canvas-send-slot';

const draft = (): CanvasDraft => ({
  id: 'draft-1', versionId: 'v', canvasId: 'cv-1', baseVersionId: null, conversationId: 'c', threadRootId: 'root-1',
  state: 'open', runCount: 0, revision: 1, closedAt: null, canvasName: null, versionName: null,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  svc.getLatestCanvasRun.mockResolvedValue(null);
  svc.getLastDoneCanvasDraftRunAt.mockResolvedValue(null);
});
afterEach(() => vi.useRealTimers());

describe('2: a stalled first read ends', () => {
  it('after FIRST_READ_MAX_MS the status is error and a held send slot is no longer active; a late answer then gives ready', async () => {
    let answer: (d: CanvasDraft) => void = () => undefined;
    svc.getCanvasDraftByThread.mockReturnValue(new Promise<CanvasDraft>((r) => { answer = r; }));
    const { result } = renderHook(() => useCanvasThread('root-1', 0));
    await act(async () => {});
    expect(result.current.status).toBe('loading');
    expect(sendSlotOf({ live: null, uploading: false, elsewhere: false, holdFirstRead: true, readStatus: result.current.status }).active).toBe(true);

    await act(async () => { vi.advanceTimersByTime(FIRST_READ_MAX_MS + 1); });
    expect(result.current.status).toBe('error');
    expect(sendSlotOf({ live: null, uploading: false, elsewhere: false, holdFirstRead: true, readStatus: result.current.status }).active).toBe(false);

    await act(async () => { answer(draft()); });
    expect(result.current.status).toBe('ready');
  });

  it('CONTROL: an answer inside the window never shows an error', async () => {
    svc.getCanvasDraftByThread.mockResolvedValue(draft());
    const { result } = renderHook(() => useCanvasThread('root-1', 0));
    await act(async () => {});
    expect(result.current.status).toBe('ready');
    await act(async () => { vi.advanceTimersByTime(FIRST_READ_MAX_MS * 2); });
    expect(result.current.status).toBe('ready');
  });

  it('Retry starts the wait again: a second stall ends after another FIRST_READ_MAX_MS', async () => {
    svc.getCanvasDraftByThread.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useCanvasThread('root-1', 0));
    await act(async () => { vi.advanceTimersByTime(FIRST_READ_MAX_MS + 1); });
    expect(result.current.status).toBe('error');
    act(() => result.current.retry());
    expect(result.current.status).toBe('loading');
    await act(async () => { vi.advanceTimersByTime(FIRST_READ_MAX_MS - 1_000); });
    expect(result.current.status).toBe('loading');
    await act(async () => { vi.advanceTimersByTime(2_000); });
    expect(result.current.status).toBe('error');
  });
});
