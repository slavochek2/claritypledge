/**
 * @file p1019-chiang-mai-embed-loading.test.tsx
 * @description Canary for P1019 — `/chiang-mai` rendered its cross-origin
 * Google Calendar embed with no loading state, so the calendar region was blank
 * from route commit until Google's embed painted. Same defect P1017 fixed on
 * `/intro`; the overlay is now shared rather than copied.
 *
 * Cross-origin means the iframe never loads under jsdom, so `onLoad` is fired
 * by hand — the same signal the browser would deliver.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChiangMaiPage } from '@/app/pages/chiang-mai-page';

vi.mock('@/app/components/seo', () => ({ SEO: () => null }));

/** Captures the page's own change listener so a test can cross the breakpoint. */
let mediaListener: ((e: { matches: boolean }) => void) | null = null;

beforeEach(() => {
  mediaListener = null;
  // The page picks WEEK vs AGENDA from matchMedia at first render.
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn((_: string, fn: (e: { matches: boolean }) => void) => {
        mediaListener = fn;
      }),
      removeEventListener: vi.fn(),
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <ChiangMaiPage />
    </MemoryRouter>
  );
}

describe('P1019: the calendar region is never a blank box', () => {
  it('shows a loading overlay from first render', () => {
    renderPage();

    const overlay = screen.getByTestId('chiang-mai-calendar-loading');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveAttribute('role', 'status');
    expect(overlay).toHaveAttribute('aria-live', 'polite');
    // Opaque until the embed loads — this is what covers the blank box.
    expect(overlay.className).toContain('opacity-100');
  });

  it('releases pointer events and fades once the embed load event fires', () => {
    renderPage();

    fireEvent.load(screen.getByTitle('Clarity Pledge Chiang Mai events calendar'));

    const overlay = screen.getByTestId('chiang-mai-calendar-loading');
    // Still mounted (Google is still painting) but transparent to clicks, so a
    // calendar that IS ready is never held behind a spinner.
    expect(overlay.className).toContain('pointer-events-none');
    expect(overlay.className).toContain('opacity-0');
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
  });

  it('removes the overlay after the fade backstop, even with no transitionend', () => {
    vi.useFakeTimers();
    renderPage();

    fireEvent.load(screen.getByTitle('Clarity Pledge Chiang Mai events calendar'));
    act(() => {
      // Longer than FADE_MAX_MS + the 300ms backstop margin.
      vi.advanceTimersByTime(13000);
    });

    expect(screen.queryByTestId('chiang-mai-calendar-loading')).not.toBeInTheDocument();
  });

  it('re-covers the embed when the breakpoint swap reloads it', () => {
    // Code review of this fix: the page swaps WEEK for AGENDA at 768px while it
    // is open, which points the iframe at a NEW url and starts a fresh
    // navigation. The overlay is one-shot, so after the first fade completed a
    // desktop resize or a phone rotation reloaded the embed with no cover —
    // recreating the exact blank interval this fix removes.
    vi.useFakeTimers();
    renderPage();

    const iframe = screen.getByTitle('Clarity Pledge Chiang Mai events calendar');
    const weekSrc = iframe.getAttribute('src');

    fireEvent.load(iframe);
    act(() => {
      vi.advanceTimersByTime(13000);
    });
    expect(screen.queryByTestId('chiang-mai-calendar-loading')).not.toBeInTheDocument();

    // Cross the breakpoint: WEEK -> AGENDA.
    act(() => {
      mediaListener?.({ matches: false });
    });

    expect(
      screen.getByTitle('Clarity Pledge Chiang Mai events calendar').getAttribute('src')
    ).not.toBe(weekSrc);
    const overlay = screen.getByTestId('chiang-mai-calendar-loading');
    expect(overlay.className).toContain('opacity-100');
    expect(overlay).not.toHaveAttribute('aria-hidden');
  });

  it('does not dismiss the re-covered overlay on the reverse fade-in transition', () => {
    // Second-pass codex review of this fix: `onTransitionEnd` used to fire
    // unconditionally. The overlay's own `transition-opacity` runs BOTH ways —
    // forward (opacity-100 -> 0) when the embed loads, and in reverse
    // (opacity-0 -> 100) when resetKey re-covers it mid-fade for a breakpoint
    // swap. The reverse transition completing ALSO raises `transitionend`, and
    // an unconditional handler read that as "the fade-out finished" and
    // unmounted the overlay it had just put back up — exposing the new,
    // still-loading iframe. Sequence: load WEEK, let it start fading, cross the
    // breakpoint mid-fade (this reverses the transition), then simulate that
    // reverse transition completing. The overlay must still be covering.
    renderPage();

    const iframe = screen.getByTitle('Clarity Pledge Chiang Mai events calendar');
    fireEvent.load(iframe); // starts the forward fade (embedLoaded -> true)

    // Cross the breakpoint WHILE the fade is still in flight — the layout
    // effect re-covers synchronously (embedLoaded -> false), reversing the
    // transition.
    act(() => {
      mediaListener?.({ matches: false });
    });

    const overlay = screen.getByTestId('chiang-mai-calendar-loading');
    expect(overlay.className).toContain('opacity-100'); // re-covered

    // The reverse (fade-IN) transition finishing raises the same event.
    fireEvent.transitionEnd(overlay);

    // Must still be covering the new, not-yet-loaded iframe.
    expect(screen.getByTestId('chiang-mai-calendar-loading')).toBeInTheDocument();
    expect(screen.getByTestId('chiang-mai-calendar-loading').className).toContain('opacity-100');
  });

  it('leaves the header row and the calc height pairing untouched', () => {
    renderPage();

    // The spec forbids touching these: the h-10 row and calc(100dvh-2.5rem)
    // are deliberately kept in sync so row + iframe = exactly 100dvh.
    const iframe = screen.getByTitle('Clarity Pledge Chiang Mai events calendar');
    expect(iframe.className).toContain('h-[calc(100dvh-2.5rem)]');
    expect(iframe.className).toContain('min-h-[480px]');
    expect(document.querySelector('header')?.className).toContain('h-10');

    expect(screen.getByRole('link', { name: /Clarity Pledge — home/i })).toBeInTheDocument();
    expect(screen.getByText('Add this calendar to yours')).toBeInTheDocument();
  });
});
