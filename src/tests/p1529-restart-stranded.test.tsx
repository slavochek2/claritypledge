/** P1529: the stranded-run restart never starts a run whose start was refused or is still in flight (no second, silent start). */
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ queued: vi.fn() }));
vi.mock('@/app/data/canvas-draft-service', async (orig) => ({ ...(await orig<typeof import('@/app/data/canvas-draft-service')>()), startQueuedCanvasRun: h.queued }));
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() }, from: vi.fn(), rpc: vi.fn() } }));

import { useRestartStrandedRun } from '@/app/pages/chat/use-canvas-thread';
import { clearStartRefusal, markStartDone, markStartGoing, recordStartRefusal } from '@/app/data/canvas-start-refusals';

const run = (id: string) => ({ id, state: 'queued', inputKind: 'text', createdAt: new Date(Date.now() - 60_000).toISOString(), startedAt: null, readyAt: null }) as never;
const mount = (id: string, visible = true) => renderHook(({ v }) => useRestartStrandedRun(run(id), 'd1', async () => undefined, v), { initialProps: { v: visible } });

beforeEach(() => { vi.useFakeTimers(); h.queued.mockResolvedValue({ ok: true, runId: 'x', kind: 'message' }); });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); clearStartRefusal('rA'); markStartDone('rB'); });

describe('useRestartStrandedRun', () => {
  it('a typed run is not started while the tab is hidden, and once when it becomes visible', async () => {
    const view = mount('rH', false);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(h.queued).not.toHaveBeenCalled();
    view.rerender({ v: true });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(h.queued).toHaveBeenCalledTimes(1);
  });
  it('a plain stranded run is started once (control)', async () => {
    mount('rC');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(h.queued).toHaveBeenCalledTimes(1);
  });
  it('a run with a recorded refusal is not started again', async () => {
    recordStartRefusal('rA', 'FAILED');
    mount('rA');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(h.queued).not.toHaveBeenCalled();
  });
  it('a run whose start is in flight from the caller is not started a second time', async () => {
    markStartGoing('rB');
    mount('rB');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(h.queued).not.toHaveBeenCalled();
  });
});
