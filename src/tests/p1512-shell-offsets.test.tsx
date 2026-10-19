/**
 * @file p1512-shell-offsets.test.ts
 * @description P1512 review round 2 (item 19): the offset overrides in index.css cover the offline-strip and
 * room-capture offset variants, and the full-width fixed bars carry the marker the sidebar rule keys on.
 * The CSS itself cannot be rendered in jsdom, so this pins the pieces that must stay in step with the
 * components that write those class names.
 */
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FixedBottomBar } from '@/app/components/shared/fixed-bottom-bar';

const css = readFileSync(`${process.cwd()}/src/index.css`, 'utf8');

describe('P1512 shell offsets', () => {
  it.each([
    'top-[calc(5.75rem+env(safe-area-inset-top))]',
    'top-[calc(6.75rem+env(safe-area-inset-top))]',
    'top-[calc(4rem+var(--room-head-offset)+env(safe-area-inset-top))]',
    'top-[calc(5rem+var(--room-head-offset)+env(safe-area-inset-top))]',
  ])('index.css overrides the nav offset class %s', (cls) => {
    expect(css).toContain(`[class*="${cls}"]`);
  });

  it('every offset class the components write is covered by an override', () => {
    const sources = [
      readFileSync(`${process.cwd()}/src/app/components/session/room-capture-bar.tsx`, 'utf8'),
      readFileSync(`${process.cwd()}/src/app/pages/meeting-terms-page.tsx`, 'utf8'),
      readFileSync(`${process.cwd()}/src/app/prototypes/events/components/EventRoomMeet.tsx`, 'utf8'),
    ].join('\n');
    const used = new Set([...sources.matchAll(/top-\[calc\((?:4|5|5\.75|6\.75)rem\+(?:var\(--room-head-offset\)\+)?env\(safe-area-inset-top\)\)\]/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThan(0);
    for (const cls of used) expect(css, `no override for ${cls}`).toContain(`[class*="${cls}"]`);
  });

  it('full-width fixed bars carry data-shell-bar, and the sidebar rules move them clear of it from lg up', () => {
    const { container } = render(<FixedBottomBar>action</FixedBottomBar>);
    expect(container.firstElementChild?.hasAttribute('data-shell-bar')).toBe(true);
    expect(readFileSync(`${process.cwd()}/src/app/components/legal/terms-notice-banner.tsx`, 'utf8')).toContain('data-shell-bar');
    expect(css).toMatch(/\[data-nav="sidebar"\]:not\(\[data-collapsed\]\)\) \[data-shell-bar\][^}]*left: 248px/s);
    expect(css).toMatch(/\[data-nav="sidebar"\]\[data-collapsed="true"\]\) \[data-shell-bar\][^}]*left: 4rem/s);
  });
});
