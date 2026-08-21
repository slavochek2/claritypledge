/**
 * P909 — /cm full-screen chrome-free layout contract (supersedes P906's
 * in-chrome "calendar-dominant" card; file renamed from
 * p906-cm-page-layout.test.tsx).
 *
 * The page IS the calendar:
 *   - one slim affordance row: logo link home + "Add this calendar to yours"
 *   - no h1 title row, no max-width container, no bordered card
 *   - iframe edge-to-edge at calc(100dvh - row height), min-h guard retained
 *
 * Preserved P906 mechanism (regression — P906 AC #4):
 *   - WEEK view on desktop / AGENDA on mobile
 *   - a single iframe whose mode is picked via matchMedia, so the heavy
 *     Google embed loads exactly once, with a live 'change' listener
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChiangMaiPage } from '@/app/pages/chiang-mai-page';

const CALENDAR_ID =
  '9b457378eacead57b6d504bb9bba5f57b9d0194eb8d8dc153663c8a274e0c2fd@group.calendar.google.com';

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/cm']}>
      <ChiangMaiPage />
    </MemoryRouter>
  );
}

function getCalendarIframe(): HTMLIFrameElement {
  return screen.getByTitle('Clarity Pledge Chiang Mai events calendar');
}

describe('P909: /cm full-screen chrome-free layout', () => {
  it('desktop viewport renders a single WEEK-mode iframe (P906 regression)', () => {
    mockMatchMedia(true);
    renderPage();

    const iframes = document.querySelectorAll('iframe');
    expect(iframes, 'exactly one iframe — the embed must not double-load').toHaveLength(1);

    const iframe = getCalendarIframe();
    expect(iframe.src).toContain('mode=WEEK');
    expect(iframe.src).toContain(encodeURIComponent(CALENDAR_ID));
  });

  it('mobile viewport renders a single AGENDA-mode iframe (P906 regression)', () => {
    mockMatchMedia(false);
    renderPage();

    const iframes = document.querySelectorAll('iframe');
    expect(iframes).toHaveLength(1);

    const iframe = getCalendarIframe();
    expect(iframe.src).toContain('mode=AGENDA');
    expect(iframe.src).toContain(encodeURIComponent(CALENDAR_ID));
  });

  it('iframe is viewport-filling: 100dvh calc with the min-h guard retained', () => {
    mockMatchMedia(true);
    renderPage();

    const iframe = getCalendarIframe();
    expect(
      iframe.className,
      `iframe must size against the viewport (100dvh calc minus the slim row). Current classes: ${iframe.className}`,
    ).toMatch(/h-\[calc\(100dvh/);
    expect(iframe.className, 'min-h guard must be retained (P909 requirement 3)').toMatch(/min-h-\[/);
    expect(iframe.className, 'fixed h-[600px] box is the pre-P906 design').not.toContain('h-[600px]');
  });

  it('no container, no bordered card — iframe renders edge-to-edge', () => {
    mockMatchMedia(true);
    const { container } = renderPage();

    expect(container.querySelector('.max-w-6xl'), 'P906 wide container is superseded — no max-width').toBeNull();
    expect(container.querySelector('.max-w-2xl'), 'narrow column must stay gone').toBeNull();
    expect(container.querySelector('.bg-card'), 'card panel is superseded').toBeNull();
    expect(container.querySelector('.rounded-lg'), 'rounded card border is superseded').toBeNull();
  });

  it('switches embed mode live when the viewport crosses the breakpoint (P906 AC #4 regression)', () => {
    // The single-iframe design only works if the registered matchMedia
    // 'change' listener actually swaps the mode — a dead listener would
    // strand a rotated phone/resized window on the wrong view.
    let changeListener: ((e: MediaQueryListEvent) => void) | null = null;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(
        (event: string, cb: (e: MediaQueryListEvent) => void) => {
          if (event === 'change') changeListener = cb;
        }
      ),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    renderPage();
    expect(getCalendarIframe().src).toContain('mode=WEEK');
    expect(changeListener, "a 'change' listener must be registered").toBeTruthy();

    act(() => {
      changeListener!({ matches: false } as MediaQueryListEvent);
    });
    expect(getCalendarIframe().src).toContain('mode=AGENDA');

    act(() => {
      changeListener!({ matches: true } as MediaQueryListEvent);
    });
    expect(getCalendarIframe().src).toContain('mode=WEEK');
  });

  it('slim row: logo links home, subscribe link carries UTM tagging, no h1 title', () => {
    mockMatchMedia(true);
    renderPage();

    // The h1 title row is superseded — the slim row is the only chrome.
    expect(screen.queryByRole('heading'), 'no heading — title row is superseded by P909').toBeNull();

    const home = screen.getByRole('link', { name: /clarity pledge — home/i });
    expect(home, 'logo link is the only way back to the site').toHaveAttribute('href', '/');

    // P1134: subscribe link carries UTM channel-attribution params (see docs/technical/analytics.md)
    const subscribe = screen.getByRole('link', { name: /add this calendar to yours/i });
    const subscribeHref = subscribe.getAttribute('href')!;
    expect(subscribeHref.startsWith(`https://calendar.google.com/calendar/u/0?cid=${btoa(CALENDAR_ID)}`)).toBe(true);
    const params = new URL(subscribeHref).searchParams;
    expect(params.get('utm_source')).toBe('cm-page');
    expect(params.get('utm_medium')).toBe('calendar-subscribe');
    expect(params.get('utm_campaign')).toBe('chiang-mai-calendar');
    expect(subscribe).toHaveAttribute('target', '_blank');
    expect(subscribe).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
