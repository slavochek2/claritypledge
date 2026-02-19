/**
 * @file no-double-scrollbar.test.tsx
 * @description TDD test to prevent double scrollbar regression on landing page.
 *
 * Bug: When landing page is wrapped in ClarityLandingLayout, using
 * overflow-x-hidden causes overflow-y: auto (CSS spec behavior),
 * creating a second scrollbar alongside the browser's.
 *
 * Solution: Use overflow-x: clip with overflow-y: visible instead.
 * The 'clip' value clips overflow without affecting the other axis.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ClarityPledgeLanding } from '@/app/pages/clarity-pledge-landing';
import { AuthProvider } from '@/auth';

describe('Landing Page - No Double Scrollbar', () => {
  it('root div should not use overflow-x-hidden (causes overflow-y: auto)', () => {
    const { container } = render(
      <BrowserRouter>
        <AuthProvider>
          <ClarityPledgeLanding />
        </AuthProvider>
      </BrowserRouter>
    );

    // The root div of ClarityPledgeLanding
    const rootDiv = container.firstElementChild as HTMLElement;
    expect(rootDiv).toBeTruthy();

    const className = rootDiv.className;

    // overflow-x-hidden without overflow-y-visible causes double scrollbar
    // We should use overflow-x: clip instead (via inline style)
    const hasProblematicOverflow = className.includes('overflow-x-hidden') &&
                                    !className.includes('overflow-y-visible');

    expect(
      hasProblematicOverflow,
      `Root div should not use overflow-x-hidden without overflow-y-visible. ` +
      `Use style={{ overflowX: 'clip' }} instead. Class: "${className}"`
    ).toBe(false);
  });

  it('should not use overflow-x-hidden alone on any container', () => {
    const { container } = render(
      <BrowserRouter>
        <AuthProvider>
          <ClarityPledgeLanding />
        </AuthProvider>
      </BrowserRouter>
    );

    // Find all elements with overflow-x-hidden class
    const elementsWithOverflowX = container.querySelectorAll('[class*="overflow-x-hidden"]');
    const problematic: string[] = [];

    elementsWithOverflowX.forEach((el) => {
      const className = el.className?.toString() || '';
      // Check if it has overflow-y-visible to counteract the auto behavior
      if (!className.includes('overflow-y-visible')) {
        problematic.push(`Element has overflow-x-hidden without overflow-y-visible: "${className.slice(0, 80)}"`);
      }
    });

    expect(problematic).toEqual([]);
  });

  it('root div should use inline style with overflow-x: clip for horizontal clipping', () => {
    const { container } = render(
      <BrowserRouter>
        <AuthProvider>
          <ClarityPledgeLanding />
        </AuthProvider>
      </BrowserRouter>
    );

    const rootDiv = container.firstElementChild as HTMLElement;
    expect(rootDiv).toBeTruthy();

    // Should use overflow-x: clip which doesn't affect overflow-y
    // Note: jsdom may not fully support 'clip', but we check the style attribute
    const style = rootDiv.getAttribute('style') || '';
    const hasOverflowClip = style.includes('overflow-x') || style.includes('clip');

    // If using overflow-x-hidden class, this test would catch the issue
    const usesOverflowXHiddenClass = rootDiv.className.includes('overflow-x-hidden');

    expect(
      hasOverflowClip || !usesOverflowXHiddenClass,
      'Root div should use overflow-x: clip (inline style) instead of overflow-x-hidden class'
    ).toBe(true);
  });
});
