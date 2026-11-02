/**
 * @file p1536-toast-offset-shared.test.tsx
 * @description P1536: no toast may sit on the canvas bar's Clone and Share below 1280px. The shared Toaster starts toasts 3.5rem from the top, which lands ON the two-row owner bar there
 * (measured at 375px: the plain Publish toast, top 56px, covered both; hovering keeps it). The offset is the TOASTER's, not each call's: while the owner bar is on the page and the width is
 * under 1280px, the toaster starts under the bar's second row, for every toast the page raises (Publish, a rename, a refused Send, a dropped tag...). From 1280px, and on every page
 * with no owner bar, it is where it always was.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Toaster } from '@/components/ui/sonner';

const css = (): string => {
  const { container } = render(<Toaster />);
  return container.querySelector('style')?.textContent ?? '';
};
const rules = (text: string) => [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ selector: m[1]!.replace(/\s+/g, ' ').trim(), body: m[2]!.replace(/\s+/g, ' ').trim() }));

describe('the Toaster', () => {
  it('keeps its usual place: 3.5rem under the top, with the safe area', () => {
    const base = rules(css()).find(r => r.selector === '[data-sonner-toaster][data-y-position="top"]');
    expect(base?.body).toContain('top: calc(3.5rem + env(safe-area-inset-top)) !important');
  });

  it('below 1280px, with the owner bar on the page, starts under the bar\'s second row (3.5rem lower)', () => {
    const text = css();
    const media = /@media\s*\(max-width:\s*1279px\)\s*\{([\s\S]*)\}\s*$/.exec(text.replace(/\s+/g, ' ').trim())?.[1] ?? '';
    const inner = rules(media).find(r => r.selector.includes(':has([data-owner-bar])') && r.selector.includes('[data-sonner-toaster]'));
    expect(inner, 'a rule inside @media (max-width: 1279px) for the toaster while body has the owner bar').toBeDefined();
    expect(inner?.body).toContain('top: calc(7rem + env(safe-area-inset-top)) !important');
  });

  it('applies nowhere else: the owner-bar rule is only inside the narrow media query', () => {
    const outside = css().replace(/@media[^{]*\{[\s\S]*\}\s*$/, '');
    expect(outside).not.toContain('data-owner-bar');
  });
});
