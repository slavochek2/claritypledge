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
});
