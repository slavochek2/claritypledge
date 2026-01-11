/**
 * @file live-session-banner.test.tsx
 * @description Comprehensive tests for LiveSessionBanner component
 *
 * KISS principle: Menu trigger ALWAYS renders (hamburger icon)
 * Auth state only affects menu CONTENTS, not whether trigger exists
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LiveSessionBanner } from '@/app/components/partners/live-session-banner';

// Mock useSoundEnabled hook
const mockSetSoundEnabled = vi.fn();
vi.mock('@/hooks/use-sound', () => ({
  useSoundEnabled: () => [true, mockSetSoundEnabled],
}));

// Create a mock factory for useAuth with different states
const createAuthMock = (overrides: {
  session?: object | null;
  user?: object | null;
  sessionChecked?: boolean;
  isLoading?: boolean;
} = {}) => ({
  session: overrides.session ?? null,
  user: overrides.user ?? null,
  sessionChecked: overrides.sessionChecked ?? true,
  isLoading: overrides.isLoading ?? false,
  signOut: vi.fn(),
  refreshProfile: vi.fn(),
});

// Default mock - anonymous user
let mockAuthState = createAuthMock();

vi.mock('@/auth', () => ({
  useAuth: () => mockAuthState,
}));

// Helper to render with router context
const renderWithRouter = (ui: React.ReactElement) => {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
};

// Helper to open dropdown menu using userEvent (handles async properly)
const openMenu = async () => {
  const user = userEvent.setup();
  const trigger = screen.getByTestId('menu-trigger');
  await user.click(trigger);
  // Wait for menu to be visible (Radix uses data-state="open")
  await waitFor(() => {
    expect(trigger).toHaveAttribute('data-state', 'open');
  });
};

describe('LiveSessionBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to anonymous state
    mockAuthState = createAuthMock();
  });

  // ============================================================================
  // CORE KISS GUARANTEE: Menu trigger ALWAYS renders
  // ============================================================================
  describe('KISS: Menu trigger always renders', () => {
    it('renders menu trigger for anonymous user', () => {
      mockAuthState = createAuthMock({ session: null, user: null });

      renderWithRouter(<LiveSessionBanner />);

      expect(screen.getByTestId('menu-trigger')).toBeInTheDocument();
      expect(screen.getByLabelText('Menu')).toBeInTheDocument();
    });

    it('renders menu trigger when auth is loading', () => {
      mockAuthState = createAuthMock({ isLoading: true, sessionChecked: false });

      renderWithRouter(<LiveSessionBanner />);

      expect(screen.getByTestId('menu-trigger')).toBeInTheDocument();
    });

    it('renders menu trigger when session exists but no profile', () => {
      mockAuthState = createAuthMock({
        session: { user: { id: 'user-123' } },
        user: null,
        sessionChecked: true,
        isLoading: false,
      });

      renderWithRouter(<LiveSessionBanner />);

      expect(screen.getByTestId('menu-trigger')).toBeInTheDocument();
    });

    it('renders menu trigger for fully logged in user', () => {
      mockAuthState = createAuthMock({
        session: { user: { id: 'user-123' } },
        user: { id: 'user-123', name: 'Test User', email: 'test@example.com', slug: 'test-user' },
        sessionChecked: true,
        isLoading: false,
      });

      renderWithRouter(<LiveSessionBanner />);

      expect(screen.getByTestId('menu-trigger')).toBeInTheDocument();
    });

    it('renders menu trigger when session check not complete', () => {
      mockAuthState = createAuthMock({ sessionChecked: false });

      renderWithRouter(<LiveSessionBanner />);

      expect(screen.getByTestId('menu-trigger')).toBeInTheDocument();
    });
  });

  // ============================================================================
  // Menu Contents - Auth-dependent items
  // ============================================================================
  describe('Menu contents for anonymous user', () => {
    beforeEach(() => {
      mockAuthState = createAuthMock({ session: null, user: null, sessionChecked: true });
    });

    it('shows Sound toggle', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      expect(screen.getByTestId('sound-toggle')).toBeInTheDocument();
      expect(screen.getByText(/Sound:/)).toBeInTheDocument();
    });

    it('shows Log In option', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      expect(screen.getByTestId('login-option')).toBeInTheDocument();
      expect(screen.getByText('Log In')).toBeInTheDocument();
    });

    it('shows Home link', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      expect(screen.getByTestId('home-link')).toBeInTheDocument();
      expect(screen.getByText('Home')).toBeInTheDocument();
    });

    it('does NOT show View My Pledge', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      expect(screen.queryByTestId('view-pledge')).not.toBeInTheDocument();
    });

    it('does NOT show Sign Out option', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      expect(screen.queryByTestId('sign-out')).not.toBeInTheDocument();
    });
  });

  describe('Menu contents for logged-in user WHO HAS PLEDGED', () => {
    beforeEach(() => {
      mockAuthState = createAuthMock({
        session: { user: { id: 'user-123' } },
        user: { id: 'user-123', name: 'Test User', email: 'test@example.com', slug: 'test-user', hasPledged: true },
        sessionChecked: true,
        isLoading: false,
      });
    });

    it('shows Sound toggle', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      expect(screen.getByTestId('sound-toggle')).toBeInTheDocument();
    });

    it('shows View My Pledge with correct link', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      const pledgeLink = screen.getByTestId('view-pledge');
      expect(pledgeLink).toBeInTheDocument();
      expect(pledgeLink).toHaveAttribute('href', '/p/test-user');
    });

    it('shows Home link', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      expect(screen.getByTestId('home-link')).toBeInTheDocument();
    });

    it('does NOT show Log In option', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      expect(screen.queryByTestId('login-option')).not.toBeInTheDocument();
    });

    it('shows Sign Out option', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      expect(screen.getByTestId('sign-out')).toBeInTheDocument();
      expect(screen.getByText('Sign Out')).toBeInTheDocument();
    });

    it('calls signOut when Sign Out clicked', async () => {
      const user = userEvent.setup();
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      await user.click(screen.getByTestId('sign-out'));
      expect(mockAuthState.signOut).toHaveBeenCalledTimes(1);
    });
  });

  describe('Menu contents for user with session but no profile', () => {
    beforeEach(() => {
      // Edge case: has Supabase session but profile fetch failed/pending
      mockAuthState = createAuthMock({
        session: { user: { id: 'user-123' } },
        user: null,
        sessionChecked: true,
        isLoading: false,
      });
    });

    it('does NOT show View My Pledge', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      expect(screen.queryByTestId('view-pledge')).not.toBeInTheDocument();
    });

    it('does NOT show Log In (session exists)', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      // Should not show Log In because session exists (even if profile is missing)
      expect(screen.queryByTestId('login-option')).not.toBeInTheDocument();
    });

    it('still shows Sound toggle and Home', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      expect(screen.getByTestId('sound-toggle')).toBeInTheDocument();
      expect(screen.getByTestId('home-link')).toBeInTheDocument();
    });
  });

  describe('Menu contents during loading state', () => {
    beforeEach(() => {
      mockAuthState = createAuthMock({
        session: null,
        user: null,
        sessionChecked: false,
        isLoading: true,
      });
    });

    it('does NOT show Log In during initial load', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      // Should not show Login until sessionChecked is true
      expect(screen.queryByTestId('login-option')).not.toBeInTheDocument();
    });

    it('does NOT show View My Pledge during load', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      expect(screen.queryByTestId('view-pledge')).not.toBeInTheDocument();
    });

    it('still shows Sound toggle and Home (always available)', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      expect(screen.getByTestId('sound-toggle')).toBeInTheDocument();
      expect(screen.getByTestId('home-link')).toBeInTheDocument();
    });
  });

  // ============================================================================
  // Leave Meeting - conditional on isLiveMeeting and onExit
  // ============================================================================
  describe('Leave Meeting option', () => {
    it('shows Leave Meeting when isLiveMeeting=true and onExit provided', async () => {
      const onExit = vi.fn();
      renderWithRouter(<LiveSessionBanner isLiveMeeting={true} onExit={onExit} />);
      await openMenu();

      expect(screen.getByTestId('leave-meeting')).toBeInTheDocument();
      expect(screen.getByText('Leave Meeting')).toBeInTheDocument();
    });

    it('calls onExit when Leave Meeting clicked', async () => {
      const user = userEvent.setup();
      const onExit = vi.fn();
      renderWithRouter(<LiveSessionBanner isLiveMeeting={true} onExit={onExit} />);
      await openMenu();

      await user.click(screen.getByTestId('leave-meeting'));
      expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('does NOT show Leave Meeting when isLiveMeeting=false', async () => {
      const onExit = vi.fn();
      renderWithRouter(<LiveSessionBanner isLiveMeeting={false} onExit={onExit} />);
      await openMenu();

      expect(screen.queryByTestId('leave-meeting')).not.toBeInTheDocument();
    });

    it('does NOT show Leave Meeting when onExit not provided', async () => {
      renderWithRouter(<LiveSessionBanner isLiveMeeting={true} />);
      await openMenu();

      expect(screen.queryByTestId('leave-meeting')).not.toBeInTheDocument();
    });

    it('defaults isLiveMeeting to true', async () => {
      const onExit = vi.fn();
      renderWithRouter(<LiveSessionBanner onExit={onExit} />);
      await openMenu();

      // Should show Leave Meeting by default when onExit provided
      expect(screen.getByTestId('leave-meeting')).toBeInTheDocument();
    });
  });

  // ============================================================================
  // Title rendering
  // ============================================================================
  describe('Title rendering', () => {
    it('shows custom title when provided', () => {
      renderWithRouter(<LiveSessionBanner title="Custom Title" />);

      expect(screen.getByText('Custom Title')).toBeInTheDocument();
    });

    it('shows partner name in title when provided', () => {
      renderWithRouter(<LiveSessionBanner partnerName="Alice Johnson" />);

      // Should show first name only
      expect(screen.getByText('Clarity Meeting with Alice')).toBeInTheDocument();
    });

    it('shows default title when no partner or custom title', () => {
      renderWithRouter(<LiveSessionBanner />);

      expect(screen.getByText('Live Clarity Meeting')).toBeInTheDocument();
    });

    it('custom title takes precedence over partnerName', () => {
      renderWithRouter(<LiveSessionBanner title="My Custom Title" partnerName="Bob" />);

      expect(screen.getByText('My Custom Title')).toBeInTheDocument();
      expect(screen.queryByText(/Bob/)).not.toBeInTheDocument();
    });
  });

  // ============================================================================
  // Sound toggle functionality
  // ============================================================================
  describe('Sound toggle', () => {
    it('calls setSoundEnabled when clicked', async () => {
      const user = userEvent.setup();
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      await user.click(screen.getByTestId('sound-toggle'));
      expect(mockSetSoundEnabled).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // Logo and navigation
  // ============================================================================
  describe('Logo and navigation', () => {
    it('renders logo linking to home', () => {
      renderWithRouter(<LiveSessionBanner />);

      const logoLink = screen.getByRole('link', { name: /clarity pledge/i });
      expect(logoLink).toHaveAttribute('href', '/');
    });
  });

  // ============================================================================
  // Edge case: User without slug (shouldn't show View My Pledge)
  // ============================================================================
  describe('Edge case: logged in user without slug', () => {
    it('does NOT show View My Pledge if user has no slug', async () => {
      mockAuthState = createAuthMock({
        session: { user: { id: 'user-123' } },
        user: { id: 'user-123', name: 'Test User', email: 'test@example.com', slug: '', hasPledged: true },
        sessionChecked: true,
        isLoading: false,
      });

      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      expect(screen.queryByTestId('view-pledge')).not.toBeInTheDocument();
    });

    it('does NOT show View My Pledge if slug is undefined', async () => {
      mockAuthState = createAuthMock({
        session: { user: { id: 'user-123' } },
        user: { id: 'user-123', name: 'Test User', email: 'test@example.com', hasPledged: true },
        sessionChecked: true,
        isLoading: false,
      });

      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      expect(screen.queryByTestId('view-pledge')).not.toBeInTheDocument();
    });
  });

  // ============================================================================
  // P50: User registered via /live (has slug, but hasPledged=false)
  // ============================================================================
  describe('P50: Live-only user (hasPledged=false)', () => {
    beforeEach(() => {
      // User registered via /live - has slug but never took the pledge
      mockAuthState = createAuthMock({
        session: { user: { id: 'user-123' } },
        user: { id: 'user-123', name: 'Live User', email: 'live@example.com', slug: 'live-user', hasPledged: false },
        sessionChecked: true,
        isLoading: false,
      });
    });

    it('does NOT show View My Pledge for live-only users', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      // User has slug but hasPledged=false - should NOT see View My Pledge
      expect(screen.queryByTestId('view-pledge')).not.toBeInTheDocument();
    });

    it('still shows Sign Out for live-only users', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      expect(screen.getByTestId('sign-out')).toBeInTheDocument();
    });

    it('still shows Home link for live-only users', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      expect(screen.getByTestId('home-link')).toBeInTheDocument();
    });
  });
});
