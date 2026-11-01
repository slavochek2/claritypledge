/**
 * @file p1536-walk5-held-send-backstop.test.tsx
 * @description P1536 walkthrough 5: the held-Send backstop is never lost. When the route flips back to `wait` with Sends still queued (after the first
 * one went), the wait still ends at HELD_SEND_MAX_MS: one toast, the remaining Send resolves false.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toastFn = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastFn }));

import { HELD_SEND_MAX_MS, useHeldSend, type SendRoute } from '@/app/pages/chat/use-held-send';
import { DRAFT_ERROR_TEXT } from '@/app/pages/chat/canvas-thread-copy';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('the backstop survives a route that goes back to wait', () => {
  it('two Sends queued, route draft, the first sends, route flips to wait: the second ends at HELD_SEND_MAX_MS with one toast and false', async () => {
    let finishFirst: (ok: boolean) => void = () => undefined;
    const draftSend = vi.fn((body: string) => (body === 'first' ? new Promise<boolean>((r) => { finishFirst = r; }) : Promise.resolve(true)));
    const { result, rerender } = renderHook(({ route }: { route: SendRoute }) => useHeldSend(route, vi.fn()), { initialProps: { route: { kind: 'wait' } as SendRoute } });
    const done: Array<Promise<boolean>> = [];
    act(() => { done.push(result.current.hold('first'), result.current.hold('second')); });
    rerender({ route: { kind: 'draft', send: draftSend } });
    expect(draftSend).toHaveBeenCalledTimes(1);
    rerender({ route: { kind: 'wait' } });
    await act(async () => { finishFirst(true); });
    expect(await done[0]).toBe(true);
    expect(toastFn.error).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(HELD_SEND_MAX_MS + 1); });
    expect(toastFn.error).toHaveBeenCalledTimes(1);
    expect(toastFn.error).toHaveBeenCalledWith(DRAFT_ERROR_TEXT.FAILED);
    expect(await done[1]).toBe(false);
    expect(draftSend).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
  });

  it('CONTROL: when the second Send goes through, no timer is left and no toast is said', async () => {
    const draftSend = vi.fn(async () => true);
    const { result, rerender } = renderHook(({ route }: { route: SendRoute }) => useHeldSend(route, vi.fn()), { initialProps: { route: { kind: 'wait' } as SendRoute } });
    const done: Array<Promise<boolean>> = [];
    act(() => { done.push(result.current.hold('first'), result.current.hold('second')); });
    await act(async () => { rerender({ route: { kind: 'draft', send: draftSend } }); });
    expect(await Promise.all(done)).toEqual([true, true]);
    expect(vi.getTimerCount()).toBe(0);
    expect(toastFn.error).not.toHaveBeenCalled();
  });
});
