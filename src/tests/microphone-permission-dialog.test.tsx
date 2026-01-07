/**
 * @file microphone-permission-dialog.test.tsx
 * @description TDD tests for P40: MicrophonePermissionDialog component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MicrophonePermissionDialog } from '@/app/components/live-meeting/microphone-permission-dialog';

describe('MicrophonePermissionDialog', () => {
  const defaultProps = {
    open: true,
    error: null,
    attemptCount: 1,
    onRetry: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock navigator.userAgent for platform detection
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      configurable: true,
    });
  });

  describe('rendering', () => {
    it('renders dialog title', () => {
      render(<MicrophonePermissionDialog {...defaultProps} />);

      expect(screen.getByText('Microphone Access Required')).toBeInTheDocument();
    });

    it('renders description text', () => {
      render(<MicrophonePermissionDialog {...defaultProps} />);

      expect(
        screen.getByText('Clarity Meetings need microphone access to work.')
      ).toBeInTheDocument();
    });

    it('renders Cancel and Try Again buttons', () => {
      render(<MicrophonePermissionDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });

    it('does not render when open is false', () => {
      render(<MicrophonePermissionDialog {...defaultProps} open={false} />);

      expect(screen.queryByText('Microphone Access Required')).not.toBeInTheDocument();
    });
  });

  describe('error display', () => {
    it('displays error message when provided', () => {
      render(
        <MicrophonePermissionDialog
          {...defaultProps}
          error="Microphone access was blocked"
        />
      );

      expect(screen.getByText('Microphone access was blocked')).toBeInTheDocument();
    });

    it('does not show error element when error is null', () => {
      render(<MicrophonePermissionDialog {...defaultProps} error={null} />);

      // The AlertTriangle icon should not be present when there's no error
      expect(screen.queryByText('Microphone access was blocked')).not.toBeInTheDocument();
    });
  });

  describe('escalated messaging', () => {
    it('does not show escalated message on first attempt', () => {
      render(<MicrophonePermissionDialog {...defaultProps} attemptCount={1} />);

      expect(
        screen.queryByText(/your browser may have blocked this site/i)
      ).not.toBeInTheDocument();
    });

    it('shows escalated message after 2 attempts', () => {
      render(<MicrophonePermissionDialog {...defaultProps} attemptCount={2} />);

      expect(
        screen.getByText(/your browser may have blocked this site/i)
      ).toBeInTheDocument();
    });

    it('shows escalated message after 3+ attempts', () => {
      render(<MicrophonePermissionDialog {...defaultProps} attemptCount={5} />);

      expect(
        screen.getByText(/your browser may have blocked this site/i)
      ).toBeInTheDocument();
    });
  });

  describe('platform-specific instructions', () => {
    it('shows desktop instructions for desktop user agent', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        configurable: true,
      });

      render(<MicrophonePermissionDialog {...defaultProps} />);

      expect(screen.getByText(/chrome:/i)).toBeInTheDocument();
      expect(screen.getByText(/safari:/i)).toBeInTheDocument();
      expect(screen.getByText(/firefox:/i)).toBeInTheDocument();
    });

    it('shows iOS instructions for iOS user agent', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
        configurable: true,
      });

      render(<MicrophonePermissionDialog {...defaultProps} />);

      expect(screen.getByText(/ios safari:/i)).toBeInTheDocument();
      expect(screen.getByText(/ios chrome:/i)).toBeInTheDocument();
      expect(
        screen.getByText(/ios resets permissions when you close the browser/i)
      ).toBeInTheDocument();
    });

    it('shows Android instructions for Android user agent', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Linux; Android 11; Pixel 5)',
        configurable: true,
      });

      render(<MicrophonePermissionDialog {...defaultProps} />);

      expect(screen.getByText(/tap lock icon in address bar/i)).toBeInTheDocument();
    });
  });

  describe('button interactions', () => {
    it('calls onRetry when Try Again is clicked', () => {
      const onRetry = vi.fn();
      render(<MicrophonePermissionDialog {...defaultProps} onRetry={onRetry} />);

      fireEvent.click(screen.getByRole('button', { name: /try again/i }));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when Cancel is clicked', () => {
      const onCancel = vi.fn();
      render(<MicrophonePermissionDialog {...defaultProps} onCancel={onCancel} />);

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });
});
