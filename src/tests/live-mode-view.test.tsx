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
    it('renders single "Does [partner] understand you?" button (P562/AD-7: Listen button removed)', () => {
      renderWithRouter(
        <LiveModeView
          {...defaultProps}
          liveState={DEFAULT_LIVE_STATE}
        />
      );

      // Single Speak button (Check) — no Listen/Prove button per AD-7
      expect(screen.getByTestId('start-check')).toBeInTheDocument();
      expect(screen.queryByTestId('start-prove')).not.toBeInTheDocument();
    });

    it('calls onStartCheck when "Does [partner] understand you?" is clicked', () => {
      renderWithRouter(
        <LiveModeView
          {...defaultProps}
          liveState={DEFAULT_LIVE_STATE}
        />
      );

      fireEvent.click(screen.getByTestId('start-check'));
      expect(mockHandlers.onStartCheck).toHaveBeenCalledTimes(1);
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
      // The text is now "journey to understand you"
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
      // And the rating question should ask how well Bob believes Alice understands him
      expect(screen.getByText(/How well do you believe Alice understands you/i)).toBeInTheDocument();
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
      expect(screen.getByText(/How well do you believe Bob understands you/i)).toBeInTheDocument();
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
      expect(screen.getByText(/How well do you believe Bob understands you/i)).toBeInTheDocument();
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

    it('P71: both checker and responder see identical Continue button (no "Share what worked")', () => {
      const perfectState: LiveSessionState = {
        ...DEFAULT_LIVE_STATE,
        ratingPhase: 'revealed',
        checkerName: 'alice',
        checkerRating: 10,
        responderRating: 10,
        checkerSubmitted: true,
        responderSubmitted: true,
      };

      // Test as checker (currentUserName matches checkerName)
      const { unmount } = renderWithRouter(
        <LiveModeView
          {...defaultProps}
          currentUserName="alice"
          liveState={perfectState}
        />
      );

      // Checker should see Continue button
      expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
      // Should NOT see "Share what worked" button (P71 removed it)
      expect(screen.queryByRole('button', { name: /share what worked/i })).not.toBeInTheDocument();
      // Should NOT see "I'm done" button (P71 removed it)
      expect(screen.queryByRole('button', { name: /i'm done/i })).not.toBeInTheDocument();

      unmount();

      // Test as responder (currentUserName does NOT match checkerName)
      renderWithRouter(
        <LiveModeView
          {...defaultProps}
          currentUserName="bob"
          liveState={perfectState}
        />
      );

      // Responder should also see Continue button (same as checker now)
      expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
      // Should NOT see any checker-specific buttons
      expect(screen.queryByRole('button', { name: /share what worked/i })).not.toBeInTheDocument();
    });

    it('P71: shows waiting state when user has acknowledged but partner has not', () => {
      // Alice (checker) has clicked Continue, Bob (responder) has not
      const aliceAcknowledgedState: LiveSessionState = {
        ...DEFAULT_LIVE_STATE,
        ratingPhase: 'revealed',
        checkerName: 'alice',
        checkerRating: 10,
        responderRating: 10,
        checkerSubmitted: true,
        responderSubmitted: true,
        celebrationAcknowledgedBy: ['alice'], // Alice clicked Continue
      };

      // Render as Alice (who has acknowledged)
      renderWithRouter(
        <LiveModeView
          {...defaultProps}
          currentUserName="alice"
          partnerName="bob"
          liveState={aliceAcknowledgedState}
        />
      );

      // Alice should see waiting indicator (disabled button + waiting message)
      const continueButton = screen.getByRole('button', { name: /continue/i });
      expect(continueButton).toBeDisabled();
      expect(screen.getByText(/waiting for bob/i)).toBeInTheDocument();
    });

    it('P71: partner who has not acknowledged sees enabled Continue button', () => {
      // Alice has clicked Continue, Bob has not
      const aliceAcknowledgedState: LiveSessionState = {
        ...DEFAULT_LIVE_STATE,
        ratingPhase: 'revealed',
        checkerName: 'alice',
        checkerRating: 10,
        responderRating: 10,
        checkerSubmitted: true,
        responderSubmitted: true,
        celebrationAcknowledgedBy: ['alice'], // Alice clicked Continue
      };

      // Render as Bob (who has NOT acknowledged)
      renderWithRouter(
        <LiveModeView
          {...defaultProps}
          currentUserName="bob"
          partnerName="alice"
          liveState={aliceAcknowledgedState}
        />
      );

      // Bob should see enabled Continue button (he hasn't clicked yet)
      const continueButton = screen.getByRole('button', { name: /continue/i });
      expect(continueButton).toBeEnabled();
      // Should NOT see waiting message
      expect(screen.queryByText(/waiting for/i)).not.toBeInTheDocument();
    });

    it('P71: clicking Continue calls onCelebrationComplete', () => {
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
          currentUserName="alice"
          liveState={perfectState}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /continue/i }));
      expect(mockHandlers.onCelebrationComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe('Recording indicator (P28 KISS fix)', () => {
    it('always shows recording indicator when session is live', () => {
      // KISS: The recording banner should ALWAYS show when LiveModeView is rendered
      // It should NOT depend on isRecording prop
      renderWithRouter(
        <LiveModeView
          {...defaultProps}
          liveState={DEFAULT_LIVE_STATE}
          // Note: NOT passing isRecording prop at all
        />
      );

      // The recording indicator should be visible
      expect(screen.getByText(/Session recorded for AI Insights/i)).toBeInTheDocument();
    });

    it('shows recording indicator in different session states', () => {
      // Banner should show regardless of session phase
      const ratingState: LiveSessionState = {
        ...DEFAULT_LIVE_STATE,
        ratingPhase: 'rating',
        checkerName: 'alice',
      };

      renderWithRouter(
        <LiveModeView
          {...defaultProps}
          liveState={ratingState}
        />
      );

      expect(screen.getByText(/Session recorded for AI Insights/i)).toBeInTheDocument();
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

  describe('P128: Session History on /live idle screen', () => {
    it('renders session history on /live idle screen', () => {
      const stateWithHistory: LiveSessionState = {
        ...DEFAULT_LIVE_STATE,
        sessionHistory: [
          { title: 'The importance of feedback', type: 'story', checkerRating: 8, responderRating: 7, explainBackRatings: [], checkerName: 'alice', partnerName: 'bob', completedAt: '2026-02-19T10:00:00.000Z', isChecker: true },
          { title: 'Clear communication matters', type: 'point', checkerRating: 6, responderRating: 9, explainBackRatings: [], checkerName: 'bob', partnerName: 'alice', completedAt: '2026-02-19T10:05:00.000Z', isChecker: false },
        ],
      };

      renderWithRouter(
        <LiveModeView
          {...defaultProps}
          liveState={stateWithHistory}
        />
      );

      // History is visible on /live
      expect(screen.getByText('This session')).toBeInTheDocument();
      expect(screen.getByText('The importance of feedback')).toBeInTheDocument();
      expect(screen.getByText('Clear communication matters')).toBeInTheDocument();
      // Primary action still visible
      expect(screen.getByTestId('start-check')).toBeInTheDocument();
    });

    it('initializes sessionHistory as empty array in DEFAULT_LIVE_STATE', () => {
      expect(DEFAULT_LIVE_STATE.sessionHistory).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // P408: Removed positions hide the point from the story card in /live
  // ─────────────────────────────────────────────────────────────────────────

  describe('P408: Removed position hides point in selected story', () => {
    const mockStoryData = {
      id: 'story-1',
      authorId: 'author-1',
      authorName: 'Alice Author',
      authorSlug: 'alice-author',
      authorAvatarColor: null,
      authorAvatarUrl: null,
      authorRole: null,
      authorEarsCount: 0,
      authorHasPledged: false,
      visibility: 'public' as const,
      content: 'Remote work changes team communication dynamics.',
      createdAt: '2026-01-01T00:00:00Z',
      points: [
        {
          id: 'point-1',
          statement: 'Remote work helps productivity',
          tags: [],
          userPosition: null,
          profileSubjectPosition: null,
          positionCounts: {},
        },
      ],
    };

    it('shows point when user has never interacted with it (not in livePositions)', () => {
      const state: LiveSessionState = {
        ...DEFAULT_LIVE_STATE,
        selectedStoryData: mockStoryData,
        livePositions: {},
      };

      // P670: userId must match authorId so hasScrollableContent treats this as a local story selection
      renderWithRouter(
        <LiveModeView {...defaultProps} currentUserName="alice" userId="author-1" liveState={state} />
      );

      // Footer expand button must be present (story has 1 point)
      expect(screen.getByText(/1 point/i)).toBeInTheDocument();

      // Expand and check point text
      fireEvent.click(screen.getByRole('button', { name: /1 point/i }));
      expect(screen.getByText('Remote work helps productivity')).toBeInTheDocument();
    });

    it('shows point when user has voted on it (non-null position in livePositions)', () => {
      const state: LiveSessionState = {
        ...DEFAULT_LIVE_STATE,
        selectedStoryData: mockStoryData,
        livePositions: { alice: { 'point-1': 'agree' } },
      };

      // P670: userId must match authorId so hasScrollableContent treats this as a local story selection
      renderWithRouter(
        <LiveModeView {...defaultProps} currentUserName="alice" userId="author-1" liveState={state} />
      );

      expect(screen.getByText(/1 point/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /1 point/i }));
      expect(screen.getByText('Remote work helps productivity')).toBeInTheDocument();
    });

    it('hides point after user explicitly removes position (null in livePositions)', () => {
      const state: LiveSessionState = {
        ...DEFAULT_LIVE_STATE,
        selectedStoryData: mockStoryData,
        livePositions: { alice: { 'point-1': null } },
      };

      // P412: hide-on-null only applies to the story author (userId matches authorId)
      renderWithRouter(
        <LiveModeView {...defaultProps} currentUserName="alice" userId="author-1" liveState={state} />
      );

      // No points remain → expand button is gone → point text not visible
      expect(screen.queryByText(/1 point/i)).not.toBeInTheDocument();
      expect(screen.queryByText('Remote work helps productivity')).not.toBeInTheDocument();
    });

    it('only hides the removed point, not unrelated points', () => {
      const twoPointStory = {
        ...mockStoryData,
        points: [
          { id: 'point-1', statement: 'Remote work helps productivity', tags: [], userPosition: null, profileSubjectPosition: null, positionCounts: {} },
          { id: 'point-2', statement: 'Async tools reduce meeting fatigue', tags: [], userPosition: null, profileSubjectPosition: null, positionCounts: {} },
        ],
      };

      const state: LiveSessionState = {
        ...DEFAULT_LIVE_STATE,
        selectedStoryData: twoPointStory,
        livePositions: { alice: { 'point-1': null } }, // only point-1 removed
      };

      // P412: hide-on-null only applies to the story author (userId matches authorId)
      renderWithRouter(
        <LiveModeView {...defaultProps} currentUserName="alice" userId="author-1" liveState={state} />
      );

      // 1 point remains
      expect(screen.getByText(/1 point/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /1 point/i }));
      expect(screen.queryByText('Remote work helps productivity')).not.toBeInTheDocument();
      expect(screen.getByText('Async tools reduce meeting fatigue')).toBeInTheDocument();
    });
  });

  describe('P398: Clickable session history on /live', () => {
    it('"View round summary" button present for completed rounds on /live idle screen', () => {
      const state: LiveSessionState = {
        ...DEFAULT_LIVE_STATE,
        sessionHistory: [
          { title: 'The bridge story', type: 'story', checkerRating: 8, responderRating: 7, explainBackRatings: [], checkerName: 'alice', partnerName: 'bob', completedAt: '2026-02-19T10:00:00.000Z', isChecker: true },
        ],
      };

      renderWithRouter(
        <LiveModeView {...defaultProps} currentUserName="alice" partnerName="bob" liveState={state} />
      );

      // Clickable history entry with chevron present on /live
      expect(screen.getByRole('button', { name: /View round summary: The bridge story/i })).toBeInTheDocument();
      // Primary action still visible
      expect(screen.getByTestId('start-check')).toBeInTheDocument();
    });
  });
});
