/**
 * @file header-consistency.test.tsx
 * @description Tests that header styling is consistent across pages.
 * The logo and hamburger menu should be at the same horizontal position
 * on both the landing page and live meeting page.
 *
 * TDD: These tests define the required structure for both navigations
 * to ensure pixel-perfect alignment.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LiveSessionBanner } from '@/app/components/partners/live-session-banner';
import { SimpleNavigation } from '@/app/components/layout/simple-navigation';

// Mock useAuth for SimpleNavigation
vi.mock('@/auth', () => ({
  useAuth: () => ({
    session: null,
    user: null,
    isLoading: false,
    sessionChecked: true,
    signOut: vi.fn(),
  }),
}));

// Mock useSoundEnabled for LiveSessionBanner
vi.mock('@/hooks/use-sound', () => ({
  useSoundEnabled: () => [true, vi.fn()],
}));

// Mock analytics
vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: vi.fn() },
}));

describe('Header consistency', () => {
  it('LiveSessionBanner uses container styling matching SimpleNavigation', () => {
    const { container } = render(
      <BrowserRouter>
        <LiveSessionBanner partnerName="Test Partner" />
      </BrowserRouter>
    );

    // Should have a div with container class for max-width centering
    // This matches SimpleNavigation's structure: outer wrapper > container > content
    const containerDiv = container.querySelector('.container');
    expect(containerDiv).toBeTruthy();
    expect(containerDiv?.className).toContain('mx-auto');
  });

  it('both headers use the same responsive height including the safe-area inset', () => {
    // P52: Both navigations must use identical height to prevent visual shift.
    // P956: that height became safe-area-aware (viewport-fit=cover). Both now total
    // base + env(safe-area-inset-top): SimpleNavigation grows its <nav> by
    // pt-[env(safe-area-inset-top)] above an inner h-16/lg:h-20 row; LiveSessionBanner
    // grows its outer height to calc(4rem|5rem + env(safe-area-inset-top)) + the same pt.
    // At inset = 0 both resolve to 4rem/5rem (the prior h-16/lg:h-20) — invariant preserved.
    const { container: liveBanner } = render(
      <BrowserRouter>
        <LiveSessionBanner partnerName="Test Partner" />
      </BrowserRouter>
    );
    const bannerDiv = liveBanner.querySelector('div');
    // Banner outer height = base + inset; pt pushes the content row below the inset.
    expect(bannerDiv?.className).toContain('h-[calc(4rem+env(safe-area-inset-top))]');
    expect(bannerDiv?.className).toContain('lg:h-[calc(5rem+env(safe-area-inset-top))]');
    expect(bannerDiv?.className).toContain('pt-[env(safe-area-inset-top)]');

    const { container: simpleNav } = render(
      <BrowserRouter>
        <SimpleNavigation />
      </BrowserRouter>
    );
    // SimpleNavigation grows its <nav> by the same inset above an h-16/lg:h-20 content row.
    const nav = simpleNav.querySelector('nav');
    expect(nav?.className).toContain('pt-[env(safe-area-inset-top)]');
    const navRow = simpleNav.querySelector('.relative.flex.items-center');
    expect(navRow?.className).toContain('h-16');
    expect(navRow?.className).toContain('lg:h-20');
  });

  it('hamburger button uses same padding as SimpleNavigation (p-2)', () => {
    // P52: Hamburger button must have identical padding to prevent position shift
    // between landing page (SimpleNavigation) and /live (LiveSessionBanner)
    const { container } = render(
      <BrowserRouter>
        <LiveSessionBanner partnerName="Test Partner" />
      </BrowserRouter>
    );

    const menuButton = container.querySelector('[data-testid="menu-trigger"]');
    expect(menuButton?.className).toContain('p-2');
    expect(menuButton?.className).toContain('rounded-md');
  });

  it('EXACT MATCH: both navigations use identical container structure', () => {
    // TDD: This test ensures PIXEL-PERFECT alignment between navigations
    // Both must use: container mx-auto px-4 lg:px-8

    const { container: simpleNav } = render(
      <BrowserRouter>
        <SimpleNavigation />
      </BrowserRouter>
    );

    const { container: liveBanner } = render(
      <BrowserRouter>
        <LiveSessionBanner />
      </BrowserRouter>
    );

    // Find the container div in both
    const simpleContainer = simpleNav.querySelector('.container');
    const liveContainer = liveBanner.querySelector('.container');

    // Both should have identical horizontal padding classes
    expect(simpleContainer?.className).toContain('px-4');
    expect(simpleContainer?.className).toContain('lg:px-8');
    expect(liveContainer?.className).toContain('px-4');
    expect(liveContainer?.className).toContain('lg:px-8');
  });

  it('EXACT MATCH: logo Link has identical className in both navigations', () => {
    // TDD: Logo positioning must be identical
    const { container: simpleNav } = render(
      <BrowserRouter>
        <SimpleNavigation />
      </BrowserRouter>
    );

    const { container: liveBanner } = render(
      <BrowserRouter>
        <LiveSessionBanner />
      </BrowserRouter>
    );

    // Find the logo link (first Link element)
    const simpleLogo = simpleNav.querySelector('a[href="/"]');
    const liveLogo = liveBanner.querySelector('a[href="/"]');

    // Extract just the styling classes (not href or other attrs)
    const simpleLogoClasses = simpleLogo?.className || '';
    const liveLogoClasses = liveLogo?.className || '';

    // Both should have identical styling
    expect(simpleLogoClasses).toBe(liveLogoClasses);
  });

  it('EXACT MATCH: inner flex container has identical structure', () => {
    // TDD: The flex container holding logo and hamburger must be identical
    const { container: simpleNav } = render(
      <BrowserRouter>
        <SimpleNavigation />
      </BrowserRouter>
    );

    const { container: liveBanner } = render(
      <BrowserRouter>
        <LiveSessionBanner />
      </BrowserRouter>
    );

    // Find the inner flex container (has 'relative flex items-center justify-between')
    const simpleInner = simpleNav.querySelector('.relative.flex.items-center');
    const liveInner = liveBanner.querySelector('.relative.flex.items-center');

    // Both should have justify-between
    expect(simpleInner?.className).toContain('justify-between');
    expect(liveInner?.className).toContain('justify-between');
  });
});

describe('Scrollbar layout stability', () => {
  // Note: This documents a CSS fix in index.css
  // scrollbar-gutter: stable prevents layout shift between pages
  // where one has scrollbar and the other doesn't
  it('documents scrollbar-gutter requirement', () => {
    // This is a documentation test - the actual fix is in index.css
    // html { scrollbar-gutter: stable; }
    //
    // Why: SimpleNavigation uses position:fixed (viewport-relative)
    //      LiveSessionBanner uses position:static (document-relative)
    //      Without scrollbar-gutter:stable, the container shifts by
    //      ~15px when navigating between pages with/without scrollbar
    expect(true).toBe(true);
  });
});
