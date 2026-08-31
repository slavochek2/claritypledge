/**
 * @file p695-nav-loading-clickable.test.tsx
 * @description Regression test: P695 — nav links must be clickable during profile loading phase
 *
 * Bug: `!sessionChecked || isLoading` gates ALL desktop nav links.
 * During the `sessionChecked=true, hasSession=true, isLoading=true` phase (100-500ms),
 * Feed/Docs/Groups links are replaced by skeleton divs and cannot be clicked.
 *
 * Fix: split gate so static links (Feed, Docs, Groups) render during profile loading.
 */
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseAuth = vi.fn();
vi.mock('@/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: vi.fn() },
}));

import { SimpleNavigation } from '@/app/components/layout/simple-navigation';

describe('P695: nav links clickable during profile loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Profile loading phase (sessionChecked=true, hasSession=true, isLoading=true)', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        session: { user: { id: 'test-user-id' } }, // session exists
        user: null,                                   // profile not yet loaded
        isLoading: true,                              // profile fetch in flight
        sessionChecked: true,                         // session check done
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
      });
    });

    it('renders Home (Feed) link — not a skeleton', () => {
      render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
      // Should find the Home link; before fix this is hidden behind a skeleton div
      expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
    });

    it('renders Letters link — not a skeleton', () => {
      render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
      expect(screen.getByRole('link', { name: /letters/i })).toBeInTheDocument();
    });

    // P1193: the link is labelled "Groups" now (the Clarity Group rename). The
    // PROPERTY P695 pinned is unchanged — this static nav link renders as a real
    // link during profile loading, not as a skeleton.
    it('renders the Groups link — not a skeleton', () => {
      render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
      expect(screen.getByRole('link', { name: /groups/i })).toBeInTheDocument();
    });

    it('does NOT show My Profile link (profile data not loaded yet)', () => {
      render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
      // My Profile requires slug/user data — must stay hidden during loading
      expect(screen.queryByRole('link', { name: /my profile/i })).not.toBeInTheDocument();
    });
  });

  describe('Full skeleton phase (sessionChecked=false) — unchanged behavior', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        session: null,
        user: null,
        isLoading: true,
        sessionChecked: false, // session check not yet complete
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
      });
    });

    it('does NOT render Home/Docs/Groups links — full skeleton shown', () => {
      render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
      // Full skeleton phase: we don't know auth state yet, keep full skeleton
      expect(screen.queryByRole('link', { name: /home/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /docs/i })).not.toBeInTheDocument();
    });
  });
});
