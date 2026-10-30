// @vitest-environment jsdom
/**
 * P1595 (founder UAT): inside the app shell the page loader is centred on the CONTENT column, not the viewport, with the
 * desktop sidebar open (248px) or collapsed (4rem). The shell publishes the width as --shell-sidebar-w (lg only); the
 * content loader's fixed mark and its slow-load notice start at that offset. jsdom does not lay out, so the wiring is
 * asserted here; the measured centres (Chromium, open / collapsed / 375 / 320) are in the P1595 report.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { ClarityContentLoader, ClarityBootLoader } from '@/components/ui/clarity-loader';

describe('the page loader inside the shell', () => {
  it('the content loader\'s mark is offset by the shell\'s sidebar width', () => {
    render(<ClarityContentLoader />);
    const mark = screen.getByTestId('content-loader-mark');
    expect(mark.className).toContain('left-[var(--shell-sidebar-w,0px)]');
    expect(mark.className).toContain('right-0');
    expect(mark.className).not.toMatch(/\binset-0\b/);
  });

  it('the boot splash (no shell) stays viewport-centred', () => {
    const { container } = render(<ClarityBootLoader />);
    expect(container.querySelector('.fixed.inset-0')).not.toBeNull();
  });

  it('the shell publishes the width for both sidebar states, desktop only', () => {
    const layout = readFileSync('src/app/layouts/clarity-landing-layout.tsx', 'utf8');
    expect(layout).toContain('lg:pl-16 lg:[--shell-sidebar-w:4rem]');
    expect(layout).toContain('lg:pl-[248px] lg:[--shell-sidebar-w:248px]');
  });
});
