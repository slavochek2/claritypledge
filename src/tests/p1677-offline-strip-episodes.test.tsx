/**
 * P1677 — one `offline_strip_episode` analytics event per strip episode. Drives the REAL
 * provider + strip through page reports (the same path the pages use), with fake timers.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import {
  OfflineStatusProvider,
  useOfflinePageReport,
  _resetProbeForTesting,
  type OfflinePageReport,
} from '@/app/contexts/offline-status-context';
import { OfflineStrip } from '@/app/components/offline/offline-strip';
import { _resetEpisodeCountForTesting } from '@/app/components/offline/offline-strip-episodes';
import { _resetNetworkOutcomeForTesting } from '@/lib/network-outcome';
import { analytics } from '@/lib/mixpanel';

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
const track = vi.mocked(analytics.track);

const UUID = '3f2b8c1e-9a4d-4e6b-8f10-2c7d5a9e1b34';
const TOKEN = 'not-a-real-token-but-a-mistyped-url-segment'; // stands in for any unknown first segment
const T0 = new Date('2026-11-13T10:00:00Z').getTime();

let navigateTo: (to: string) => void = () => {};
function Nav() {
  const navigate = useNavigate();
  navigateTo = (to) => navigate(to);
  return null;
}
function Page({ report }: { report: OfflinePageReport | null }) {
  useOfflinePageReport(report);
  return null;
}

const slowCopy = (): OfflinePageReport => ({ kind: 'cached', storedAt: Date.now() - 5 * 60_000, slow: true });
const savedCopy = (): OfflinePageReport => ({ kind: 'cached', storedAt: Date.now() - 5 * 60_000 });

function tree(report: OfflinePageReport | null, withStrip = true) {
  return (
    <OfflineStatusProvider>
      <Nav />
      {withStrip && <OfflineStrip />}
      <Page report={report} />
    </OfflineStatusProvider>
  );
}
function mount(report: OfflinePageReport | null, path = '/') {
  const view = render(<MemoryRouter initialEntries={[path]}>{tree(report)}</MemoryRouter>);
  const set = (r: OfflinePageReport | null, withStrip = true) =>
    act(() => view.rerender(<MemoryRouter initialEntries={[path]}>{tree(r, withStrip)}</MemoryRouter>));
  return { ...view, set };
}
/** Properties of the first tracked event. */
const sent = () => track.mock.calls[0]?.[1] as Record<string, unknown>;
const advance =(ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  track.mockClear();
  _resetEpisodeCountForTesting();
  _resetNetworkOutcomeForTesting();
  _resetProbeForTesting();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('offline strip episodes (P1677)', () => {
  it('slow -> cleared: one event with all 7 properties and the faked duration', () => {
    const v = mount(null, '/feed');
    v.set(slowCopy());
    advance(6_000);
    v.set(null);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('offline_strip_episode', {
      first_state: 'slow',
      last_state: 'slow',
      duration_ms: 6_000,
      ended_by: 'cleared',
      start_route: '/feed',
      end_route: '/feed',
      navigator_online: true,
    });
  });

  it('slow -> offline_cached -> cleared: ONE episode, first and last state differ', () => {
    const v = mount(null, '/feed');
    v.set(slowCopy());
    advance(15_000);
    v.set(savedCopy());
    advance(5_000);
    v.set(null);
    expect(track).toHaveBeenCalledTimes(1);
    const props = sent();
    expect(props).toMatchObject({ first_state: 'slow', last_state: 'offline_cached', duration_ms: 20_000, ended_by: 'cleared' });
    expect(Object.keys(props).sort()).toEqual(
      ['duration_ms', 'end_route', 'ended_by', 'first_state', 'last_state', 'navigator_online', 'start_route'],
    );
  });

  it('offline only (page needs a connection): state offline', () => {
    const v = mount(null, '/me');
    v.set({ kind: 'needs-connection' });
    advance(3_000);
    v.set(null);
    expect(track).toHaveBeenCalledTimes(1);
    expect(sent()).toMatchObject({ first_state: 'offline', last_state: 'offline', duration_ms: 3_000, ended_by: 'cleared' });
  });

  it('strip staying up across a route change: one episode, start_route and end_route differ', () => {
    const v = mount(null, '/feed');
    v.set(slowCopy());
    advance(2_000);
    act(() => navigateTo('/story/' + UUID));
    expect(track).not.toHaveBeenCalled();
    advance(3_000);
    v.set(null);
    expect(track).toHaveBeenCalledTimes(1);
    expect(sent()).toMatchObject({ start_route: '/feed', end_route: '/story', duration_ms: 5_000 });
  });

  it('navigator_online reflects navigator.onLine at the end of the episode', () => {
    const v = mount(null);
    v.set(slowCopy());
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    // The strip component leaves while navigator.onLine is false (a cleared strip would need it online).
    v.set(slowCopy(), false);
    expect(track).toHaveBeenCalledTimes(1);
    expect((sent()).navigator_online).toBe(false);
  });

  it('saved copy while the clock passes several minutes (text changes age): still ONE episode', () => {
    const v = mount(null);
    v.set(savedCopy());
    const strip = () => document.querySelector('[data-testid="offline-strip"]')?.textContent;
    // Not slow, and offline is not confirmed: the page reports a plain saved copy, so the text is the cached text.
    const first = strip();
    advance(4 * 60_000);
    const later = strip();
    expect(first).toBeTruthy();
    expect(later).not.toBe(first);
    expect(track).not.toHaveBeenCalled();
    v.set(null);
    expect(track).toHaveBeenCalledTimes(1);
    expect(sent()).toMatchObject({ first_state: 'offline_cached', last_state: 'offline_cached', duration_ms: 4 * 60_000 });
  });

  it('unmounting OfflineStrip while it shows: one episode with ended_by unmount', () => {
    const v = mount(null, '/feed');
    v.set(slowCopy());
    advance(1_500);
    v.set(slowCopy(), false); // strip component leaves, the page report is still there
    expect(track).toHaveBeenCalledTimes(1);
    expect(sent()).toMatchObject({ ended_by: 'unmount', duration_ms: 1_500, first_state: 'slow' });
  });

  it('unmounting the whole tree while the strip shows: one episode with ended_by unmount', () => {
    const v = mount(slowCopy());
    advance(800);
    v.unmount();
    expect(track).toHaveBeenCalledTimes(1);
    expect(sent()).toMatchObject({ ended_by: 'unmount', duration_ms: 800 });
  });

  it('no strip, no event', () => {
    const v = mount(null);
    advance(10_000);
    v.unmount();
    expect(track).not.toHaveBeenCalled();
  });

  it('the 5th episode in one document load is sent and the 6th is not, across a route change', () => {
    const v = mount(null, '/feed');
    for (let i = 1; i <= 6; i++) {
      v.set(slowCopy());
      advance(1_000);
      if (i === 3) act(() => navigateTo('/me'));
      v.set(null);
      expect(track).toHaveBeenCalledTimes(Math.min(i, 5));
    }
    expect(track).toHaveBeenCalledTimes(5);
  });

  describe('tab hidden when the episode ends (metered-services rule 3)', () => {
    let visibility: 'visible' | 'hidden' = 'visible';
    const setVisibility = (value: 'visible' | 'hidden') => {
      visibility = value;
      document.dispatchEvent(new Event('visibilitychange'));
    };
    beforeEach(() => {
      visibility = 'visible';
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    });
    afterEach(() => {
      delete (document as unknown as Record<string, unknown>).visibilityState;
    });

    it('sends nothing while hidden; flushes one event on visible with duration from the END', () => {
      const v = mount(null, '/feed');
      v.set(slowCopy());
      advance(4_000);
      visibility = 'hidden';
      v.set(null);
      expect(track).not.toHaveBeenCalled();
      advance(60_000); // clock moves between the end and the flush
      act(() => setVisibility('visible'));
      expect(track).toHaveBeenCalledTimes(1);
      expect(sent()).toMatchObject({ duration_ms: 4_000, ended_by: 'cleared', end_route: '/feed' });
      act(() => setVisibility('visible'));
      expect(track).toHaveBeenCalledTimes(1);
    });

    it('two episodes ending while hidden flush in order', () => {
      const v = mount(null, '/feed');
      visibility = 'hidden';
      v.set(slowCopy());
      advance(1_000);
      v.set(null);
      v.set(slowCopy());
      advance(2_000);
      v.set(null);
      expect(track).not.toHaveBeenCalled();
      act(() => setVisibility('visible'));
      expect(track).toHaveBeenCalledTimes(2);
      expect(track.mock.calls.map((c) => (c[1] as Record<string, unknown>).duration_ms)).toEqual([1_000, 2_000]);
    });

    it('an episode ending while visible still sends immediately', () => {
      const v = mount(null, '/feed');
      v.set(slowCopy());
      advance(500);
      v.set(null);
      expect(track).toHaveBeenCalledTimes(1);
    });
  });

  it('route reduction: /story/<uuid> -> /story, / -> /, /<random-token> -> other; no property carries the id or token', () => {
    const cases: Array<[string, string]> = [
      ['/story/' + UUID, '/story'],
      ['/', '/'],
      ['/' + TOKEN, 'other'],
    ];
    for (const [path, expected] of cases) {
      track.mockClear();
      _resetEpisodeCountForTesting();
      const v = mount(null, path);
      v.set(slowCopy());
      v.set(null);
      const props = sent();
      expect(props.start_route).toBe(expected);
      expect(props.end_route).toBe(expected);
      const serialized = JSON.stringify(props);
      expect(serialized).not.toContain(UUID);
      expect(serialized).not.toContain(TOKEN);
      v.unmount();
    }
  });
});
