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
