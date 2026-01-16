/**
 * @file live-session-banner.test.tsx
 * @description KISS Navigation Tests for LiveSessionBanner
 *
 * TWO STATES ONLY:
 * 1. Verified user → Full menu (View My Profile, pledge items, Settings, Log Out)
 * 2. Everyone else → Public menu (Log In)
 *
 * "Everyone else" includes: anonymous, unverified /live users, loading states
 *
 * Menu trigger ALWAYS renders (hamburger icon)
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
// P52: Now includes isVerified check - users must be verified to see user menu
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

  // P52: User menu only shows for VERIFIED users
  describe('Menu contents for verified logged-in user WHO HAS PLEDGED', () => {
    beforeEach(() => {
      mockAuthState = createAuthMock({
        session: { user: { id: 'user-123' } },
        // P52: isVerified must be true to see user menu
        user: { id: 'user-123', name: 'Test User', email: 'test@example.com', slug: 'test-user', hasPledged: true, isVerified: true },
        sessionChecked: true,
        isLoading: false,
      });
    });

    it('shows Sound toggle', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      expect(screen.getByTestId('sound-toggle')).toBeInTheDocument();
    });

    // P52: New menu items - View My Profile
    it('shows View My Profile with correct link', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      const profileLink = screen.getByTestId('view-profile');
      expect(profileLink).toBeInTheDocument();
      expect(profileLink).toHaveAttribute('href', '/me');
    });

    it('shows View My Pledge with correct link', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      const pledgeLink = screen.getByTestId('view-pledge');
      expect(pledgeLink).toBeInTheDocument();
      // P52: Link now goes to /p/slug/pledge to match SimpleNavigation
      expect(pledgeLink).toHaveAttribute('href', '/p/test-user/pledge');
    });

    // P52: New menu items - Settings
    it('shows Settings link', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      const settingsLink = screen.getByTestId('settings');
      expect(settingsLink).toBeInTheDocument();
      expect(settingsLink).toHaveAttribute('href', '/settings');
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

    it('shows Log Out option', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      expect(screen.getByTestId('sign-out')).toBeInTheDocument();
      // P52: Changed from "Sign Out" to "Log Out" to match SimpleNavigation
      expect(screen.getByText('Log Out')).toBeInTheDocument();
    });

    it('calls signOut when Log Out clicked', async () => {
      const user = userEvent.setup();
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      await user.click(screen.getByTestId('sign-out'));
      expect(mockAuthState.signOut).toHaveBeenCalledTimes(1);
    });
  });

  // KISS: Session without profile = public menu (same as anonymous)
  describe('Menu contents for user with session but no profile', () => {
    beforeEach(() => {
      // Edge case: has Supabase session but profile fetch failed/pending
      // KISS: Treated same as anonymous for menu purposes
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

    it('shows Log In (KISS: same as anonymous)', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      // KISS: No verified user profile = public menu with Log In
      expect(screen.getByTestId('login-option')).toBeInTheDocument();
    });

    it('does NOT show Log Out (KISS: treated as anonymous)', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      // KISS: Without verified profile, user sees public menu
      expect(screen.queryByTestId('sign-out')).not.toBeInTheDocument();
    });

    it('still shows Sound toggle and Home', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      expect(screen.getByTestId('sound-toggle')).toBeInTheDocument();
      expect(screen.getByTestId('home-link')).toBeInTheDocument();
    });
  });

  // KISS: Loading state = public menu (safe default)
  describe('Menu contents during loading state', () => {
    beforeEach(() => {
      mockAuthState = createAuthMock({
        session: null,
        user: null,
        sessionChecked: false,
        isLoading: true,
      });
    });

    it('shows Log In during loading (KISS: safe default)', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      // KISS: Loading = public menu (shows Log In as safe default)
      expect(screen.getByTestId('login-option')).toBeInTheDocument();
    });

    it('does NOT show View My Pledge during load', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      expect(screen.queryByTestId('view-pledge')).not.toBeInTheDocument();
    });

    it('does NOT show Log Out during loading', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      expect(screen.queryByTestId('sign-out')).not.toBeInTheDocument();
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

    it('hides center title when empty string is passed', () => {
      renderWithRouter(<LiveSessionBanner title="" />);

      // Should not show any title text in the center
      expect(screen.queryByText('Clarity Meeting')).not.toBeInTheDocument();
      expect(screen.queryByText('Live Clarity Meeting')).not.toBeInTheDocument();
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
  // Edge case: Verified user without slug (shouldn't show View My Pledge)
  // ============================================================================
  describe('Edge case: verified user without slug', () => {
    it('does NOT show View My Pledge if user has no slug', async () => {
      mockAuthState = createAuthMock({
        session: { user: { id: 'user-123' } },
        // P52: isVerified=true to show user menu, but empty slug means no pledge link
        user: { id: 'user-123', name: 'Test User', email: 'test@example.com', slug: '', hasPledged: true, isVerified: true },
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
        // P52: isVerified=true to show user menu
        user: { id: 'user-123', name: 'Test User', email: 'test@example.com', hasPledged: true, isVerified: true },
        sessionChecked: true,
        isLoading: false,
      });

      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      expect(screen.queryByTestId('view-pledge')).not.toBeInTheDocument();
    });
  });

  // ============================================================================
  // P50/P52: User registered via /live (has slug, hasPledged=false, isVerified=true)
  // ============================================================================
  describe('P50/P52: Verified live-only user (hasPledged=false)', () => {
    beforeEach(() => {
      // User registered via /live - verified but never took the pledge
      // P52: isVerified=true is required to show user menu
      mockAuthState = createAuthMock({
        session: { user: { id: 'user-123' } },
        user: { id: 'user-123', name: 'Live User', email: 'live@example.com', slug: 'live-user', hasPledged: false, isVerified: true },
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

    it('shows Take the Pledge instead', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      // P52: Non-pledgers see "Take the Pledge" link instead
      expect(screen.getByTestId('take-pledge')).toBeInTheDocument();
      expect(screen.getByTestId('take-pledge')).toHaveAttribute('href', '/sign-pledge?prefill=true');
    });

    it('still shows Log Out for live-only users', async () => {
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

  // ============================================================================
  // KISS: Unverified user = same menu as anonymous
  // ============================================================================
  describe('KISS: Unverified user sees public menu (same as anonymous)', () => {
    beforeEach(() => {
      // User registered via /live but hasn't verified email yet
      // KISS: Treated same as anonymous for menu purposes
      mockAuthState = createAuthMock({
        session: { user: { id: 'user-123' } },
        user: { id: 'user-123', name: 'Unverified User', email: 'unverified@example.com', slug: null, hasPledged: false, isVerified: false },
        sessionChecked: true,
        isLoading: false,
      });
    });

    it('shows Log In (KISS: treated same as anonymous)', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      // KISS: Unverified = public menu with Log In
      expect(screen.getByTestId('login-option')).toBeInTheDocument();
    });

    it('does NOT show Log Out (KISS: treated same as anonymous)', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      // KISS: Unverified users see public menu, no Log Out
      expect(screen.queryByTestId('sign-out')).not.toBeInTheDocument();
    });

    it('does NOT show View My Profile', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      // KISS: Unverified = public menu, no profile link
      expect(screen.queryByTestId('view-profile')).not.toBeInTheDocument();
    });

    it('does NOT show Settings', async () => {
      renderWithRouter(<LiveSessionBanner />);
      await openMenu();

      // KISS: Unverified = public menu, no settings
      expect(screen.queryByTestId('settings')).not.toBeInTheDocument();
    });
  });
});
