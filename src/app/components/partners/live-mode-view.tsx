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
 * - ComprehensionRatingCard: Reusable rating question + scale component (shared)
 * - JourneyToUnderstanding: Shows rating history across rounds
 * - UnderstandingScreen: Unified component for waiting, gap-revealed, explain-back, results, and celebration phases
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { Award, CheckCircle2, ShieldOff, Sparkles } from 'lucide-react';
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
import { getFirstName } from './shared';
import { playCelebrationSound } from '@/hooks/use-sound';
import { PointCardPreview } from './live-content-cards';
import { StorySearchPicker } from './story-search-picker';
import { LiveStoryCardExpanded } from './live-story-card-expanded';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { FreeModeView } from './free-mode-view';
import { GapBanner } from '@/app/components/shared/gap-banner';
import { PositionBadge } from '@/app/components/shared';
import { ComprehensionRatingCard } from '@/app/components/shared/comprehension-rating-card';
import { MobileTooltip } from '@/app/components/shared/mobile-tooltip';
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

function RecordingIndicator({ isPrivate = false, uploadHealth }: { isPrivate?: boolean; uploadHealth?: 'healthy' | 'degraded' | 'critical' }) {
  if (isPrivate) {
    return (
      <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] lg:top-[calc(5rem+env(safe-area-inset-top))] z-40 flex items-center justify-center gap-2 py-1.5 bg-muted border-b border-border" aria-live="polite">
        <ShieldOff className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Private session</span>
      </div>
    );
  }

  return (
    <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] lg:top-[calc(5rem+env(safe-area-inset-top))] z-40" aria-live="polite">
      {uploadHealth === 'critical' && (
        <div className="flex items-center justify-center gap-2 py-1.5 bg-red-50 border-b border-red-200">
          <span className="text-xs text-red-700">❌ Audio upload failing — check your connection</span>
        </div>
      )}
      {uploadHealth === 'degraded' && (
        <div className="flex items-center justify-center gap-2 py-1.5 bg-yellow-50 border-b border-yellow-200">
          <span className="text-xs text-yellow-800">⚠️ Weak connection — retrying audio upload</span>
        </div>
      )}
      {(!uploadHealth || uploadHealth === 'healthy') && (
        <div className="flex items-center justify-center gap-2 py-1.5 bg-blue-50 border-b border-blue-200">
          <Sparkles className="w-3.5 h-3.5 text-blue-500" />
          <span className="text-xs text-blue-700">Session recorded for AI Insights</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// LAYOUT CONSTANTS
// ============================================================================

/** Standard content container layout - centered, max-width, top-aligned */
// max-w-2xl matches letter reading (P777) and STORY_CARD_LAYOUT / JOURNEY_LAYOUT child widths.
// pb-[calc(...)] extends scroll range past the rating drawer so last item clears at max scroll.
const CONTENT_LAYOUT = "flex-1 min-h-0 flex flex-col items-center justify-start pt-8 px-6 pb-[calc(env(safe-area-inset-bottom)+280px)] space-y-6 max-w-2xl mx-auto w-full overflow-y-auto live-scroll";
/** Content layout variant - vertically centered (for idle state without history) */
const CONTENT_LAYOUT_CENTERED = "flex-1 min-h-0 flex flex-col items-center justify-center px-6 pb-6 pt-16 space-y-8 max-w-lg mx-auto w-full overflow-y-auto live-scroll";
/** Shared wrapper padding inside all /live rating drawers (all 4 Drawer sites).
 *  Card pads itself internally — outer wrapper only needs structural spacing. */
const DRAWER_CONTENT_WRAPPER = "px-4 pb-4 pt-2 space-y-3";
/** Story card sizing across all /live screens — matches letter reading width (P777). */
const STORY_CARD_LAYOUT = "w-full max-w-2xl mb-2";
/** Journey card sizing — must match STORY_CARD_LAYOUT width so adjacent cards align. */
const JOURNEY_LAYOUT = "w-full max-w-2xl";

// ============================================================================
// VIEW STATE DECISION FUNCTION — pure logic, no React
// ============================================================================

/** P638: Mode switcher state — computed by getViewState, not by a separate IIFE */
export type ModeSwitcherState = 'enabled' | 'disabled' | 'hidden';

/** Input for the view state decision function */
export interface ViewStateInput {
  sessionMode: string | undefined;
  freePhase: string | undefined;
  hasFreeSliderHandler: boolean;
  waitingForPartner: boolean;
  inCelebrationState: boolean;
  isLocallyRating: boolean;
  ratingPhase: string;
  isChecker: boolean;
  myRatingSubmitted: boolean | undefined;
  partnerRatingSubmitted: boolean | undefined;
  bothSubmitted: boolean;
  checkerRating: number | undefined;
  responderRating: number | undefined;
  // P638: New fields for modeSwitcherState computation
  ratingInitiatedBy: string | undefined;
  hasSessionModeChangeHandler: boolean;
  checkerName: string | undefined;
}

/** Discriminated union of all possible view states */
export type ViewState =
  | { view: 'free-mode' }
  | { view: 'waiting-for-partner' }
  | { view: 'local-rating'; showDrawer: boolean }
  | { view: 'idle'; modeSwitcherState: ModeSwitcherState }
  | { view: 'checker-rating' }
  | { view: 'responder-drawer' }
  | { view: 'understanding' }
  | { view: 'idle-fallback'; modeSwitcherState: ModeSwitcherState };

/**
 * Pure function that determines which view to render based on session state.
 * Encodes the 9-branch cascade priority in a single testable place.
 * Order matters — each check is a higher-priority override of later checks.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function getViewState(input: ViewStateInput): ViewState {
  const {
    sessionMode, freePhase, hasFreeSliderHandler,
    waitingForPartner, inCelebrationState,
    isLocallyRating, ratingPhase, isChecker,
    myRatingSubmitted, partnerRatingSubmitted, bothSubmitted,
    checkerRating, responderRating,
    ratingInitiatedBy, hasSessionModeChangeHandler, checkerName,
  } = input;

  // Branch 1: Free mode (highest priority — completely different UI)
  if (sessionMode !== 'guided' && (freePhase === 'unlocked' || freePhase === 'success') && hasFreeSliderHandler) {
    return { view: 'free-mode' };
  }

  // Branch 2: Waiting for partner to acknowledge celebration
  if (waitingForPartner && !inCelebrationState) {
    return { view: 'waiting-for-partner' };
  }

  // Branch 3: Local rating (I clicked Speak, haven't submitted yet)
  if (isLocallyRating) {
    const partnerAlreadySubmitted = !!(myRatingSubmitted === undefined && partnerRatingSubmitted);
    return { view: 'local-rating', showDrawer: partnerAlreadySubmitted };
  }

  // Branch 4a: Submission mismatch — one person submitted, other hasn't.
  // Must come BEFORE idle check: ratingPhase may still be 'idle' on the partner's
  // side due to Realtime delivery delay, but submission flags arrive via the same
  // liveState merge. Without this, the partner sees the Speak button instead of
  // the responder drawer on the second round.
  if (myRatingSubmitted !== partnerRatingSubmitted) {
    const iHaveSubmitted = isChecker
      ? checkerRating !== undefined
      : responderRating !== undefined;

    if (!iHaveSubmitted && partnerRatingSubmitted) {
      return { view: 'responder-drawer' };
    }
    return { view: 'understanding' };
  }

  // Branch 4: Idle (default screen)
  if (ratingPhase === 'idle') {
    // P638: Compute modeSwitcherState — replaces the IIFE at IdleScreen
    // P643: checkerName set → 'disabled' (not 'hidden') — listener may still be on idle
    // while ratingPhase update is in transit via drift polling. Hiding the switcher
    // causes it to vanish with no explanation; disabled + tooltip is correct.
    const modeSwitcherState: ModeSwitcherState =
      !hasSessionModeChangeHandler ? 'hidden'
      : freePhase ? 'hidden'
      : checkerName ? 'disabled'
      : ratingInitiatedBy ? 'disabled'
      : 'enabled';
    return { view: 'idle', modeSwitcherState };
  }

  // Branch 5: Checker re-rating (after explain-back)
  if (ratingPhase === 'rating' && isChecker && !myRatingSubmitted) {
    return { view: 'checker-rating' };
  }

  // Branch 5a/5b: Waiting phase
  if (ratingPhase === 'waiting') {
    const iHaveSubmitted = isChecker
      ? checkerRating !== undefined
      : responderRating !== undefined;

    if (!iHaveSubmitted && partnerRatingSubmitted) {
      return { view: 'responder-drawer' };
    }
    return { view: 'understanding' };
  }

  // Branch 6: Results/revealed/explain-back
  if (ratingPhase === 'results' || ratingPhase === 'revealed' || ratingPhase === 'explain-back' || bothSubmitted) {
    return { view: 'understanding' };
  }

  // Fallback: safe idle
  // P643: same fix as idle — checkerName in transit race → 'disabled' not 'hidden'
  const fallbackModeSwitcherState: ModeSwitcherState =
    !hasSessionModeChangeHandler ? 'hidden'
    : freePhase ? 'hidden'
    : checkerName ? 'disabled'
    : ratingInitiatedBy ? 'disabled'
    : 'enabled';
  return { view: 'idle-fallback', modeSwitcherState: fallbackModeSwitcherState };
}

// ============================================================================
// PARTNER LEFT SCREEN
// ============================================================================

/** P566: Upload progress state for PartnerLeftScreen */
export interface UploadProgressState {
  pending: number;
  total: number;
  status: 'uploading' | 'complete' | 'failed';
  /** P752: Queue internal state — surfaced to show retry/stall to user */
  state?: 'uploading' | 'retrying' | 'stalled';
}

interface PartnerLeftScreenProps {
  partnerName: string | null;
  sessionEnded: boolean; // true = creator ended session, false = joiner left
  onStartNew: () => void;
  /** P396: True when user is an anonymous guest (not a verified account) */
  isGuest?: boolean;
  /** P583: True when current user is the session creator */
  isCreator?: boolean;
  /** P566: Upload progress to show during post-session drain */
  uploadProgress?: UploadProgressState | null;
  /** P584: Number of completed (non-skipped) rounds in this session */
  completedRounds?: number;
}

/**
 * P584: Session end screen — upload gate + single CTA.
 * Unified layout for host, participant, and guest.
 * Upload progress shown for ALL users. CTA hidden during upload.
 * Transcript messaging conditional on completedRounds > 0.
 */
export function PartnerLeftScreen({ partnerName, sessionEnded, onStartNew, isGuest, uploadProgress, isCreator: _isCreator, completedRounds = 0 }: PartnerLeftScreenProps) {
  // Title logic (Option A — keep existing distinction)
  const title = sessionEnded
    ? 'Session ended'
    : partnerName
      ? `${partnerName} has left`
      : 'Your partner has left';

  const isUploading = uploadProgress?.status === 'uploading';
  const uploadDone = !uploadProgress || uploadProgress.status === 'complete' || uploadProgress.status === 'failed';
  const uploadFailed = uploadProgress?.status === 'failed';
  const isRetrying = uploadProgress?.state === 'retrying';
  const isStalled = uploadProgress?.state === 'stalled';
  const uploadedCount = (uploadProgress?.total ?? 0) - (uploadProgress?.pending ?? 0);
  const uploadPercent = uploadProgress && uploadProgress.total > 0
    ? Math.round((uploadedCount / uploadProgress.total) * 100)
    : 0;

  return (
    <div className="flex flex-col items-center justify-center min-h-[300px]">
      {/* P493: Install banner for registered users (guests see signup CTA instead) */}
      {!isGuest && <PwaSessionEndBanner />}
      <div className="p-8 text-center max-w-sm mx-auto space-y-6">
        {/* P584: CheckCircle icon — replaces DoorOpen + muted circle */}
        <CheckCircle2 className="w-12 h-12 text-blue-500 mx-auto" />

        <h2 className="text-xl font-semibold">{title}</h2>

        {/* P752: Upload progress — shown for ALL users including guests */}
        {isUploading && (
          <div className="w-full space-y-2">
            {(uploadProgress?.total ?? 0) === 0 ? (
              // H1: nothing enqueued yet (final chunk still saving to IndexedDB)
              <p className="text-sm text-muted-foreground">Finishing up…</p>
            ) : isRetrying ? (
              // H3: queue retrying a failed chunk upload
              <>
                <p className="text-sm font-medium">Retrying upload…</p>
                <p className="text-sm text-muted-foreground">Don&apos;t close this tab yet.</p>
              </>
            ) : isStalled ? (
              // H3b: chunk exhausted all retries — drain timeout will flip to 'failed'
              <>
                <p className="text-sm font-medium">Upload stalled — retrying…</p>
                <p className="text-sm text-muted-foreground">Don&apos;t close this tab yet.</p>
              </>
            ) : (
              // H2: normal upload — chunk-level progress instead of frozen 0%
              <>
                <p className="text-sm font-medium">
                  Uploading chunk {Math.min(uploadedCount + 1, uploadProgress?.total ?? 0)} of {uploadProgress?.total ?? 0}
                </p>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-blue-500 rounded-full h-2 transition-all duration-300"
                    style={{ width: `${uploadPercent}%` }}
                    role="progressbar"
                    aria-valuenow={uploadedCount}
                    aria-valuemin={0}
                    aria-valuemax={uploadProgress?.total ?? 0}
                  />
                </div>
                <p className="text-sm text-muted-foreground">{uploadPercent}%</p>
                <p className="text-sm text-muted-foreground">Don&apos;t close this tab yet.</p>
              </>
            )}
          </div>
        )}

        {/* P584: Upload failed — subtle one-liner */}
        {uploadFailed && (
          <p className="text-sm text-muted-foreground">Recording could not be saved</p>
        )}

        {/* P584: Transcript notification — conditional on completedRounds > 0 AND upload done */}
        {uploadDone && completedRounds > 0 && !isGuest && (
          <p className="text-sm text-muted-foreground">
            Your transcript is being generated. Check{' '}
            <Link to="/sessions" className="text-primary hover:underline">
              Session History
            </Link>{' '}
            in a few minutes.
          </p>
        )}

        {/* P584: Guest transcript message — conditional on completedRounds > 0 AND upload done */}
        {uploadDone && completedRounds > 0 && isGuest && (
          <p className="text-sm text-muted-foreground">
            Your session was recorded. Create an account to access your transcript and AI insights.
          </p>
        )}

        {/* P584: CTA — hidden while uploading */}
        {!isUploading && !isGuest && (
          <Button
            asChild
            className="bg-blue-500 hover:bg-blue-600 text-white w-full"
            onClick={onStartNew}
          >
            <Link to="/live">Start a Clarity Session</Link>
          </Button>
        )}

        {/* P584: Guest CTA — hidden while uploading */}
        {!isUploading && isGuest && (
          <div className="space-y-3">
            <Button asChild className="bg-blue-500 hover:bg-blue-600 text-white w-full">
              <Link to="/signup">Create Free Account</Link>
            </Button>
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
  /** P566: Upload health indicator for RecordingIndicator */
  uploadHealth?: 'healthy' | 'degraded' | 'critical';
  /** P562: Session mode change callback */
  onSessionModeChange?: (mode: 'guided' | 'free') => void;
  /** P562: Free mode slider change (debounced) */
  onFreeSliderChange?: (value: number) => void;
  /** P562: Free mode speak freely (exit round) */
  onFreeSpeakFreely?: () => void;
  /** P562: Free mode round complete (10/10) */
  onFreeRoundComplete?: () => void;
  /** P562: Free mode discuss another story */
  onFreeDiscussAnother?: () => void;
  /** P562: Story title for free mode success screen */
  freeStoryTitle?: string;
  /** P686: true when the current user is a certified certifier */
  isCertifier?: boolean;
  /** P792: Partner's avatar URL — threaded to badge in all LiveStoryCardExpanded call sites */
  partnerAvatarUrl?: string;
  /** P792: Partner's avatar color fallback */
  partnerAvatarColor?: string;
  /** P792: Whether partner has taken the pledge — shows blue ring in badge */
  partnerHasPledged?: boolean;
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
  uploadHealth,
  onSessionModeChange,
  onFreeSliderChange,
  onFreeSpeakFreely: _onFreeSpeakFreely,
  onFreeRoundComplete,
  onFreeDiscussAnother,
  freeStoryTitle,
  isCertifier,
  partnerAvatarUrl,
  partnerAvatarColor,
  partnerHasPledged,
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
      // P562: Read positions from top-level per-participant keys (JSONB merge safe).
      // Fall back to old nested livePositions for backward compat with in-progress sessions.
      const myPositions = isCreator
        ? (liveState.livePositionsCreator ?? liveState.livePositions?.[currentUserName] ?? {})
        : (liveState.livePositionsJoiner ?? liveState.livePositions?.[currentUserName] ?? {});
      const isAuthor = userId !== undefined && userId === liveState.selectedStoryData.authorId;
      const partnerPositions = isCreator
        ? (liveState.livePositionsJoiner ?? liveState.livePositions?.[partnerName] ?? {})
        : (liveState.livePositionsCreator ?? liveState.livePositions?.[partnerName] ?? {});
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
  }, [liveState.selectedStoryData, liveState.livePositions, liveState.livePositionsCreator, liveState.livePositionsJoiner, currentUserName, userId, isCreator]);

  // Show a toast when the other person changes their position on a point.
  // Uses a ref to diff previous vs current partner positions — only fires for actual changes,
  // never on initial mount. Fixed id='live-position' replaces itself on rapid re-voting.
  const prevPartnerPositionsRef = useRef<Record<string, PositionType | null> | null>(null);
  useEffect(() => {
    // P562: Read partner positions from top-level keys (fall back to old nested structure)
    const currentPositions = (isCreator
      ? (liveState.livePositionsJoiner ?? liveState.livePositions?.[partnerName] ?? {})
      : (liveState.livePositionsCreator ?? liveState.livePositions?.[partnerName] ?? {})) as Record<string, PositionType | null>;

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
  }, [liveState.livePositions, liveState.livePositionsCreator, liveState.livePositionsJoiner, partnerName, isCreator]);

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
  const badgePersonAvatarUrl = isAuthorOfSelected ? partnerAvatarUrl : undefined;
  const badgePersonAvatarColor = isAuthorOfSelected ? partnerAvatarColor : undefined;
  const badgePersonHasPledged = isAuthorOfSelected ? (partnerHasPledged ?? false) : undefined;

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
    // P646: Use role-based check — name comparison breaks with same-name users
    const isSkipFromPartner = liveState.skippedByIsCreator !== undefined
      ? liveState.skippedByIsCreator !== isCreator
      : (!!skippedBy && skippedBy !== currentUserName); // backward compat
    if (
      skippedBy &&
      isSkipFromPartner &&
      prevSkippedByRef.current !== skippedBy
    ) {
      const displayName = getFirstName(skippedBy);
      setSkipDialogName(displayName);
      setSkipDialogOpen(true);
    }

    prevSkippedByRef.current = skippedBy;
  }, [liveState.skippedBy, liveState.skippedByIsCreator, currentUserName, isCreator]);

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
  // Use session position (creator/joiner) for role comparison — name comparison
  // breaks when two users share the same display name.
  const isChecker = liveState.checkerIsCreator !== undefined
    ? liveState.checkerIsCreator === isCreator
    : liveState.checkerName === currentUserName; // backward compat for old sessions

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

  // ── View state decision (pure function, tested separately) ──────────
  const viewState = getViewState({
    sessionMode: liveState.sessionMode,
    freePhase: liveState.freePhase,
    hasFreeSliderHandler: !!onFreeSliderChange,
    waitingForPartner,
    inCelebrationState,
    isLocallyRating,
    ratingPhase,
    isChecker,
    myRatingSubmitted,
    partnerRatingSubmitted,
    bothSubmitted,
    checkerRating,
    responderRating,
    // P638: New fields for modeSwitcherState
    ratingInitiatedBy: liveState.ratingInitiatedBy,
    hasSessionModeChangeHandler: !!onSessionModeChange,
    checkerName: liveState.checkerName,
  });

  // ── Render based on view state ─────────────────────────────────────
  switch (viewState.view) {
    case 'free-mode':
      return (
        <div className="flex flex-col h-full">
          <LiveHeader partnerName={partnerName} onExit={onExitMeeting} isPrivate={isPrivate} uploadHealth={uploadHealth} />
          <FreeModeView
            liveState={liveState}
            partnerName={partnerName}
            isCreator={isCreator ?? false}
            onSliderChange={onFreeSliderChange as (value: number) => void}
            onSpeakFreely={() => handleRequestSkip('good-enough')}
            onRoundComplete={onFreeRoundComplete as () => void}
            onDiscussAnother={onFreeDiscussAnother as () => void}
            storyTitle={freeStoryTitle}
            selectedStory={selectedStory}
            isCertifier={isCertifier}
            partnerEarsCount={partnerEarsCount}
            partnerAvatarUrl={partnerAvatarUrl}
            partnerAvatarColor={partnerAvatarColor}
            partnerHasPledged={partnerHasPledged}
          />
          {confirmSkipDialog}
        </div>
      );

    case 'waiting-for-partner':
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
            badgePersonAvatarUrl={badgePersonAvatarUrl}
            badgePersonAvatarColor={badgePersonAvatarColor}
            badgePersonHasPledged={badgePersonHasPledged}
            isStoryOwner={isAuthorOfSelected}
            isGuest={isGuest}
            currentUserName={currentUserName}
            uploadHealth={uploadHealth}
            modeSwitcherState="hidden"
            isCreator={isCreator}
          />
          {skipNotificationDialog}
          {confirmSkipDialog}
        </>
      );

    case 'local-rating':
      return (
        <>
          <RatingScreenWithOptionalDrawer
            partnerName={partnerName}
            liveState={liveState}
            onRatingSubmit={onRatingSubmit}
            onBack={onCancelLocalRating}
            showDrawer={viewState.showDrawer}
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
            badgePersonAvatarUrl={badgePersonAvatarUrl}
            badgePersonAvatarColor={badgePersonAvatarColor}
            badgePersonHasPledged={badgePersonHasPledged}
            isStoryOwner={isAuthorOfSelected}
            isGuest={isGuest}
            uploadHealth={uploadHealth}
          />
          {skipNotificationDialog}
          {confirmSkipDialog}
        </>
      );

    case 'idle':
    case 'idle-fallback':
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
            badgePersonAvatarUrl={badgePersonAvatarUrl}
            badgePersonAvatarColor={badgePersonAvatarColor}
            badgePersonHasPledged={badgePersonHasPledged}
            isStoryOwner={isAuthorOfSelected}
            isGuest={isGuest}
            currentUserName={currentUserName}
            uploadHealth={uploadHealth}
            sessionMode={liveState.sessionMode}
            onSessionModeChange={onSessionModeChange}
            modeSwitcherState={viewState.modeSwitcherState}
            isCreator={isCreator}
          />
          {skipNotificationDialog}
          {confirmSkipDialog}
        </>
      );

    case 'checker-rating':
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
            badgePersonAvatarUrl={badgePersonAvatarUrl}
            badgePersonAvatarColor={badgePersonAvatarColor}
            badgePersonHasPledged={badgePersonHasPledged}
            isStoryOwner={isAuthorOfSelected}
            isGuest={isGuest}
            uploadHealth={uploadHealth}
          />
          {skipNotificationDialog}
          {confirmSkipDialog}
        </>
      );

    case 'responder-drawer':
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
            badgePersonAvatarUrl={badgePersonAvatarUrl}
            badgePersonAvatarColor={badgePersonAvatarColor}
            badgePersonHasPledged={badgePersonHasPledged}
            isStoryOwner={isAuthorOfSelected}
            isGuest={isGuest}
            currentUserName={currentUserName}
            uploadHealth={uploadHealth}
            sessionMode={liveState.sessionMode}
            onSessionModeChange={onSessionModeChange}
            isCreator={isCreator}
          />
          {skipNotificationDialog}
          {confirmSkipDialog}
        </>
      );

    case 'understanding':
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
            uploadHealth={uploadHealth}
            badgePersonName={badgePersonName}
            badgePersonEarsCount={badgePersonEarsCount}
            badgePersonAvatarUrl={badgePersonAvatarUrl}
            badgePersonAvatarColor={badgePersonAvatarColor}
            badgePersonHasPledged={badgePersonHasPledged}
            isCertifier={isCertifier}
          />
          {skipNotificationDialog}
          {confirmSkipDialog}
        </>
      );
  }
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
  /** Avatar URL for the badge person */
  badgePersonAvatarUrl?: string;
  /** Avatar color for the badge person */
  badgePersonAvatarColor?: string;
  /** Whether the badge person has pledged */
  badgePersonHasPledged?: boolean;
  /** When true, current user owns the selected story — show only the check button and keep card collapsed */
  isStoryOwner?: boolean;
  /** Current user's name — used to merge live positions into history story snapshots */
  currentUserName: string;
  /** P490: When true, user is a guest (unauthenticated) — shows "sign up to save" hint instead of CTA */
  isGuest?: boolean;
  /** P566: Upload health for recording indicator */
  uploadHealth?: 'healthy' | 'degraded' | 'critical';
  /** P562: Current session mode */
  sessionMode?: 'guided' | 'free';
  /** P562: Mode toggle callback */
  onSessionModeChange?: (mode: 'guided' | 'free') => void;
  /** P638: Pre-computed mode switcher state from getViewState */
  modeSwitcherState?: ModeSwitcherState;
  /** P646: Role identity — true if current user is session creator */
  isCreator?: boolean;
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
  badgePersonAvatarUrl,
  badgePersonAvatarColor,
  badgePersonHasPledged,
  isStoryOwner = false,
  currentUserName: _currentUserName,
  isGuest = false,
  uploadHealth,
  sessionMode,
  onSessionModeChange,
  modeSwitcherState,
  isCreator = false,
}: IdleScreenProps) {
  const displayPartnerName = getFirstName(partnerName);
  const checkerName = liveState.checkerName ? getFirstName(liveState.checkerName) : '';
  const proverName = liveState.proverName ? getFirstName(liveState.proverName) : '';

  // P23.3: Detect "Did I get it?" flow for drawer messaging
  const isProverInitiated = liveState.proverName !== undefined;

  // P600: Toast when partner switches session mode
  const prevSessionModeRef = useRef<string | undefined>(sessionMode);
  useEffect(() => {
    if (prevSessionModeRef.current !== undefined && sessionMode !== prevSessionModeRef.current) {
      const modeName = sessionMode === 'guided' ? 'Guided mode' : 'Open mode';
      toast(`Switched to ${modeName}`, { id: 'mode-switch', duration: 2000 });
    }
    prevSessionModeRef.current = sessionMode;
  }, [sessionMode]);

  // P600: Progressive disclosure — "Select your story" toggle
  const [showStoryPicker, setShowStoryPicker] = useState(false);

  // P128: Fetch user's stories and points (only if authenticated)
  const [stories, setStories] = useState<StoryWithPoints[]>([]);
  const [points, setPoints] = useState<PointWithUserPosition[]>([]);
  const [contentLoaded, setContentLoaded] = useState(false);
  const [contentInteracted, setContentInteracted] = useState(false);

  // Derive hasContent from state (needed for effects below)
  const hasContent = stories.length > 0 || points.length > 0;

  // Layout: bottom zone has content only when stories exist AND picker is relevant
  const hasBottomContent = contentLoaded && stories.length > 0
    && !liveState.selectedStoryId && !!userId && !!onSelectStory;

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


  // P617: Listener should not see story card until round starts (speaker submits).
  // P646: Use role-based check (isCreator) instead of name comparison.
  // Name comparison breaks when both users share the same display name.
  const isListenerDuringLocalRating = liveState.ratingInitiatedByIsCreator !== undefined
    && liveState.ratingInitiatedByIsCreator !== isCreator;
  // P766: Narrow gate for story card — only hide before speaker submits their rating.
  // isListenerDuringLocalRating stays true for the whole rating phase (used to disable Speak button).
  const isListenerBeforeSpeakerSubmits = isListenerDuringLocalRating && !liveState.checkerSubmitted;
  if (import.meta.env.DEV && (liveState.ratingInitiatedBy || liveState.ratingInitiatedByIsCreator !== undefined)) {
    // eslint-disable-next-line no-console -- gated by import.meta.env.DEV; dev-only diagnostic (P1200)
    console.log(`[P646] isListenerDuringLocalRating=${isListenerDuringLocalRating}, ratingInitiatedByIsCreator=${liveState.ratingInitiatedByIsCreator}, isCreator=${isCreator}, ratingInitiatedBy=${liveState.ratingInitiatedBy}`);
  }

  // P670: Only the user who selected the story should get the layout shift.
  // The picker only shows your own stories, so authorId matches the selector's userId.
  // The partner receives selectedStoryData via Realtime but has no reason to change layout.
  const isLocalStorySelection = !!liveState.selectedStoryData && liveState.selectedStoryData.authorId === userId;
  const hasScrollableContent = isLocalStorySelection;
  // P600: Clean idle (no story, no ratings, no history) uses two-zone layout for stable button position
  const isCleanIdle = !hasScrollableContent && !showRatingDrawer && !hasRatingData;
  const layoutClass = isCleanIdle
    ? '' // Two-zone layout handled inline below
    : hasScrollableContent || showRatingDrawer || hasRatingData
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

  // P562/AD-7: Prove button removed — tracking handler kept with _ prefix for potential future use
  const _handleStartProveWithTracking = () => {
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
    <div className="flex flex-col h-full min-h-0">
      <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} uploadHealth={uploadHealth} />

      {isCleanIdle ? (
        /* P600/P667: Two-zone layout — button stays fixed at ~40% mark, content flows below.
           P667: Always use justify-end and flex-[3] to prevent position jumps when
           stories load async, partner state changes, or session history appears. */
        <>
          {/* Top zone: button area. Always justify-end to anchor button at ~40% mark. */}
          <div className="flex-[2] flex flex-col items-center justify-end pb-4 px-6 max-w-lg mx-auto w-full">
            <div className="flex flex-col gap-1 w-full max-w-sm">
              <MobileTooltip content={isListenerDuringLocalRating ? `Mode locked, waiting for ${displayPartnerName}` : ''}>
                <Button
                  size="lg"
                  className="bg-blue-500 hover:bg-blue-600 w-full py-6"
                  onClick={handleStartCheckWithTracking}
                  disabled={waitingForPartnerToContinue || isListenerDuringLocalRating}
                  data-testid="start-check"
                >
                  <span className="flex flex-col items-center gap-1.5">
                    <span className="text-xl font-semibold leading-none">Speak</span>
                    <span className="text-[11px] font-normal text-white/90 leading-none">Did {displayPartnerName} understand you?</span>
                  </span>
                </Button>
              </MobileTooltip>
              {waitingForPartnerToContinue && (
                <WaitingIndicator message={`Waiting for ${displayPartnerName} to continue...`} />
              )}
            </div>
          </div>

          {/* Bottom zone: always flex-[3] to maintain stable layout. Contains story picker
              and session history. P667: overflowAnchor + scrollContainerRef preserved. */}
          <div ref={scrollContainerRef} className="flex-[3] flex flex-col items-center justify-start pt-2 px-6 max-w-lg mx-auto w-full overflow-y-auto live-scroll" style={{ overflowAnchor: 'none' }}>
            {hasBottomContent && (
              showStoryPicker ? (
                <StorySearchPicker
                  stories={stories}
                  onSelectStory={(id, title) => { handleSelectStoryWithTracking(id, title); setShowStoryPicker(false); }}
                  disabled={waitingForPartnerToContinue}
                  onCancel={() => setShowStoryPicker(false)}
                />
              ) : !waitingForPartnerToContinue && !isListenerDuringLocalRating && (
                <Button
                  variant="outline"
                  onClick={() => setShowStoryPicker(true)}
                  className="mx-auto text-sm min-h-[44px]"
                >
                  + Select your story
                </Button>
              )
            )}

          </div>
        </>
      ) : (
        <div ref={scrollContainerRef} className={layoutClass} style={{ overflowAnchor: 'none' }}>
            <>
              {/* Show journey card if there's rating history or drawer is open */}
              {(hasRatingData || showRatingDrawer) && (
                <JourneyToUnderstanding
                  checkerRating={liveState.checkerRating}
                  responderRating={liveState.responderRating}
                  explainBackRatings={liveState.explainBackRatings}
                  isChecker={false}
                  displayPartnerName={displayPartnerName}
                  checkerName={checkerName}
                  proverName={liveState.proverName ? getFirstName(liveState.proverName) : undefined}
                  className={JOURNEY_LAYOUT}
                  hideUntilBothSubmitted={showRatingDrawer}
                />
              )}

              {/* P272: Story card shown when story is selected */}
              {/* P617/P766: Hide for listener only before speaker submits — visible once speaker submits */}
              {selectedStory && !isListenerBeforeSpeakerSubmits && (
                <LiveStoryCardExpanded
                  story={selectedStory}
                  isOwnStory={isStoryOwner}
                  isGuest={isGuest}
                  onPositionSelect={onPositionSelect}
                  className={STORY_CARD_LAYOUT}
                  badgePersonName={badgePersonName}
                  badgePersonEarsCount={badgePersonEarsCount}
                  badgePersonAvatarUrl={badgePersonAvatarUrl}
                  badgePersonAvatarColor={badgePersonAvatarColor}
                  badgePersonHasPledged={badgePersonHasPledged}
                  defaultExpanded={false}
                />
              )}

              {/* Button for non-clean-idle cases (has session history or rating data) */}
              {/* P643 Layer 3: Also show (disabled) when listener is waiting for speaker's rating */}
              {(!selectedStory || isListenerDuringLocalRating) && !showRatingDrawer && (
                <div className="flex flex-col gap-1 w-full max-w-sm mx-auto">
                  <MobileTooltip content={isListenerDuringLocalRating ? `Mode locked, waiting for ${displayPartnerName}` : ''}>
                    <Button
                      size="lg"
                      className="bg-blue-500 hover:bg-blue-600 w-full py-6"
                      onClick={handleStartCheckWithTracking}
                      disabled={waitingForPartnerToContinue || isListenerDuringLocalRating}
                      data-testid="start-check"
                    >
                      <span className="flex flex-col items-center gap-1">
                        <span className="text-xl font-semibold">Speak</span>
                        <span className="text-xs font-normal text-white/70">Did {displayPartnerName} understand you?</span>
                      </span>
                    </Button>
                  </MobileTooltip>
                  {waitingForPartnerToContinue && (
                    <WaitingIndicator message={`Waiting for ${displayPartnerName} to continue...`} />
                  )}
                </div>
              )}

            </>
        </div>
      )}

      {/* P588: Sticky ActionArea OUTSIDE scroll container — only when story selected */}
      {/* P617/P766: Hide for listener only before speaker submits */}
      {selectedStory && !isListenerBeforeSpeakerSubmits && (
        <ActionArea
          sticky={true}
          className={showRatingDrawer || hasRatingData ? '' : '!pt-0'}
        >
          {!showRatingDrawer && isStoryOwner && (
            <>
              <Button
                size="lg"
                className="bg-blue-500 hover:bg-blue-600 w-full py-6"
                onClick={handleStartCheckWithTracking}
                disabled={waitingForPartnerToContinue}
                data-testid="start-check"
              >
                <span className="flex flex-col items-center gap-0.5">
                  <span className="text-lg font-semibold">Speak</span>
                  <span className="text-xs font-normal opacity-80">Did {displayPartnerName} understand you?</span>
                </span>
              </Button>
            </>
          )}

          {waitingForPartnerToContinue && (
            <WaitingIndicator message={`Waiting for ${displayPartnerName} to continue...`} />
          )}
          {liveState.selectedStoryId && !waitingForPartnerToContinue && (
            <button
              onClick={onClearStory}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-4"
              type="button"
            >
              Speak freely
            </button>
          )}
        </ActionArea>
      )}

      {/* P638: Mode pill toggle — state from getViewState, no IIFE */}
      {modeSwitcherState && modeSwitcherState !== 'hidden' && onSessionModeChange && (
        <div className="flex justify-center py-4">
          <MobileTooltip content={modeSwitcherState === 'disabled' ? 'Mode locked — your partner is rating' : ''}>
            <div className={`inline-flex bg-gray-100 rounded-full p-1 text-sm ${modeSwitcherState === 'disabled' ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <button
                onClick={() => modeSwitcherState === 'enabled' && onSessionModeChange('free')}
                disabled={modeSwitcherState === 'disabled'}
                className={`px-4 py-1.5 rounded-full transition-all ${
                  (sessionMode === 'free' || !sessionMode) ? 'bg-blue-500 text-white shadow-sm font-medium' : 'text-gray-500'
                } ${modeSwitcherState === 'disabled' ? 'pointer-events-none' : ''}`}
              >
                Open mode
              </button>
              <button
                onClick={() => modeSwitcherState === 'enabled' && onSessionModeChange('guided')}
                disabled={modeSwitcherState === 'disabled'}
                className={`px-4 py-1.5 rounded-full transition-all ${
                  sessionMode === 'guided' ? 'bg-blue-500 text-white shadow-sm font-medium' : 'text-gray-500'
                } ${modeSwitcherState === 'disabled' ? 'pointer-events-none' : ''}`}
              >
                Guided mode
              </button>
            </div>
          </MobileTooltip>
        </div>
      )}

      {/* Responder notification drawer - slides up from bottom */}
      {/* Only render when showRatingDrawer is true AND onRatingSubmit is provided */}
      {/* Peer-aligned: modal={false} prevents body-scroll lock so background
          stays scrollable. dismissible={false} requires explicit "Decline" tap. */}
      {showRatingDrawer && onRatingSubmit && (
        <Drawer open={true} dismissible={false} modal={false}>
          <DrawerContent overlayClassName="bg-transparent">
            <DrawerHeader className="sr-only">
              <DrawerTitle>
                {isProverInitiated
                  ? `Rate how well you believe ${proverName} understands you`
                  : `Rate how well you understood ${checkerName}`}
              </DrawerTitle>
              <DrawerDescription>
                {isProverInitiated
                  ? `${proverName} wants to know how well they understood you`
                  : `${checkerName} wants to know how well you understood them`}
              </DrawerDescription>
            </DrawerHeader>
            <div className={DRAWER_CONTENT_WRAPPER}>
              <ComprehensionRatingCard
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
  badgePersonAvatarUrl?: string;
  badgePersonAvatarColor?: string;
  badgePersonHasPledged?: boolean;
  isStoryOwner?: boolean;
  currentUserName: string;
  /** P490: When true, user is a guest (unauthenticated) — shows "sign up to save" hint instead of CTA */
  isGuest?: boolean;
  /** P566: Upload health for recording indicator */
  uploadHealth?: 'healthy' | 'degraded' | 'critical';
  /** P614: Mode switcher props */
  sessionMode?: 'guided' | 'free';
  onSessionModeChange?: (mode: 'guided' | 'free') => void;
  /** P646: Role identity */
  isCreator?: boolean;
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
  badgePersonAvatarUrl,
  badgePersonAvatarColor,
  badgePersonHasPledged,
  isStoryOwner,
  currentUserName,
  isGuest = false,
  uploadHealth,
  sessionMode,
  onSessionModeChange,
  isCreator = false,
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
      badgePersonAvatarUrl={badgePersonAvatarUrl}
      badgePersonAvatarColor={badgePersonAvatarColor}
      badgePersonHasPledged={badgePersonHasPledged}
      isStoryOwner={isStoryOwner}
      currentUserName={currentUserName}
      isGuest={isGuest}
      uploadHealth={uploadHealth}
      sessionMode={sessionMode}
      onSessionModeChange={onSessionModeChange}
      modeSwitcherState="hidden"
      isCreator={isCreator}
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
  /** Avatar URL for the badge person */
  badgePersonAvatarUrl?: string;
  /** Avatar color for the badge person */
  badgePersonAvatarColor?: string;
  /** Whether the badge person has pledged */
  badgePersonHasPledged?: boolean;
  /** P400: Clear selected story — Speak Freely must be present whenever story card is visible */
  onClearStory?: () => void;
  /** When true, current user owns the selected story — suppresses the "Tell your story" CTA */
  isStoryOwner?: boolean;
  /** P490: When true, user is a guest (unauthenticated) — shows "sign up to save" hint instead of CTA */
  isGuest?: boolean;
  /** P566: Upload health for recording indicator */
  uploadHealth?: 'healthy' | 'degraded' | 'critical';
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
  badgePersonAvatarUrl,
  badgePersonAvatarColor,
  badgePersonHasPledged,
  onClearStory: _onClearStory,
  isStoryOwner = false,
  isGuest = false,
  uploadHealth,
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
    <div className="flex flex-col h-full min-h-0">
      <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} uploadHealth={uploadHealth} />

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
            className={JOURNEY_LAYOUT}
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
            className={STORY_CARD_LAYOUT}
            badgePersonName={badgePersonName}
            badgePersonEarsCount={badgePersonEarsCount}
            badgePersonAvatarUrl={badgePersonAvatarUrl}
            badgePersonAvatarColor={badgePersonAvatarColor}
            badgePersonHasPledged={badgePersonHasPledged}
          />
        )}
        {/* P562: Mid-card "Speak freely" removed — ActionArea at bottom handles it */}
        {selectedPoint && <PointCardPreview point={selectedPoint} />}
      </div>

      {/* Rating drawer - always open by design for focused rating UX.
          dismissible={false} prevents accidental swipe/overlay close.
          modal={false} removes pointer-event lock so page behind remains interactive.
          overlayClassName="bg-transparent" keeps story card visible behind drawer. */}
      <Drawer open={true} dismissible={false} modal={false}>
        <DrawerContent overlayClassName="bg-transparent">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Rate your understanding</DrawerTitle>
            <DrawerDescription>Submit your rating on the scale below</DrawerDescription>
          </DrawerHeader>
          <div className={DRAWER_CONTENT_WRAPPER}>
            <ComprehensionRatingCard
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
  /** Avatar URL for the badge person */
  badgePersonAvatarUrl?: string;
  /** Avatar color for the badge person */
  badgePersonAvatarColor?: string;
  /** Whether the badge person has pledged */
  badgePersonHasPledged?: boolean;
  /** P400: Clear selected story — Speak Freely must be present whenever story card is visible */
  onClearStory?: () => void;
  /** When true, current user owns the selected story — suppresses the "Tell your story" CTA */
  isStoryOwner?: boolean;
  /** P490: When true, user is a guest (unauthenticated) — shows "sign up to save" hint instead of CTA */
  isGuest?: boolean;
  /** P566: Upload health for recording indicator */
  uploadHealth?: 'healthy' | 'degraded' | 'critical';
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
  badgePersonAvatarUrl,
  badgePersonAvatarColor,
  badgePersonHasPledged,
  onClearStory: _onClearStory2,
  isStoryOwner = false,
  isGuest = false,
  uploadHealth,
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

  return (
    <div className="flex flex-col h-full min-h-0">
      <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} uploadHealth={uploadHealth} />

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
            className={JOURNEY_LAYOUT}
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
            className={STORY_CARD_LAYOUT}
            badgePersonName={badgePersonName}
            badgePersonEarsCount={badgePersonEarsCount}
            badgePersonAvatarUrl={badgePersonAvatarUrl}
            badgePersonAvatarColor={badgePersonAvatarColor}
            badgePersonHasPledged={badgePersonHasPledged}
          />
        )}
        {/* P562: Mid-card "Speak freely" removed — ActionArea at bottom handles it */}
        {selectedPoint && <PointCardPreview point={selectedPoint} />}
      </div>

      {/* Rating drawer - always open by design for focused rating UX.
          dismissible={false} prevents accidental swipe/overlay close.
          modal={false} removes pointer-event lock so page behind remains interactive.
          overlayClassName="bg-transparent" keeps story card visible behind drawer. */}
      <Drawer open={true} dismissible={false} modal={false}>
        <DrawerContent overlayClassName="bg-transparent">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Rate your understanding</DrawerTitle>
            <DrawerDescription>Submit your rating on the scale below</DrawerDescription>
          </DrawerHeader>
          <div className={DRAWER_CONTENT_WRAPPER}>
            <ComprehensionRatingCard
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

// ComprehensionRatingCard — extracted to @/app/components/shared/comprehension-rating-card.tsx

// ============================================================================
// JOURNEY TO UNDERSTANDING - Shows rating history across rounds
// Unified component for ALL screens that display rating data
// ============================================================================


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
                  absent={!hasResponderRating && !hideUntilBothSubmitted}
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
                  absent={!hasCheckerRating && !hideUntilBothSubmitted}
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
                  absent={!hasResponderRating && !hideUntilBothSubmitted}
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
                  absent={!hasCheckerRating && !hideUntilBothSubmitted}
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
    <div className={`${bgClass} rounded-lg p-4 text-left ${className}`} data-testid="journey-to-understanding">
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
                    absent={!hasResponderRating && !hideUntilBothSubmitted}
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
                    absent={!hasCheckerRating && !hideUntilBothSubmitted}
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
                    absent={!hasResponderRating && !hideUntilBothSubmitted}
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
                    absent={!hasCheckerRating && !hideUntilBothSubmitted}
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
  /** Optional emoji icon (e.g., "🎤", "👂") — hidden when sticky */
  icon?: string;
  /** Optional title text */
  title?: React.ReactNode;
  /** Optional subtitle/description */
  subtitle?: React.ReactNode;
  /** Children (buttons, waiting indicators, etc.) */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** P588: When true, renders as fixed bottom bar. Default true. */
  sticky?: boolean;
}

/**
 * ActionArea - Wrapper component for action content below the history card.
 * P588: When sticky (default), renders as a fixed bottom bar so CTAs are always reachable.
 * When not sticky, renders inline as before (used for celebration and free-form idle).
 */
function ActionArea({ icon, title, subtitle, children, className = '', sticky = true }: ActionAreaProps) {
  if (sticky) {
    return (
      <section
        className={`flex-shrink-0 w-full bg-background/95 backdrop-blur-md border-t border-border shadow-[0_-4px_12px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom)] ${className}`}
        data-testid="action-area"
      >
        <div className="flex flex-col items-center gap-2 w-full max-w-sm mx-auto px-4 py-3">
          {/* Title only (no icon in sticky mode) */}
          {title && (
            <p className="text-lg font-semibold text-center max-w-xs whitespace-pre-line">
              {title}
            </p>
          )}
          {subtitle && (
            <p className="text-xs text-muted-foreground text-center">
              {subtitle}
            </p>
          )}
          {/* Action buttons/content */}
          <div className="flex flex-col gap-2 w-full max-w-xs" role="group">
            {children}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`flex flex-col items-center gap-3 w-full max-w-sm mx-auto pt-4 ${className}`} data-testid="action-area">
      {/* Icon + Title block */}
      {(icon || title) && (
        <div className="flex flex-col items-center gap-2">
          {icon && (
            <div className="w-12 h-12 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center">
              <span className="text-xl" aria-hidden="true">{icon}</span>
            </div>
          )}
          {title && (
            <p className="text-lg font-semibold text-center max-w-xs whitespace-pre-line">
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
  /** When true, rating is genuinely absent (not sealed-bid). Shows "Not yet rated" without pulse dot. */
  absent?: boolean;
}

function RatingDisplayPending({ label, absent = false }: RatingDisplayPendingProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {!absent && <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />}
        <span className="text-sm text-muted-foreground italic">
          {absent ? 'Not yet rated' : 'Pending...'}
        </span>
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
  /** P566: Upload health for recording indicator */
  uploadHealth?: 'healthy' | 'degraded' | 'critical';
  /** P792: Badge person name (partner's first name when viewer owns the story) */
  badgePersonName?: string;
  /** P792: Badge person ear count */
  badgePersonEarsCount?: number;
  /** P792: Badge person avatar URL */
  badgePersonAvatarUrl?: string;
  /** P792: Badge person avatar color fallback */
  badgePersonAvatarColor?: string;
  /** P792: Whether badge person has taken the pledge */
  badgePersonHasPledged?: boolean;
  /** P806: Whether the current user is a certified certifier (for amber subtext on perfect celebration) */
  isCertifier?: boolean;
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
  uploadHealth,
  badgePersonName,
  badgePersonEarsCount,
  badgePersonAvatarUrl,
  badgePersonAvatarColor,
  badgePersonHasPledged,
  isCertifier = false,
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
  // P646: Use role-based check — name comparison breaks with same-name users
  const iAmNegotiationRequester = negotiation?.requestedByIsCreator !== undefined
    ? negotiation.requestedByIsCreator === isCreator
    : negotiation?.requestedBy === currentUserName; // backward compat
  const listenerWaitingForNegotiation = !isChecker && negotiation?.state === 'pending' && iAmNegotiationRequester;

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
          <div className="flex flex-col h-full min-h-0">
            <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} uploadHealth={uploadHealth} />
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
                className={JOURNEY_LAYOUT}
              />
              {/* P272: Story card visible throughout round */}
              {selectedStory && (
                <LiveStoryCardExpanded
                  story={selectedStory}
                  isOwnStory={isStoryOwner}
                  badgePersonName={badgePersonName}
                  badgePersonEarsCount={badgePersonEarsCount}
                  badgePersonAvatarUrl={badgePersonAvatarUrl}
                  badgePersonAvatarColor={badgePersonAvatarColor}
                  badgePersonHasPledged={badgePersonHasPledged}
                  onPositionSelect={onPositionSelect}
                  defaultExpanded={true}
                  className={STORY_CARD_LAYOUT}
                />
              )}
            </div>

            <ActionArea
              icon="👂"
              title={`Hear what's missing for a perfect 10`}
            >
              <WaitingIndicator
                message={`Waiting for ${displayPartnerName} to finish clarifying...`}
                onSkip={onSkip}
              />
            </ActionArea>

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
      const explainBackPrompt = `How well do you believe ${displayPartnerName} understands your intended meaning?`;
      return (
        <div className="flex flex-col h-full min-h-0">
          <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} uploadHealth={uploadHealth} />
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
              className={JOURNEY_LAYOUT}
            />
            {/* P272: Story card visible throughout round */}
            {selectedStory && (
              <LiveStoryCardExpanded
                story={selectedStory}
                isOwnStory={isStoryOwner}
                badgePersonName={badgePersonName}
                badgePersonEarsCount={badgePersonEarsCount}
                badgePersonAvatarUrl={badgePersonAvatarUrl}
                badgePersonAvatarColor={badgePersonAvatarColor}
                badgePersonHasPledged={badgePersonHasPledged}
                onPositionSelect={onPositionSelect}
                defaultExpanded={true}
                className={STORY_CARD_LAYOUT}
              />
            )}
          </div>

          {/* Rating drawer - always open by design for focused rating UX.
              dismissible={false} prevents accidental swipe/overlay close.
              modal={false} removes pointer-event lock so page behind remains interactive.
              User must tap explicit skip button to end the round. */}
          <Drawer open={true} dismissible={false} modal={false}>
            <DrawerContent overlayClassName="bg-transparent">
              <DrawerHeader className="sr-only">
                <DrawerTitle>Rate understanding</DrawerTitle>
                <DrawerDescription>Submit your rating on the scale below</DrawerDescription>
              </DrawerHeader>
              <div className={DRAWER_CONTENT_WRAPPER}>
                <ComprehensionRatingCard
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
        <div className="flex flex-col h-full min-h-0">
          <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} uploadHealth={uploadHealth} />
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
              className={JOURNEY_LAYOUT}
            />
            {/* P272: Story card visible throughout round */}
            {selectedStory && (
              <LiveStoryCardExpanded
                story={selectedStory}
                isOwnStory={isStoryOwner}
                badgePersonName={badgePersonName}
                badgePersonEarsCount={badgePersonEarsCount}
                badgePersonAvatarUrl={badgePersonAvatarUrl}
                badgePersonAvatarColor={badgePersonAvatarColor}
                badgePersonHasPledged={badgePersonHasPledged}
                onPositionSelect={onPositionSelect}
                defaultExpanded={true}
                className={STORY_CARD_LAYOUT}
              />
            )}
          </div>

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
      <div className="flex flex-col h-full min-h-0">
        <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} uploadHealth={uploadHealth} />
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
            className={JOURNEY_LAYOUT}
          />
          {/* P272: Story card visible throughout round */}
          {selectedStory && (
            <LiveStoryCardExpanded
              story={selectedStory}
              isOwnStory={isStoryOwner}
              badgePersonName={badgePersonName}
              badgePersonEarsCount={badgePersonEarsCount}
              badgePersonAvatarUrl={badgePersonAvatarUrl}
              badgePersonAvatarColor={badgePersonAvatarColor}
              badgePersonHasPledged={badgePersonHasPledged}
              onPositionSelect={onPositionSelect}
              defaultExpanded={true}
              className={STORY_CARD_LAYOUT}
            />
          )}
        </div>

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
      <div className="flex flex-col h-full min-h-0">
        <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} uploadHealth={uploadHealth} />
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
            className={JOURNEY_LAYOUT}
            hideUntilBothSubmitted={true}
          />
          {/* P272: Story card visible throughout round */}
          {selectedStory && (
            <LiveStoryCardExpanded
              story={selectedStory}
              isOwnStory={isStoryOwner}
              badgePersonName={badgePersonName}
              badgePersonEarsCount={badgePersonEarsCount}
              badgePersonAvatarUrl={badgePersonAvatarUrl}
              badgePersonAvatarColor={badgePersonAvatarColor}
              badgePersonHasPledged={badgePersonHasPledged}
              onPositionSelect={onPositionSelect}
              defaultExpanded={true}
              className={STORY_CARD_LAYOUT}
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

        </div>

        {/* Waiting indicator below the card */}
        <ActionArea>
          <WaitingIndicator
            message={waitingMessage}
            onSkip={onBackToIdle}
            skipLabel="Cancel"
          />
        </ActionArea>
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
      <div className="flex flex-col h-full min-h-0">
        <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} uploadHealth={uploadHealth} />
        <div className={CONTENT_LAYOUT}>
          {/* P804: Badge headline — shown above celebration when a badge point was earned */}
          {liveState.badgePointEarned && (
            <div className="text-center mb-4">
              <Award className="h-6 w-6 text-amber-500 mx-auto mb-1" aria-hidden />
              <h2 className="text-amber-700 font-semibold">
                {(liveState.badgeCount ?? 0) >= 9
                  ? `Full badge earned! 9/9 clarity points verified`
                  : `Badge point earned! ${Math.min(liveState.badgeCount ?? 0, 9)}/9 clarity points verified`
                }
              </h2>
              {isCertifier && (
                <p className="text-sm text-amber-600 mt-1">
                  You verified {displayPartnerName} on a clarity point
                </p>
              )}
            </div>
          )}
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
            className={JOURNEY_LAYOUT}
          />
          {/* P272: Story card visible throughout round, hidden once user continues */}
          {selectedStory && !continueAcknowledged && (
            <LiveStoryCardExpanded
              story={selectedStory}
              isOwnStory={isStoryOwner}
              badgePersonName={badgePersonName}
              badgePersonEarsCount={badgePersonEarsCount}
              badgePersonAvatarUrl={badgePersonAvatarUrl}
              badgePersonAvatarColor={badgePersonAvatarColor}
              badgePersonHasPledged={badgePersonHasPledged}
              onPositionSelect={onPositionSelect}
              defaultExpanded={true}
              className={STORY_CARD_LAYOUT}
            />
          )}
          <ActionArea sticky={false}>
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
    return (
      <div className="flex flex-col h-full min-h-0">
        <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} uploadHealth={uploadHealth} />
        <div className={CONTENT_LAYOUT}>
          {/* P588: Journey → calibration banner (no gap) → story card → CTA */}
          <JourneyToUnderstanding
            checkerRating={checkerRating}
            responderRating={responderRating}
            explainBackRatings={liveState.explainBackRatings}
            isChecker={isChecker}
            displayPartnerName={displayPartnerName}
            checkerName={checkerName}
            proverName={liveState.proverName ? getFirstName(liveState.proverName) : undefined}
            className={JOURNEY_LAYOUT}
          />
          <GapBanner
            gap={gapPoints}
            senderName={isChecker ? displayPartnerName : checkerName}
            isOverconfident={gapType === 'overconfidence'}
            isChecker={isChecker}
            className={`${JOURNEY_LAYOUT} -mt-3`}
          />
          {/* P272: Story card visible throughout round */}
          {selectedStory && (
            <LiveStoryCardExpanded
              story={selectedStory}
              isOwnStory={isStoryOwner}
              badgePersonName={badgePersonName}
              badgePersonEarsCount={badgePersonEarsCount}
              badgePersonAvatarUrl={badgePersonAvatarUrl}
              badgePersonAvatarColor={badgePersonAvatarColor}
              badgePersonHasPledged={badgePersonHasPledged}
              onPositionSelect={onPositionSelect}
              defaultExpanded={true}
              className={STORY_CARD_LAYOUT}
            />
          )}
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
    return (
      <div className="flex flex-col h-full min-h-0">
        <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} uploadHealth={uploadHealth} />
        <div className={CONTENT_LAYOUT}>
          {/* P588: Journey → calibration banner (no gap) → story card → CTA */}
          <JourneyToUnderstanding
            checkerRating={checkerRating}
            responderRating={responderRating}
            explainBackRatings={liveState.explainBackRatings}
            isChecker={isChecker}
            displayPartnerName={displayPartnerName}
            checkerName={checkerName}
            proverName={liveState.proverName ? getFirstName(liveState.proverName) : undefined}
            className={JOURNEY_LAYOUT}
          />
          <GapBanner
            gap={0}
            senderName={isChecker ? displayPartnerName : checkerName}
            isOverconfident={false}
            isChecker={isChecker}
            className={`${JOURNEY_LAYOUT} -mt-3`}
          />
          {/* P272: Story card visible throughout round */}
          {selectedStory && (
            <LiveStoryCardExpanded
              story={selectedStory}
              isOwnStory={isStoryOwner}
              badgePersonName={badgePersonName}
              badgePersonEarsCount={badgePersonEarsCount}
              badgePersonAvatarUrl={badgePersonAvatarUrl}
              badgePersonAvatarColor={badgePersonAvatarColor}
              badgePersonHasPledged={badgePersonHasPledged}
              onPositionSelect={onPositionSelect}
              defaultExpanded={true}
              className={STORY_CARD_LAYOUT}
            />
          )}
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
      <div className="flex flex-col h-full min-h-0">
        <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} uploadHealth={uploadHealth} />
        <div className={CONTENT_LAYOUT}>
          <JourneyToUnderstanding
            checkerRating={checkerRating}
            responderRating={responderRating}
            explainBackRatings={liveState.explainBackRatings}
            isChecker={isChecker}
            displayPartnerName={displayPartnerName}
            checkerName={checkerName}
            proverName={liveState.proverName ? getFirstName(liveState.proverName) : undefined}
            className={JOURNEY_LAYOUT}
          />
          {/* P400: Story card visible throughout round including clarifying phase */}
          {selectedStory && (
            <LiveStoryCardExpanded
              story={selectedStory}
              isOwnStory={isStoryOwner}
              badgePersonName={badgePersonName}
              badgePersonEarsCount={badgePersonEarsCount}
              badgePersonAvatarUrl={badgePersonAvatarUrl}
              badgePersonAvatarColor={badgePersonAvatarColor}
              badgePersonHasPledged={badgePersonHasPledged}
              onPositionSelect={onPositionSelect}
              defaultExpanded={true}
              className={STORY_CARD_LAYOUT}
            />
          )}
        </div>

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
    <div className="flex flex-col h-full min-h-0">
      <LiveHeader partnerName={partnerName} onExit={onExit} isPrivate={isPrivate} uploadHealth={uploadHealth} />
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
          className={JOURNEY_LAYOUT}
        />
        {/* P272: Story card visible throughout all UnderstandingScreen phases */}
        {selectedStory && (
          <LiveStoryCardExpanded
            story={selectedStory}
            isOwnStory={isStoryOwner}
            isGuest={isGuest}
            badgePersonName={badgePersonName}
            badgePersonEarsCount={badgePersonEarsCount}
            badgePersonAvatarUrl={badgePersonAvatarUrl}
            badgePersonAvatarColor={badgePersonAvatarColor}
            badgePersonHasPledged={badgePersonHasPledged}
            onPositionSelect={onPositionSelect}
            defaultExpanded={true}
            className={STORY_CARD_LAYOUT}
          />
        )}
      </div>

      <ActionArea
        title={isChecker && clarificationPhase === 'speaker-deciding' && hasExplainBackHappened
          ? `What is missing to a perfect 10?`
          : !isChecker && clarificationPhase !== 'speaker-deciding' && !listenerWaitingForNegotiation && !iAmNegotiationRequester
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
  /** P566: Upload health indicator */
  uploadHealth?: 'healthy' | 'degraded' | 'critical';
}

/** Header with banner + recording indicator. */
function LiveHeader({ partnerName, onExit, isPrivate = false, uploadHealth }: LiveHeaderProps) {
  return (
    <>
      <LiveSessionBanner partnerName={partnerName} onExit={onExit} />
      <RecordingIndicator isPrivate={isPrivate} uploadHealth={uploadHealth} />
    </>
  );
}

