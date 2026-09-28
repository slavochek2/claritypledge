/**
 * @file p1364-scroll-to-top.test.tsx
 * @description P1364 §5 — ScrollToTop's restore contract, in jsdom with a simulated document.
 *
 * jsdom has no layout, so the window here is modelled: `scrollTo` clamps to `maxY` (the
 * document's height minus the viewport), exactly what makes a one-shot restore land on ~0
 * while a list page is still a spinner, and — like a browser — every scrollTo that moves the
 * window fires a real `scroll` event, asynchronously (next task). So the clamped values a
 * restore produces DO reach ScrollToTop's scroll tracker, as they would in a browser.
 * `maxY` is raised mid-test to play "the data arrived".
 * The real-layout ACs (same first card) are asserted in Playwright: e2e/p1364-back-navigation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from 'react-router-dom';
import { useReturnState } from '@/app/hooks/use-return-state';
import { ScrollToTop, RESTORE_WINDOW_MS } from '@/app/components/scroll-to-top';
import {
  MAX_SAVED_POSITIONS,
  __savedPositionsForTest,
  getSavedPosition,
  rememberPosition,
  scrollEntryKey,
} from '@/lib/scroll-positions';

let y = 0;
let maxY = 10_000;
const scrollTo = vi.fn((_x: number, top: number) => {
  const next = Math.max(0, Math.min(top, maxY));
  if (next === y) return;
  y = next;
  setTimeout(() => window.dispatchEvent(new Event('scroll')), 0);
});

let nav: NavigateFunction;
function NavGrab() {
  nav = useNavigate();
  return null;
}

function renderAt(entries: string[] = ['/feed']) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <ScrollToTop />
      <NavGrab />
      <Routes>
        <Route path="*" element={<div />} />
      </Routes>
    </MemoryRouter>
  );
}

/** The reader scrolls: the window moves and fires `scroll`, which the tracker records. */
function readerScrollsTo(top: number) {
  y = top;
  window.dispatchEvent(new Event('scroll'));
}
const go = (to: string | number, opts?: { replace?: boolean }) =>
  act(() => {
    if (typeof to === 'number') nav(to);
    else nav(to, opts);
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'] });
  y = 0;
  maxY = 10_000;
  scrollTo.mockClear();
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y });
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('P1364 ScrollToTop — POP restore', () => {
  it('a PUSH starts at the top; Back restores the position the entry was left at', () => {
    renderAt();
    readerScrollsTo(2400);
    go('/story/1');
    expect(y).toBe(0);
    go(-1);
    expect(y).toBe(2400);
  });

  it('keeps retrying while the page is too short, and lands once the content arrives', () => {
    renderAt();
    readerScrollsTo(2400);
    go('/story/1');
    maxY = 600; // the feed remounts as a spinner
    go(-1);
    expect(y).toBe(600); // clamped
    act(() => { vi.advanceTimersByTime(400); });
    maxY = 5000; // the list rendered
    act(() => { vi.advanceTimersByTime(50); });
    expect(y).toBe(2400);
    const calls = scrollTo.mock.calls.length;
    act(() => { vi.advanceTimersByTime(1000); });
    expect(scrollTo.mock.calls.length).toBe(calls); // done: no more writes once it landed
  });

  it('gives up after the bounded window (~1.5 s)', () => {
    renderAt();
    readerScrollsTo(2400);
    go('/story/1');
    maxY = 600;
    go(-1);
    act(() => { vi.advanceTimersByTime(RESTORE_WINDOW_MS + 100); });
    const calls = scrollTo.mock.calls.length;
    act(() => { vi.advanceTimersByTime(2000); });
    expect(scrollTo.mock.calls.length).toBe(calls);
  });

  it.each(['wheel', 'touchstart', 'keydown', 'pointerdown'])('stops at the reader\'s first %s', (type) => {
    renderAt();
    readerScrollsTo(2400);
    go('/story/1');
    maxY = 600;
    go(-1);
    act(() => { window.dispatchEvent(new Event(type)); });
    const calls = scrollTo.mock.calls.length;
    maxY = 5000;
    act(() => { vi.advanceTimersByTime(500); });
    expect(scrollTo.mock.calls.length).toBe(calls);
    expect(y).toBe(600);
  });

  it('a mostly-HORIZONTAL wheel (macOS swipe-back momentum) does not stop it', () => {
    renderAt();
    readerScrollsTo(2400);
    go('/story/1');
    maxY = 600;
    go(-1);
    act(() => { window.dispatchEvent(new WheelEvent('wheel', { deltaX: 40, deltaY: 3 })); });
    maxY = 5000;
    act(() => { vi.advanceTimersByTime(50); });
    expect(y).toBe(2400);
  });

  it('a mostly-vertical wheel does stop it', () => {
    renderAt();
    readerScrollsTo(2400);
    go('/story/1');
    maxY = 600;
    go(-1);
    act(() => { window.dispatchEvent(new WheelEvent('wheel', { deltaX: 2, deltaY: 30 })); });
    maxY = 5000;
    act(() => { vi.advanceTimersByTime(200); });
    expect(y).toBe(600);
  });

  it('a `scroll` event does NOT stop it — the restore fires those itself', () => {
    renderAt();
    readerScrollsTo(2400);
    go('/story/1');
    maxY = 600;
    go(-1);
    act(() => { window.dispatchEvent(new Event('scroll')); });
    maxY = 5000;
    act(() => { vi.advanceTimersByTime(50); });
    expect(y).toBe(2400);
  });

  it('leaving mid-retry cancels it and never saves the clamped value as the position', () => {
    renderAt();
    readerScrollsTo(2400);
    go('/story/1');
    maxY = 600;
    go(-1); // restore in flight, window clamped at 600
    act(() => { vi.advanceTimersByTime(100); }); // the clamp's own scroll events are delivered
    go(1); // forward to the story before the list arrived
    const calls = scrollTo.mock.calls.length;
    act(() => { vi.advanceTimersByTime(500); });
    expect(scrollTo.mock.calls.length).toBe(calls); // cancelled in cleanup
    maxY = 5000;
    go(-1);
    expect(y).toBe(2400); // the saved position is still the one the reader left, not 600
  });
});

describe('P1364 ScrollToTop — PUSH / REPLACE', () => {
  it('a REPLACE that keeps the pathname (a feed tab, the search box) does not scroll to the top', () => {
    renderAt(['/feed']);
    readerScrollsTo(1800);
    scrollTo.mockClear();
    go('/feed?tab=stories', { replace: true });
    expect(scrollTo).not.toHaveBeenCalled();
    expect(y).toBe(1800);
  });

  it('a REPLACE to a different pathname starts at the top', () => {
    renderAt(['/me/calibration']);
    readerScrollsTo(900);
    go('/login?redirect=/me/calibration', { replace: true });
    expect(y).toBe(0);
  });

  it('a REPLACE drops the replaced entry, so a search session does not fill the position store', () => {
    renderAt(['/feed']);
    readerScrollsTo(500);
    for (let i = 0; i < 80; i++) go(`/feed?q=${'x'.repeat(i + 1)}`, { replace: true });
    go('/story/1');
    expect(__savedPositionsForTest().size).toBe(1); // only the live /feed entry
    go(-1);
    expect(y).toBe(500);
  });

  it('after a same-path REPLACE, leaving and coming back restores the latest position', () => {
    renderAt(['/feed']);
    readerScrollsTo(1800);
    go('/feed?tab=stories', { replace: true });
    readerScrollsTo(2100);
    go('/story/1');
    go(-1);
    expect(y).toBe(2100);
  });
});

describe('P1364 scroll position store', () => {
  it('entries sharing location.key "default" do not share a position', () => {
    rememberPosition(scrollEntryKey('default', '/feed', ''), 1200);
    rememberPosition(scrollEntryKey('default', '/stake/cmp7', ''), 300);
    expect(getSavedPosition(scrollEntryKey('default', '/feed', ''))).toBe(1200);
    expect(getSavedPosition(scrollEntryKey('default', '/stake/cmp7', ''))).toBe(300);
    expect(getSavedPosition(scrollEntryKey('default', '/feed', '?tab=stories'))).toBeUndefined();
  });

  it(`is capped at ${MAX_SAVED_POSITIONS} entries, oldest dropped first`, () => {
    for (let i = 0; i < MAX_SAVED_POSITIONS + 10; i++) rememberPosition(`e${i}`, i);
    expect(__savedPositionsForTest().size).toBe(MAX_SAVED_POSITIONS);
    expect(getSavedPosition('e0')).toBeUndefined();
    expect(getSavedPosition(`e${MAX_SAVED_POSITIONS + 9}`)).toBe(MAX_SAVED_POSITIONS + 9);
  });
});

/**
 * A card above the restored position that opens AFTER the first restore attempt, with the
 * browser's scroll anchoring modelled: when it grows by 300px, scrollY moves by 300 to keep the
 * visible content still (Chrome's overflow-anchor). That is what shifted the reader off target.
 */
function AnchoredCard() {
  const [open, setOpen] = useReturnState('anchored-card', false);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (open) { y += 300; window.dispatchEvent(new Event('scroll')); }
  }, [open]);
  return <button type="button" onClick={() => setOpen(o => !o)}>{open ? 'open' : 'closed'}</button>;
}

describe('P1364 ScrollToTop — a same-route POP whose cards re-open after the first attempt', () => {
  it('/list → PUSH /list?tag=x → Back: the card re-opens above the target, and the restore still lands on the target', () => {
    render(
      <MemoryRouter initialEntries={['/list']}>
        <ScrollToTop />
        <NavGrab />
        <Routes>
          <Route path="/list" element={<AnchoredCard />} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'closed' })); // the reader opens it…
    readerScrollsTo(1200); // …and scrolls to 1200 (the open card's height already counted)
    go('/list?tag=x'); // same route, still mounted: the card resets (PUSH)
    expect(screen.getByRole('button').textContent).toBe('closed');
    go(-1); // POP: ScrollToTop restores 1200 first; the card re-opens in its own layout effect
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByRole('button').textContent).toBe('open');
    expect(y).toBe(1200);
  });
});

