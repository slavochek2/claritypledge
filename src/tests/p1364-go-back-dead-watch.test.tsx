/**
 * @file p1364-go-back-dead-watch.test.tsx
 * @description P1364 review 4, finding 2 — the one uncertain Back path is watched, not accepted.
 *
 * Uncertain = at the first app entry, this document booted as reload / back_forward and READ the
 * "page before the app?" answer from storage (it may belong to a newer arrival), and that answer
 * says pop. Only there does useGoBack watch the pop: no popstate / pagehide / beforeunload within
 * DEAD_BACK_TIMEOUT_MS → it was a dead button → the fallback route instead. Every other path is
 * unchanged, and never arms the watch.
 *
 * Real BrowserRouter over jsdom history, fresh window per file: history starts at index 0.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, Route, Routes, useNavigate, type NavigateFunction } from 'react-router-dom';
import { FocusHeader } from '@/app/components/layout/focus-header';
import {
  __resetHistoryBootForTest,
  DEAD_BACK_TIMEOUT_MS,
  decideBrowserBackDetailed,
  stampHistoryBoot,
  TAB_HAD_PREDECESSOR_STORAGE_KEY,
  watchForDeadBack,
} from '@/app/hooks/use-go-back';

let nav: NavigateFunction;
function NavGrab() {
  nav = useNavigate();
  return null;
}
function App() {
  return (
    <BrowserRouter>
      <NavGrab />
      <Routes>
        <Route path="/feed" element={<p>the feed</p>} />
        <Route path="/prev" element={<p>the previous page</p>} />
        <Route path="/stake/:tag" element={<FocusHeader fallback="/feed" />} />
      </Routes>
    </BrowserRouter>
  );
}
const path = () => window.location.pathname;

function bootAs(type: 'navigate' | 'reload' | 'back_forward', storedHadPredecessor: boolean | null) {
  if (storedHadPredecessor === null) window.sessionStorage.removeItem(TAB_HAD_PREDECESSOR_STORAGE_KEY);
  else window.sessionStorage.setItem(TAB_HAD_PREDECESSOR_STORAGE_KEY, String(storedHadPredecessor));
  const t = vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type } as unknown as PerformanceEntry]);
  __resetHistoryBootForTest();
  stampHistoryBoot();
  t.mockRestore();
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete (window as unknown as { navigation?: unknown }).navigation;
});

describe('the edge the watch closes', () => {
  it('back_forward into an older document whose stored answer says "pop", at the tab\'s first entry → Back lands on the fallback, not a dead button', async () => {
    expect(window.history.length).toBe(1); // jsdom index 0: history.back() goes nowhere
    window.history.replaceState(null, '', '/stake/cmp7');
    bootAs('back_forward', true); // the NEWEST arrival had a page before it; this document did not
    render(<App />); // the router writes { idx: 0 } into the entry
    expect(decideBrowserBackDetailed()).toBe('pop-watched');
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(path()).toBe('/stake/cmp7'); // the pop is tried first…
    await waitFor(() => expect(path()).toBe('/feed'), { timeout: DEAD_BACK_TIMEOUT_MS + 1500 }); // …then the fallback
  });
});

describe('a watched pop that DOES go somewhere is left alone', () => {
  it('popstate from a real traversal cancels the watch: the reader stays on the previous page', async () => {
    window.history.replaceState(null, '', '/prev');
    render(<App />);
    act(() => nav('/stake/cmp7')); // a real previous entry now exists
    bootAs('reload', true);
    // Force the uncertain branch (Navigation API: "no earlier app entry"), so the pop is watched.
    (window as unknown as { navigation: unknown }).navigation = { canGoBack: false };
    expect(decideBrowserBackDetailed()).toBe('pop-watched');
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(path()).toBe('/prev'));
    await act(async () => { await new Promise(r => setTimeout(r, DEAD_BACK_TIMEOUT_MS + 300)); });
    expect(path()).toBe('/prev'); // not replaced by /feed
  });

  it.each(['popstate', 'pagehide', 'beforeunload'])('%s cancels the watch', (type) => {
    vi.useFakeTimers();
    const onDead = vi.fn();
    watchForDeadBack(onDead);
    window.dispatchEvent(new Event(type));
    vi.advanceTimersByTime(DEAD_BACK_TIMEOUT_MS * 3);
    expect(onDead).not.toHaveBeenCalled();
  });

  it('with no sign of leaving, the watch fires once', () => {
    vi.useFakeTimers();
    const onDead = vi.fn();
    watchForDeadBack(onDead);
    vi.advanceTimersByTime(DEAD_BACK_TIMEOUT_MS + 1);
    expect(onDead).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('popstate')); // listeners are gone after firing
    vi.advanceTimersByTime(DEAD_BACK_TIMEOUT_MS * 3);
    expect(onDead).toHaveBeenCalledTimes(1);
  });
});

describe('every other path never arms the watch', () => {
  const armed = (spy: ReturnType<typeof vi.spyOn>) =>
    spy.mock.calls.some((c: unknown[]) => c[1] === DEAD_BACK_TIMEOUT_MS);

  it.each([
    ['an earlier app entry (idx > 0)', () => { bootAs('reload', true); return { idx: 2 }; }],
    ['first entry, answer MEASURED on a fresh arrival (outside page before it)', () => {
      const len = vi.spyOn(window.history, 'length', 'get').mockReturnValue(3);
      vi.spyOn(window.history, 'state', 'get').mockReturnValue(null);
      bootAs('navigate', null);
      len.mockRestore();
      return { idx: 0 };
    }],
    ['first entry, stored answer says "no predecessor" (fallback, no pop)', () => { bootAs('back_forward', false); return { idx: 0 }; }],
  ] as const)('%s', (_label, setup) => {
    const state = setup();
    vi.spyOn(window.history, 'state', 'get').mockReturnValue(state);
    expect(decideBrowserBackDetailed()).not.toBe('pop-watched');
    const st = vi.spyOn(window, 'setTimeout');
    window.history.replaceState(null, '', '/stake/cmp7');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(armed(st)).toBe(false);
  });
});
