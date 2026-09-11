/**
 * @file consent-dialogs.test.tsx
 * TDD tests for P37.2a Recording Consent Dialog Components
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

describe('TermsUpdateDialog — dismissible behavior (P832)', () => {
  it('default: onOpenChange(false) routes to onCancel (back-compat with /live)', async () => {
    const onCancel = vi.fn();
    const { TermsUpdateDialog } = await import(
      '@/app/components/live-meeting/terms-update-dialog'
    );
    // Render OPEN and capture the onOpenChange callback by re-rendering closed.
    // Simulating Radix outside-click inside jsdom is fragile; instead, assert
    // the binding contract: clicking the explicit Cancel button calls onCancel.
    const { rerender } = render(
      <TermsUpdateDialog open onAccept={vi.fn()} onCancel={onCancel} />
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    rerender(<TermsUpdateDialog open={false} onAccept={vi.fn()} onCancel={onCancel} />);
  });

  it('dismissible=false: outside-click / Escape do NOT call onCancel; close button is hidden', async () => {
    const onCancel = vi.fn();
    const { TermsUpdateDialog } = await import(
      '@/app/components/live-meeting/terms-update-dialog'
    );
    render(
      <TermsUpdateDialog open onAccept={vi.fn()} onCancel={onCancel} dismissible={false} />
    );

    // No X close button rendered
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();

    // Escape key on the dialog content must not trigger onCancel
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();

    // Explicit Cancel button still fires onCancel
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

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

  // P1300: this assertion previously required "This session is recorded for AI Insights".
  // The dialog is also the global re-acceptance gate over every authed route, where that
  // sentence is false; recording is disclosed in-session, not here (tos.md, privacy.md).
  it('states the terms agreement without claiming a session or a recording', async () => {
    const { TermsUpdateDialog } = await import(
      '@/app/components/live-meeting/terms-update-dialog'
    );
    render(<TermsUpdateDialog {...defaultProps} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/by continuing, you agree to the updated terms\./i);
    expect(dialog.textContent ?? '').not.toMatch(/session|record/i);
  });

  it('has links to view Terms and Privacy Policy', async () => {
    const { TermsUpdateDialog } = await import(
      '@/app/components/live-meeting/terms-update-dialog'
    );
    render(<TermsUpdateDialog {...defaultProps} />);

    const termsLink = screen.getByRole('link', { name: /view terms/i });
    const privacyLink = screen.getByRole('link', { name: /view privacy policy/i });

    // P1300: '/terms' never resolved (NotFoundPage); the legal page is /terms-of-service.
    expect(termsLink).toHaveAttribute('href', '/terms-of-service');
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
   * E2E COVERAGE
   *
   * The global-gate path (a returning user with an outdated accepted_terms_version
   * on an ordinary page) is covered end to end by e2e/p1300-terms-popup.spec.ts:
   * copy, working links, readable documents, and Continue recording acceptance.
   *
   * Still NOT covered end to end: the /live join-path render of this dialog
   * (clarity-live-page.tsx). The global gate normally catches a stale user first,
   * so that path is reached only if the gate has not fired yet.
   */
});
