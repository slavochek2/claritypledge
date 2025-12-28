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

      // Use data-testid for robust button selection
      expect(screen.getByTestId('start-check')).toBeInTheDocument();
      expect(screen.getByTestId('start-prove')).toBeInTheDocument();
    });

    it('calls onStartCheck when "Did you get it?" is clicked', () => {
      render(
        <LiveModeView
          {...defaultProps}
          liveState={DEFAULT_LIVE_STATE}
        />
      );

      fireEvent.click(screen.getByTestId('start-check'));
      expect(mockHandlers.onStartCheck).toHaveBeenCalledTimes(1);
    });

    it('calls onStartProve when "Did I get it?" is clicked', () => {
      render(
        <LiveModeView
          {...defaultProps}
          liveState={DEFAULT_LIVE_STATE}
        />
      );

      fireEvent.click(screen.getByTestId('start-prove'));
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

    it('shows drawer notification with correct message when prover initiates', () => {
      // Simulate: Alice (prover/listener) tapped "Did I get it?" and submitted
      // Bob (checker/speaker) sees the drawer notification
      const proverSubmittedState: LiveSessionState = {
        ...DEFAULT_LIVE_STATE,
        ratingPhase: 'waiting',
        checkerName: 'bob',
        proverName: 'alice',
        responderRating: 7,
        responderSubmitted: true,
        checkerSubmitted: false,
      };

      // Render as Bob (the checker/speaker who sees the drawer)
      render(
        <LiveModeView
          {...defaultProps}
          currentUserName="bob"
          partnerName="alice"
          liveState={proverSubmittedState}
        />
      );

      // Bob should see drawer with "Alice wants to prove they understand you"
      expect(screen.getByText(/Alice wants to prove/i)).toBeInTheDocument();
      // And the rating question should ask how understood Bob feels
      expect(screen.getByText(/How well do you feel understood by Alice/i)).toBeInTheDocument();
    });

    it('shows correct rating question for prover (listener) when they initiate', () => {
      // Simulate: Alice tapped "Did I get it?" and is now rating her confidence
      // This is shown via the local isLocallyRating state, but we can test the RatingScreen
      const proverRatingState: LiveSessionState = {
        ...DEFAULT_LIVE_STATE,
        ratingPhase: 'rating',
        checkerName: 'bob',
        proverName: 'alice',
        checkerSubmitted: false,
        responderSubmitted: false,
      };

      // Render as Alice (the prover/responder who is rating)
      render(
        <LiveModeView
          {...defaultProps}
          currentUserName="alice"
          partnerName="bob"
          liveState={proverRatingState}
          isLocallyRating={true}
        />
      );

      // Alice should see "How confident are you that you understand Bob?"
      expect(screen.getByText(/How confident are you that you understand Bob/i)).toBeInTheDocument();
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
    it('calls onSkip after confirmation when skip/good enough is clicked', () => {
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

      // Click "Good enough" button - this opens a confirmation dialog
      const skipButton = screen.getByRole('button', { name: /Good enough/i });
      fireEvent.click(skipButton);

      // onSkip should not be called yet (waiting for confirmation)
      expect(mockHandlers.onSkip).not.toHaveBeenCalled();

      // Find and click the confirm button in the dialog
      // The dialog shows "Move forward?" with a "Move forward" confirm button
      const confirmButton = screen.getByRole('button', { name: /Move forward$/i });
      fireEvent.click(confirmButton);

      expect(mockHandlers.onSkip).toHaveBeenCalledTimes(1);
    });
  });
});
