/**
 * @file p1364-go-back-boot-record.test.tsx
 * @description P1364 review 2 — D1 (a reload must not corrupt "did the tab have a page before
 * the app?") and D3 (the browser-backed check must survive percent-encoding).
 *
 * Real BrowserRouter over jsdom history, in a fresh window: history.length starts at 1. A
 * "reload" is simulated the way the app boots — unmount, forget module memory, re-run
 * stampHistoryBoot (as main.tsx does) with Navigation Timing saying `reload`, remount.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, Route, Routes, useNavigate, type NavigateFunction } from 'react-router-dom';
import { FocusHeader } from '@/app/components/layout/focus-header';
import {
  __resetHistoryBootForTest,
  decideBrowserBack,
  isBrowserBacked,
  stampHistoryBoot,
  TAB_HAD_PREDECESSOR_STORAGE_KEY,
} from '@/app/hooks/use-go-back';

let nav: NavigateFunction;
function NavGrab() {
  nav = useNavigate();
  return null;
}
const path = () => window.location.pathname + window.location.search;

function App() {
  return (
    <BrowserRouter>
      <NavGrab />
      <Routes>
        <Route path="/feed" element={<p>the feed</p>} />
        <Route path="/stake/:tag" element={<FocusHeader fallback="/feed" />} />
        <Route path="/point/:id" element={<p>a point</p>} />
      </Routes>
    </BrowserRouter>
  );
}

function bootAs(type: 'navigate' | 'reload') {
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type } as unknown as PerformanceEntry]);
  __resetHistoryBootForTest();
  stampHistoryBoot();
}

async function browserBack() {
  await act(async () => {
    window.history.back();
    await new Promise(r => setTimeout(r, 20));
  });
}

afterEach(() => vi.restoreAllMocks());

describe('D1 — a reload of a later entry does not make Back at the first entry dead', () => {
  it('cold /stake → tab switch (replace) → push /point → RELOAD /point → browser back → Back → /feed', async () => {
    expect(window.history.length).toBe(1); // a fresh tab
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/stake/cmp7');
    bootAs('navigate');
    const first = render(<App />);
    act(() => nav('/stake/cmp7?tab=stories', { replace: true })); // a router replace at index 0
    act(() => nav('/point/p1'));
    first.unmount();

    bootAs('reload'); // the app boots again, at index 1, with history.length 2
    render(<App />);
    expect(path()).toBe('/point/p1');
    await browserBack();
    expect(path()).toBe('/stake/cmp7?tab=stories'); // index 0 again

    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(path()).toBe('/feed'));
  });

  it('with sessionStorage blocked, a reload boot records "no predecessor" (never derives it from history.length)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(3);
    vi.spyOn(window.history, 'state', 'get').mockReturnValue({ idx: 2 });
    bootAs('reload');
    vi.spyOn(window.history, 'state', 'get').mockReturnValue({ idx: 0 }); // later: Back to index 0
    // Reaching index 0 with "no predecessor" → fallback. Checked through the decision the hook makes.
    return import('@/app/hooks/use-go-back').then(({ decideBrowserBack }) => {
      expect(decideBrowserBack()).toBe('fallback');
    });
  });

  it('a reload boot reads the stored answer and never rewrites it', () => {
    window.sessionStorage.setItem(TAB_HAD_PREDECESSOR_STORAGE_KEY, 'true'); // arrived from an outside page
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(5);
    bootAs('reload');
    expect(window.sessionStorage.getItem(TAB_HAD_PREDECESSOR_STORAGE_KEY)).toBe('true');
    window.sessionStorage.setItem(TAB_HAD_PREDECESSOR_STORAGE_KEY, 'false');
    bootAs('reload');
    expect(window.sessionStorage.getItem(TAB_HAD_PREDECESSOR_STORAGE_KEY)).toBe('false');
  });
});

describe('review 3 — every fresh arrival re-records the answer (P1311 after leaving and coming back)', () => {
  /** Cold first visit (stores "no predecessor"), then out to an outside site and back via a link. */
  function coldThenBackViaOutsideLink() {
    window.sessionStorage.clear();
    const len = vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
    bootAs('navigate'); // arrival 1: cold
    expect(window.sessionStorage.getItem(TAB_HAD_PREDECESSOR_STORAGE_KEY)).toBe('false');
    // …the reader follows a link out, then a link on that site back into /story/:id: a NEW
    // document, a fresh `navigate`, with the app's old entry and the outside page behind it.
    len.mockReturnValue(3);
    vi.spyOn(window.history, 'state', 'get').mockReturnValue(null);
    bootAs('navigate'); // arrival 2
    len.mockRestore();
    expect(window.sessionStorage.getItem(TAB_HAD_PREDECESSOR_STORAGE_KEY)).toBe('true');
  }

  it('without the Navigation API: Back at the new arrival pops to the outside page (not the fallback)', async () => {
    coldThenBackViaOutsideLink();
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/stake/cmp7');
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
    render(<App />); // the router's first entry in this document: idx 0
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(go).toHaveBeenCalledWith(-1);
    expect(path()).toBe('/stake/cmp7'); // not the /feed fallback
  });

  it('with the Navigation API (canGoBack false at the new document): pops too', async () => {
    coldThenBackViaOutsideLink();
    vi.spyOn(window.history, 'state', 'get').mockReturnValue({ idx: 0 });
    (window as unknown as { navigation?: unknown }).navigation = { canGoBack: false };
    try {
      expect(decideBrowserBack()).toBe('pop');
    } finally {
      delete (window as unknown as { navigation?: unknown }).navigation;
    }
  });

  it('a reload / back_forward boot reads the newest arrival\'s stored answer (its pop is then watched — p1364-go-back-dead-watch)', () => {
    coldThenBackViaOutsideLink();
    bootAs('reload');
    expect(window.sessionStorage.getItem(TAB_HAD_PREDECESSOR_STORAGE_KEY)).toBe('true');
  });
});

describe('D3 — the browser-backed check is encoding-safe', () => {
  it('an encoded path and its decoded form are the same router path', () => {
    window.history.replaceState(null, '', '/stake/ai%20safety/caf%C3%A9');
    expect(isBrowserBacked({ key: 'x', pathname: '/stake/ai safety/café' })).toBe(true);
    expect(isBrowserBacked({ key: 'x', pathname: '/stake/ai%20safety/caf%C3%A9' })).toBe(true);
    expect(isBrowserBacked({ key: 'x', pathname: '/stake/other' })).toBe(false);
  });

  it('a malformed escape does not throw', () => {
    window.history.replaceState(null, '', '/stake/%E0%A4%A');
    expect(() => isBrowserBacked({ key: 'x', pathname: '/stake/%E0%A4%A' })).not.toThrow();
  });

  it('cold /stake/<encoded tag> → push → browser back → Back still reaches the fallback', async () => {
    window.history.replaceState(null, '', '/stake/ai%20safety');
    const len = vi.spyOn(window.history, 'length', 'get').mockReturnValue(1); // a cold, fresh tab
    bootAs('navigate');
    len.mockRestore();
    render(<App />);
    act(() => nav('/point/p1'));
    await browserBack();
    expect(window.location.pathname).toBe('/stake/ai%20safety');
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(path()).toBe('/feed'));
  });
});
