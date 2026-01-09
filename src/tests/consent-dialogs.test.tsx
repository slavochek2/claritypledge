/**
 * @file consent-dialogs.test.tsx
 * TDD tests for P37.2a Recording Consent Dialog Components
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

describe('TermsUpdateDialog', () => {
  const defaultProps = {
    open: true,
    onAccept: vi.fn(),
    onCancel: vi.fn(),
    isLoading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and update message when open', async () => {
    const { TermsUpdateDialog } = await import(
      '@/app/components/live-meeting/terms-update-dialog'
    );
    render(<TermsUpdateDialog {...defaultProps} />);

    expect(screen.getByText('Updated Terms')).toBeInTheDocument();
    expect(
      screen.getByText(/we've updated our terms and privacy policy/i)
    ).toBeInTheDocument();
  });

  it('shows consent notice about recording', async () => {
    const { TermsUpdateDialog } = await import(
      '@/app/components/live-meeting/terms-update-dialog'
    );
    render(<TermsUpdateDialog {...defaultProps} />);

    expect(screen.getByText(/this session will be recorded/i)).toBeInTheDocument();
  });

  it('has links to view Terms and Privacy Policy', async () => {
    const { TermsUpdateDialog } = await import(
      '@/app/components/live-meeting/terms-update-dialog'
    );
    render(<TermsUpdateDialog {...defaultProps} />);

    const termsLink = screen.getByRole('link', { name: /view terms/i });
    const privacyLink = screen.getByRole('link', { name: /view privacy policy/i });

    expect(termsLink).toHaveAttribute('href', '/terms');
    expect(privacyLink).toHaveAttribute('href', '/privacy-policy');
  });

  it('calls onAccept when Continue is clicked', async () => {
    const onAccept = vi.fn();
    const { TermsUpdateDialog } = await import(
      '@/app/components/live-meeting/terms-update-dialog'
    );
    render(<TermsUpdateDialog {...defaultProps} onAccept={onAccept} />);

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(onAccept).toHaveBeenCalled();
  });

  it('calls onCancel when Cancel is clicked', async () => {
    const onCancel = vi.fn();
    const { TermsUpdateDialog } = await import(
      '@/app/components/live-meeting/terms-update-dialog'
    );
    render(<TermsUpdateDialog {...defaultProps} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalled();
  });

  it('shows loading state when isLoading is true', async () => {
    const { TermsUpdateDialog } = await import(
      '@/app/components/live-meeting/terms-update-dialog'
    );
    render(<TermsUpdateDialog {...defaultProps} isLoading={true} />);

    expect(screen.getByText('Continuing...')).toBeInTheDocument();
  });

  /**
   * E2E TEST GAP DOCUMENTATION
   *
   * The TermsUpdateDialog integration (showing for returning users with
   * outdated accepted_terms_version) is NOT covered by E2E tests due to
   * complexity of setup:
   *
   * To test E2E would require:
   * 1. Creating a user with accepted_terms_version='v0.9' in database
   * 2. Authenticating as that user
   * 3. Navigating to /live and trying to join/create a meeting
   * 4. Verifying dialog appears and "Continue" records consent
   *
   * Current coverage:
   * - Unit tests here verify component behavior (render, callbacks, states)
   * - Unit tests in consent-api.test.ts verify needsTermsAcceptance() logic
   * - Integration in clarity-live-page.tsx verified via code review
   *
   * If regression occurs, add E2E test or seed test database with outdated user.
   */
});
