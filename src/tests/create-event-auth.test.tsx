import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CreateEvent } from '@/app/prototypes/events/components/CreateEvent';

// Mock useNavigate
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

// Mock events service
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    createEvent: vi.fn(),
  },
}));

// Mock useAuth - will configure per test
const mockUseAuth = vi.fn();
vi.mock('@/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('CreateEvent Auth Check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show create event form when user is authenticated', async () => {
    // Setup: User has session and profile
    mockUseAuth.mockReturnValue({
      user: { id: '123', name: 'Test User', slug: 'test-user' },
      session: { user: { id: '123', email: 'test@example.com' } },
      isLoading: false,
      sessionChecked: true,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    });

    render(
      <MemoryRouter>
        <CreateEvent />
      </MemoryRouter>
    );

    // Should show the create event form, not the sign-in message
    await waitFor(() => {
      expect(screen.getByTestId('create-event-form')).toBeInTheDocument();
    });

    // Should NOT show sign-up message
    expect(screen.queryByText('Sign Up to Create Events')).not.toBeInTheDocument();
  });

  it('should show sign-up message when user is not authenticated', async () => {
    // Setup: No session, no user
    mockUseAuth.mockReturnValue({
      user: null,
      session: null,
      isLoading: false,
      sessionChecked: true,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    });

    render(
      <MemoryRouter>
        <CreateEvent />
      </MemoryRouter>
    );

    // Should show sign-up message
    await waitFor(() => {
      expect(screen.getByText('Sign Up to Create Events')).toBeInTheDocument();
    });

    // Should NOT show the form
    expect(screen.queryByTestId('create-event-form')).not.toBeInTheDocument();
  });

  it('should show loading state while checking auth', async () => {
    // Setup: Still loading
    mockUseAuth.mockReturnValue({
      user: null,
      session: null,
      isLoading: true,
      sessionChecked: false,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    });

    render(
      <MemoryRouter>
        <CreateEvent />
      </MemoryRouter>
    );

    // Should show loading
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
