/**
 * P906 — /cm calendar-dominant layout contract.
 *
 * The original page boxed the calendar into a 672px-wide, 600px-tall panel
 * under a full hero header. The approved redesign makes the calendar the page:
 *   - compact header row (title + subscribe link), minimal padding
 *   - wide container (max-w-6xl)
 *   - near-full-viewport iframe height (100dvh-relative, not a fixed px box)
 *   - WEEK view on desktop / AGENDA on mobile — a single iframe whose mode is
 *     picked via matchMedia, so the heavy Google embed loads exactly once
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
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

function getCalendarIframe(): HTMLIFrameElement {
  return screen.getByTitle('Clarity Pledge Chiang Mai events calendar');
}

describe('P906: /cm calendar-dominant layout', () => {
  it('desktop viewport renders a single WEEK-mode iframe', () => {
    mockMatchMedia(true);
    render(<ChiangMaiPage />);

    const iframes = document.querySelectorAll('iframe');
    expect(iframes, 'exactly one iframe — the embed must not double-load').toHaveLength(1);

    const iframe = getCalendarIframe();
    expect(iframe.src).toContain('mode=WEEK');
    expect(iframe.src).toContain(encodeURIComponent(CALENDAR_ID));
  });

  it('mobile viewport renders a single AGENDA-mode iframe', () => {
    mockMatchMedia(false);
    render(<ChiangMaiPage />);

    const iframes = document.querySelectorAll('iframe');
    expect(iframes).toHaveLength(1);

    const iframe = getCalendarIframe();
    expect(iframe.src).toContain('mode=AGENDA');
    expect(iframe.src).toContain(encodeURIComponent(CALENDAR_ID));
  });

  it('iframe height is viewport-relative, not a fixed pixel box', () => {
    mockMatchMedia(true);
    render(<ChiangMaiPage />);

    const iframe = getCalendarIframe();
    expect(
      iframe.className,
      `iframe must size against the viewport (100dvh calc) so the calendar dominates the screen. Current classes: ${iframe.className}`,
    ).toMatch(/h-\[calc\(100dvh/);
    expect(iframe.className, 'fixed h-[600px] box is the pre-P906 design').not.toContain('h-[600px]');
  });

  it('container is wide (max-w-6xl), not the pre-P906 max-w-2xl column', () => {
    mockMatchMedia(true);
    const { container } = render(<ChiangMaiPage />);

    expect(container.querySelector('.max-w-6xl'), 'wide container must exist').toBeTruthy();
    expect(container.querySelector('.max-w-2xl'), 'narrow column must be gone').toBeNull();
  });

  it('switches embed mode live when the viewport crosses the breakpoint', () => {
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

    render(<ChiangMaiPage />);
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

  it('compact header keeps the title and the subscribe link', () => {
    mockMatchMedia(true);
    render(<ChiangMaiPage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Clarity Pledge — Chiang Mai');

    const subscribe = screen.getByRole('link', { name: /add this calendar to yours/i });
    expect(subscribe).toHaveAttribute('href', `https://calendar.google.com/calendar/u/0?cid=${btoa(CALENDAR_ID)}`);
    expect(subscribe).toHaveAttribute('target', '_blank');
    expect(subscribe).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
