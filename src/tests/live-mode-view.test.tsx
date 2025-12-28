/**
 * @file live-mode-view.test.tsx
 * @description Tests for P23.3 "Did I get it?" feature and core LiveModeView functionality
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LiveModeView } from '@/app/components/partners/live-mode-view';
import { DEFAULT_LIVE_STATE, type LiveSessionState } from '@/app/types';

// Mock handlers
const mockHandlers = {
  onRatingSubmit: vi.fn(),
  onSkip: vi.fn(),
  onExplainBackStart: vi.fn(),
  onExplainBackRate: vi.fn(),
  onToggleMode: vi.fn(),
  onStartCheck: vi.fn(),
  onStartProve: vi.fn(),
  onBackToIdle: vi.fn(),
  onClearSkipNotification: vi.fn(),
  onCancelLocalRating: vi.fn(),
  onExitMeeting: vi.fn(),
  onExplainBackDone: vi.fn(),
  onCelebrationComplete: vi.fn(),
};

const defaultProps = {
  currentUserName: 'alice',
  partnerName: 'bob',
  isLocallyRating: false,
  ...mockHandlers,
};

describe('LiveModeView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('IdleScreen', () => {
    it('renders both "Did you get it?" and "Did I get it?" buttons', () => {
      render(
        <LiveModeView
          {...defaultProps}
          liveState={DEFAULT_LIVE_STATE}
        />
      );

      // Get all buttons and check both exist
      const buttons = screen.getAllByRole('button');
      const didYouGetIt = buttons.find(b => b.textContent?.includes('you'));
      const didIGetIt = buttons.find(b => b.textContent?.includes('I'));

      expect(didYouGetIt).toBeInTheDocument();
      expect(didIGetIt).toBeInTheDocument();
    });

    it('calls onStartCheck when "Did you get it?" is clicked', () => {
      render(
        <LiveModeView
          {...defaultProps}
          liveState={DEFAULT_LIVE_STATE}
        />
      );

      const buttons = screen.getAllByRole('button');
      const didYouGetIt = buttons.find(b => b.textContent?.includes('you') && b.textContent?.includes('get it'));
      fireEvent.click(didYouGetIt!);
      expect(mockHandlers.onStartCheck).toHaveBeenCalledTimes(1);
    });

    it('calls onStartProve when "Did I get it?" is clicked', () => {
      render(
        <LiveModeView
          {...defaultProps}
          liveState={DEFAULT_LIVE_STATE}
        />
      );

      const buttons = screen.getAllByRole('button');
      // Find button that has "I" underlined (contains "I" and "get it")
      const didIGetIt = buttons.find(b => {
        const text = b.textContent || '';
        return text.includes('Did') && text.includes('I') && text.includes('get it') && !text.includes('you');
      });
      fireEvent.click(didIGetIt!);
      expect(mockHandlers.onStartProve).toHaveBeenCalledTimes(1);
    });

    it('displays partner name in header', () => {
      render(
        <LiveModeView
          {...defaultProps}
          liveState={DEFAULT_LIVE_STATE}
        />
      );

      // Partner name "bob" should be capitalized to "Bob" and appear in the header
      expect(screen.getByText(/Clarity Meeting with/)).toBeInTheDocument();
    });
  });

  describe('P23.3: "Did I get it?" flow - proverName handling', () => {
    it('shows prover-initiated messaging when proverName is set', () => {
      const proverInitiatedState: LiveSessionState = {
        ...DEFAULT_LIVE_STATE,
        ratingPhase: 'revealed',
        checkerName: 'bob',
        proverName: 'alice', // Alice initiated "Did I get it?"
        checkerRating: 8,
        responderRating: 7,
        checkerSubmitted: true,
        responderSubmitted: true,
      };

      render(
        <LiveModeView
          {...defaultProps}
          liveState={proverInitiatedState}
        />
      );

      // Should show the journey with prover context
      expect(screen.getByText(/journey to understand/i)).toBeInTheDocument();
    });

    it('defaults proverName to undefined in DEFAULT_LIVE_STATE', () => {
      expect(DEFAULT_LIVE_STATE.proverName).toBeUndefined();
    });
  });

  describe('Rating submission', () => {
    it('shows rating screen when isLocallyRating is true', () => {
      render(
        <LiveModeView
          {...defaultProps}
          liveState={DEFAULT_LIVE_STATE}
          isLocallyRating={true}
        />
      );

      // Should show rating buttons (0-10) - use getAllByText since multiple instances may exist
      expect(screen.getAllByText('0').length).toBeGreaterThan(0);
      expect(screen.getAllByText('10').length).toBeGreaterThan(0);
      // Should have a Submit button
      const submitButtons = screen.getAllByRole('button', { name: /Submit/i });
      expect(submitButtons.length).toBeGreaterThan(0);
    });

    it('calls onRatingSubmit when a rating is submitted', () => {
      render(
        <LiveModeView
          {...defaultProps}
          liveState={DEFAULT_LIVE_STATE}
          isLocallyRating={true}
        />
      );

      // Click rating 7
      fireEvent.click(screen.getByText('7'));
      // Click submit
      fireEvent.click(screen.getByRole('button', { name: /Submit/i }));

      expect(mockHandlers.onRatingSubmit).toHaveBeenCalledWith(7);
    });
  });

  describe('Waiting phase', () => {
    it('shows waiting indicator when user has submitted but partner has not', () => {
      const waitingState: LiveSessionState = {
        ...DEFAULT_LIVE_STATE,
        ratingPhase: 'waiting',
        checkerName: 'alice',
        checkerRating: 7,
        checkerSubmitted: true,
        responderSubmitted: false,
      };

      render(
        <LiveModeView
          {...defaultProps}
          liveState={waitingState}
        />
      );

      expect(screen.getByText(/Waiting for/i)).toBeInTheDocument();
    });
  });

  describe('Celebration phase', () => {
    it('shows celebration when checker rates 10/10', () => {
      const perfectState: LiveSessionState = {
        ...DEFAULT_LIVE_STATE,
        ratingPhase: 'revealed',
        checkerName: 'alice',
        checkerRating: 10,
        responderRating: 10,
        checkerSubmitted: true,
        responderSubmitted: true,
      };

      render(
        <LiveModeView
          {...defaultProps}
          liveState={perfectState}
        />
      );

      // Should show celebration
      expect(screen.getByText(/perfectly/i)).toBeInTheDocument();
    });
  });

  describe('Skip functionality', () => {
    it('calls onSkip when skip/good enough is clicked', () => {
      const gapState: LiveSessionState = {
        ...DEFAULT_LIVE_STATE,
        ratingPhase: 'revealed',
        checkerName: 'alice',
        checkerRating: 5,
        responderRating: 8,
        checkerSubmitted: true,
        responderSubmitted: true,
      };

      render(
        <LiveModeView
          {...defaultProps}
          liveState={gapState}
        />
      );

      const skipButton = screen.getByRole('button', { name: /Good enough/i });
      fireEvent.click(skipButton);

      expect(mockHandlers.onSkip).toHaveBeenCalledTimes(1);
    });
  });
});
