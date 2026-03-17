/**
 * @file live-mode-view.tsx
 * @description P23: Live Clarity Meeting UI - Check/Prove model for understanding verification
 *
 * Architecture (P23.2):
 * - Checker/Responder model: User who taps "I spoke" becomes checker
 * - Sealed-bid ratings: Both rate simultaneously, hidden until both submit
 * - Gap detection with explain-back flow for resolving understanding gaps
 *
 * Key Components:
 * - IdleScreen: Start screen with "Did you get me?" / "Did I get you?" buttons
 * - RatingScreen: Rating input (0-10 scale)
 * - RatingCard: Reusable rating question + scale component
 * - JourneyToUnderstanding: Shows rating history across rounds
 * - UnderstandingScreen: Unified component for waiting, gap-revealed, explain-back, results, and celebration phases
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Link, useSearchParams } from 'react-router-dom';
import { DoorOpen, Loader2 as Loader2Icon, ShieldOff, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { type LiveSessionState, type GapType, type FlowType, type StoryWithPoints, type PointWithCreator, type PointWithUserPosition, type PositionType } from '@/app/types';
import { LiveSessionBanner } from './live-session-banner';
import { getFirstName, RatingButtons } from './shared';
import { playCelebrationSound } from '@/hooks/use-sound';
import { SessionHistoryList, PointCardPreview } from './live-content-cards';
import { RoundSummaryScreen } from './round-summary-screen';
import { StorySearchPicker } from './story-search-picker';
import { LiveStoryCardExpanded } from './live-story-card-expanded';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { PositionBadge } from '@/app/components/shared';
import { storiesService } from '@/app/data/stories-service';
import { pointsService } from '@/app/data/points-service';
import { analytics } from '@/lib/mixpanel';
import { InstallBanner } from '@/app/components/pwa/install-banner';
import { usePwaInstall } from '@/hooks/use-pwa-install';

// ============================================================================
// P28.1: RECORDING INDICATOR (KISS: always show when session is live)
// ============================================================================

/**
 * Shows recording indicator banner below the header.
 * KISS: Always renders when session is live - no props needed.
 * The banner's purpose is transparency for users, not a technical indicator.
 */

function RecordingIndicator({ isPrivate = false }: { isPrivate?: boolean }) {
  if (isPrivate) {
    return (
      <div className="flex items-center justify-center gap-2 py-1.5 bg-muted border-b border-border" aria-live="polite">
        <ShieldOff className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Private session</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center gap-2 py-1.5 bg-blue-50 border-b border-blue-200">
      <Sparkles className="w-3.5 h-3.5 text-blue-500" />
      <span className="text-xs text-blue-700">Session recorded for AI Insights</span>
    </div>
  );
}

// ============================================================================
// LAYOUT CONSTANTS
// ============================================================================

/** Standard content container layout - centered, max-width, top-aligned */
const CONTENT_LAYOUT = "flex-1 flex flex-col items-center justify-start pt-8 p-6 space-y-6 max-w-lg mx-auto w-full";
/** Content layout variant - vertically centered (for idle state without history) */
const CONTENT_LAYOUT_CENTERED = "flex-1 flex flex-col items-center justify-center px-6 pb-6 pt-16 space-y-8 max-w-lg mx-auto w-full";

// ============================================================================
// PARTNER LEFT SCREEN
// ============================================================================

interface PartnerLeftScreenProps {
  partnerName: string | null;
  sessionEnded: boolean; // true = creator ended session, false = joiner left
  onStartNew: () => void;
  /** P396: True when user is an anonymous guest (not a verified account) */
  isGuest?: boolean;
}

/**
 * Screen shown when the partner has left the meeting.
 * Displays different messaging based on whether the creator ended the session
 * or the joiner left. Shows signup prompt for anonymous guests.
 */
export function PartnerLeftScreen({ partnerName, sessionEnded, onStartNew, isGuest }: PartnerLeftScreenProps) {
  // Different messaging based on what happened
  const title = sessionEnded
    ? 'Session ended'
    : partnerName
      ? `${partnerName} has left`
      : 'Your partner has left';

  const subtitle = sessionEnded
    ? `${partnerName || 'The host'} ended the Clarity Session.`
    : 'Clarity Session has ended.';

  return (
    <div className="flex flex-col items-center justify-center min-h-[300px]">
      {/* P493: Install banner for registered users (guests see signup CTA instead) */}
      {!isGuest && <PwaSessionEndBanner />}
      <div className="p-8 text-center max-w-sm mx-auto">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4 mx-auto">
        <DoorOpen className="w-8 h-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <p className="text-muted-foreground mb-6">{subtitle}</p>
      {!isGuest && (
        <>
          <Button onClick={onStartNew} className="bg-blue-500 hover:bg-blue-600 text-white">
            Start New Session
          </Button>
          {sessionEnded && (
            <>
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="w-4 h-4 animate-spin flex-shrink-0" />
                <span>Transcribing your session...</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                It will be available shortly in{' '}
                <Link to="/sessions" className="text-primary hover:underline">
                  Session History
                </Link>
              </p>
            </>
          )}
        </>
      )}

      {/* P396/P492: Soft signup CTA for anonymous guests — lead with value prop */}
      {isGuest && (
        <div className="mt-2 text-center space-y-4">
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 space-y-1">
            <p className="text-sm font-medium text-blue-900">Your session transcript is ready</p>
            <p className="text-xs text-blue-700">Create a free account to access AI-powered insights from this session</p>
          </div>
          <Link
            to="/signup"
            className="inline-flex items-center justify-center rounded-md bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium h-10 px-6 transition-colors w-full"
          >
            Create Free Account
          </Link>
          <Link
            to="/login"
            className="block text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Already have an account? Log in
          </Link>
        </div>
      )}
      </div>
    </div>
  );
}

/** P493: Install banner for registered users at session end */
function PwaSessionEndBanner() {
  const { dismiss } = usePwaInstall();
  return <InstallBanner source="session_end" onDismiss={() => dismiss('session_end')} />;
}

// ============================================================================
// LIVE MODE VIEW
// ============================================================================

interface LiveModeViewProps {
  liveState: LiveSessionState;
  currentUserName: string;
  partnerName: string;
  onRatingSubmit: (rating: number) => void;
  onSkip: () => void;
  onExplainBackStart: () => void;
  onExplainBackRate: (rating: number) => void;
  onStartCheck: () => void;
  /** P23.3: Listener taps "Did I get it?" to prove understanding */
  onStartProve: () => void;
  onBackToIdle: () => void;
  /** Clear the skip notification after showing toast */
  onClearSkipNotification: () => void;
  /** Local rating state - true when user tapped "I spoke" but hasn't submitted yet */
  isLocallyRating: boolean;
  onCancelLocalRating: () => void;
  /** Exit the meeting entirely and return to the join/lobby screen */
  onExitMeeting: () => void;
  /** V11: Listener taps "Done Explaining" to unlock speaker's belief interface */
  onExplainBackDone: () => void;
  /** Called when user clicks "Continue" on celebration screen - resets shared state for new rounds */
  onCelebrationComplete: () => void;
  /** Local flow type - 'check' for "Did you get me?", 'prove' for "Did I get you?" */
  localFlowType?: FlowType;
  /** Listener wants to share their own perspective instead of explaining back */
  onSharePerspective: () => void;
  /** Speaker asks listener to explain back first (negotiation step 1) */
  onAskToExplainFirst: () => void;
  /** Listener continues as listener after speaker asked them to explain back */
  onContinueAsListener: () => void;
  /** Listener insists they really need to speak */
  onInsistToSpeak: () => void;
  /** Speaker lets listener speak after they insisted */
  onLetThemSpeak: () => void;
  /** P515: Listener cancels their "Speak freely" negotiation request */
  onCancelNegotiation: () => void;
  /** Speaker wants to clarify before listener tries again */
  onClarifyStart: () => void;
  /** Speaker finished clarifying */
  onClarifyDone: () => void;
  /** P128: Authenticated user ID for fetching stories/points */
  userId?: string;
  /** P128: Select a story for content-attached verification */
  onSelectStory?: (storyId: string, title: string, storyData?: StoryWithPoints) => void;
  /** P128: Select a point for content-attached verification */
  onSelectPoint?: (pointId: string, title: string) => void;
  /** P272: Clear selected story (return to free-form mode) */
  onClearStory?: () => void;
  /** P275: Update a point position during the /live session (safe for unverified guests) */
  onPositionSelect?: (pointId: string, position: PositionType | null) => void;
  /** P160: When true, session is private — shows private band instead of recording band */
  isPrivate?: boolean;
  /** Ear count for the partner (used to show their credibility badge in the host view) */
  partnerEarsCount?: number;
  /** P525: Whether the current user is the session creator (needed for role-aware celebration acknowledgment) */
  isCreator?: boolean;
}

export function LiveModeView({
  liveState,
  currentUserName,
  partnerName,
  onRatingSubmit,
  onSkip,
  onExplainBackStart,
  onExplainBackRate,
  onStartCheck,
  onStartProve,
  onBackToIdle,
  onClearSkipNotification,
  isLocallyRating,
  onCancelLocalRating,
  onExitMeeting,
  onExplainBackDone,
  onCelebrationComplete,
  localFlowType,
  onSharePerspective,
  onAskToExplainFirst,
  onContinueAsListener,
  onInsistToSpeak,
  onLetThemSpeak,
  onCancelNegotiation,
  onClarifyStart,
  onClarifyDone,
  userId,
  onSelectStory,
  onSelectPoint,
  onClearStory,
  onPositionSelect,
  isPrivate = false,
  partnerEarsCount = 0,
  isCreator = false,
}: LiveModeViewProps) {

  // Hide site-wide navigation when live session is active.
  // useLayoutEffect (not useEffect) so the cleanup fires synchronously before
  // the browser paints — prevents a one-frame flash of missing nav when the
  // session ends or the user navigates away.
  useLayoutEffect(() => {
    const nav = document.querySelector<HTMLElement>('[data-nav="main"]');
    const main = nav?.closest('.min-h-screen')?.querySelector('main');
    if (nav) nav.style.display = 'none';
    if (main) {
      main.style.paddingTop = '0';
      // P511: Keep bottom padding so BottomNav remains visible during live sessions
      // main.style.paddingBottom = '0';
    }
    return () => {
      if (nav) nav.style.display = '';
      if (main) {
        main.style.paddingTop = '';
        // P511: bottom padding no longer removed, so no cleanup needed
      }
    };
  }, []);

  // P128: Fetch selected content for display during verification
  const [selectedStory, setSelectedStory] = useState<StoryWithPoints | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<PointWithCreator | null>(null);

  // P272: Read selectedStory directly from liveState.selectedStoryData (no async fetch needed)
  // Also merge livePositions so positions survive page refresh.
  // For the host (viewer = author):
  //   - Fall back to profileSubjectPosition so buttons stay highlighted even if snapshot is stale
  // Each participant computes their own selectedStory, so this doesn't affect the partner's view.
  useEffect(() => {
    if (liveState.selectedStoryData) {
      const myPositions = liveState.livePositions?.[currentUserName] ?? {};
      const isAuthor = userId !== undefined && userId === liveState.selectedStoryData.authorId;
      // partnerPositions: always read from liveState so both views are reactive.
      // From each viewer's perspective, partnerName = the OTHER person, so:
      //   host view (isAuthor=true):  partnerName = guest  → guest's live votes
      //   partner view (isAuthor=false): partnerName = host → host's live votes
      const partnerPositions = liveState.livePositions?.[partnerName] ?? {};
      const storyWithPositions = {
        ...liveState.selectedStoryData,
        points: liveState.selectedStoryData.points
          // P412: Only hide a point for the story author removing their own position.
          // For the reviewer (isAuthor=false), livePositions null means "badge cleared" — point stays visible.
          .filter((p: { id: string }) => !isAuthor || !(p.id in myPositions && myPositions[p.id] === null))
          .map((p: { id: string; userPosition?: string | null; profileSubjectPosition?: string | null }) => ({
          ...p,
          // p.id in myPositions distinguishes "explicitly set to null (removed)" from "not set"
          // ?? would silently fall through null to the DB position, ignoring the removal
          // p.userPosition in selectedStoryData is always the HOST's DB position (fetched via
          // getStoriesByAuthorWithPoints(userId, userId)). Only use it for the host themselves
          // (isAuthor = true, since all picker stories are authored by the host). For the guest
          // (isAuthor = false), default to null so they start with an unset state.
          userPosition: p.id in myPositions
            ? myPositions[p.id]
            : isAuthor ? (p.userPosition ?? p.profileSubjectPosition ?? null) : null,
          // Show the other person's live position in the badge; fall back to DB snapshot for
          // the partner view (host's DB position) when the host hasn't voted live yet.
          profileSubjectPosition: p.id in partnerPositions
            ? partnerPositions[p.id]
            : (isAuthor ? null : p.profileSubjectPosition),
        })),
      };
      setSelectedStory(storyWithPositions as unknown as StoryWithPoints);
    } else {
      setSelectedStory(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState.selectedStoryData, liveState.livePositions, currentUserName, userId]);

  // Show a toast when the other person changes their position on a point.
  // Uses a ref to diff previous vs current partner positions — only fires for actual changes,
  // never on initial mount. Fixed id='live-position' replaces itself on rapid re-voting.
  const prevPartnerPositionsRef = useRef<Record<string, PositionType | null> | null>(null);
  useEffect(() => {
    const currentPositions = (liveState.livePositions?.[partnerName] ?? {}) as Record<string, PositionType | null>;

    if (prevPartnerPositionsRef.current === null) {
      // First run — initialise without toasting
      prevPartnerPositionsRef.current = { ...currentPositions };
      return;
    }

    const prev = prevPartnerPositionsRef.current;
    const points = liveState.selectedStoryData?.points ?? [];
    for (const pointId of Object.keys(currentPositions)) {
      const next = currentPositions[pointId];
      if (next && next !== prev[pointId]) {
        const firstName = getFirstName(partnerName);
        const statement = (points as { id: string; statement?: string }[]).find(p => p.id === pointId)?.statement ?? '';
        const snippet = statement.length > 42 ? statement.slice(0, 42) + '…' : statement;
        toast.custom(
          () => (
            <div className="px-3 py-2 text-sm text-foreground">
              <div className="flex items-center gap-2">
                <GravatarAvatar name={firstName} size="sm" isPledger={false} className="!w-5 !h-5 !text-[10px]" />
                <span className="font-medium">{firstName}</span>
                <PositionBadge position={next} />
              </div>
              {snippet && (
                <p className="mt-1 text-xs text-muted-foreground truncate">{snippet}</p>
              )}
            </div>
          ),
          { id: 'live-position', duration: 3000 },
        );
        break; // one toast per batch — don't stack
      }
    }
    prevPartnerPositionsRef.current = { ...currentPositions };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState.livePositions, partnerName]);

  // P128: Fetch selected point for display during verification
  useEffect(() => {
    const pointId = liveState.selectedPointId;
    if (!pointId) {
      setSelectedPoint(null);
      return;
    }
    let cancelled = false;
    pointsService.getPoint(pointId).then(p => { if (!cancelled) setSelectedPoint(p); });
    return () => { cancelled = true; };
  }, [liveState.selectedPointId]);

  // Track previous skip state to detect new skips
  const prevSkippedByRef = useRef<string | undefined>(undefined);
  // Badge person name: host sees partner's name in badge; partner sees host's name (default)
  const isAuthorOfSelected = userId !== undefined && selectedStory?.authorId === userId;
  const isGuest = userId === undefined;
  const badgePersonName = isAuthorOfSelected ? getFirstName(partnerName) : undefined;
  const badgePersonEarsCount = isAuthorOfSelected ? partnerEarsCount : undefined;

  // State for skip notification dialog
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const [skipDialogName, setSkipDialogName] = useState<string>('');

  // State for skip/good-enough/decline confirmation dialog
  const [confirmSkipOpen, setConfirmSkipOpen] = useState(false);
  const [confirmSkipType, setConfirmSkipType] = useState<'skip' | 'good-enough' | 'decline'>('skip');

  // Handler to show confirmation dialog before skipping
  const handleRequestSkip = (type: 'skip' | 'good-enough' | 'decline' = 'skip') => {
    setConfirmSkipType(type);
    setConfirmSkipOpen(true);
  };

  // Handler when user confirms the skip action
  const handleConfirmSkip = () => {
    setConfirmSkipOpen(false);
    onSkip();
  };

  // P525: Track celebration acknowledgment from new boolean keys (+ old array for backward compat)
  const oldAcknowledged = liveState.celebrationAcknowledgedBy || [];
  // P525 fix: Check only MY role's boolean — checking both caused deadlock where
  // Creator clicking Continue made Joiner think they also acknowledged
  const myBoolean = isCreator
    ? liveState.celebrationAcknowledgedByCreator
    : liveState.celebrationAcknowledgedByJoiner;
  const iHaveAcknowledgedAny = oldAcknowledged.includes(currentUserName) || myBoolean === true;
  // waitingForPartner: I clicked but both aren't done yet
  const bothBoolsDone = liveState.celebrationAcknowledgedByCreator === true && liveState.celebrationAcknowledgedByJoiner === true;
  const bothArrayDone = oldAcknowledged.includes(currentUserName) && oldAcknowledged.includes(partnerName);
  const waitingForPartner = iHaveAcknowledgedAny && !bothBoolsDone && !bothArrayDone;

  // Show dialog when partner clicks "Speak freely"
  // Dialog requires user acknowledgment before returning to idle
  useEffect(() => {
    const skippedBy = liveState.skippedBy;

    // Only show dialog to the OTHER user (not the one who skipped)
    // and only when there's a new skip (not on initial render or re-renders)
    if (
      skippedBy &&
      skippedBy !== currentUserName &&
      prevSkippedByRef.current !== skippedBy
    ) {
      const displayName = getFirstName(skippedBy);
      setSkipDialogName(displayName);
      setSkipDialogOpen(true);
    }

    prevSkippedByRef.current = skippedBy;
  }, [liveState.skippedBy, currentUserName]);

  // V10: Handle dialog OK button - clear notification and close dialog
  const handleSkipDialogOk = () => {
    setSkipDialogOpen(false);
    setSkipDialogName('');
    onClearSkipNotification();
  };

  // Handle celebration continue - add user to shared acknowledgment list
  // When both users acknowledge, parent component resets state for new rounds
  const handleCelebrationContinue = () => {
    onCelebrationComplete();
  };

  // P23.2: Determine role using new checker/responder model
  // The checker is the person who tapped "Check if partner gets me"
  const isChecker = liveState.checkerName === currentUserName;

  // Get submission status using new model
  const myRatingSubmitted = isChecker
    ? liveState.checkerSubmitted
    : liveState.responderSubmitted;
  const partnerRatingSubmitted = isChecker
    ? liveState.responderSubmitted
    : liveState.checkerSubmitted;

  // Get ratings (only visible when both submitted)
  const bothSubmitted = liveState.checkerSubmitted && liveState.responderSubmitted;
  const checkerRating = liveState.checkerRating;
  const responderRating = liveState.responderRating;


  // Render based on phase
  const { ratingPhase } = liveState;

  // Skip notification dialog - shown when partner clicks "Speak freely"
  const skipNotificationDialog = (
    <Dialog open={skipDialogOpen} onOpenChange={(open) => { if (!open) handleSkipDialogOk(); }}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{skipDialogName} chose to move forward</DialogTitle>
          <DialogDescription>
            Returning to the home screen.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={handleSkipDialogOk} className="w-full sm:w-auto bg-blue-500 hover:bg-blue-600">
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // Confirmation dialog for skip/good-enough/decline actions
  // In "Did I get it?" flow, proverName is the requester (listener who initiated)
  // In "Did you get it?" flow, checkerName is the requester (speaker who initiated)
  const requesterName = liveState.proverName
    ? getFirstName(liveState.proverName)
    : liveState.checkerName
      ? getFirstName(liveState.checkerName)
      : getFirstName(partnerName);
  const confirmSkipTitle = confirmSkipType === 'decline'
    ? `Decline ${requesterName}'s request?`
    : confirmSkipType === 'good-enough'
      ? 'Move forward?'
      : 'Skip this round?';
  const confirmSkipDescription = confirmSkipType === 'decline'
    ? 'This will end the current round.'
    : confirmSkipType === 'good-enough'
      ? 'This will end the current round and return to the home screen.'
      : 'This will end the current round and return to the home screen.';
  const confirmSkipButtonLabel = confirmSkipType === 'decline'
    ? 'Decline'
    : confirmSkipType === 'good-enough'
      ? 'Move forward'
      : 'Skip';

  const confirmSkipDialog = (
    <Dialog open={confirmSkipOpen} onOpenChange={setConfirmSkipOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{confirmSkipTitle}</DialogTitle>
          <DialogDescription>{confirmSkipDescription}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => setConfirmSkipOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirmSkip}>
            {confirmSkipButtonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // Check if we're in a celebration state (perfect rating achieved)
  // Used to determine whether to show celebration waiting vs idle waiting
  const inCelebrationState = bothSubmitted && checkerRating === 10;

  // User clicked "Continue" but partner hasn't yet
  // If in celebration state, let UnderstandingScreen handle the waiting UI
  // If NOT in celebration state, show idle with disabled buttons
  if (waitingForPartner && !inCelebrationState) {
    return (
      <>
        <IdleScreen
          partnerName={partnerName}
          liveState={liveState}
          onStartCheck={onStartCheck}
          onStartProve={onStartProve}
          onSkip={() => handleRequestSkip('good-enough')}
          onExit={onExitMeeting}
          hideHistory={true}
          waitingForPartnerToContinue={true}
          onClearStory={onClearStory}
          selectedStory={selectedStory}
          onPositionSelect={onPositionSelect}
          isPrivate={isPrivate}
          badgePersonName={badgePersonName}
          badgePersonEarsCount={badgePersonEarsCount}
          isStoryOwner={isAuthorOfSelected}
          isGuest={isGuest}
          currentUserName={currentUserName}
                  />
        {skipNotificationDialog}
        {confirmSkipDialog}
      </>
    );
  }

  // V10: Local rating - user tapped "I spoke" but hasn't submitted yet
  // This check comes FIRST - local state takes priority over shared state
  // This is purely local, doesn't affect partner's screen
  // BUT: if partner already submitted, show the drawer notification on top
  if (isLocallyRating) {
    const partnerAlreadySubmitted = liveState.checkerSubmitted && liveState.checkerName !== currentUserName;

    return (
      <>
        <RatingScreenWithOptionalDrawer
          partnerName={partnerName}
          liveState={liveState}
          onRatingSubmit={onRatingSubmit}
          onBack={onCancelLocalRating}
          showDrawer={partnerAlreadySubmitted}
          selectedStory={selectedStory}
          selectedPoint={selectedPoint}
          onPositionSelect={onPositionSelect}
          onClearStory={onClearStory}
          onSkip={() => handleRequestSkip('decline')}
          onExit={onExitMeeting}
          localFlowType={localFlowType}
          isPrivate={isPrivate}
          badgePersonName={badgePersonName}
          badgePersonEarsCount={badgePersonEarsCount}
          isStoryOwner={isAuthorOfSelected}
          isGuest={isGuest}
                  />
        {skipNotificationDialog}
        {confirmSkipDialog}
      </>
    );
  }

  // Phase: Idle - show Check/Prove buttons (P23.2 start screen)
  // IMPORTANT: Responder stays on idle until checker submits their rating
  if (ratingPhase === 'idle') {
    return (
      <>
        <IdleScreen
          partnerName={partnerName}
          liveState={liveState}
          onStartCheck={onStartCheck}
          onStartProve={onStartProve}
          onSkip={() => handleRequestSkip('good-enough')}
          onExit={onExitMeeting}
          userId={userId}
          onSelectStory={onSelectStory}
          onSelectPoint={onSelectPoint}
          onClearStory={onClearStory}
          selectedStory={selectedStory}
          onPositionSelect={onPositionSelect}
          isPrivate={isPrivate}
          badgePersonName={badgePersonName}
          badgePersonEarsCount={badgePersonEarsCount}
          isStoryOwner={isAuthorOfSelected}
          isGuest={isGuest}
          currentUserName={currentUserName}
                  />
        {skipNotificationDialog}
        {confirmSkipDialog}
      </>
    );
  }

  // Phase: Rating - checker is re-rating (after change rating)
  if (ratingPhase === 'rating' && isChecker && !myRatingSubmitted) {
    return (
      <>
        <RatingScreen
          partnerName={partnerName}
          liveState={liveState}
          isChecker={isChecker}
          onRatingSubmit={onRatingSubmit}
          onBack={onBackToIdle}
          onExit={onExitMeeting}
          selectedStory={selectedStory}
          selectedPoint={selectedPoint}
          onPositionSelect={onPositionSelect}
          onClearStory={onClearStory}
          isPrivate={isPrivate}
          badgePersonName={badgePersonName}
          badgePersonEarsCount={badgePersonEarsCount}
          isStoryOwner={isAuthorOfSelected}
          isGuest={isGuest}
                  />
        {skipNotificationDialog}
        {confirmSkipDialog}
      </>
    );
  }

  // Phase: Waiting (one user submitted, waiting for partner)
  // Responder: hasn't submitted yet, checker has → show IdleScreen with drawer
  if (ratingPhase === 'waiting' || (myRatingSubmitted !== partnerRatingSubmitted)) {
    const iHaveSubmitted = (isChecker ? checkerRating : responderRating) !== undefined;

    if (!iHaveSubmitted && partnerRatingSubmitted) {
      return (
        <>
          <ResponderWaitingWithDrawer
            partnerName={partnerName}
            liveState={liveState}
            onStartCheck={onStartCheck}
            onStartProve={onStartProve}
            onRatingSubmit={onRatingSubmit}
            onSkip={() => handleRequestSkip('decline')}
            onExit={onExitMeeting}
            selectedStory={selectedStory}
            onPositionSelect={onPositionSelect}
            badgePersonName={badgePersonName}
            badgePersonEarsCount={badgePersonEarsCount}
            isStoryOwner={isAuthorOfSelected}
            isGuest={isGuest}
            currentUserName={currentUserName}
                      />
          {skipNotificationDialog}
          {confirmSkipDialog}
        </>
      );
    }

    // User who submitted: show unified UnderstandingScreen in 'waiting' phase
    return (
      <>
        <UnderstandingScreen
          liveState={liveState}
          currentUserName={currentUserName}
          partnerName={partnerName}
          isChecker={isChecker}
          checkerRating={checkerRating}
          responderRating={responderRating}
          onExplainBackStart={onExplainBackStart}
          onExplainBackRate={onExplainBackRate}
          onExplainBackDone={onExplainBackDone}
          onSkip={() => handleRequestSkip('skip')}
          onBackToIdle={onBackToIdle}
          onExit={onExitMeeting}
          onCelebrationContinue={handleCelebrationContinue}
          onSharePerspective={onSharePerspective}
          onAskToExplainFirst={onAskToExplainFirst}
          onContinueAsListener={onContinueAsListener}
          onInsistToSpeak={onInsistToSpeak}
          onLetThemSpeak={onLetThemSpeak}
          onCancelNegotiation={onCancelNegotiation}
          onClarifyStart={onClarifyStart}
          onClarifyDone={onClarifyDone}
          isPrivate={isPrivate}
          selectedStory={selectedStory}
          onPositionSelect={onPositionSelect}
          onClearStory={onClearStory}
          isGuest={isGuest}
          isCreator={isCreator}
                  />
        {skipNotificationDialog}
        {confirmSkipDialog}
      </>
    );
  }

  // Phase: Results, Revealed, Explain-back - all handled by UnderstandingScreen
  if (ratingPhase === 'results' || ratingPhase === 'revealed' || ratingPhase === 'explain-back' || bothSubmitted) {
    return (
      <>
        <UnderstandingScreen
          liveState={liveState}
          currentUserName={currentUserName}
          partnerName={partnerName}
          isChecker={isChecker}
          checkerRating={checkerRating}
          responderRating={responderRating}
          onExplainBackStart={onExplainBackStart}
          onExplainBackRate={onExplainBackRate}
          onExplainBackDone={onExplainBackDone}
          onSkip={() => handleRequestSkip('good-enough')}
          onBackToIdle={onBackToIdle}
          onExit={onExitMeeting}
          onCelebrationContinue={handleCelebrationContinue}
          onSharePerspective={onSharePerspective}
          onAskToExplainFirst={onAskToExplainFirst}
          onContinueAsListener={onContinueAsListener}
          onInsistToSpeak={onInsistToSpeak}
          onLetThemSpeak={onLetThemSpeak}
          onCancelNegotiation={onCancelNegotiation}
          onClarifyStart={onClarifyStart}
          onClarifyDone={onClarifyDone}
          isPrivate={isPrivate}
          selectedStory={selectedStory}
          onPositionSelect={onPositionSelect}
          onClearStory={onClearStory}
          isStoryOwner={isAuthorOfSelected}
          isGuest={isGuest}
          isCreator={isCreator}
                  />
        {skipNotificationDialog}
        {confirmSkipDialog}
      </>
    );
  }

  // Fallback to idle screen
  return (
    <>
      <IdleScreen
        partnerName={partnerName}
        liveState={liveState}
        onStartCheck={onStartCheck}
        onStartProve={onStartProve}
        onSkip={() => handleRequestSkip('good-enough')}
        onExit={onExitMeeting}
        userId={userId}
        onSelectStory={onSelectStory}
        onSelectPoint={onSelectPoint}
        onClearStory={onClearStory}
        selectedStory={selectedStory}
        onPositionSelect={onPositionSelect}
        isPrivate={isPrivate}
        badgePersonName={badgePersonName}
        badgePersonEarsCount={badgePersonEarsCount}
        isStoryOwner={isAuthorOfSelected}
        isGuest={isGuest}
        currentUserName={currentUserName}
              />
      {skipNotificationDialog}
      {confirmSkipDialog}
    </>
  );
}

// ============================================================================
// IDLE SCREEN - P23.2 Start screen with Check/Prove buttons
// ============================================================================

interface IdleScreenProps {
  partnerName: string;
  liveState: LiveSessionState;
  onStartCheck: () => void;
  /** P23.3: Listener taps "Did I get it?" to prove understanding */
  onStartProve: () => void;
  /** Required - used when drawer is closed or user declines */
  onSkip: () => void;
  onExit: () => void;
  // Props for responder notification drawer
  showRatingDrawer?: boolean;
  onRatingSubmit?: (rating: number) => void;
  /** Hide journey history card - used when returning from celebration (round is complete) */
  hideHistory?: boolean;
  /** Show waiting state - user clicked Continue but partner hasn't yet */
  waitingForPartnerToContinue?: boolean;
  /** P128: Authenticated user ID for fetching stories/points (undefined = guest) */
  userId?: string;
  /** P128: Select a story card */
  onSelectStory?: (storyId: string, title: string, storyData?: StoryWithPoints) => void;
  /** P128: Select a point card */
  onSelectPoint?: (pointId: string, title: string) => void;
  /** P272: Clear selected story (return to free-form mode) */
  onClearStory?: () => void;
  /** P272: Story currently selected (passed from LiveModeView state) */
  selectedStory?: StoryWithPoints | null;
  /** P275: Update a point position during the /live session */
  onPositionSelect?: (pointId: string, position: PositionType | null) => void;
  isPrivate?: boolean;
  /** Name to show in the position badge (partner's name for host view) */
  badgePersonName?: string;
  /** Ear count for the badge person — shown in the badge when host view is active */
  badgePersonEarsCount?: number;
  /** When true, current user owns the selected story — show only the check button and keep card collapsed */
  isStoryOwner?: boolean;
  /** Current user's name — used to merge live positions into history story snapshots */
  currentUserName: string;
  /** P490: When true, user is a guest (unauthenticated) — shows "sign up to save" hint instead of CTA */
  isGuest?: boolean;
}

function IdleScreen({
  partnerName,
  liveState,
  onStartCheck,
  onStartProve,
  onSkip,
  onExit,
  showRatingDrawer = false,
  onRatingSubmit,
  hideHistory = false,
  waitingForPartnerToContinue = false,
  userId,
  onSelectStory,
  onSelectPoint: _onSelectPoint,
  onClearStory,
  selectedStory = null,
  onPositionSelect,
  isPrivate = false,
  badgePersonName,
  badgePersonEarsCount,
  isStoryOwner = false,
  _currentUserName,
  isGuest = false,
}: IdleScreenProps) {
  const displayPartnerName = getFirstName(partnerName);
  const checkerName = liveState.checkerName ? getFirstName(liveState.checkerName) : '';
  const proverName = liveState.proverName ? getFirstName(liveState.proverName) : '';

  // P23.3: Detect "Did I get it?" flow for drawer messaging
  const isProverInitiated = liveState.proverName !== undefined;

  // P398: Selected history index for inline round summary
  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState<number | null>(null);

  // P398: Auto-close summary when a new round starts
  useEffect(() => {
    if (liveState.ratingPhase !== 'idle') {
      setSelectedHistoryIndex(null);
    }
  }, [liveState.ratingPhase]);

  // P128: Fetch user's stories and points (only if authenticated)
  const [stories, setStories] = useState<StoryWithPoints[]>([]);
  const [points, setPoints] = useState<PointWithUserPosition[]>([]);
  const [contentLoaded, setContentLoaded] = useState(false);
  const [contentInteracted, setContentInteracted] = useState(false);

  // Derive hasContent from state (needed for effects below)
  const hasContent = stories.length > 0 || points.length > 0;

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    const fetchContent = async () => {
      try {
        const [fetchedStories, fetchedPoints] = await Promise.all([
          storiesService.getStoriesByAuthorWithPoints(userId, userId),
          pointsService.getPointsForProfileDisplay(userId, userId),
        ]);
        if (!cancelled) {
          setStories(fetchedStories);
          setPoints(fetchedPoints);

          // P128: Track content picker shown (if there's content)
          const hasAnyContent = fetchedStories.length > 0 || fetchedPoints.length > 0;
          if (hasAnyContent) {
            analytics.track('content_picker_shown', {
              userId,
              contentAvailable: true,
              storiesCount: fetchedStories.length,
              pointsCount: fetchedPoints.length,
            });
          }
        }
      } catch (err) {
        console.error('[live-mode-view] Failed to fetch content:', err);
        // Non-blocking: content picker is optional, session still works
      } finally {
        if (!cancelled) setContentLoaded(true);
      }
    };

    fetchContent();
    return () => { cancelled = true; };
  }, [userId]);

  // P128: Track content picker dismissal on unmount (if content shown but not interacted)
  useEffect(() => {
    return () => {
      if (hasContent && !contentInteracted) {
        analytics.track('content_picker_dismissed', {
          userId,
          contentAvailable: true,
          storiesCount: stories.length,
          pointsCount: points.length,
        });
      }
    };
  }, [hasContent, contentInteracted, userId, stories.length, points.length]);

  // Check if we have any rating data to show (from a previous round)
  // But hide it if explicitly requested (e.g., returning from celebration)
  const hasRatingData = !hideHistory && (
    liveState.checkerRating !== undefined ||
    liveState.responderRating !== undefined ||
    liveState.explainBackRatings.length > 0
  );

  const sessionHistory = liveState.sessionHistory ?? [];

  // Use top-aligned layout only when a story/point card is visible on screen
  const hasScrollableContent = !!liveState.selectedStoryId || sessionHistory.length > 0;
  const layoutClass = showRatingDrawer || hasRatingData || hasScrollableContent
    ? CONTENT_LAYOUT
    : CONTENT_LAYOUT_CENTERED;

  // P128: Track cardless mode selection when user has content but chooses free-form
  const handleStartCheckWithTracking = () => {
    if (hasContent) {
      analytics.track('cardless_mode_selected', {
        userId,
        contentAvailable: true,
        storiesCount: stories.length,
        pointsCount: points.length,
        flowType: 'check',
      });
      setContentInteracted(true);
    }
    onStartCheck();
  };

  const handleStartProveWithTracking = () => {
    if (hasContent) {
      analytics.track('cardless_mode_selected', {
        userId,
        contentAvailable: true,
        storiesCount: stories.length,
        pointsCount: points.length,
        flowType: 'prove',
      });
      setContentInteracted(true);
    }
    onStartProve();
  };

  // Reset inner scroll container to top on mount and after each round completes (P513)
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const roundCount = (liveState.sessionHistory ?? []).length;
  useLayoutEffect(() => {
    scrollContainerRef.current?.scrollTo(0, 0);
  }, [roundCount]);

  // P128: Wrap story/point selection to mark interaction
  const handleSelectStoryWithTracking = (storyId: string, title: string) => {
    setContentInteracted(true);
    const storyData = stories.find(s => s.id === storyId);
    onSelectStory?.(storyId, title, storyData);
  };

  return (
    <div className="flex flex-col h-full">
      <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} />

      <div ref={scrollContainerRef} className={`${layoutClass} overflow-y-auto`} style={{ overflowAnchor: 'none' }}>
        {selectedHistoryIndex !== null && sessionHistory[selectedHistoryIndex] ? (
          <RoundSummaryScreen
            item={sessionHistory[selectedHistoryIndex]}
            storyData={sessionHistory[selectedHistoryIndex].storyData}
            onBack={() => setSelectedHistoryIndex(null)}
          />
        ) : (
          <>
            {/* Show journey card if there's rating history or drawer is open */}
            {(hasRatingData || showRatingDrawer) && (
              <JourneyToUnderstanding
                checkerRating={liveState.checkerRating}
                responderRating={liveState.responderRating}
                explainBackRatings={liveState.explainBackRatings}
                isChecker={false} // On idle screen, show neutral perspective (listener view)
                displayPartnerName={displayPartnerName}
                checkerName={checkerName}
                proverName={liveState.proverName ? getFirstName(liveState.proverName) : undefined}
                className="w-full max-w-sm"
                hideUntilBothSubmitted={showRatingDrawer}
              />
            )}

            {/* P272: Story card shown when story is selected.
                Both views start collapsed — partner can expand to read points and vote. */}
            {selectedStory && (
              <LiveStoryCardExpanded
                story={selectedStory}
                isOwnStory={isStoryOwner}
                isGuest={isGuest}
                onPositionSelect={onPositionSelect}
                className="w-full max-w-sm mb-2"
                badgePersonName={badgePersonName}
                badgePersonEarsCount={badgePersonEarsCount}
                defaultExpanded={false}
              />
            )}

            <ActionArea
              className={showRatingDrawer || hasRatingData ? '' : '!pt-0'}
            >
              {/* Check button: always shown in free session; owner-only when story is selected */}
              {!showRatingDrawer && (!selectedStory || isStoryOwner) && (
                <Button
                  size="lg"
                  className="bg-blue-500 hover:bg-blue-600 w-full"
                  onClick={handleStartCheckWithTracking}
                  disabled={waitingForPartnerToContinue}
                  data-testid="start-check"
                >
                  Does <span className="font-bold">{displayPartnerName}</span> understand you?
                </Button>
              )}

              {/* Prove button: only shown in free session (no story selected) */}
              {!showRatingDrawer && !selectedStory && (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full"
                  onClick={handleStartProveWithTracking}
                  disabled={waitingForPartnerToContinue}
                  data-testid="start-prove"
                >
                  Do you understand <span className="font-bold">{displayPartnerName}</span>?
                </Button>
              )}

              {/* Waiting for partner to continue indicator */}
              {waitingForPartnerToContinue && (
                <WaitingIndicator message={`Waiting for ${displayPartnerName} to continue...`} />
              )}
            </ActionArea>

            {/* P272: StorySearchPicker — only when no story selected AND user has stories */}
            {!liveState.selectedStoryId && userId && contentLoaded && stories.length > 0 && onSelectStory && (
              <StorySearchPicker
                stories={stories}
                onSelectStory={handleSelectStoryWithTracking}
                disabled={showRatingDrawer || waitingForPartnerToContinue}
              />
            )}

            {/* P272: Speak freely pre-round — clears story from both screens when story selected */}
            {/* P400: removed !showRatingDrawer gate — Speak Freely must show whenever story card is visible */}
            {liveState.selectedStoryId && !waitingForPartnerToContinue && (
              <button
                onClick={onClearStory}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors mt-1 min-h-[44px] px-4"
                type="button"
              >
                Speak freely
              </button>
            )}

            {/* P398: Session history — clickable rows for completed rounds */}
            {sessionHistory.length > 0 && (
              <SessionHistoryList
                history={sessionHistory}
                onItemClick={showRatingDrawer ? undefined : (i) => setSelectedHistoryIndex(i)}
              />
            )}
          </>
        )}
      </div>

      {/* Responder notification drawer - slides up from bottom */}
      {/* Only render when showRatingDrawer is true AND onRatingSubmit is provided */}
      {showRatingDrawer && onRatingSubmit && (
        <Drawer open={true} onOpenChange={(open) => { if (!open) onSkip(); }}>
          {/* overlayClassName="bg-transparent" keeps story card visible behind drawer. */}
          <DrawerContent overlayClassName="bg-transparent">
            <DrawerHeader className="text-center pb-2">
              <DrawerDescription className="text-sm text-muted-foreground">
                {isProverInitiated
                  ? <>{proverName} wants to know how well <span className="font-semibold text-foreground">they</span> understood you</>
                  : <>{checkerName} wants to know how well <span className="font-semibold text-foreground">you understood them</span></>}
              </DrawerDescription>
              <DrawerTitle className="sr-only">
                {isProverInitiated
                  ? `Rate how well you believe ${proverName} understands you`
                  : `Rate how well you understood ${checkerName}`}
              </DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-8 pt-4 space-y-4">
              <RatingCard
                question={isProverInitiated
                  ? `How well do you believe ${proverName} understands you?`
                  : `How confident are you that you understand ${checkerName}?`}
                onSelect={onRatingSubmit}
                onSkip={onSkip}
                skipLabel="Decline"
              />
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}

// ============================================================================
// RESPONDER WAITING WITH DRAWER - IdleScreen + bottom sheet for rating
// ============================================================================

interface ResponderWaitingWithDrawerProps {
  partnerName: string;
  liveState: LiveSessionState;
  onStartCheck: () => void;
  onStartProve: () => void;
  onRatingSubmit: (rating: number) => void;
  onSkip: () => void;
  onExit: () => void;
  selectedStory?: StoryWithPoints | null;
  onPositionSelect?: (pointId: string, position: PositionType | null) => void;
  badgePersonName?: string;
  badgePersonEarsCount?: number;
  isStoryOwner?: boolean;
  currentUserName: string;
  /** P490: When true, user is a guest (unauthenticated) — shows "sign up to save" hint instead of CTA */
  isGuest?: boolean;
}

function ResponderWaitingWithDrawer({
  partnerName,
  liveState,
  onStartCheck,
  onStartProve,
  onRatingSubmit,
  onSkip,
  onExit,
  selectedStory,
  onPositionSelect,
  badgePersonName,
  badgePersonEarsCount,
  isStoryOwner,
  currentUserName,
  isGuest = false,
}: ResponderWaitingWithDrawerProps) {
  return (
    <IdleScreen
      partnerName={partnerName}
      liveState={liveState}
      onStartCheck={onStartCheck}
      onStartProve={onStartProve}
      showRatingDrawer={true}
      onRatingSubmit={onRatingSubmit}
      onSkip={onSkip}
      onExit={onExit}
      selectedStory={selectedStory}
      onPositionSelect={onPositionSelect}
      badgePersonName={badgePersonName}
      badgePersonEarsCount={badgePersonEarsCount}
      isStoryOwner={isStoryOwner}
      currentUserName={currentUserName}
      isGuest={isGuest}
          />
  );
}

// ============================================================================
// RATING SCREEN - Rating buttons after checker initiates
// ============================================================================

interface RatingScreenProps {
  partnerName: string;
  liveState: LiveSessionState;
  isChecker: boolean;
  onRatingSubmit: (rating: number) => void;
  onBack: () => void;
  onExit: () => void;
  isPrivate?: boolean;
  /** P272: Selected story with points for expanded card display during verification */
  selectedStory?: StoryWithPoints | null;
  /** P128: Selected point for content-attached verification */
  selectedPoint?: PointWithCreator | null;
  /** P272: Handler for position selection on story points */
  onPositionSelect?: (pointId: string, position: PositionType | null) => void;
  /** Name to show in the position badge (partner's name for host view) */
  badgePersonName?: string;
  /** Ear count for the badge person */
  badgePersonEarsCount?: number;
  /** P400: Clear selected story — Speak Freely must be present whenever story card is visible */
  onClearStory?: () => void;
  /** When true, current user owns the selected story — suppresses the "Tell your story" CTA */
  isStoryOwner?: boolean;
  /** P490: When true, user is a guest (unauthenticated) — shows "sign up to save" hint instead of CTA */
  isGuest?: boolean;
}

function RatingScreen({
  partnerName,
  liveState,
  isChecker,
  onRatingSubmit,
  onBack,
  onExit,
  isPrivate = false,
  selectedStory,
  selectedPoint,
  onPositionSelect,
  badgePersonName,
  badgePersonEarsCount,
  onClearStory,
  isStoryOwner = false,
  isGuest = false,
}: RatingScreenProps) {
  const displayPartnerName = getFirstName(partnerName);
  const checkerName = liveState.checkerName ? getFirstName(liveState.checkerName) : '';

  // P23.3: Detect "Did I get it?" flow
  const isProverInitiated = liveState.proverName !== undefined;

  // Different prompts based on flow type and role
  let prompt: string;
  if (isProverInitiated) {
    // "Did I get it?" flow - listener initiated
    // Prover (listener): "How confident are you that you understand [Speaker]?"
    // Checker (speaker): "How well do you believe [Prover] understands you?"
    prompt = isChecker
      ? `How well do you believe ${displayPartnerName} understands you?`
      : `How confident are you that you understand ${checkerName}?`;
  } else {
    // "Did you get it?" flow - speaker initiated (existing)
    // Checker (speaker): "How well do you believe [Partner] understands you?"
    // Responder (listener): "How confident are you that you understand [Checker]?"
    prompt = isChecker
      ? `How well do you believe ${displayPartnerName} understands you?`
      : `How confident are you that you understand ${checkerName}?`;
  }

  // Only show journey card if there's prior history (not on first rating submission)
  // First rating = no prior completed round, no explain-back ratings
  const hasHistory = liveState.explainBackRatings.length > 0;

  return (
    <div className="flex flex-col h-full">
      <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} />

      <div className={CONTENT_LAYOUT}>
        {/* Only show journey card if there's history from previous rounds */}
        {hasHistory && (
          <JourneyToUnderstanding
            checkerRating={liveState.checkerRating}
            responderRating={liveState.responderRating}
            explainBackRatings={liveState.explainBackRatings}
            isChecker={isChecker}
            displayPartnerName={displayPartnerName}
            checkerName={checkerName}
            proverName={liveState.proverName ? getFirstName(liveState.proverName) : undefined}
            className="w-full max-w-sm"
            hideUntilBothSubmitted={true}
          />
        )}

        {/* P272: Story card visible above rating drawer (stays visible throughout round) */}
        {selectedStory && (
          <LiveStoryCardExpanded
            story={selectedStory}
            isOwnStory={isStoryOwner}
            isGuest={isGuest}
            onPositionSelect={onPositionSelect}
            className="w-full max-w-sm mb-2"
            badgePersonName={badgePersonName}
            badgePersonEarsCount={badgePersonEarsCount}
          />
        )}
        {/* P400: Speak Freely must be present whenever story card is visible */}
        {selectedStory && onClearStory && (
          <button
            onClick={onClearStory}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors mt-1 min-h-[44px] px-4"
            type="button"
          >
            Speak freely
          </button>
        )}
        {selectedPoint && <PointCardPreview point={selectedPoint} />}
      </div>

      {/* Rating drawer - always open by design for focused rating UX.
          dismissible={false} prevents accidental swipe/overlay close.
          overlayClassName="bg-transparent" keeps story card visible behind drawer. */}
      <Drawer open={true} dismissible={false}>
        <DrawerContent overlayClassName="bg-transparent">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Rate your understanding</DrawerTitle>
            <DrawerDescription>{prompt}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-8 pt-4 space-y-4">
            <RatingCard
              question={prompt}
              onSelect={onRatingSubmit}
              onBack={onBack}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

// ============================================================================
// RATING SCREEN WITH OPTIONAL DRAWER - For when user is rating locally
// but partner has already submitted their rating
// ============================================================================

interface RatingScreenWithOptionalDrawerProps {
  partnerName: string;
  liveState: LiveSessionState;
  onRatingSubmit: (rating: number) => void;
  onBack: () => void;
  showDrawer: boolean;
  onSkip: () => void;
  onExit: () => void;
  /** Local flow type - needed to detect "Did I get you?" before shared state is updated */
  localFlowType?: FlowType;
  /** P272: Selected story with points for expanded card display during verification */
  selectedStory?: StoryWithPoints | null;
  /** P128: Selected point for content-attached verification */
  selectedPoint?: PointWithCreator | null;
  isPrivate?: boolean;
  /** P272: Handler for position selection on story points */
  onPositionSelect?: (pointId: string, position: PositionType | null) => void;
  /** Name to show in the position badge (partner's name for host view) */
  badgePersonName?: string;
  /** Ear count for the badge person */
  badgePersonEarsCount?: number;
  /** P400: Clear selected story — Speak Freely must be present whenever story card is visible */
  onClearStory?: () => void;
  /** When true, current user owns the selected story — suppresses the "Tell your story" CTA */
  isStoryOwner?: boolean;
  /** P490: When true, user is a guest (unauthenticated) — shows "sign up to save" hint instead of CTA */
  isGuest?: boolean;
}

function RatingScreenWithOptionalDrawer({
  partnerName,
  liveState,
  onRatingSubmit,
  onBack,
  showDrawer,
  onSkip,
  onExit,
  localFlowType,
  selectedStory,
  selectedPoint,
  isPrivate = false,
  onPositionSelect,
  badgePersonName,
  badgePersonEarsCount,
  onClearStory,
  isStoryOwner = false,
  isGuest = false,
}: RatingScreenWithOptionalDrawerProps) {
  const displayPartnerName = getFirstName(partnerName);
  const checkerName = liveState.checkerName ? getFirstName(liveState.checkerName) : displayPartnerName;

  // P23.3: Detect if this is a "Did I get it?" (prover-initiated) flow
  // Check localFlowType first (before submit) OR liveState.proverName (after submit)
  const isProverInitiated = localFlowType === 'prove' || liveState.proverName !== undefined;

  // Determine the rating prompt based on context:
  // 1. If drawer is showing: Partner submitted as checker, so user is responder
  //    → "How confident are you that you understand {checker}?"
  // 2. If prover-initiated and no drawer: User is the prover (responder) rating first
  //    → "How confident are you that you understand {checker}?"
  // 3. If checker-initiated and no drawer: User is the checker rating first
  //    → "How well do you believe {partner} understands you?"
  let prompt: string;
  if (showDrawer) {
    // Partner already submitted as checker, user is responder
    prompt = `How confident are you that you understand ${checkerName}?`;
  } else if (isProverInitiated) {
    // P23.3: Prover-initiated flow - prover (responder) is rating their confidence
    prompt = `How confident are you that you understand ${checkerName}?`;
  } else {
    // Checker-initiated flow - checker is rating how understood they feel
    prompt = `How well do you believe ${displayPartnerName} understands you?`;
  }

  // When user is locally rating, determine their role for journey card
  // If showDrawer is true or prover-initiated, user is responder; otherwise checker
  const isChecker = !showDrawer && !isProverInitiated;

  // Only show journey card if there's prior history (not on first rating submission)
  const hasHistory = liveState.explainBackRatings.length > 0;

  // When partner already submitted (showDrawer), show their request in drawer header
  const drawerDescription = showDrawer
    ? <>{checkerName} wants to know how well <span className="font-semibold text-foreground">you understood them</span></>
    : null;

  return (
    <div className="flex flex-col h-full">
      <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} />

      <div className={CONTENT_LAYOUT}>
        {/* Only show journey card if there's history from previous rounds */}
        {hasHistory && (
          <JourneyToUnderstanding
            checkerRating={liveState.checkerRating}
            responderRating={liveState.responderRating}
            explainBackRatings={liveState.explainBackRatings}
            isChecker={isChecker}
            displayPartnerName={displayPartnerName}
            checkerName={checkerName}
            proverName={liveState.proverName ? getFirstName(liveState.proverName) : undefined}
            className="w-full max-w-sm"
            hideUntilBothSubmitted={true}
          />
        )}

        {/* P272: Story card visible above rating drawer (stays visible throughout round) */}
        {selectedStory && (
          <LiveStoryCardExpanded
            story={selectedStory}
            isOwnStory={isStoryOwner}
            isGuest={isGuest}
            onPositionSelect={onPositionSelect}
            className="w-full max-w-sm mb-2"
            badgePersonName={badgePersonName}
            badgePersonEarsCount={badgePersonEarsCount}
          />
        )}
        {/* P400: Speak Freely must be present whenever story card is visible */}
        {selectedStory && onClearStory && (
          <button
            onClick={onClearStory}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors mt-1 min-h-[44px] px-4"
            type="button"
          >
            Speak freely
          </button>
        )}
        {selectedPoint && <PointCardPreview point={selectedPoint} />}
      </div>

      {/* Rating drawer - always open by design for focused rating UX.
          dismissible={false} prevents accidental swipe/overlay close.
          overlayClassName="bg-transparent" keeps story card visible behind drawer. */}
      <Drawer open={true} dismissible={false}>
        <DrawerContent overlayClassName="bg-transparent">
          <DrawerHeader className={drawerDescription ? "text-center pb-2" : "sr-only"}>
            {drawerDescription && (
              <DrawerDescription className="text-sm text-muted-foreground">
                {drawerDescription}
              </DrawerDescription>
            )}
            <DrawerTitle className="sr-only">Rate your understanding</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-8 pt-4 space-y-4">
            <RatingCard
              question={prompt}
              onSelect={onRatingSubmit}
              onSkip={showDrawer ? onSkip : undefined}
              skipLabel="Decline"
              onBack={!showDrawer ? onBack : undefined}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

// OLD SCREENS DELETED - Now using unified UnderstandingScreen component
// WaitingScreen, GapRevealedScreen, PerfectUnderstandingScreen,
// ExplainBackScreen, ResultsScreen have been consolidated into UnderstandingScreen

// ============================================================================
// RATING CARD - Reusable question + rating scale component
// Uses select + submit pattern: tap to select, then tap Submit to confirm
// ============================================================================

interface RatingCardProps {
  question?: string;
  onSelect: (rating: number) => void;
  className?: string;
  /** Optional skip handler - when provided, shows Skip button inside the card */
  onSkip?: () => void;
  /** Label for the skip button (default: "Skip") */
  skipLabel?: string;
  /** Optional back handler - when provided, shows Back button inside the card */
  onBack?: () => void;
}

function RatingCard({ question, onSelect, className = '', onSkip, skipLabel = 'Speak freely', onBack }: RatingCardProps) {
  const [selectedRating, setSelectedRating] = useState<number | null>(null);

  const handleSubmit = () => {
    if (selectedRating !== null) {
      onSelect(selectedRating);
    }
  };

  return (
    <div className={`bg-white rounded-lg p-5 space-y-4 shadow-sm border-l-4 border-l-blue-500 ${className}`}>
      {question && (
        <h2 className="text-lg font-semibold text-center">
          {question}
        </h2>
      )}

      <div className={`flex flex-col items-center space-y-3 ${question ? 'pt-3 border-t' : ''}`}>
        <div className="flex justify-between text-xs text-muted-foreground w-full max-w-sm">
          <span>Not at all</span>
          <span>Complete cognitive understanding</span>
        </div>
        <RatingButtons selectedValue={selectedRating} onSelect={setSelectedRating} />
        <Button
          size="sm"
          className="bg-blue-500 hover:bg-blue-600 w-full max-w-[200px] mt-2"
          disabled={selectedRating === null}
          onClick={handleSubmit}
        >
          Submit
        </Button>
        {onSkip && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSkip}
            className="text-muted-foreground min-h-[44px]"
          >
            {skipLabel}
          </Button>
        )}
        {onBack && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-muted-foreground"
          >
            Back
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// JOURNEY TO UNDERSTANDING - Shows rating history across rounds
// Unified component for ALL screens that display rating data
// ============================================================================

/**
 * Min-height of 180px reserves space for approximately 7 rounds of explain-back
 * to prevent layout shift as rounds are added. Each round takes ~24px (text + spacing).
 * 180px = initial round (~48px) + 5-6 explain-back rounds (~24px each) + padding.
 */
const JOURNEY_MIN_HEIGHT = 'min-h-[180px]';

export interface JourneyToUnderstandingProps {
  /** Initial checker rating (Round 0) - undefined if not yet submitted */
  checkerRating?: number;
  /** Initial responder rating (Round 0) - undefined if not yet submitted */
  responderRating?: number;
  /** Array of checker ratings after each explain-back round */
  explainBackRatings: number[];
  /** Whether viewing as checker (affects label text) */
  isChecker: boolean;
  /** Display name of partner */
  displayPartnerName: string;
  /** Display name of checker */
  checkerName: string;
  /** P23.3: Display name of prover (for "Did I get it?" flow) */
  proverName?: string;
  /** Additional CSS classes */
  className?: string;
  /** Whether to use compact mode (no round numbers, no min-height) */
  compact?: boolean;
  /** Background variant */
  variant?: 'default' | 'success';
  /**
   * Hide individual ratings until both have submitted (sealed-bid mode).
   * When true, shows "Pending..." for any rating that's revealed before both submit.
   * This prevents bias by not letting one user see the other's rating before rating themselves.
   */
  hideUntilBothSubmitted?: boolean;
}

export function JourneyToUnderstanding({
  checkerRating,
  responderRating,
  explainBackRatings,
  isChecker,
  displayPartnerName,
  checkerName,
  proverName,
  className = '',
  compact = false,
  variant = 'default',
  hideUntilBothSubmitted = false,
}: JourneyToUnderstandingProps) {
  // Detect which flow type we're in:
  // - "Did I get it?" (prover-initiated): listener proactively proves understanding
  // - "Did you get it?" (checker-initiated): speaker asks listener to prove understanding
  const isProverInitiated = proverName !== undefined;

  // Header text depends on perspective and flow type
  // Key terminology:
  // - "checker" = the person being understood (always the speaker in both flows)
  // - "responder" = the person proving understanding (always the listener in both flows)
  // - "prover" = only set when listener initiated via "Did I get it?" (tracks who started)
  // In both flows, the journey is about the LISTENER understanding the SPEAKER.
  let headerText: React.ReactNode;
  if (isProverInitiated) {
    // "Did I get it?" flow - listener (prover) initiated
    headerText = isChecker
      ? <>{proverName}'s journey to <span className="font-semibold text-foreground">understand you</span></>
      : <>Your journey to <span className="font-semibold text-foreground">understand {checkerName}</span></>;
  } else {
    // "Did you get it?" flow - speaker (checker) initiated
    headerText = isChecker
      ? <>{displayPartnerName}'s journey to <span className="font-semibold text-foreground">understand you</span></>
      : <>Your journey to <span className="font-semibold text-foreground">understand {checkerName}</span></>;
  }

  // Determine which ratings are available
  const hasCheckerRating = checkerRating !== undefined;
  const hasResponderRating = responderRating !== undefined;

  // Sealed-bid mode: show YOUR OWN rating immediately, hide PARTNER's rating until they submit
  // This gives instant feedback while preserving sealed-bid integrity
  const bothSubmitted = hasCheckerRating && hasResponderRating;

  // Determine what to reveal based on viewer role and sealed-bid mode
  // - Your own rating: always visible once submitted
  // - Partner's rating: only visible after both submit (sealed-bid) OR when hideUntilBothSubmitted is false
  let shouldRevealCheckerRating: boolean;
  let shouldRevealResponderRating: boolean;

  if (!hideUntilBothSubmitted || bothSubmitted) {
    // Either sealed-bid mode is off, or both have submitted - show everything
    shouldRevealCheckerRating = hasCheckerRating;
    shouldRevealResponderRating = hasResponderRating;
  } else {
    // Sealed-bid mode: show your own rating immediately, hide partner's
    if (isChecker) {
      // I'm the checker (speaker) - show my belief, hide responder's confidence
      shouldRevealCheckerRating = hasCheckerRating;
      shouldRevealResponderRating = false;
    } else {
      // I'm the responder (listener) - show my confidence, hide checker's belief
      shouldRevealCheckerRating = false;
      shouldRevealResponderRating = hasResponderRating;
    }
  }

  // Background color based on variant
  // History cards are muted with subtle border to differentiate from active RatingCard
  const bgClass = variant === 'success'
    ? 'bg-green-50 border border-green-200'
    : 'bg-muted/50 border border-border';

  // Must be declared before any early return (React hooks rules)
  const [showHistory, setShowHistory] = useState(false);

  // In compact mode, skip round numbers and min-height
  if (compact) {
    return (
      <div className={`${bgClass} rounded-lg p-4 text-left ${className}`}>
        <div className="space-y-2">
          {/* Show ratings - in sealed-bid mode, only reveal when both submitted */}
          {isChecker ? (
            <>
              {/* Speaker view: show listener's confidence (if available), then your belief */}
              {hasResponderRating && shouldRevealResponderRating ? (
                <RatingDisplay
                  label={<span className="text-muted-foreground">{displayPartnerName}'s confidence</span>}
                  rating={responderRating}
                />
              ) : (
                <RatingDisplayPending
                  label={<span className="text-muted-foreground">{displayPartnerName}'s confidence</span>}
                />
              )}
              {hasCheckerRating && shouldRevealCheckerRating ? (
                <RatingDisplay
                  label={<b className="text-foreground">Your belief</b>}
                  rating={checkerRating}
                />
              ) : (
                <RatingDisplayPending
                  label={<b className="text-foreground">Your belief</b>}
                />
              )}
            </>
          ) : (
            <>
              {/* Listener view: show your confidence (if available), then speaker's belief */}
              {hasResponderRating && shouldRevealResponderRating ? (
                <RatingDisplay
                  label={<span className="text-muted-foreground">Your confidence</span>}
                  rating={responderRating}
                />
              ) : (
                <RatingDisplayPending
                  label={<span className="text-muted-foreground">Your confidence</span>}
                />
              )}
              {hasCheckerRating && shouldRevealCheckerRating ? (
                <RatingDisplay
                  label={<b className="text-foreground">{checkerName}'s belief</b>}
                  rating={checkerRating}
                />
              ) : (
                <RatingDisplayPending
                  label={<b className="text-foreground">{checkerName}'s belief</b>}
                />
              )}
            </>
          )}

          {/* Explain-back ratings */}
          {explainBackRatings.map((rating, index) => (
            <div key={index} className="pt-2 border-t">
              <RatingDisplay
                label={isChecker
                  ? <><b className="text-foreground">Your belief</b> <span className="text-muted-foreground">(round {index + 1})</span></>
                  : <><b className="text-foreground">{checkerName}'s belief</b> <span className="text-muted-foreground">(round {index + 1})</span></>
                }
                rating={rating}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Only show round numbers when there's history (explain-back rounds)
  // Round 0 is implicit - users don't need to see "0" on first check-in
  const showRoundNumbers = explainBackRatings.length > 0;

  // Collapse older rounds only when 3+ rounds (2+ hidden) — 1-2 rounds show all rows
  const hasOlderRounds = explainBackRatings.length > 2;
  // Older rounds = all except the last (computed always so they render when not collapsed)
  const olderRounds = explainBackRatings.slice(0, -1);
  const latestRound = explainBackRatings.length > 0 ? explainBackRatings[explainBackRatings.length - 1] : null;
  const latestRoundIndex = explainBackRatings.length - 1;

  // Full mode with round numbers and header
  return (
    <div className={`${bgClass} rounded-lg p-4 ${JOURNEY_MIN_HEIGHT} text-left ${className}`} data-testid="journey-to-understanding">
      {/* Section header - personal and directional */}
      <p className="text-sm font-medium text-muted-foreground text-center mb-4 pb-2 border-b border-border">{headerText}</p>

      <div className="space-y-2">
        {/* Initial round (0) - show one-time rating first for each role */}
        {/* Speaker rates "belief" (subjective), Listener rates "confidence" (self-assessment) */}
        {/* In sealed-bid mode, only reveal ratings when BOTH have submitted */}
        <div className={showRoundNumbers ? "flex gap-3" : ""}>
          {showRoundNumbers && (
            <div className="w-4 shrink-0 text-xs text-muted-foreground pt-0.5 text-right">0</div>
          )}
          <div className="flex-1 space-y-1">
            {isChecker ? (
              <>
                {/* Speaker view: show listener's confidence first (one-time, muted), then your belief */}
                {hasResponderRating && shouldRevealResponderRating ? (
                  <RatingDisplay
                    label={<span className="text-muted-foreground">{displayPartnerName}'s confidence</span>}
                    rating={responderRating}
                  />
                ) : (
                  <RatingDisplayPending
                    label={<span className="text-muted-foreground">{displayPartnerName}'s confidence</span>}
                  />
                )}
                {hasCheckerRating && shouldRevealCheckerRating ? (
                  <RatingDisplay
                    label={<b className="text-foreground">Your belief</b>}
                    rating={checkerRating}
                  />
                ) : (
                  <RatingDisplayPending
                    label={<b className="text-foreground">Your belief</b>}
                  />
                )}
              </>
            ) : (
              <>
                {/* Listener view: show your confidence first, then speaker's belief (bold) */}
                {hasResponderRating && shouldRevealResponderRating ? (
                  <RatingDisplay
                    label={<span className="text-muted-foreground">Your confidence</span>}
                    rating={responderRating}
                  />
                ) : (
                  <RatingDisplayPending
                    label={<span className="text-muted-foreground">Your confidence</span>}
                  />
                )}
                {hasCheckerRating && shouldRevealCheckerRating ? (
                  <RatingDisplay
                    label={<b className="text-foreground">{checkerName}'s belief</b>}
                    rating={checkerRating}
                  />
                ) : (
                  <RatingDisplayPending
                    label={<b className="text-foreground">{checkerName}'s belief</b>}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* Older explain-back rounds — collapsed by default when 3+ rounds; shown directly when 1-2 */}
        {hasOlderRounds && !showHistory && (
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="w-full pt-2 border-t text-xs text-muted-foreground hover:text-foreground transition-colors text-left"
          >
            Show {olderRounds.length} earlier {olderRounds.length === 1 ? 'round' : 'rounds'}
          </button>
        )}
        {(!hasOlderRounds || showHistory) && olderRounds.map((rating, index) => (
          <div key={index} className="flex gap-3 pt-2 border-t">
            <div className="w-4 shrink-0 text-xs text-muted-foreground pt-0.5 text-right">{index + 1}</div>
            <div className="flex-1">
              <RatingDisplay
                label={isChecker
                  ? <b className="text-foreground">Your belief</b>
                  : <b className="text-foreground">{checkerName}'s belief</b>
                }
                rating={rating}
              />
            </div>
          </div>
        ))}

        {/* Latest explain-back round (or only round) — always visible */}
        {latestRound !== null && (
          <div className="flex gap-3 pt-2 border-t">
            <div className="w-4 shrink-0 text-xs text-muted-foreground pt-0.5 text-right">{latestRoundIndex + 1}</div>
            <div className="flex-1">
              <RatingDisplay
                label={isChecker
                  ? <b className="text-foreground">Your belief</b>
                  : <b className="text-foreground">{checkerName}'s belief</b>
                }
                rating={latestRound}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ACTION AREA - Wrapper for action content below history card
// Provides consistent spacing, optional icon, and title styling
// ============================================================================

interface ActionAreaProps {
  /** Optional emoji icon (e.g., "🎤", "👂") */
  icon?: string;
  /** Optional title text */
  title?: React.ReactNode;
  /** Optional subtitle/description */
  subtitle?: React.ReactNode;
  /** Children (buttons, waiting indicators, etc.) */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

/**
 * ActionArea - Wrapper component for action content below the history card.
 * Provides consistent spacing, optional icon with circular background, and title styling.
 * Use for presenting action choices (buttons) or waiting states with visual context.
 */
function ActionArea({ icon, title, subtitle, children, className = '' }: ActionAreaProps) {
  return (
    <section className={`flex flex-col items-center gap-3 w-full max-w-sm pt-4 ${className}`} data-testid="action-area">
      {/* Icon + Title block */}
      {(icon || title) && (
        <div className="flex flex-col items-center gap-2">
          {icon && (
            <div className="w-12 h-12 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center">
              <span className="text-xl" aria-hidden="true">{icon}</span>
            </div>
          )}
          {title && (
            <p className="text-base font-semibold text-center max-w-xs whitespace-pre-line">
              {title}
            </p>
          )}
          {subtitle && (
            <p className="text-sm text-muted-foreground text-center">
              {subtitle}
            </p>
          )}
        </div>
      )}
      {/* Action buttons/content */}
      <div className="flex flex-col gap-4 w-full max-w-xs" role="group">
        {children}
      </div>
    </section>
  );
}

// ============================================================================
// WAITING INDICATOR - Reusable component for "Waiting for X..." messages
// ============================================================================

interface WaitingIndicatorProps {
  message: string;
  onSkip?: () => void;
  skipLabel?: string;
  showBackground?: boolean;
}

function WaitingIndicator({ message, onSkip, skipLabel = "Speak freely", showBackground = true }: WaitingIndicatorProps) {
  const content = (
    <>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      {onSkip && (
        <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground min-h-[44px]">
          {skipLabel}
        </Button>
      )}
    </>
  );

  if (showBackground) {
    return (
      <div className="bg-muted rounded-lg px-4 py-3 max-w-xs space-y-3 flex flex-col items-center" data-testid="waiting-indicator">
        {content}
      </div>
    );
  }

  return <div className="flex flex-col items-center gap-2" data-testid="waiting-indicator">{content}</div>;
}

// ============================================================================
// RATING DISPLAY PENDING - Shows "Pending..." instead of rating
// ============================================================================

interface RatingDisplayPendingProps {
  label: React.ReactNode;
}

function RatingDisplayPending({ label }: RatingDisplayPendingProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
        <span className="text-sm text-muted-foreground italic">Pending...</span>
      </div>
    </div>
  );
}

// ============================================================================
// UNDERSTANDING SCREEN - Unified component for all rating-related screens
// Replaces: WaitingScreen, GapRevealedScreen, PerfectUnderstandingScreen,
//           ResultsScreen, ExplainBackScreen
// ============================================================================

type UnderstandingPhase =
  | 'waiting'        // User submitted, waiting for partner
  | 'gap-revealed'   // Both submitted, gap detected (round 0 only)
  | 'calibrated'     // Both submitted, gap = 0 (round 0 only)
  | 'perfect'        // Both submitted, checker rated 10
  | 'results'        // After explain-back
  | 'explain-back';  // Explain-back in progress

interface UnderstandingScreenProps {
  liveState: LiveSessionState;
  currentUserName: string;
  partnerName: string;
  isChecker: boolean;
  checkerRating?: number;
  responderRating?: number;
  // Callbacks
  onExplainBackStart: () => void;
  onExplainBackRate: (rating: number) => void;
  onExplainBackDone: () => void;
  onSkip: () => void;
  onBackToIdle: () => void;
  onExit: () => void;
  onCelebrationContinue: () => void;
  /** Listener wants to share their own perspective instead of explaining back */
  onSharePerspective: () => void;
  /** Negotiation handlers for role switch */
  onAskToExplainFirst: () => void;
  onContinueAsListener: () => void;
  onInsistToSpeak: () => void;
  onLetThemSpeak: () => void;
  /** P515: Listener cancels their "Speak freely" negotiation request */
  onCancelNegotiation: () => void;
  /** Speaker clarification handlers */
  onClarifyStart: () => void;
  onClarifyDone: () => void;
  isPrivate?: boolean;
  /** P272: Full story with points for expanded card display */
  selectedStory?: StoryWithPoints | null;
  /** P272: Handler for position selection on story points */
  onPositionSelect?: (pointId: string, position: PositionType | null) => void;
  /** P400: Clear selected story — Speak Freely must be present in waiting phase when story is visible */
  onClearStory?: () => void;
  /** When true, the current user owns the selected story — suppresses the "Tell your story" CTA */
  isStoryOwner?: boolean;
  /** P490: When true, user is a guest (unauthenticated) — shows "sign up to save" hint instead of CTA */
  isGuest?: boolean;
  /** P525: Whether the current user is the session creator (for role-aware celebration acknowledgment) */
  isCreator?: boolean;
}

function UnderstandingScreen({
  liveState,
  currentUserName,
  partnerName,
  isChecker,
  checkerRating,
  responderRating,
  onExplainBackStart,
  onExplainBackRate,
  onExplainBackDone,
  onSkip,
  onBackToIdle,
  onExit,
  onCelebrationContinue,
  onSharePerspective,
  onAskToExplainFirst,
  onContinueAsListener,
  onInsistToSpeak,
  onLetThemSpeak,
  onCancelNegotiation,
  onClarifyStart,
  onClarifyDone,
  isPrivate = false,
  selectedStory,
  onPositionSelect,
  onClearStory,
  isStoryOwner = false,
  isGuest = false,
  isCreator = false,
}: UnderstandingScreenProps) {
  const displayPartnerName = getFirstName(partnerName);
  const checkerName = liveState.checkerName ? getFirstName(liveState.checkerName) : '';

  // Clarification phase - single enum replaces three booleans
  const clarificationPhase = liveState.clarificationPhase;
  // Check if explain-back has happened (required for clarification flow)
  const hasExplainBackHappened = liveState.explainBackRatings.length > 0;

  // Determine phase based on state
  const bothSubmitted = liveState.checkerSubmitted && liveState.responderSubmitted;

  // Check if latest rating (from explain-back or initial) - used for gap and perfect detection
  const latestCheckerRating = liveState.explainBackRatings.length > 0
    ? liveState.explainBackRatings[liveState.explainBackRatings.length - 1]
    : checkerRating;
  const reachedPerfect = latestCheckerRating === 10;

  // Initial round perfect states (round 0 only)
  const isPerfect = bothSubmitted && checkerRating === 10 && responderRating === 10;
  const isPerfectWithUnderconfidence = bothSubmitted && checkerRating === 10 && responderRating !== undefined && responderRating < 10;

  // Gap calculation uses LATEST checker rating, not initial - fixes calibration box appearing after explain-back
  const gap = bothSubmitted && latestCheckerRating !== undefined && responderRating !== undefined
    ? responderRating - latestCheckerRating
    : 0;
  const gapType: GapType = gap > 0 ? 'overconfidence' : gap < 0 ? 'underconfidence' : 'none';
  const gapPoints = Math.abs(gap);

  // P525: Check if current user has acknowledged the celebration (role-aware boolean + old array backward compat)
  const celebrationOldArr = liveState.celebrationAcknowledgedBy || [];
  const userHasAcknowledgedViaArray = celebrationOldArr.includes(currentUserName);
  // P525 fix: Check only MY role's boolean — checking both caused deadlock
  const myBool = isCreator
    ? liveState.celebrationAcknowledgedByCreator
    : liveState.celebrationAcknowledgedByJoiner;
  const userHasAcknowledgedViaBool = myBool === true;
  const userHasAcknowledged = userHasAcknowledgedViaArray || userHasAcknowledgedViaBool;

  // Local flag: hide story immediately on click, before server state propagates
  const [clickedContinue, setClickedContinue] = useState(false);
  useEffect(() => {
    // P525: Reset clickedContinue when both booleans are cleared (round reset)
    const noBooleans = !liveState.celebrationAcknowledgedByCreator && !liveState.celebrationAcknowledgedByJoiner;
    const noArray = !liveState.celebrationAcknowledgedBy?.length;
    if (noBooleans && noArray) {
      setClickedContinue(false);
    }
  }, [liveState.celebrationAcknowledgedByCreator, liveState.celebrationAcknowledgedByJoiner, liveState.celebrationAcknowledgedBy]);
  const continueAcknowledged = userHasAcknowledged || clickedContinue;

  // Determine which phase we're in
  // IMPORTANT: ratingPhase === 'results' takes priority when explicitly set (after explain-back rating)
  let phase: UnderstandingPhase;
  if (liveState.ratingPhase === 'explain-back') {
    phase = 'explain-back';
  } else if (liveState.ratingPhase === 'results') {
    // Explicit results phase (set after explain-back rating) - this takes priority
    // Check for perfect understanding first - show celebration even if user acknowledged (waiting for partner)
    if (reachedPerfect) {
      phase = 'perfect';
    } else {
      phase = 'results';
    }
  } else if (reachedPerfect) {
    // Perfect understanding achieved - show celebration (takes priority over 'results')
    // Keep showing celebration even if user acknowledged - let celebration UI handle waiting state
    phase = 'perfect';
  } else if (!bothSubmitted) {
    phase = 'waiting';
  } else if (isPerfect || isPerfectWithUnderconfidence) {
    phase = 'perfect';
  } else if (gapPoints > 0 && !hasExplainBackHappened) {
    phase = 'gap-revealed';
  } else if (gapPoints === 0 && bothSubmitted && !hasExplainBackHappened && !clarificationPhase) {
    // Both submitted with matching ratings on round 0 - perfectly calibrated
    // But if clarification has started, fall through to results to handle that UI
    phase = 'calibrated';
  } else {
    // All other cases go to results (after explain-back, or subsequent rounds)
    phase = 'results';
  }

  // V11: Check if listener has tapped "Done Explaining"
  // B32_2: Also check speakerSawExplainBackDone to keep drawer visible after "Continue as listener"
  const listenerDone = liveState.explainBackDone === true || liveState.speakerSawExplainBackDone === true;

  // Negotiation state for role switch
  const negotiation = liveState.roleSwitchNegotiation;
  const negotiationRequester = negotiation?.requestedBy
    ? getFirstName(negotiation.requestedBy)
    : '';

  // Determine if we should show a negotiation dialog
  const showPendingNegotiationDialog = isChecker && negotiation?.state === 'pending';
  const showAskedToExplainDialog = !isChecker && negotiation?.state === 'speaker-asked-to-explain';
  const showInsistDialog = isChecker && negotiation?.state === 'listener-insists';

  // Listener waiting state: they clicked "I want to speak freely" and are waiting for speaker's decision
  const listenerWaitingForNegotiation = !isChecker && negotiation?.state === 'pending' && negotiation?.requestedBy === currentUserName;

  // Play celebration sound when entering perfect phase (only once per celebration)
  const prevPhaseRef = useRef<UnderstandingPhase | null>(null);
  useEffect(() => {
    if (phase === 'perfect' && prevPhaseRef.current !== 'perfect') {
      playCelebrationSound();
    }
    prevPhaseRef.current = phase;
  }, [phase]);

  // ============================================================================
  // PHASE: EXPLAIN-BACK
  // ============================================================================
  if (phase === 'explain-back') {
    // Checker (Speaker) view - simplified to 2 branches
    if (isChecker) {
      // Branch 1: Listener hasn't tapped "Done Explaining" yet - show listening state
      if (!listenerDone) {
        return (
          <div className="flex flex-col h-full">
            <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} />
            <div className={CONTENT_LAYOUT}>
              {/* P400 Bug 3: journey FIRST, story SECOND (correct order) */}
              <JourneyToUnderstanding
                checkerRating={checkerRating}
                responderRating={responderRating}
                explainBackRatings={liveState.explainBackRatings}
                isChecker={true}
                displayPartnerName={displayPartnerName}
                checkerName={checkerName}
                proverName={liveState.proverName ? getFirstName(liveState.proverName) : undefined}
                className="w-full max-w-sm"
              />
              {/* P272: Story card visible throughout round */}
              {selectedStory && (
                <LiveStoryCardExpanded
                  story={selectedStory}
                  isOwnStory={isStoryOwner}
                  onPositionSelect={onPositionSelect}
                  className="w-full max-w-sm mb-2"
                />
              )}
              <ActionArea
                icon="👂"
                title={`Hear what's missing for a perfect 10`}
              >
                <WaitingIndicator
                  message={`Waiting for ${displayPartnerName} to finish clarifying...`}
                  onSkip={onSkip}
                />
              </ActionArea>
            </div>

            {/* Negotiation Dialog 1: Speaker sees when listener wants to skip active listening */}
            <Dialog open={showPendingNegotiationDialog} onOpenChange={() => {}}>
              <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} hideCloseButton>
                <DialogHeader>
                  <DialogTitle>Allow {negotiationRequester} to skip active listening?</DialogTitle>
                </DialogHeader>
                <DialogFooter className="flex-col gap-2 sm:flex-col">
                  <Button onClick={onLetThemSpeak} className="w-full bg-blue-500 hover:bg-blue-600">
                    Accept
                  </Button>
                  <Button variant="outline" onClick={onAskToExplainFirst} className="w-full">
                    Suggest explaining back first
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Negotiation Dialog 3: Speaker sees when listener insists */}
            <Dialog open={showInsistDialog} onOpenChange={() => {}}>
              <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} hideCloseButton>
                <DialogHeader>
                  <DialogTitle>{negotiationRequester} says they really need to speak</DialogTitle>
                  <DialogDescription>
                    This might be important to them.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button onClick={onLetThemSpeak} className="w-full bg-blue-500 hover:bg-blue-600">
                    Let them speak
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        );
      }

      // Branch 2: Listener tapped Done - show rating in drawer
      const explainBackPrompt = `How well do you believe ${displayPartnerName} understands your intention?`;
      return (
        <div className="flex flex-col h-full">
          <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} />
          <div className={CONTENT_LAYOUT}>
            {/* P400 Bug 3: journey FIRST, story SECOND (correct order) */}
            <JourneyToUnderstanding
              checkerRating={checkerRating}
              responderRating={responderRating}
              explainBackRatings={liveState.explainBackRatings}
              isChecker={true}
              displayPartnerName={displayPartnerName}
              checkerName={checkerName}
              proverName={liveState.proverName ? getFirstName(liveState.proverName) : undefined}
              className="w-full max-w-sm"
            />
            {/* P272: Story card visible throughout round */}
            {selectedStory && (
              <LiveStoryCardExpanded
                story={selectedStory}
                isOwnStory={isStoryOwner}
                onPositionSelect={onPositionSelect}
                className="w-full max-w-sm mb-2"
              />
            )}
          </div>

          {/* Rating drawer - always open by design for focused rating UX.
              dismissible={false} prevents accidental swipe/overlay close.
              User must tap explicit skip button to end the round. */}
          <Drawer open={true} dismissible={false}>
            <DrawerContent overlayClassName="bg-transparent">
              <DrawerHeader className="text-center pb-2">
                <DrawerDescription className="text-sm text-muted-foreground">
                  {displayPartnerName} finished listening actively to you
                </DrawerDescription>
                <DrawerTitle className="sr-only">{explainBackPrompt}</DrawerTitle>
              </DrawerHeader>
              <div className="px-4 pb-8 pt-4 space-y-4">
                <RatingCard
                  question={explainBackPrompt}
                  onSelect={onExplainBackRate}
                  onSkip={onSkip}
                />
              </div>
            </DrawerContent>
          </Drawer>

          {/* Negotiation Dialog 1: Speaker sees when listener wants to skip active listening */}
          <Dialog open={showPendingNegotiationDialog} onOpenChange={() => {}}>
            <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} hideCloseButton>
              <DialogHeader>
                <DialogTitle>Allow {negotiationRequester} to skip active listening?</DialogTitle>
              </DialogHeader>
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <Button onClick={onLetThemSpeak} className="w-full bg-blue-500 hover:bg-blue-600">
                  Accept
                </Button>
                <Button variant="outline" onClick={onAskToExplainFirst} className="w-full">
                  Suggest explaining back first
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Negotiation Dialog 3: Speaker sees when listener insists */}
          <Dialog open={showInsistDialog} onOpenChange={() => {}}>
            <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} hideCloseButton>
              <DialogHeader>
                <DialogTitle>{negotiationRequester} says they really need to speak</DialogTitle>
                <DialogDescription>
                  This might be important to them.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={onLetThemSpeak} className="w-full bg-blue-500 hover:bg-blue-600">
                  Let them speak
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      );
    }

    // Responder (Listener) view: explaining back
    const hasTappedDone = liveState.explainBackDone === true;

    // AFTER tapping "Done Explaining" - show waiting state (no microphone)
    if (hasTappedDone) {
      return (
        <div className="flex flex-col h-full">
          <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} />
          <div className={CONTENT_LAYOUT}>
            {/* P400 Bug 3: journey FIRST, story SECOND (correct order) */}
            <JourneyToUnderstanding
              checkerRating={checkerRating}
              responderRating={responderRating}
              explainBackRatings={liveState.explainBackRatings}
              isChecker={false}
              displayPartnerName={displayPartnerName}
              checkerName={checkerName}
              proverName={liveState.proverName ? getFirstName(liveState.proverName) : undefined}
              className="w-full max-w-sm"
            />
            {/* P272: Story card visible throughout round */}
            {selectedStory && (
              <LiveStoryCardExpanded
                story={selectedStory}
                isOwnStory={isStoryOwner}
                onPositionSelect={onPositionSelect}
                className="w-full max-w-sm mb-2"
              />
            )}
            <ActionArea>
              {listenerWaitingForNegotiation ? (
                // Listener clicked "Speak freely" and is waiting for speaker's decision
                <>
                  <WaitingIndicator
                    message={`Waiting for ${checkerName} to allow skipping active listening...`}
                    onSkip={onSkip}
                    skipLabel="Skip without waiting"
                  />
                  <Button variant="ghost" size="sm" onClick={onCancelNegotiation} className="text-muted-foreground min-h-[44px]">
                    Cancel request
                  </Button>
                </>
              ) : (
                // Default: waiting for speaker to rate
                <WaitingIndicator
                  message={`Waiting for ${checkerName} to evaluate how well you captured their idea...`}
                  onSkip={onSharePerspective}
                />
              )}
            </ActionArea>
          </div>

          {/* Negotiation Dialog 2: Listener sees when speaker asked them to explain back */}
          <Dialog open={showAskedToExplainDialog} onOpenChange={() => {}}>
            <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} hideCloseButton>
              <DialogHeader>
                <DialogTitle>{checkerName} would like to feel understood</DialogTitle>
                <DialogDescription>
                  Can you explain back what you heard before switching?
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <Button onClick={onContinueAsListener} className="w-full bg-blue-500 hover:bg-blue-600">
                  Continue as listener
                </Button>
                <Button variant="outline" onClick={onInsistToSpeak} className="w-full">
                  I really need to speak
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      );
    }

    // BEFORE tapping "Done Explaining" - show microphone/speaking state
    return (
      <div className="flex flex-col h-full">
        <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} />
        <div className={CONTENT_LAYOUT}>
          {/* P400 Bug 3: journey FIRST, story SECOND (correct order) */}
          <JourneyToUnderstanding
            checkerRating={checkerRating}
            responderRating={responderRating}
            explainBackRatings={liveState.explainBackRatings}
            isChecker={false}
            displayPartnerName={displayPartnerName}
            checkerName={checkerName}
            proverName={liveState.proverName ? getFirstName(liveState.proverName) : undefined}
            className="w-full max-w-sm"
          />
          {/* P272: Story card visible throughout round */}
          {selectedStory && (
            <LiveStoryCardExpanded
              story={selectedStory}
              isOwnStory={isStoryOwner}
              onPositionSelect={onPositionSelect}
              className="w-full max-w-sm mb-2"
            />
          )}
          <ActionArea
            icon="🎤"
            title={listenerWaitingForNegotiation ? undefined : <>Explain back what you heard<br />OR ask a clarifying question</>}
          >
            {listenerWaitingForNegotiation ? (
              <>
                <WaitingIndicator
                  message={`Waiting for ${checkerName} to allow skipping active listening...`}
                  onSkip={onSkip}
                  skipLabel="Skip without waiting"
                />
                <Button variant="ghost" size="sm" onClick={onCancelNegotiation} className="text-muted-foreground min-h-[44px]">
                  Cancel request
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="lg"
                  className="bg-blue-500 hover:bg-blue-600 w-full"
                  onClick={onExplainBackDone}
                >
                  I'm done with active listening
                </Button>
                <Button variant="ghost" size="sm" onClick={onSharePerspective} className="text-muted-foreground mx-auto min-h-[44px]">
                  Speak freely
                </Button>
              </>
            )}
          </ActionArea>
        </div>

        {/* Negotiation Dialog 2: Listener sees when speaker asked them to explain back */}
        <Dialog open={showAskedToExplainDialog} onOpenChange={() => {}}>
          <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} hideCloseButton>
            <DialogHeader>
              <DialogTitle>{checkerName} would like to feel understood</DialogTitle>
              <DialogDescription>
                Can you explain back what you heard before switching?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button onClick={onContinueAsListener} className="w-full bg-blue-500 hover:bg-blue-600">
                Continue as listener
              </Button>
              <Button variant="outline" onClick={onInsistToSpeak} className="w-full">
                I really need to speak
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ============================================================================
  // PHASE: WAITING (one user submitted, waiting for partner)
  // ============================================================================
  if (phase === 'waiting') {
    const waitingMessage = isChecker
      ? `Waiting for ${displayPartnerName} to share their confidence...`
      : `Waiting for ${checkerName} to share their confidence...`;

    return (
      <div className="flex flex-col h-full">
        <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} />
        <div className={CONTENT_LAYOUT}>
          {/* Hide ratings until both submit to prevent bias */}
          {/* P400 Bug 3: journey FIRST, story SECOND (correct order) */}
          <JourneyToUnderstanding
            checkerRating={checkerRating}
            responderRating={responderRating}
            explainBackRatings={liveState.explainBackRatings}
            isChecker={isChecker}
            displayPartnerName={displayPartnerName}
            checkerName={checkerName}
            proverName={liveState.proverName ? getFirstName(liveState.proverName) : undefined}
            className="w-full max-w-sm"
            hideUntilBothSubmitted={true}
          />
          {/* P272: Story card visible throughout round */}
          {selectedStory && (
            <LiveStoryCardExpanded
              story={selectedStory}
              isOwnStory={isStoryOwner}
              onPositionSelect={onPositionSelect}
              className="w-full max-w-sm mb-2"
            />
          )}
          {/* P400: Speak Freely must be present in waiting phase when story card is visible */}
          {selectedStory && onClearStory && (
            <button
              onClick={onClearStory}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors mt-1 min-h-[44px] px-4"
              type="button"
            >
              Speak freely
            </button>
          )}

          {/* Waiting indicator below the card */}
          <ActionArea>
            <WaitingIndicator
              message={waitingMessage}
              onSkip={onBackToIdle}
              skipLabel="Cancel"
            />
          </ActionArea>
        </div>
      </div>
    );
  }

  // ============================================================================
  // PHASE: PERFECT (checker rated 10, celebration)
  // ============================================================================
  if (phase === 'perfect') {
    // Determine if this is via explain-back rounds or initial rating
    const viaExplainBack = liveState.explainBackRatings.length > 0;
    const roundCount = liveState.explainBackRatings.length;

    const headline = isChecker
      ? `${displayPartnerName} understood you perfectly!`
      : `You understood ${checkerName} perfectly!`;

    // Show rounds info if achieved via explain-back
    const roundsMessage = viaExplainBack
      ? `Achieved in ${roundCount} explain-back ${roundCount === 1 ? 'round' : 'rounds'}`
      : null;

    const underconfidenceMessage = isPerfectWithUnderconfidence && responderRating !== undefined
      ? (isChecker
          ? `${displayPartnerName} was underconfident: ${10 - responderRating} points`
          : `You were underconfident: ${10 - responderRating} points`)
      : null;

    return (
      <div className="flex flex-col h-full">
        <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} />
        <div className={CONTENT_LAYOUT}>
          {/* Celebration header */}
          <div className="text-center space-y-2">
            <div className="text-4xl">🎉</div>
            <h2 className="text-xl font-semibold text-green-600">{headline}</h2>
            {roundsMessage && (
              <p className="text-sm text-muted-foreground">{roundsMessage}</p>
            )}
            {underconfidenceMessage && (
              <p className="text-sm text-blue-600 font-medium">{underconfidenceMessage}</p>
            )}
          </div>
          {/* P400 Bug 3: journey FIRST, story SECOND (correct order) */}
          <JourneyToUnderstanding
            checkerRating={checkerRating}
            responderRating={responderRating}
            explainBackRatings={liveState.explainBackRatings}
            isChecker={isChecker}
            displayPartnerName={displayPartnerName}
            checkerName={checkerName}
            proverName={liveState.proverName ? getFirstName(liveState.proverName) : undefined}
            variant="success"
            className="w-full max-w-sm"
          />
          {/* P272: Story card visible throughout round, hidden once user continues */}
          {selectedStory && !continueAcknowledged && (
            <LiveStoryCardExpanded
              story={selectedStory}
              isOwnStory={isStoryOwner}
              onPositionSelect={onPositionSelect}
              className="w-full max-w-sm mb-2"
            />
          )}
          <ActionArea>
            <Button
              size="lg"
              className="bg-blue-500 hover:bg-blue-600 w-full"
              onClick={() => { setClickedContinue(true); onCelebrationContinue(); }}
              disabled={continueAcknowledged}
            >
              Continue
            </Button>
            {continueAcknowledged && (
              <WaitingIndicator message={`Waiting for ${displayPartnerName} to continue...`} />
            )}
          </ActionArea>
        </div>
      </div>
    );
  }

  // ============================================================================
  // PHASE: GAP-REVEALED (gap detected, offer explain-back)
  // ============================================================================
  if (phase === 'gap-revealed') {
    const pointLabel = gapPoints === 1 ? 'point' : 'points';
    // Insight message without the gap number (shown separately as badge)
    // Uses JSX to highlight "less"/"more" like we highlight "I"/"you" in idle buttons
    const insightMessage = gapType === 'overconfidence'
      ? (isChecker
          ? <>You think {displayPartnerName} understands <span className="font-bold">less</span> than they think</>
          : <>{checkerName} thinks you understand <span className="font-bold">less</span> than you think</>)
      : (isChecker
          ? <>You think {displayPartnerName} understands <span className="font-bold">more</span> than they think</>
          : <>{checkerName} thinks you understand <span className="font-bold">more</span> than you think</>);
    const gapBadgeText = `${gapPoints} ${pointLabel} gap`;

    return (
      <div className="flex flex-col h-full">
        <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} />
        <div className={CONTENT_LAYOUT}>
          {/* Result-first: journey → gap badge (bonded) → CTA → story (reference, scrollable) */}
          <JourneyToUnderstanding
            checkerRating={checkerRating}
            responderRating={responderRating}
            explainBackRatings={liveState.explainBackRatings}
            isChecker={isChecker}
            displayPartnerName={displayPartnerName}
            checkerName={checkerName}
            proverName={liveState.proverName ? getFirstName(liveState.proverName) : undefined}
            className="w-full max-w-sm"
          />
          {/* P272: Story card visible throughout round */}
          {selectedStory && (
            <LiveStoryCardExpanded
              story={selectedStory}
              isOwnStory={isStoryOwner}
              onPositionSelect={onPositionSelect}
              className="w-full max-w-sm mb-2"
            />
          )}
          <div className="border border-blue-200 bg-blue-50 rounded-lg px-4 py-3 w-full max-w-sm">
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="bg-blue-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">{gapBadgeText}</span>
            </div>
            <p className="text-blue-700 text-sm text-center">{insightMessage}</p>
          </div>
          <ActionArea
            title={!isChecker && !listenerWaitingForNegotiation ? `Help ${checkerName} understand you better. Withhold premature judgment.` : undefined}
          >
            {isChecker ? (
              // Speaker view in gap-revealed: wait for listener to decide
              <WaitingIndicator
                message={`${displayPartnerName} is deciding whether to listen actively...`}
                onSkip={onSkip}
                skipLabel="Speak freely"
              />
            ) : listenerWaitingForNegotiation ? (
              // Listener waiting: they clicked "I want to speak freely", waiting for speaker's decision
              <>
                <WaitingIndicator
                  message={`Waiting for ${checkerName} to allow skipping active listening...`}
                  onSkip={onSkip}
                  skipLabel="Skip without waiting"
                />
                <Button variant="ghost" size="sm" onClick={onCancelNegotiation} className="text-muted-foreground min-h-[44px]">
                  Cancel request
                </Button>
              </>
            ) : (
              // Listener view in gap-revealed: offer to explain back or speak freely
              <>
                <Button
                  size="lg"
                  className="bg-blue-500 hover:bg-blue-600 w-full"
                  onClick={onExplainBackStart}
                >
                  Explain back what I heard
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground min-h-[44px]" onClick={onSharePerspective}>
                  Speak freely
                </Button>
              </>
            )}
          </ActionArea>
        </div>

        {/* Negotiation Dialog 1: Speaker sees when listener wants to share perspective */}
        <Dialog open={showPendingNegotiationDialog} onOpenChange={() => {}}>
          <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} hideCloseButton>
            <DialogHeader>
              <DialogTitle>Allow {negotiationRequester} to skip active listening?</DialogTitle>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button onClick={onLetThemSpeak} className="w-full bg-blue-500 hover:bg-blue-600">
                Accept
              </Button>
              <Button variant="outline" onClick={onAskToExplainFirst} className="w-full">
                Suggest explaining back first
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Negotiation Dialog 2: Listener sees when speaker asked them to explain back */}
        <Dialog open={showAskedToExplainDialog} onOpenChange={() => {}}>
          <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} hideCloseButton>
            <DialogHeader>
              <DialogTitle>{checkerName} would like to feel understood</DialogTitle>
              <DialogDescription>
                Can you explain back what you heard before switching?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button onClick={onContinueAsListener} className="w-full bg-blue-500 hover:bg-blue-600">
                Continue as listener
              </Button>
              <Button variant="outline" onClick={onInsistToSpeak} className="w-full">
                I really need to speak
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Negotiation Dialog 3: Speaker sees when listener insists */}
        <Dialog open={showInsistDialog} onOpenChange={() => {}}>
          <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} hideCloseButton>
            <DialogHeader>
              <DialogTitle>{negotiationRequester} says they really need to speak</DialogTitle>
              <DialogDescription>
                This might be important to them.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={onLetThemSpeak} className="w-full bg-blue-500 hover:bg-blue-600">
                Let them speak
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ============================================================================
  // PHASE: CALIBRATED (gap = 0 on round 0 only)
  // Same UX as gap-revealed: listener gets "Listen actively" button, speaker waits
  // ============================================================================
  if (phase === 'calibrated') {
    // Insight message matching the gap-revealed pattern but for calibrated state
    const insightMessage = isChecker
      ? <>You believe {displayPartnerName} understands <span className="font-bold">exactly as much</span> as they think</>
      : <>{checkerName} believes you understand <span className="font-bold">exactly as much</span> as you think</>;

    return (
      <div className="flex flex-col h-full">
        <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} />
        <div className={CONTENT_LAYOUT}>
          {/* Result-first: journey → calibrated badge (bonded) → CTA → story (reference, scrollable) */}
          <JourneyToUnderstanding
            checkerRating={checkerRating}
            responderRating={responderRating}
            explainBackRatings={liveState.explainBackRatings}
            isChecker={isChecker}
            displayPartnerName={displayPartnerName}
            checkerName={checkerName}
            proverName={liveState.proverName ? getFirstName(liveState.proverName) : undefined}
            className="w-full max-w-sm"
          />
          {/* P272: Story card visible throughout round */}
          {selectedStory && (
            <LiveStoryCardExpanded
              story={selectedStory}
              isOwnStory={isStoryOwner}
              onPositionSelect={onPositionSelect}
              className="w-full max-w-sm mb-2"
            />
          )}
          <div className="border border-input bg-muted/50 rounded-lg px-4 py-3 w-full max-w-sm">
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="bg-green-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">Perfectly calibrated</span>
            </div>
            <p className="text-muted-foreground text-sm text-center">{insightMessage}</p>
          </div>
          <ActionArea
            title={!isChecker && !listenerWaitingForNegotiation ? `Help ${checkerName} understand you better. Withhold premature judgment.` : undefined}
          >
            {isChecker ? (
              // Speaker view: wait for listener to decide (same as gap-revealed)
              <WaitingIndicator
                message={`${displayPartnerName} is deciding whether to listen actively...`}
                onSkip={onSkip}
                skipLabel="Speak freely"
              />
            ) : listenerWaitingForNegotiation ? (
              // Listener waiting: they clicked "Speak freely", waiting for speaker's decision
              <>
                <WaitingIndicator
                  message={`Waiting for ${checkerName} to allow skipping active listening...`}
                  onSkip={onSkip}
                  skipLabel="Skip without waiting"
                />
                <Button variant="ghost" size="sm" onClick={onCancelNegotiation} className="text-muted-foreground min-h-[44px]">
                  Cancel request
                </Button>
              </>
            ) : (
              // Listener view: offer to explain back or speak freely (same as gap-revealed)
              <>
                <Button
                  size="lg"
                  className="bg-blue-500 hover:bg-blue-600 w-full"
                  onClick={onExplainBackStart}
                >
                  Explain back what I heard
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground min-h-[44px]" onClick={onSharePerspective}>
                  Speak freely
                </Button>
              </>
            )}
          </ActionArea>
        </div>

        {/* Negotiation Dialog 1: Speaker sees when listener wants to share perspective */}
        <Dialog open={showPendingNegotiationDialog} onOpenChange={() => {}}>
          <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} hideCloseButton>
            <DialogHeader>
              <DialogTitle>Allow {negotiationRequester} to skip active listening?</DialogTitle>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button onClick={onLetThemSpeak} className="w-full bg-blue-500 hover:bg-blue-600">
                Accept
              </Button>
              <Button variant="outline" onClick={onAskToExplainFirst} className="w-full">
                Suggest explaining back first
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Negotiation Dialog 2: Listener sees when speaker asked them to explain back */}
        <Dialog open={showAskedToExplainDialog} onOpenChange={() => {}}>
          <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} hideCloseButton>
            <DialogHeader>
              <DialogTitle>{checkerName} would like to feel understood</DialogTitle>
              <DialogDescription>
                Can you explain back what you heard before switching?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button onClick={onContinueAsListener} className="w-full bg-blue-500 hover:bg-blue-600">
                Continue as listener
              </Button>
              <Button variant="outline" onClick={onInsistToSpeak} className="w-full">
                I really need to speak
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Negotiation Dialog 3: Speaker sees when listener insists */}
        <Dialog open={showInsistDialog} onOpenChange={() => {}}>
          <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} hideCloseButton>
            <DialogHeader>
              <DialogTitle>{negotiationRequester} says they really need to speak</DialogTitle>
              <DialogDescription>
                This might be important to them.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={onLetThemSpeak} className="w-full bg-blue-500 hover:bg-blue-600">
                Let them speak
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ============================================================================
  // PHASE: RESULTS (after explain-back or no gap)
  // ============================================================================

  // Speaker clarifying state - show different UI
  if (clarificationPhase === 'speaker-clarifying') {
    return (
      <div className="flex flex-col h-full">
        <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} />
        <div className={CONTENT_LAYOUT}>
          <JourneyToUnderstanding
            checkerRating={checkerRating}
            responderRating={responderRating}
            explainBackRatings={liveState.explainBackRatings}
            isChecker={isChecker}
            displayPartnerName={displayPartnerName}
            checkerName={checkerName}
            proverName={liveState.proverName ? getFirstName(liveState.proverName) : undefined}
            className="w-full max-w-sm"
          />
          {/* P400: Story card visible throughout round including clarifying phase */}
          {selectedStory && (
            <LiveStoryCardExpanded
              story={selectedStory}
              isOwnStory={isStoryOwner}
              onPositionSelect={onPositionSelect}
              className="w-full max-w-sm mb-2"
            />
          )}
          {isChecker ? (
            // Speaker view: "Clarifying..." with microphone icon
            <ActionArea
              icon="🎤"
              title={`Clarify what's missing OR\ntest: 'If X happened, ...'`}
            >
              <Button
                size="lg"
                className="bg-blue-500 hover:bg-blue-600 w-full"
                onClick={onClarifyDone}
              >
                I'm done clarifying
              </Button>
              <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground mx-auto min-h-[44px]">
                Speak freely
              </Button>
            </ActionArea>
          ) : listenerWaitingForNegotiation ? (
            // B32_4: Listener clicked "Speak freely" during clarify phase, waiting for speaker's decision
            <ActionArea
              icon="👂"
              title="Hear what's missing for a perfect 10"
            >
              <WaitingIndicator
                message={`Waiting for ${checkerName} to allow skipping active listening...`}
                onSkip={onSkip}
                skipLabel="Skip without waiting"
              />
              <Button variant="ghost" size="sm" onClick={onCancelNegotiation} className="text-muted-foreground min-h-[44px]">
                Cancel request
              </Button>
            </ActionArea>
          ) : (
            // Listener view: waiting for speaker to finish clarifying
            <ActionArea
              icon="👂"
              title="Hear what's missing for a perfect 10"
            >
              <WaitingIndicator
                message={`Waiting for ${checkerName} to finish clarifying...`}
                onSkip={onSharePerspective}
                skipLabel="Speak freely"
              />
            </ActionArea>
          )}
        </div>

        {/* B32_4: Negotiation Dialog 1 - Speaker sees when listener wants to skip during clarify phase */}
        <Dialog open={showPendingNegotiationDialog} onOpenChange={() => {}}>
          <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} hideCloseButton>
            <DialogHeader>
              <DialogTitle>Allow {negotiationRequester} to skip active listening?</DialogTitle>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button onClick={onLetThemSpeak} className="w-full bg-blue-500 hover:bg-blue-600">
                Accept
              </Button>
              <Button variant="outline" onClick={onAskToExplainFirst} className="w-full">
                Suggest explaining back first
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* B32_4: Negotiation Dialog 2 - Listener sees when speaker asked them to explain back */}
        <Dialog open={showAskedToExplainDialog} onOpenChange={() => {}}>
          <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} hideCloseButton>
            <DialogHeader>
              <DialogTitle>{checkerName} would like to feel understood</DialogTitle>
              <DialogDescription>
                Can you explain back what you heard before switching?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button onClick={onContinueAsListener} className="w-full bg-blue-500 hover:bg-blue-600">
                Continue as listener
              </Button>
              <Button variant="outline" onClick={onInsistToSpeak} className="w-full">
                I really need to speak
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* B32_4: Negotiation Dialog 3 - Speaker sees when listener insists */}
        <Dialog open={showInsistDialog} onOpenChange={() => {}}>
          <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} hideCloseButton>
            <DialogHeader>
              <DialogTitle>{negotiationRequester} really needs to speak</DialogTitle>
              <DialogDescription>
                They feel they need to share something important.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button onClick={onLetThemSpeak} className="w-full bg-blue-500 hover:bg-blue-600">
                Let them speak
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // RESULTS phase logic:
  // - Clarification is ONLY offered after explain-back has happened (hasExplainBackHappened)
  // - When speaker is deciding (speakerDecidingToClarify), listener waits
  // - "Perfectly calibrated" messaging removed entirely - was causing bugs and not essential

  return (
    <div className="flex flex-col h-full">
      <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} />
      <div className={CONTENT_LAYOUT}>
        {/* P400 Bug 3: journey FIRST, story SECOND (correct order) */}
        <JourneyToUnderstanding
          checkerRating={checkerRating}
          responderRating={responderRating}
          explainBackRatings={liveState.explainBackRatings}
          isChecker={isChecker}
          displayPartnerName={displayPartnerName}
          checkerName={checkerName}
          proverName={liveState.proverName ? getFirstName(liveState.proverName) : undefined}
          className="w-full max-w-sm"
        />
        {/* P272: Story card visible throughout all UnderstandingScreen phases */}
        {selectedStory && (
          <LiveStoryCardExpanded
            story={selectedStory}
            isOwnStory={isStoryOwner}
            isGuest={isGuest}
            onPositionSelect={onPositionSelect}
            className="w-full max-w-sm mb-2"
          />
        )}
        <ActionArea
          title={isChecker && clarificationPhase === 'speaker-deciding' && hasExplainBackHappened
            ? `What is missing to a perfect 10?`
            : !isChecker && clarificationPhase !== 'speaker-deciding' && !listenerWaitingForNegotiation && negotiation?.requestedBy !== currentUserName
              ? `Help ${checkerName} understand you better. Withhold premature judgment.`
              : undefined}
        >
          {isChecker ? (
            // Speaker view - states based on clarificationPhase:
            // 1. 'listener-responding': speaker waits, listener's turn to explain back
            // 2. 'speaker-deciding' (hasExplainBackHappened): show "Share what's missing" / "Speak freely" choice
            // 3. undefined: show waiting for listener
            clarificationPhase === 'listener-responding' ? (
              <WaitingIndicator
                message={`${displayPartnerName} is deciding whether to listen actively...`}
                onSkip={onSkip}
                skipLabel="Speak freely"
              />
            ) : clarificationPhase === 'speaker-deciding' && hasExplainBackHappened ? (
              <>
                <Button
                  size="lg"
                  className="bg-blue-500 hover:bg-blue-600 w-full"
                  onClick={onClarifyStart}
                >
                  Share what's missing
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground min-h-[44px]" onClick={onSkip}>
                  Speak freely
                </Button>
              </>
            ) : (
              <WaitingIndicator
                message={`${displayPartnerName} is deciding whether to listen actively...`}
                onSkip={onSkip}
                skipLabel="Speak freely"
              />
            )
          ) : (
            // Listener view - states based on clarificationPhase:
            // 1. listenerWaitingForNegotiation: listener clicked "Speak freely", waiting for speaker's response
            // 2. 'speaker-deciding': show waiting for speaker to decide
            // 3. undefined or 'listener-responding': show action buttons
            listenerWaitingForNegotiation ? (
              <>
                <WaitingIndicator
                  message={`Waiting for ${checkerName} to allow skipping active listening...`}
                  onSkip={onSkip}
                  skipLabel="Skip without waiting"
                />
                <Button variant="ghost" size="sm" onClick={onCancelNegotiation} className="text-muted-foreground min-h-[44px]">
                  Cancel request
                </Button>
              </>
            ) : clarificationPhase === 'speaker-deciding' ? (
              <WaitingIndicator
                message={`${checkerName} is deciding whether to clarify...`}
                onSkip={onSharePerspective}
                skipLabel="Speak freely"
              />
            ) : (
              <>
                <Button
                  size="lg"
                  className="bg-blue-500 hover:bg-blue-600 w-full"
                  onClick={onExplainBackStart}
                >
                  Explain back what I heard
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground min-h-[44px]" onClick={onSharePerspective}>
                  Speak freely
                </Button>
              </>
            )
          )}
        </ActionArea>
      </div>

      {/* Negotiation Dialog 1: Speaker sees when listener wants to share perspective */}
      <Dialog open={showPendingNegotiationDialog} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} hideCloseButton>
          <DialogHeader>
            <DialogTitle>Allow {negotiationRequester} to skip active listening?</DialogTitle>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={onLetThemSpeak} className="w-full bg-blue-500 hover:bg-blue-600">
              Accept
            </Button>
            <Button variant="outline" onClick={onAskToExplainFirst} className="w-full">
              Suggest explaining back first
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Negotiation Dialog 2: Listener sees when speaker asked them to explain back */}
      <Dialog open={showAskedToExplainDialog} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} hideCloseButton>
          <DialogHeader>
            <DialogTitle>{checkerName} would like to feel understood</DialogTitle>
            <DialogDescription>
              Can you explain back what you heard before switching?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={onContinueAsListener} className="w-full bg-blue-500 hover:bg-blue-600">
              Continue as listener
            </Button>
            <Button variant="outline" onClick={onInsistToSpeak} className="w-full">
              I really need to speak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Negotiation Dialog 3: Speaker sees when listener insists */}
      <Dialog open={showInsistDialog} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} hideCloseButton>
          <DialogHeader>
            <DialogTitle>{negotiationRequester} says they really need to speak</DialogTitle>
            <DialogDescription>
              This might be important to them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={onLetThemSpeak} className="w-full bg-blue-500 hover:bg-blue-600">
              Let them speak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// RATING DISPLAY - Visual dot bar for showing ratings
// ============================================================================

interface RatingDisplayProps {
  label: React.ReactNode;
  rating: number;
  maxRating?: number;
  showCurrent?: boolean;
}

function RatingDisplay({ label, rating, maxRating = 10, showCurrent = false }: RatingDisplayProps) {
  const filledDots = rating;
  const emptyDots = maxRating - rating;

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5">
          {Array.from({ length: filledDots }).map((_, i) => (
            <span key={`filled-${i}`} className="w-2 h-2 rounded-full bg-foreground" />
          ))}
          {Array.from({ length: emptyDots }).map((_, i) => (
            <span key={`empty-${i}`} className="w-2 h-2 rounded-full bg-muted-foreground/30" />
          ))}
        </div>
        <span className="text-sm font-semibold tabular-nums w-5 text-right">{rating}</span>
        {showCurrent && <span className="text-xs text-muted-foreground">✓</span>}
      </div>
    </div>
  );
}

interface LiveHeaderProps {
  partnerName: string;
  onExit: () => void;
  isPrivate?: boolean;
}

/** Header with banner + recording indicator. Reads returnTo from URL directly. */
function LiveHeader({ partnerName, onExit, isPrivate = false }: LiveHeaderProps) {
  const [searchParams] = useSearchParams();
  const rawReturnTo = searchParams.get('returnTo');
  const returnTo = rawReturnTo && rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//')
    ? rawReturnTo : null;

  return (
    <>
      <LiveSessionBanner partnerName={partnerName} onExit={onExit} returnTo={returnTo} />
      <RecordingIndicator isPrivate={isPrivate} />
    </>
  );
}

