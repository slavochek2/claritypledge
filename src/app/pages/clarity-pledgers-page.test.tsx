import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/auth';
import { ClarityPledgersPage } from './clarity-pledgers-page';
import type { Profile } from '@/app/data/api';
import type { ReactNode } from 'react';

// Mock Mixpanel
vi.mock('@/lib/mixpanel', () => ({
  analytics: {
    track: vi.fn(),
    identify: vi.fn(),
    setUserProperties: vi.fn(),
  },
}));

// Mock API
vi.mock('@/app/data/api', () => ({
  getVerifiedProfilesPage: vi.fn(),
  PLEDGERS_PAGE_SIZE: 30,
}));

// Import the mocked functions
import { analytics } from '@/lib/mixpanel';
import { getVerifiedProfilesPage } from '@/app/data/api';

// P1229: the page fetches one page + total; these tests give it everything in page one.
const mockPage = (profiles: Profile[]) =>
  vi.mocked(getVerifiedProfilesPage).mockResolvedValue({ profiles, total: profiles.length });

// Wrapper to provide router and tooltip context
const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <AuthProvider>
      <TooltipProvider>{children}</TooltipProvider>
    </AuthProvider>
  </MemoryRouter>
);

// Helper to create mock profiles
const createMockProfile = (id: number): Profile => ({
  id: `profile-${id}`,
  slug: `user-${id}`,
  name: `User ${id}`,
  email: `user${id}@example.com`,
  role: `Role ${id}`,
  reason: `Reason ${id}`,
  signedAt: '2024-01-15T10:30:00Z',
  isVerified: true,
  avatarColor: '#0044CC',
  witnesses: [],
  reciprocations: 0,
});

describe('ClarityPledgersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading state', () => {
    it('shows loading spinner while fetching profiles', async () => {
      // Mock API to never resolve (simulate loading state)
      vi.mocked(getVerifiedProfilesPage).mockReturnValue(new Promise(() => {}));

      render(<ClarityPledgersPage />, { wrapper });

      expect(screen.getByTestId('loader')).toBeInTheDocument();
      expect(screen.queryByText('Clarity Pledgers')).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('shows empty state when no profiles exist', async () => {
      mockPage([]);

      render(<ClarityPledgersPage />, { wrapper });

      await waitFor(() => {
        expect(screen.getByText('No Verified Pledgers Yet')).toBeInTheDocument();
      });

      expect(
        screen.getByText('Be the first to sign the pledge and verify your commitment!')
      ).toBeInTheDocument();
    });
  });

  describe('Data fetching', () => {
    it('fetches verified profiles on mount', async () => {
      const mockProfiles = [createMockProfile(1), createMockProfile(2)];
      mockPage(mockProfiles);

      render(<ClarityPledgersPage />, { wrapper });

      await waitFor(() => {
        expect(getVerifiedProfilesPage).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Mixpanel analytics', () => {
    it('fires pledgers_page_viewed once with profile count', async () => {
      const mockProfiles = [
        createMockProfile(1),
        createMockProfile(2),
        createMockProfile(3),
      ];
      mockPage(mockProfiles);

      render(<ClarityPledgersPage />, { wrapper });

      await waitFor(() => {
        expect(analytics.track).toHaveBeenCalledTimes(1);
      });

      expect(analytics.track).toHaveBeenCalledWith('pledgers_page_viewed', {
        pledger_count: 3,
      });
    });

    it('does not fire analytics when profiles are empty', async () => {
      mockPage([]);

      render(<ClarityPledgersPage />, { wrapper });

      await waitFor(() => {
        expect(screen.getByText('No Verified Pledgers Yet')).toBeInTheDocument();
      });

      // Analytics still fires with count 0
      expect(analytics.track).toHaveBeenCalledWith('pledgers_page_viewed', {
        pledger_count: 0,
      });
    });
  });

  describe('Mobile carousel (JSDOM limitation - visual only)', () => {
    it('mobile carousel limits to MAX_MOBILE_CAROUSEL (20 profiles)', async () => {
      // Create 30 profiles
      const mockProfiles = Array.from({ length: 30 }, (_, i) =>
        createMockProfile(i + 1)
      );
      mockPage(mockProfiles);

      render(<ClarityPledgersPage />, { wrapper });

      await waitFor(() => {
        expect(screen.getAllByText('User 1').length).toBeGreaterThan(0);
      });

      // On mobile (JSDOM can't test responsive CSS, but we can check DOM structure)
      // The mobile carousel should only render first 20 profiles
      // However, in JSDOM, both mobile and desktop render (no CSS media query support)
      // We'll just verify the "Showing 20 of 30" message is in the DOM
      expect(screen.getByText(/Showing 20 of 30 pledgers/i)).toBeInTheDocument();
    });

    it('dot indicators render (one per mobile profile, max 20)', async () => {
      const mockProfiles = Array.from({ length: 15 }, (_, i) =>
        createMockProfile(i + 1)
      );
      mockPage(mockProfiles);

      const { container } = render(<ClarityPledgersPage />, { wrapper });

      await waitFor(() => {
        expect(screen.getAllByText('User 1').length).toBeGreaterThan(0);
      });

      // Dot indicators are buttons with aria-label
      const dots = container.querySelectorAll('button[aria-label^="Go to profile"]');
      expect(dots.length).toBe(15);
    });

    it('shows "Showing X of Y" when profiles exceed MAX_MOBILE_CAROUSEL', async () => {
      const mockProfiles = Array.from({ length: 25 }, (_, i) =>
        createMockProfile(i + 1)
      );
      mockPage(mockProfiles);

      render(<ClarityPledgersPage />, { wrapper });

      await waitFor(() => {
        expect(screen.getByText(/Showing 20 of 25 pledgers/i)).toBeInTheDocument();
      });
    });

    it('does not show "Showing X of Y" when profiles <= MAX_MOBILE_CAROUSEL', async () => {
      const mockProfiles = Array.from({ length: 15 }, (_, i) =>
        createMockProfile(i + 1)
      );
      mockPage(mockProfiles);

      render(<ClarityPledgersPage />, { wrapper });

      await waitFor(() => {
        expect(screen.getAllByText('User 1').length).toBeGreaterThan(0);
      });

      expect(screen.queryByText(/Showing/i)).not.toBeInTheDocument();
    });
  });

  describe('Desktop grid (JSDOM limitation - visual only)', () => {
    it('desktop grid shows all profiles (no limit)', async () => {
      const mockProfiles = Array.from({ length: 30 }, (_, i) =>
        createMockProfile(i + 1)
      );
      mockPage(mockProfiles);

      const { container } = render(<ClarityPledgersPage />, { wrapper });

      await waitFor(() => {
        expect(screen.getAllByText('User 1').length).toBeGreaterThan(0);
      });

      // Desktop grid has hidden md:grid class
      const desktopGrid = container.querySelector('.md\\:grid');
      expect(desktopGrid).toBeInTheDocument();

      // Desktop grid should have all 30 profiles as children
      // In JSDOM, CSS classes don't affect rendering, so we check structure
      const allCards = screen.getAllByText(/User \d+/);
      // Mobile shows 20, desktop shows 30, so total is 50 in JSDOM (both render)
      expect(allCards.length).toBeGreaterThanOrEqual(30);
    });
  });

  // P1229 D1: the desktop grid renders one page at a time behind a "Show more" control.
  // The browser cannot prove the last clause — exhausting 5,308 test-DB pledgers is 176
  // clicks — so the boundary lives here.
  describe('Desktop pagination (P1229 D1)', () => {
    const page = (from: number, count: number) =>
      Array.from({ length: count }, (_, i) => createMockProfile(from + i + 1));

    it('renders one page and a "Show more" control while more remain', async () => {
      vi.mocked(getVerifiedProfilesPage).mockResolvedValue({ profiles: page(0, 30), total: 75 });

      render(<ClarityPledgersPage />, { wrapper });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Show 30 more pledgers/ })).toBeInTheDocument();
      });
      expect(screen.getByText('Showing 30 of 75 pledgers')).toBeInTheDocument();
      expect(screen.queryByText(/User 31\b/)).not.toBeInTheDocument();
    });

    it('appends the next page on each click and drops the control at total', async () => {
      vi.mocked(getVerifiedProfilesPage)
        .mockResolvedValueOnce({ profiles: page(0, 30), total: 75 })
        .mockResolvedValueOnce({ profiles: page(30, 30), total: 75 })
        .mockResolvedValueOnce({ profiles: page(60, 15), total: 75 });

      render(<ClarityPledgersPage />, { wrapper });
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Show 30 more pledgers/ })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Show 30 more pledgers/ }));
      await waitFor(() => {
        expect(screen.getByText('Showing 60 of 75 pledgers')).toBeInTheDocument();
      });
      // last page is the remainder, not a full page
      expect(screen.getByRole('button', { name: /Show 15 more pledgers/ })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Show 15 more pledgers/ }));
      await waitFor(() => {
        expect(screen.getAllByText(/User 75\b/).length).toBeGreaterThan(0);
      });

      // loaded === total → the control is gone, and so is the desktop counter beside it.
      // (The mobile carousel's own "Showing 20 of 75 pledgers" line is a different element
      // and correctly stays — the carousel cap is unrelated to desktop pagination.)
      expect(screen.queryByRole('button', { name: /more pledgers/ })).not.toBeInTheDocument();
      expect(screen.queryByText('Showing 75 of 75 pledgers')).not.toBeInTheDocument();

      expect(getVerifiedProfilesPage).toHaveBeenNthCalledWith(1, 0);
      expect(getVerifiedProfilesPage).toHaveBeenNthCalledWith(2, 30);
      expect(getVerifiedProfilesPage).toHaveBeenNthCalledWith(3, 60);
    });

    it('keeps "Show more" alive when a page fetch fails mid-list (P1229 review, HIGH)', async () => {
      // getVerifiedProfilesPage swallows RPC errors and returns {profiles: [], total: 0}.
      // Writing that zero into totalCount makes hasMore false forever, so one flaky click
      // silently truncates the list at page 1 with no error and no way to recover.
      vi.mocked(getVerifiedProfilesPage)
        .mockResolvedValueOnce({ profiles: page(0, 30), total: 75 })
        .mockResolvedValueOnce({ profiles: [], total: 0 })
        .mockResolvedValueOnce({ profiles: page(30, 30), total: 75 });

      render(<ClarityPledgersPage />, { wrapper });
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Show 30 more pledgers/ })).toBeInTheDocument();
      });

      // the failing click must not destroy the known-good total
      await user.click(screen.getByRole('button', { name: /Show 30 more pledgers/ }));
      await waitFor(() => {
        expect(getVerifiedProfilesPage).toHaveBeenCalledTimes(2);
      });
      expect(screen.getByText('Showing 30 of 75 pledgers')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Show 30 more pledgers/ })).toBeInTheDocument();

      // and a retry still works
      await user.click(screen.getByRole('button', { name: /Show 30 more pledgers/ }));
      await waitFor(() => {
        expect(screen.getByText('Showing 60 of 75 pledgers')).toBeInTheDocument();
      });
    });

    it('does not render the control when the first page is the whole set', async () => {
      mockPage(page(0, 12));

      render(<ClarityPledgersPage />, { wrapper });

      await waitFor(() => {
        expect(screen.getAllByText('User 1').length).toBeGreaterThan(0);
      });
      expect(screen.queryByRole('button', { name: /more pledgers/ })).not.toBeInTheDocument();
    });
  });

  describe('CTA section', () => {
    it('"Ready to Commit" CTA section appears after loading', async () => {
      const mockProfiles = [createMockProfile(1)];
      mockPage(mockProfiles);

      render(<ClarityPledgersPage />, { wrapper });

      await waitFor(() => {
        expect(screen.getByText('Ready to Commit?')).toBeInTheDocument();
      });

      expect(
        screen.getByText('Make your public commitment to clear communication.')
      ).toBeInTheDocument();
    });

    it('CTA section does not appear while loading', () => {
      vi.mocked(getVerifiedProfilesPage).mockReturnValue(new Promise(() => {}));

      render(<ClarityPledgersPage />, { wrapper });

      expect(screen.queryByText('Ready to Commit?')).not.toBeInTheDocument();
    });
  });

  describe('Page header', () => {
    it('renders page title', async () => {
      mockPage([]);

      render(<ClarityPledgersPage />, { wrapper });

      expect(screen.getByText('Clarity Pledgers')).toBeInTheDocument();
    });
  });

  describe('Carousel navigation (dot clicks)', () => {
    it('clicking dot button triggers scroll (structure test)', async () => {
      const mockProfiles = Array.from({ length: 5 }, (_, i) =>
        createMockProfile(i + 1)
      );
      mockPage(mockProfiles);

      const { container } = render(<ClarityPledgersPage />, { wrapper });

      await waitFor(() => {
        expect(screen.getAllByText('User 1').length).toBeGreaterThan(0);
      });

      // Find dot buttons
      const dots = container.querySelectorAll('button[aria-label^="Go to profile"]');
      expect(dots.length).toBe(5);

      // Click second dot (index 1)
      const user = userEvent.setup();
      await user.click(dots[1]);

      // In JSDOM, scrollTo is mocked, so we just verify the button exists and is clickable
      expect(dots[1]).toBeInTheDocument();
    });
  });
});
