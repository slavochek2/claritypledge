/**
 * P1540 — the Offline strip must not flap on one failed request. A lone failure triggers a
 * health probe; only a failed probe (a confirmed outage) shows offline.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { OfflineStatusProvider, useConnectivity, _resetProbeForTesting } from '@/app/contexts/offline-status-context';
import { recordNetworkFailure, recordNetworkSuccess, _resetNetworkOutcomeForTesting } from '@/lib/network-outcome';

function Probe() {
  const { offline } = useConnectivity();
  return <p data-testid="state">{offline ? 'offline' : 'online'}</p>;
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
