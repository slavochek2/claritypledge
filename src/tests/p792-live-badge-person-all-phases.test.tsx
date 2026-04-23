/**
 * @file p792-live-badge-person-all-phases.test.tsx
 * @description Canary tests for P792 — partner badge identity in LiveModeView.
 *
 * T1 (canary): In gap-revealed phase, partner badge shows partner's name ('Partner'), not
 * the story author's name ('alice'). FAILS before fix: line 3050 of live-mode-view.tsx
 * passes neither badgePersonName nor badgePersonEarsCount to <LiveStoryCardExpanded>, so
 * LiveStoryCardExpanded falls back to story.authorName ('alice') in the badge.
 *
 * T2: In explain-back phase, partner badge also shows 'Partner' — confirms fix covers the
 * ratingPhase='explain-back' invocation sites as well.
 *
 * Root cause: 10 of 13 <LiveStoryCardExpanded> call sites in live-mode-view.tsx pass no
 * badgePersonName/badgePersonEarsCount/avatar props. Fix: thread isAuthorOfSelected ?
 * getFirstName(partnerName) : undefined through all 13 invocations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LiveModeView } from '@/app/components/partners/live-mode-view';
import { DEFAULT_LIVE_STATE, type LiveSessionState } from '@/app/types';

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

const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

const mockHandlers = {
  onRatingSubmit: vi.fn(),
  onSkip: vi.fn(),
  onExplainBackStart: vi.fn(),
  onExplainBackRate: vi.fn(),
  onStartCheck: vi.fn(),
  onStartProve: vi.fn(),
  onBackToIdle: vi.fn(),
  onClearSkipNotification: vi.fn(),
  onCancelLocalRating: vi.fn(),
  onExitMeeting: vi.fn(),
  onExplainBackDone: vi.fn(),
  onCelebrationComplete: vi.fn(),
  onSharePerspective: vi.fn(),
  onAskToExplainFirst: vi.fn(),
  onContinueAsListener: vi.fn(),
  onInsistToSpeak: vi.fn(),
  onLetThemSpeak: vi.fn(),
  onCancelNegotiation: vi.fn(),
  onClarifyStart: vi.fn(),
  onClarifyDone: vi.fn(),
};

// Shared story fixture — alice is the author, partner has position 'agree' on p1.
// livePositionsJoiner populated so the badge renders (profileSubjectPosition truthy).
const aliceStory = {
  id: 'story-test',
  authorId: 'user-alice',
  authorName: 'alice',
  authorSlug: 'alice',
  content: 'Test story content',
  visibility: 'public',
  points: [{
    id: 'p1',
    statement: 'Test point statement',
    tags: [] as string[],
    systemTags: [] as string[],
    visibility: 'public',
    profileSubjectPosition: null as string | null,
  }],
};

describe('LiveModeView — partner badge identity (P792 canary)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('T1: gap-revealed phase shows partner name in badge, not story author name', () => {
    // State that reaches gap-revealed:
    //   ratingPhase='revealed' → viewState='understanding'
    //   bothSubmitted=true, gapPoints=|8-5|=3>0, hasExplainBackHappened=false
    //   → phase='gap-revealed'
    //   livePositionsJoiner populated → badge renders with profileSubjectPosition
    //
    // Bug: <LiveStoryCardExpanded> at line 3050 receives no badgePersonName prop →
    // badge falls back to story.authorName = 'alice' instead of 'Partner'.
    const bugState: LiveSessionState = {
      ...DEFAULT_LIVE_STATE,
      ratingPhase: 'revealed',
      checkerName: 'alice',       // isChecker = (checkerName === currentUserName) → true
      checkerRating: 5,           // latestCheckerRating = 5
      checkerSubmitted: true,
      responderRating: 8,         // gapPoints = |8-5| = 3
      responderSubmitted: true,   // bothSubmitted = true
      explainBackRatings: [],     // hasExplainBackHappened = false → gap-revealed
      livePositionsJoiner: { 'p1': 'agree' }, // partnerPositions when isCreator=true
      selectedStoryData: aliceStory,
    };

    renderWithRouter(
      <LiveModeView
        {...mockHandlers}
        liveState={bugState}
        currentUserName="alice"
        partnerName="Partner"
        isLocallyRating={false}
        userId="user-alice"       // isAuthorOfSelected = (userId === authorId) → true
        isCreator={true}          // partnerPositions = livePositionsJoiner
      />
    );

    // Before fix: badge shows story.authorName = 'alice' (wrong)
    // → no element with exactly 'Partner' as text → this assertion FAILS
    // After fix: badgePersonName = getFirstName('Partner') = 'Partner' is threaded through
    // → <span className="font-medium">Partner</span> exists → passes
    expect(screen.queryByText('Partner')).not.toBeNull();
  });

  it('T2: explain-back phase also shows partner name in badge', () => {
    // ratingPhase='explain-back' → viewState='understanding', phase='explain-back'
    // Same badge identity bug applies to line 3184 and 3311 (explain-back invocation sites).
    const explainBackState: LiveSessionState = {
      ...DEFAULT_LIVE_STATE,
      ratingPhase: 'explain-back',
      checkerName: 'alice',
      checkerRating: 5,
      checkerSubmitted: true,
      responderRating: 8,
      responderSubmitted: true,
      explainBackRatings: [],
      livePositionsJoiner: { 'p1': 'agree' },
      selectedStoryData: aliceStory,
    };

    renderWithRouter(
      <LiveModeView
        {...mockHandlers}
        liveState={explainBackState}
        currentUserName="alice"
        partnerName="Partner"
        isLocallyRating={false}
        userId="user-alice"
        isCreator={true}
      />
    );

    // Same badge identity invariant: partner's name, not author's name.
    expect(screen.queryByText('Partner')).not.toBeNull();
  });
});
