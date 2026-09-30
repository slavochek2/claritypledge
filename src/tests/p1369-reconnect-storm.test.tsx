/**
 * P1369 — the reconnect must not become a request storm (found by the orchestrator after the
 * defect-1/9 fixes: a point page whose one request kept failing re-read ~250 times a second).
 *
 *   - a success proves the connection is back only if its request was SENT after the failure;
 *   - reconnect refreshes are edge-triggered and back off while the connection keeps dropping
 *     again right after one.
 * The browser-level check is e2e/offline/p1369-regressions.spec.ts "no request storm".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  isSupabaseUnreachable,
  recordNetworkFailure,
  recordNetworkSuccess,
  withNetworkOutcome,
  _resetNetworkOutcomeForTesting,
} from '@/lib/network-outcome';
import { OfflineStatusProvider, useConnectivity } from '@/app/contexts/offline-status-context';

beforeEach(() => {
  _resetNetworkOutcomeForTesting();
});
afterEach(() => {
  vi.useRealTimers();
});

/** A fetch whose calls settle when the test says so. */
function controlledFetch() {
  const calls: Array<{ resolve: () => void; reject: () => void }> = [];
  const fetchImpl = (() =>
    new Promise<Response>((res, rej) => {
      calls.push({ resolve: () => res(new Response('{}')), reject: () => rej(new TypeError('Failed to fetch')) });
    })) as typeof fetch;
  return { calls, fetch: withNetworkOutcome(fetchImpl) };
}

describe('a success counts as a reconnect only if it was sent after the failure', () => {
  it('a sibling sent alongside the failing request succeeds afterwards: still unreachable', async () => {
    const { calls, fetch } = controlledFetch();
    const failing = fetch('https://x/rest/v1/points').catch(() => undefined);
    const sibling = fetch('https://x/rest/v1/point_positions');
    calls[0]!.reject();
    await failing;
    expect(isSupabaseUnreachable()).toBe(true);
    calls[1]!.resolve();
    await sibling;
    expect(isSupabaseUnreachable()).toBe(true);
  });

  it('control: a request sent after the failure succeeds: reachable again', async () => {
    const { calls, fetch } = controlledFetch();
    const failing = fetch('https://x/rest/v1/points').catch(() => undefined);
    calls[0]!.reject();
    await failing;
    const later = fetch('https://x/auth/v1/health');
    calls[1]!.resolve();
    await later;
    expect(isSupabaseUnreachable()).toBe(false);
  });
});

function Tick() {
  const { reconnectTick } = useConnectivity();
  return <p data-testid="tick">{reconnectTick}</p>;
}
const tick = () => Number(screen.getByTestId('tick').textContent);

describe('reconnect refreshes are edge-triggered and back off', () => {
  it('first reconnect refreshes at once; one that follows it within 30 s waits 2 s, then 4 s', async () => {
    vi.useFakeTimers();
    render(<OfflineStatusProvider><Tick /></OfflineStatusProvider>);

    act(() => recordNetworkFailure());
    act(() => recordNetworkSuccess());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(tick()).toBe(1);

    // The refresh failed again at once, and something reconnected again at once.
    act(() => recordNetworkFailure());
    act(() => recordNetworkSuccess());
    await act(async () => { await vi.advanceTimersByTimeAsync(1_900); });
    expect(tick()).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(tick()).toBe(2);

    act(() => recordNetworkFailure());
    act(() => recordNetworkSuccess());
    await act(async () => { await vi.advanceTimersByTimeAsync(3_900); });
    expect(tick()).toBe(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(tick()).toBe(3);
  });

  it('a reconnect long after the previous one is immediate again (the backoff resets)', async () => {
    vi.useFakeTimers();
    render(<OfflineStatusProvider><Tick /></OfflineStatusProvider>);
    for (let i = 0; i < 3; i++) {
      act(() => recordNetworkFailure());
      act(() => recordNetworkSuccess());
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    }
    expect(tick()).toBe(3);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    act(() => recordNetworkFailure());
    act(() => recordNetworkSuccess());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(tick()).toBe(4);
  });

  it('dropping again before a delayed refresh is due cancels it', async () => {
    vi.useFakeTimers();
    render(<OfflineStatusProvider><Tick /></OfflineStatusProvider>);
    act(() => recordNetworkFailure());
    act(() => recordNetworkSuccess());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    act(() => recordNetworkFailure());
    act(() => recordNetworkSuccess()); // due in 2 s
    act(() => recordNetworkFailure()); // down again before that
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(tick()).toBe(1);
  });
});
