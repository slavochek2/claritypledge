/**
 * @file consent-dialogs.test.tsx
 * TDD tests for P37.2a Recording Consent Dialog Components
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

describe('JoinSessionDialog', () => {
  const defaultProps = {
    open: true,
    onJoin: vi.fn(),
    onCancel: vi.fn(),
    isLoading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and form fields when open', async () => {
    const { JoinSessionDialog } = await import(
      '@/app/components/live-meeting/join-session-dialog'
    );
    render(<JoinSessionDialog {...defaultProps} />);

    expect(screen.getByText('Join Clarity Meeting')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('shows consent notice about recording', async () => {
    const { JoinSessionDialog } = await import(
      '@/app/components/live-meeting/join-session-dialog'
    );
    render(<JoinSessionDialog {...defaultProps} />);

    expect(screen.getByText(/this session will be recorded/i)).toBeInTheDocument();
  });

  it('has links to Terms and Privacy Policy', async () => {
    const { JoinSessionDialog } = await import(
      '@/app/components/live-meeting/join-session-dialog'
    );
    render(<JoinSessionDialog {...defaultProps} />);

    const termsLink = screen.getByRole('link', { name: /terms/i });
    const privacyLink = screen.getByRole('link', { name: /privacy policy/i });

    expect(termsLink).toHaveAttribute('href', '/terms');
    expect(privacyLink).toHaveAttribute('href', '/privacy-policy');
  });

  it('disables Join button when fields are empty', async () => {
    const { JoinSessionDialog } = await import(
      '@/app/components/live-meeting/join-session-dialog'
    );
    render(<JoinSessionDialog {...defaultProps} />);

    const joinButton = screen.getByRole('button', { name: /join session/i });
    expect(joinButton).toBeDisabled();
  });

  it('enables Join button when name and valid email are entered', async () => {
    const { JoinSessionDialog } = await import(
      '@/app/components/live-meeting/join-session-dialog'
    );
    render(<JoinSessionDialog {...defaultProps} />);

    const nameInput = screen.getByLabelText('Name');
    const emailInput = screen.getByLabelText('Email');

    fireEvent.change(nameInput, { target: { value: 'John Doe' } });
    fireEvent.change(emailInput, { target: { value: 'john@example.com' } });

    const joinButton = screen.getByRole('button', { name: /join session/i });
    expect(joinButton).not.toBeDisabled();
  });

  it('calls onJoin with name and email when Join is clicked', async () => {
    const onJoin = vi.fn();
    const { JoinSessionDialog } = await import(
      '@/app/components/live-meeting/join-session-dialog'
    );
    render(<JoinSessionDialog {...defaultProps} onJoin={onJoin} />);

    const nameInput = screen.getByLabelText('Name');
    const emailInput = screen.getByLabelText('Email');

    fireEvent.change(nameInput, { target: { value: 'John Doe' } });
    fireEvent.change(emailInput, { target: { value: 'john@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /join session/i }));

    expect(onJoin).toHaveBeenCalledWith('John Doe', 'john@example.com');
  });

  it('calls onCancel when Cancel is clicked', async () => {
    const onCancel = vi.fn();
    const { JoinSessionDialog } = await import(
      '@/app/components/live-meeting/join-session-dialog'
    );
    render(<JoinSessionDialog {...defaultProps} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalled();
  });

  it('shows loading state when isLoading is true', async () => {
    const { JoinSessionDialog } = await import(
      '@/app/components/live-meeting/join-session-dialog'
    );
    render(<JoinSessionDialog {...defaultProps} isLoading={true} />);

    expect(screen.getByText('Joining...')).toBeInTheDocument();
  });

  it('trims whitespace from name and email before submitting', async () => {
    const onJoin = vi.fn();
    const { JoinSessionDialog } = await import(
      '@/app/components/live-meeting/join-session-dialog'
    );
    render(<JoinSessionDialog {...defaultProps} onJoin={onJoin} />);

    const nameInput = screen.getByLabelText('Name');
    const emailInput = screen.getByLabelText('Email');

    fireEvent.change(nameInput, { target: { value: '  John Doe  ' } });
    fireEvent.change(emailInput, { target: { value: '  john@example.com  ' } });
    fireEvent.click(screen.getByRole('button', { name: /join session/i }));

    expect(onJoin).toHaveBeenCalledWith('John Doe', 'john@example.com');
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

describe('RequiresLoginDialog', () => {
  const defaultProps = {
    open: true,
    email: 'test@example.com',
    onSendLoginLink: vi.fn(),
    onUseDifferentEmail: vi.fn(),
    isLoading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and shows the email address', async () => {
    const { RequiresLoginDialog } = await import(
      '@/app/components/live-meeting/requires-login-dialog'
    );
    render(<RequiresLoginDialog {...defaultProps} />);

    expect(screen.getByText('This email has an account')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('explains user needs to log in', async () => {
    const { RequiresLoginDialog } = await import(
      '@/app/components/live-meeting/requires-login-dialog'
    );
    render(<RequiresLoginDialog {...defaultProps} />);

    expect(screen.getByText(/already registered/i)).toBeInTheDocument();
    expect(screen.getByText(/log in first/i)).toBeInTheDocument();
  });

  it('calls onSendLoginLink when Send Login Link is clicked', async () => {
    const onSendLoginLink = vi.fn();
    const { RequiresLoginDialog } = await import(
      '@/app/components/live-meeting/requires-login-dialog'
    );
    render(<RequiresLoginDialog {...defaultProps} onSendLoginLink={onSendLoginLink} />);

    fireEvent.click(screen.getByRole('button', { name: /send login link/i }));

    expect(onSendLoginLink).toHaveBeenCalled();
  });

  it('calls onUseDifferentEmail when Use Different Email is clicked', async () => {
    const onUseDifferentEmail = vi.fn();
    const { RequiresLoginDialog } = await import(
      '@/app/components/live-meeting/requires-login-dialog'
    );
    render(
      <RequiresLoginDialog {...defaultProps} onUseDifferentEmail={onUseDifferentEmail} />
    );

    fireEvent.click(screen.getByRole('button', { name: /use different email/i }));

    expect(onUseDifferentEmail).toHaveBeenCalled();
  });

  it('shows loading state when isLoading is true', async () => {
    const { RequiresLoginDialog } = await import(
      '@/app/components/live-meeting/requires-login-dialog'
    );
    render(<RequiresLoginDialog {...defaultProps} isLoading={true} />);

    expect(screen.getByText('Sending...')).toBeInTheDocument();
  });
});
