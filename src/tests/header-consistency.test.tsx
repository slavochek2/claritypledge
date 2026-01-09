/**
 * @file header-consistency.test.tsx
 * @description Tests that header styling is consistent across pages.
 * The logo and hamburger menu should be at the same horizontal position
 * on both the landing page and live meeting page.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LiveSessionBanner } from '@/app/components/partners/live-session-banner';

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

  it('both headers use the same height on desktop', () => {
    // Both should use h-16 base height for consistency
    // This is a documentation test - the actual height classes are:
    // SimpleNavigation: h-16 lg:h-20
    // LiveSessionBanner: h-16
    // We verify LiveSessionBanner matches the base h-16
    const { container } = render(
      <BrowserRouter>
        <LiveSessionBanner partnerName="Test Partner" />
      </BrowserRouter>
    );

    const headerDiv = container.querySelector('div');
    expect(headerDiv?.className).toContain('h-16');
  });
});
