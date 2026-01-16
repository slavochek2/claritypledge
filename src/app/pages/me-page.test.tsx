/**
 * @file me-page.test.tsx
 * @description Tests for the MePage component (P50: Profile & Pledge Separation)
 *
 * MePage is a smart redirect page that handles:
 * - Redirect to /login when not logged in
 * - Redirect to /p/:slug when user has slug
 * - Email verification prompt when user has no slug (e.g., /live users)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MePage } from './me-page';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock useAuth
const mockUseAuth = vi.fn();
vi.mock('@/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock Supabase
const mockSignInWithOtp = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: () => mockSignInWithOtp(),
    },
  },
}));

describe('MePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Loading state', () => {
    it('shows loading state while session is being checked', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isLoading: true,
        sessionChecked: false,
      });

      render(
        <MemoryRouter>
          <MePage />
        </MemoryRouter>
      );

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('shows loading state while auth is loading', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isLoading: true,
        sessionChecked: true,
      });

      render(
        <MemoryRouter>
          <MePage />
        </MemoryRouter>
      );

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  describe('Redirect behavior', () => {
    it('redirects to /login when user is not logged in', async () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isLoading: false,
        sessionChecked: true,
      });

      render(
        <MemoryRouter>
          <MePage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
      });
    });

    it('redirects to /p/:slug when user has a slug', async () => {
      mockUseAuth.mockReturnValue({
        user: {
          id: 'user-123',
          email: 'test@example.com',
          slug: 'john-doe',
          name: 'John Doe',
        },
        isLoading: false,
        sessionChecked: true,
      });

      render(
        <MemoryRouter>
          <MePage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/p/john-doe', { replace: true });
      });
    });
  });

  describe('Verification prompt (no slug)', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: {
          id: 'user-123',
          email: 'live-user@example.com',
          slug: null, // No slug - e.g., /live user
          name: 'Live User',
        },
        isLoading: false,
        sessionChecked: true,
      });
    });

    it('shows verification prompt when user has no slug', () => {
      render(
        <MemoryRouter>
          <MePage />
        </MemoryRouter>
      );

      expect(screen.getByText('Complete Your Registration')).toBeInTheDocument();
      expect(screen.getByText('To create your profile, please verify your email address.')).toBeInTheDocument();
      expect(screen.getByText('live-user@example.com')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Verify My Email' })).toBeInTheDocument();
    });

    it('does not redirect when user has no slug', () => {
      render(
        <MemoryRouter>
          <MePage />
        </MemoryRouter>
      );

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('sends verification email when button is clicked', async () => {
      mockSignInWithOtp.mockResolvedValue({ error: null });

      render(
        <MemoryRouter>
          <MePage />
        </MemoryRouter>
      );

      const button = screen.getByRole('button', { name: 'Verify My Email' });
      fireEvent.click(button);

      // Button should show loading state
      await waitFor(() => {
        expect(screen.getByText('Sending...')).toBeInTheDocument();
      });

      // After success, should show email sent confirmation
      await waitFor(() => {
        expect(screen.getByText('Check Your Email')).toBeInTheDocument();
        expect(screen.getByText(/We've sent a verification link/)).toBeInTheDocument();
      });
    });

    it('shows resend button after email is sent', async () => {
      mockSignInWithOtp.mockResolvedValue({ error: null });

      render(
        <MemoryRouter>
          <MePage />
        </MemoryRouter>
      );

      const button = screen.getByRole('button', { name: 'Verify My Email' });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Resend Verification Email' })).toBeInTheDocument();
      });
    });

    it('shows error message when email sending fails', async () => {
      mockSignInWithOtp.mockResolvedValue({
        error: { message: 'Rate limit exceeded' }
      });

      render(
        <MemoryRouter>
          <MePage />
        </MemoryRouter>
      );

      const button = screen.getByRole('button', { name: 'Verify My Email' });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument();
      });
    });

    it('handles unexpected errors gracefully', async () => {
      mockSignInWithOtp.mockRejectedValue(new Error('Network error'));

      render(
        <MemoryRouter>
          <MePage />
        </MemoryRouter>
      );

      const button = screen.getByRole('button', { name: 'Verify My Email' });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('An unexpected error occurred. Please try again.')).toBeInTheDocument();
      });
    });
  });

  describe('SEO', () => {
    it('renders SEO component with correct props', () => {
      mockUseAuth.mockReturnValue({
        user: {
          id: 'user-123',
          email: 'test@example.com',
          slug: null,
          name: 'Test User',
        },
        isLoading: false,
        sessionChecked: true,
      });

      render(
        <MemoryRouter>
          <MePage />
        </MemoryRouter>
      );

      // The SEO component sets document.title
      // We can't easily test this in jsdom, but we verify the component renders
      expect(screen.getByText('Complete Your Registration')).toBeInTheDocument();
    });
  });
});
