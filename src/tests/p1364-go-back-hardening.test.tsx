/**
 * @file p1364-go-back-hardening.test.tsx
 * @description P1364 review findings 2 and 3 — useGoBack must never be a dead button.
 *
 * Rendered in a real BrowserRouter over jsdom's window.history (this file gets a fresh window,
 * so history.length starts at 1 — a fresh tab).
 *
 *   2. Cold /story → push /point → browser back → Back: index 0 with a FORWARD entry makes
 *      history.length 2, and the old `length <= 1` test popped at index 0 — which does nothing.
 *   3. A page that calls `history.replaceState(null, …)` wipes react-router's `{ key, idx }`;
 *      the old code then trusted a mount-time key and popped in a length-1 tab — dead again.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, Route, Routes, useNavigate, type NavigateFunction } from 'react-router-dom';
import { FocusHeader } from '@/app/components/layout/focus-header';
import {
  __resetHistoryBootForTest,
  decideBrowserBack,
  stampHistoryBoot,
  TAB_HAD_PREDECESSOR_STORAGE_KEY,
} from '@/app/hooks/use-go-back';

let nav: NavigateFunction;
function NavGrab() {
  nav = useNavigate();
  return null;
}
const path = () => window.location.pathname;

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as { navigation?: unknown }).navigation;
});

describe('finding 2 — cold arrival with a forward entry', () => {
  it('cold /story → /point → browser back → Back goes to the fallback, not nowhere', async () => {
    expect(window.history.length).toBe(1); // a fresh tab
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/story/s1');
    __resetHistoryBootForTest();
    stampHistoryBoot(); // what main.tsx does before the router mounts
    render(
      <BrowserRouter>
        <NavGrab />
        <Routes>
          <Route path="/feed" element={<p>the feed</p>} />
          <Route path="/story/:id" element={<FocusHeader fallback="/feed" />} />
          <Route path="/point/:id" element={<p>a point</p>} />
        </Routes>
      </BrowserRouter>
    );
    act(() => nav('/point/p1'));
    await act(async () => {
      const popped = new Promise<void>(resolve => window.addEventListener('popstate', () => resolve(), { once: true }));
      window.history.back();
      // jsdom traverses history asynchronously: wait for the popstate itself, not a fixed delay
      // (a 20ms sleep lost the race under a loaded parallel run).
      await Promise.race([popped, new Promise(r => setTimeout(r, 2000))]);
    });
    expect(path()).toBe('/story/s1');
    expect(window.history.length).toBe(2); // index 0, one entry FORWARD

    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(path()).toBe('/feed'));
    expect(screen.getByText('the feed')).toBeTruthy();
  });

  it('the boot record lives in sessionStorage and leaves the router state untouched', () => {
    expect(window.sessionStorage.getItem(TAB_HAD_PREDECESSOR_STORAGE_KEY)).toBe('false'); // from the test above
    window.history.replaceState({ usr: null, key: 'k1', idx: 0 }, '');
    __resetHistoryBootForTest();
    stampHistoryBoot();
    expect(window.history.state).toEqual({ usr: null, key: 'k1', idx: 0 });
  });
});

describe('finding 3 — a wiped history state', () => {
  it('accept (replace) → agreement page whose state was wiped, in a length-1 tab → Back goes to the fallback', async () => {
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
    window.history.replaceState(null, '', '/agreements/a1/accept');
    render(
      <BrowserRouter>
        <NavGrab />
        <Routes>
          <Route path="/me" element={<p>my page</p>} />
          <Route path="/agreements/:id/accept" element={<p>accept form</p>} />
          <Route path="/agreements/:id" element={<FocusHeader fallback="/me" />} />
        </Routes>
      </BrowserRouter>
    );
    act(() => nav('/agreements/a1', { replace: true }));
    window.history.replaceState(null, '', '/agreements/a1'); // what the accept page used to do
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(path()).toBe('/me'));
  });
});

describe('decideBrowserBack — the decision table', () => {
  const withState = (state: unknown, length: number) => {
    vi.spyOn(window.history, 'state', 'get').mockReturnValue(state);
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(length);
  };
  const withNavigationApi = (canGoBack: boolean) => {
    (window as unknown as { navigation: unknown }).navigation = { canGoBack };
  };
  /** What the tab's last fresh arrival recorded, read back by a reload boot. */
  const withBoot = (hadPredecessor: boolean) => {
    window.sessionStorage.setItem(TAB_HAD_PREDECESSOR_STORAGE_KEY, String(hadPredecessor));
    const nav = vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type: 'reload' } as unknown as PerformanceEntry]);
    __resetHistoryBootForTest();
    stampHistoryBoot();
    nav.mockRestore();
  };

  it('Navigation API: an earlier app entry → pop', () => {
    withState({ idx: 0 }, 1);
    withNavigationApi(true);
    expect(decideBrowserBack()).toBe('pop');
  });

  it('Navigation API: first app entry, an outside page before it (recorded at the tab\'s first boot) → pop (P1311)', () => {
    withBoot(true);
    withState({ idx: 0 }, 2);
    withNavigationApi(false);
    expect(decideBrowserBack()).toBe('pop');
  });

  it('Navigation API: first app entry, nothing before it, a forward entry (length 2) → fallback', () => {
    withBoot(false);
    withState({ idx: 0 }, 2);
    withNavigationApi(false);
    expect(decideBrowserBack()).toBe('fallback');
  });

  it('no Navigation API, idx > 0 → pop', () => {
    withState({ idx: 3 }, 4);
    expect(decideBrowserBack()).toBe('pop');
  });

  it('no Navigation API, state wiped, length 1 → fallback', () => {
    withState(null, 1);
    expect(decideBrowserBack()).toBe('fallback');
  });

  it('no Navigation API, state wiped, length > 1 → pop', () => {
    withState(null, 3);
    expect(decideBrowserBack()).toBe('pop');
  });
});
