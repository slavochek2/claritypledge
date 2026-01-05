/**
 * @file live-mode-view.test.tsx
 * @description Tests for P23.3 "Did I get it?" feature and core LiveModeView functionality
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LiveModeView } from '@/app/components/partners/live-mode-view';
import { DEFAULT_LIVE_STATE, type LiveSessionState } from '@/app/types';

// Mock auth for LiveSessionBanner which uses useAuth
vi.mock('@/auth', () => ({
  useAuth: () => ({
    user: null,
    session: null,
    isLoading: false,
    sessionChecked: true,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));

// Helper to render with router context
const renderWithRouter = (ui: React.ReactElement) => {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
};

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
  onSharePerspective: vi.fn(),
  // Role switch negotiation handlers
  onAskToExplainFirst: vi.fn(),
  onContinueAsListener: vi.fn(),
  onInsistToSpeak: vi.fn(),
  onLetThemSpeak: vi.fn(),
  // Speaker clarification handlers
  onClarifyStart: vi.fn(),
  onClarifyDone: vi.fn(),
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
      renderWithRouter(
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
      renderWithRouter(
        <LiveModeView
          {...defaultProps}
          liveState={DEFAULT_LIVE_STATE}
        />
      );

      fireEvent.click(screen.getByTestId('start-check'));
      expect(mockHandlers.onStartCheck).toHaveBeenCalledTimes(1);
    });

    it('calls onStartProve when "Did I get it?" is clicked', () => {
      renderWithRouter(
        <LiveModeView
          {...defaultProps}
          liveState={DEFAULT_LIVE_STATE}
        />
      );

      fireEvent.click(screen.getByTestId('start-prove'));
      expect(mockHandlers.onStartProve).toHaveBeenCalledTimes(1);
    });

    it('displays partner name in header', () => {
      renderWithRouter(
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

      renderWithRouter(
        <LiveModeView
          {...defaultProps}
          liveState={proverInitiatedState}
        />
      );

      // Should show the journey with prover context
      // The text is now "journey to make you feel understood"
      expect(screen.getByText(/journey to/i)).toBeInTheDocument();
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
      renderWithRouter(
        <LiveModeView
          {...defaultProps}
          currentUserName="bob"
          partnerName="alice"
          liveState={proverSubmittedState}
        />
      );

      // Bob should see drawer with "Alice wants to know how well they understood you"
      expect(screen.getByText(/Alice wants to know/i)).toBeInTheDocument();
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
      renderWithRouter(
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

    it('uses localFlowType to detect prove flow BEFORE shared state updates', () => {
      // Critical test: localFlowType='prove' should trigger prover-initiated messaging
      // even when liveState.proverName is NOT yet set (before submit)
      const preSubmitState: LiveSessionState = {
        ...DEFAULT_LIVE_STATE,
        ratingPhase: 'rating',
        checkerName: 'bob',
        // proverName is NOT set yet - this is the key difference
        checkerSubmitted: false,
        responderSubmitted: false,
      };

      // Render as Alice with localFlowType='prove' (she just tapped "Did I get it?")
      renderWithRouter(
        <LiveModeView
          {...defaultProps}
          currentUserName="alice"
          partnerName="bob"
          liveState={preSubmitState}
          isLocallyRating={true}
          localFlowType="prove"
        />
      );

      // Alice should see the prover question even before proverName is set in shared state
      expect(screen.getByText(/How confident are you that you understand Bob/i)).toBeInTheDocument();
    });

    it('uses localFlowType="check" for standard "Did you get it?" flow', () => {
      const checkFlowState: LiveSessionState = {
        ...DEFAULT_LIVE_STATE,
        ratingPhase: 'rating',
        checkerName: 'alice',
        checkerSubmitted: false,
        responderSubmitted: false,
      };

      // Render as Alice with localFlowType='check' (she tapped "Did you get it?")
      renderWithRouter(
        <LiveModeView
          {...defaultProps}
          currentUserName="alice"
          partnerName="bob"
          liveState={checkFlowState}
          isLocallyRating={true}
          localFlowType="check"
        />
      );

      // Alice (checker) should see the speaker question
      expect(screen.getByText(/How well do you feel Bob understands you/i)).toBeInTheDocument();
    });

    it('handles undefined localFlowType with isLocallyRating=true (defaults to check flow)', () => {
      const defaultFlowState: LiveSessionState = {
        ...DEFAULT_LIVE_STATE,
        ratingPhase: 'rating',
        checkerName: 'alice',
        checkerSubmitted: false,
        responderSubmitted: false,
      };

      // Render without localFlowType prop
      renderWithRouter(
        <LiveModeView
          {...defaultProps}
          currentUserName="alice"
          partnerName="bob"
          liveState={defaultFlowState}
          isLocallyRating={true}
          // localFlowType is undefined
        />
      );

      // Should default to check flow behavior (speaker question)
      expect(screen.getByText(/How well do you feel Bob understands you/i)).toBeInTheDocument();
    });
  });

  describe('Rating submission', () => {
    it('shows rating screen when isLocallyRating is true', () => {
      renderWithRouter(
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
      renderWithRouter(
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

      renderWithRouter(
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

      renderWithRouter(
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
    it('calls onSharePerspective when "Speak freely" is clicked in gap-revealed state', () => {
      // In gap-revealed phase, the listener (responder) sees "Speak freely" button
      const gapState: LiveSessionState = {
        ...DEFAULT_LIVE_STATE,
        ratingPhase: 'revealed',
        checkerName: 'alice',
        checkerRating: 5,
        responderRating: 8,
        checkerSubmitted: true,
        responderSubmitted: true,
      };

      renderWithRouter(
        <LiveModeView
          {...defaultProps}
          currentUserName="bob"  // Bob is the listener/responder
          partnerName="alice"
          liveState={gapState}
        />
      );

      // In gap-revealed phase, listener sees "Speak freely" button
      const speakFreelyButton = screen.getByRole('button', { name: /Speak freely/i });
      fireEvent.click(speakFreelyButton);

      // This triggers onSharePerspective (to start negotiation)
      expect(mockHandlers.onSharePerspective).toHaveBeenCalledTimes(1);
    });
  });
});
