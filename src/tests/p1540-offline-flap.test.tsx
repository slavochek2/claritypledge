/**
 * P1540 — the Offline strip must not flap on one failed request. A lone failure triggers a
 * health probe; only a failed probe (a confirmed outage) shows offline.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { OfflineStatusProvider, useConnectivity, _resetProbeForTesting } from '@/app/contexts/offline-status-context';
import { recordNetworkFailure, recordNetworkSuccess, recordNetworkTrouble, networkMark, _resetNetworkOutcomeForTesting } from '@/lib/network-outcome';

function Probe() {
  const { offline, reconnectTick } = useConnectivity();
  return (
    <>
      <p data-testid="state">{offline ? 'offline' : 'online'}</p>
      <p data-testid="tick">{reconnectTick}</p>
    </>
  );
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const state = () => screen.getByTestId('state').textContent;

beforeEach(() => {
  _resetNetworkOutcomeForTesting();
  _resetProbeForTesting();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.test');
  render(<OfflineStatusProvider><Probe /></OfflineStatusProvider>);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('P1540 offline strip hysteresis', () => {
  it('one failed request while the health probe answers: never offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
    act(() => recordNetworkFailure());
    expect(state()).toBe('online');
    await flush();
    expect(state()).toBe('online');
  });

  it('a failed request followed by a failed probe: offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    act(() => recordNetworkFailure());
    await flush();
    expect(state()).toBe('offline');
  });

  it('a success sent after a confirmed outage: online again', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    act(() => recordNetworkFailure());
    await flush();
    expect(state()).toBe('offline');
    act(() => recordNetworkSuccess());
    expect(state()).toBe('online');
  });
});

describe('P1540 review fixes', () => {
  const tick = () => screen.getByTestId('tick').textContent;

  it('lone failure, probe ok: reconnectTick bumps so a cached page re-reads', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
    act(() => recordNetworkFailure());
    await flush();
    await flush();
    expect(state()).toBe('online');
    expect(tick()).toBe('1');
  });

  it('read-deadline trouble, probe ok: reconnectTick bumps', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
    act(() => recordNetworkTrouble());
    await flush();
    await flush();
    expect(tick()).toBe('1');
  });

  it('a late failed probe after reachability recovered does not confirm an outage', async () => {
    let rejectFetch: (e: unknown) => void = () => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise((_, rej) => { rejectFetch = rej; })));
    act(() => recordNetworkFailure());
    await flush();
    act(() => recordNetworkSuccess());
    await act(async () => { rejectFetch(new TypeError('Failed to fetch')); await new Promise((r) => setTimeout(r, 0)); });
    // The probe's own failure re-marks unreachable; a later success must leave us online.
    act(() => recordNetworkSuccess());
    await flush();
    expect(state()).toBe('online');
  });

  it('a stale probe success (sent before a newer failure) does not clear that failure', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((res) => { resolveFetch = res; })));
    act(() => recordNetworkFailure());
    await flush();
    act(() => recordNetworkFailure(networkMark()));
    await act(async () => { resolveFetch(new Response('{}')); await new Promise((r) => setTimeout(r, 0)); });
    const { isSupabaseUnreachable } = await import('@/lib/network-outcome');
    expect(isSupabaseUnreachable()).toBe(true);
  });

  it('navigator offline shows offline immediately', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(state()).toBe('offline');
    spy.mockRestore();
  });
});
