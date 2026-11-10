/**
 * P1529: how a phone reads the host's "End the evening" stamp and the canvas-update step in the gap between rounds. Both reads are
 * made only in the gap (no round on, rounds behind us, event not closed), only on a visible tab, every GAP_POLL_MS, and stop once the
 * evening is over. The stamp wins over a step it came after. The server and the clock are fakes the test sets.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ getEveningEnd: vi.fn(), getCanvasUpdateStep: vi.fn() }));
vi.mock('@/app/data/event-mastermind-service', () => ({ getEveningEnd: h.getEveningEnd, getCanvasUpdateStep: h.getCanvasUpdateStep }));
vi.mock('@/app/data/canvas-service', () => ({ canvasService: {} }));
vi.mock('@/app/data/canvas-draft-service', () => ({}));

import { useEveningEnd, useUpdateStep } from '@/app/prototypes/events/rounds/use-mastermind-round';
import { GAP_POLL_MS, updateStepOn } from '@/app/prototypes/events/rounds/mastermind-round-helpers';

function setVisibility(v: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
  document.dispatchEvent(new Event('visibilitychange'));
}
const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const rounds = [{ startedAt: new Date(1000).toISOString() }];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setVisibility('visible');
  h.getEveningEnd.mockReset().mockResolvedValue(null);
  h.getCanvasUpdateStep.mockReset().mockResolvedValue(null);
});
afterEach(() => { setVisibility('visible'); vi.useRealTimers(); });

describe('useEveningEnd', () => {
  it('reads nothing while a round runs, or while the tab is hidden; reads once when it is shown', async () => {
    const view = renderHook(({ watch }) => useEveningEnd('e1', true, rounds, watch), { initialProps: { watch: false } });
    await tick(GAP_POLL_MS * 3);
    expect(h.getEveningEnd, 'a round is on').not.toHaveBeenCalled();
    setVisibility('hidden');
    view.rerender({ watch: true });
    await tick(GAP_POLL_MS * 3);
    expect(h.getEveningEnd, 'the gap began in a hidden tab').not.toHaveBeenCalled();
    setVisibility('visible');
    await tick(10);
    expect(h.getEveningEnd).toHaveBeenCalledTimes(1);
  });

  it('in the gap it reads at once and then every GAP_POLL_MS: 450 an hour, never faster', async () => {
    renderHook(() => useEveningEnd('e1', true, rounds, true));
    await tick(100);
    expect(h.getEveningEnd).toHaveBeenCalledTimes(1);
    await tick(GAP_POLL_MS * 4 + 100);
    expect(h.getEveningEnd).toHaveBeenCalledTimes(5);
    expect(3600_000 / GAP_POLL_MS).toBe(450);
  });

  it('once the stamp says the evening is over it is never read again', async () => {
    h.getEveningEnd.mockResolvedValue(new Date(2000).toISOString());
    const view = renderHook(() => useEveningEnd('e1', true, rounds, true));
    await tick(100);
    expect(view.result.current).toBe(new Date(2000).toISOString());
    await tick(GAP_POLL_MS * 10);
    expect(h.getEveningEnd).toHaveBeenCalledTimes(1);
  });

  it('a stamp from before the newest round does not end it, and keeps being read', async () => {
    h.getEveningEnd.mockResolvedValue(new Date(500).toISOString());
    renderHook(() => useEveningEnd('e1', true, rounds, true));
    await tick(GAP_POLL_MS * 2 + 100);
    expect(h.getEveningEnd.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('a failed first read counts as "not ended" (null), never as unknown forever', async () => {
    h.getEveningEnd.mockRejectedValue(new Error('offline'));
    const view = renderHook(() => useEveningEnd('e1', true, rounds, true));
    await tick(100);
    expect(view.result.current).toBeNull();
  });
});

describe('useUpdateStep in the gap after round 2', () => {
  const ended = [{ id: 'r2', endedAt: new Date(2000).toISOString() }];

  it('a hidden tab makes no request on mount or when the rounds change; the read comes when it is shown', async () => {
    setVisibility('hidden');
    const view = renderHook(({ key }) => useUpdateStep('e1', true, key, false, ended), { initialProps: { key: 'a' } });
    await tick(100);
    view.rerender({ key: 'b' });
    await tick(GAP_POLL_MS * 3);
    expect(h.getCanvasUpdateStep, 'zero requests while hidden').not.toHaveBeenCalled();
    setVisibility('visible');
    await tick(10);
    expect(h.getCanvasUpdateStep).toHaveBeenCalledTimes(1);
  });

  it('polls only while watched and the step has not started; stops once it is on', async () => {
    const view = renderHook(({ watch }) => useUpdateStep('e1', true, 'k', watch, ended), { initialProps: { watch: true } });
    await tick(100);
    const first = h.getCanvasUpdateStep.mock.calls.length;
    await tick(GAP_POLL_MS * 3);
    expect(h.getCanvasUpdateStep.mock.calls.length - first).toBe(3);
    h.getCanvasUpdateStep.mockResolvedValue({ afterRoundId: 'r2', startedAt: new Date(3000).toISOString() });
    await tick(GAP_POLL_MS + 100);
    expect(view.result.current?.afterRoundId).toBe('r2');
    const on = h.getCanvasUpdateStep.mock.calls.length;
    await tick(GAP_POLL_MS * 5);
    expect(h.getCanvasUpdateStep, 'step is on: no more polling').toHaveBeenCalledTimes(on);
    view.rerender({ watch: false });
    await tick(GAP_POLL_MS * 3);
    expect(h.getCanvasUpdateStep).toHaveBeenCalledTimes(on);
  });

  it('does not poll when not watched (a round runs, or the evening is over)', async () => {
    renderHook(() => useUpdateStep('e1', true, 'k', false, ended));
    await tick(GAP_POLL_MS * 4);
    expect(h.getCanvasUpdateStep, 'only the one read on mount').toHaveBeenCalledTimes(1);
  });
});

describe('useEveningEnd is scoped to its event', () => {
  it('a stamp read for one event is never shown for another', async () => {
    const stamp = new Date(2000).toISOString();
    h.getEveningEnd.mockImplementation(async (id: string) => (id === 'e1' ? stamp : null));
    const view = renderHook(({ id }) => useEveningEnd(id, true, rounds, true), { initialProps: { id: 'e1' } });
    await tick(100);
    expect(view.result.current).toBe(stamp);
    view.rerender({ id: 'e2' });
    expect(view.result.current, 'e2 starts unknown, not e1\'s stamp').toBeUndefined();
    await tick(100);
    expect(h.getEveningEnd).toHaveBeenLastCalledWith('e2');
    expect(view.result.current).toBeNull();
  });
});

describe('the stamp wins over the step it came after', () => {
  const rs = [{ id: 'r2', endedAt: new Date(2000).toISOString() }];
  const step = { afterRoundId: 'r2', startedAt: new Date(3000).toISOString() };
  it('a stamp at or after the step\'s start ends it; before it, not; none, not', () => {
    expect(updateStepOn(step, rs)).toBe(true);
    expect(updateStepOn(step, rs, null)).toBe(true);
    expect(updateStepOn(step, rs, new Date(3000).toISOString())).toBe(false);
    expect(updateStepOn(step, rs, new Date(4000).toISOString())).toBe(false);
    expect(updateStepOn(step, rs, new Date(2500).toISOString())).toBe(true);
  });
});
