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
 * - IdleScreen: Start screen with "Did you get it?" / "Did I get it?" buttons
 * - RatingScreen: Rating input (0-10 scale)
 * - WaitingScreen: Shows own rating while waiting for partner
 * - GapRevealedScreen: Shows gap with explain-back option
 * - ExplainBackScreen: Responder explains, checker re-rates
 * - ResultsScreen: Shows rating progression history
 * - PerfectUnderstandingScreen: Celebration when 10/10 achieved
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Mic } from 'lucide-react';
import { toast } from 'sonner';
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
import { type LiveSessionState, type GapType } from '@/app/types';
import { LiveSessionBanner } from './live-session-banner';
import { capitalizeName, RatingButtons } from './shared';

interface LiveModeViewProps {
  liveState: LiveSessionState;
  currentUserName: string;
  partnerName: string;
  onRatingSubmit: (rating: number) => void;
  onSkip: () => void;
  onExplainBackStart: () => void;
  onExplainBackRate: (rating: number) => void;
  onToggleMode: () => void;
  onStartCheck: () => void;
  onBackToIdle: () => void;
  /** Clear the decline notification after showing toast - required for proper state cleanup */
  onClearDeclineNotification: () => void;
  /** Clear the skip notification after showing toast - required for proper state cleanup */
  onClearSkipNotification: () => void;
  /** Local rating state - true when user tapped "I spoke" but hasn't submitted yet */
  isLocallyRating: boolean;
  onCancelLocalRating: () => void;
  /** Exit the meeting entirely and return to the join/lobby screen */
  onExitMeeting: () => void;
}

export function LiveModeView({
  liveState,
  currentUserName,
  partnerName,
  onRatingSubmit,
  onSkip,
  onExplainBackStart,
  onExplainBackRate,
  onToggleMode,
  onStartCheck,
  onBackToIdle,
  onClearDeclineNotification,
  onClearSkipNotification,
  isLocallyRating,
  onCancelLocalRating,
  onExitMeeting,
}: LiveModeViewProps) {

  // V9: Track previous decline state to detect new declines
  const prevDeclinedByRef = useRef<string | undefined>(undefined);
  // V10: Track previous skip state to detect new skips
  const prevSkippedByRef = useRef<string | undefined>(undefined);
  // V10: State for skip notification dialog
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const [skipDialogName, setSkipDialogName] = useState<string>('');

  // V9: Show toast when responder declines explain-back request
  // This effect runs when explainBackDeclinedBy changes
  useEffect(() => {
    const declinedBy = liveState.explainBackDeclinedBy;
    const isChecker = liveState.checkerName === currentUserName;

    // Only show toast to the checker (the one who requested explain-back)
    // and only when there's a new decline (not on initial render or re-renders)
    if (
      declinedBy &&
      isChecker &&
      declinedBy !== currentUserName &&
      prevDeclinedByRef.current !== declinedBy
    ) {
      const displayName = capitalizeName(declinedBy);
      toast(`${displayName} decided to skip explaining back`, {
        duration: 3000,
      });

      // Clear the notification state after showing toast
      onClearDeclineNotification();
    }

    prevDeclinedByRef.current = declinedBy;
  }, [liveState.explainBackDeclinedBy, liveState.checkerName, currentUserName, onClearDeclineNotification]);

  // V10: Show dialog when partner clicks "Good enough" or "Good enough"
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
      const displayName = capitalizeName(skippedBy);
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

  // Calculate gap and type
  // Gap = responder's self-assessment - checker's belief about responder
  const gap = bothSubmitted && checkerRating !== undefined && responderRating !== undefined
    ? responderRating - checkerRating
    : 0;
  const gapType: GapType = gap > 0 ? 'overconfidence' : gap < 0 ? 'underconfidence' : 'none';
  const gapPoints = Math.abs(gap);
  const isPerfect = bothSubmitted && checkerRating === 10 && responderRating === 10;

  // Render based on phase
  const { ratingPhase } = liveState;

  // V10: Skip notification dialog - shown when partner clicks "Good enough" or "Good enough"
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
          <Button onClick={handleSkipDialogOk} className="w-full sm:w-auto">
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

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
          onToggleMode={onToggleMode}
          showDrawer={partnerAlreadySubmitted}
          onSkip={onSkip}
          onExit={onExitMeeting}
        />
        {skipNotificationDialog}
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
          onSkip={onSkip}
          onToggleMode={onToggleMode}
          onExit={onExitMeeting}
        />
        {skipNotificationDialog}
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
          onToggleMode={onToggleMode}
          onExit={onExitMeeting}
        />
        {skipNotificationDialog}
      </>
    );
  }

  // Phase: Waiting (one user submitted, waiting for partner)
  // Checker submitted → show checker "waiting", show responder IdleScreen with drawer
  if (ratingPhase === 'waiting' || (myRatingSubmitted !== partnerRatingSubmitted)) {
    const iHaveSubmitted = (isChecker ? checkerRating : responderRating) !== undefined;

    // Responder: hasn't submitted yet, checker has → show IdleScreen with drawer
    if (!iHaveSubmitted && partnerRatingSubmitted) {
      return (
        <>
          <ResponderWaitingWithDrawer
            partnerName={partnerName}
            liveState={liveState}
            onStartCheck={onStartCheck}
            onRatingSubmit={onRatingSubmit}
            onSkip={onSkip}
            onToggleMode={onToggleMode}
            onExit={onExitMeeting}
          />
          {skipNotificationDialog}
        </>
      );
    }

    // Checker or responder who submitted: show waiting screen
    return (
      <>
        <WaitingScreen
          partnerName={partnerName}
          liveState={liveState}
          isChecker={isChecker}
          myRating={isChecker ? checkerRating : responderRating}
          onBackToIdle={onBackToIdle}
          onToggleMode={onToggleMode}
          onExit={onExitMeeting}
        />
        {skipNotificationDialog}
      </>
    );
  }

  // Phase: Results (after explain-back) - MUST come before 'revealed' check
  // because bothSubmitted is still true after explain-back
  if (ratingPhase === 'results') {
    const latestRating = liveState.explainBackRatings[liveState.explainBackRatings.length - 1];
    const isPerfectNow = latestRating === 10;

    if (isPerfectNow) {
      return (
        <>
          <PerfectUnderstandingScreen
            partnerName={partnerName}
            liveState={liveState}
            isChecker={isChecker}
            checkerRating={checkerRating!}
            responderRating={responderRating!}
            afterExplainBack
            explainBackRating={latestRating}
            onSkip={onSkip}
            onToggleMode={onToggleMode}
            onExit={onExitMeeting}
          />
          {skipNotificationDialog}
        </>
      );
    }

    return (
      <>
        <ResultsScreen
          partnerName={partnerName}
          liveState={liveState}
          isChecker={isChecker}
          checkerRating={checkerRating!}
          responderRating={responderRating!}
          onExplainBackStart={onExplainBackStart}
          onSkip={onSkip}
          onToggleMode={onToggleMode}
          onExit={onExitMeeting}
        />
        {skipNotificationDialog}
      </>
    );
  }

  // Phase: Revealed - check if perfect understanding
  if (ratingPhase === 'revealed' || (bothSubmitted && !liveState.explainBackInProgress)) {
    // SCREEN 3b-ii: Both believe 10/10 - pure celebration
    if (isPerfect) {
      return (
        <>
          <PerfectUnderstandingScreen
            partnerName={partnerName}
            liveState={liveState}
            isChecker={isChecker}
            checkerRating={checkerRating!}
            responderRating={responderRating!}
            onSkip={onSkip}
            onToggleMode={onToggleMode}
            onExit={onExitMeeting}
          />
          {skipNotificationDialog}
        </>
      );
    }

    // SCREEN 3b-i: Checker believes 10/10 but responder was underconfident
    // Show "understood perfectly" + underconfidence warning, auto-return
    if (checkerRating === 10 && responderRating !== undefined && responderRating < 10) {
      return (
        <>
          <PerfectUnderstandingScreen
            partnerName={partnerName}
            liveState={liveState}
            isChecker={isChecker}
            checkerRating={checkerRating}
            responderRating={responderRating}
            responderUnderconfident
            underconfidenceGap={10 - responderRating}
            onSkip={onSkip}
            onToggleMode={onToggleMode}
            onExit={onExitMeeting}
          />
          {skipNotificationDialog}
        </>
      );
    }

    // Gap detected - show gap screen
    if (gapPoints > 0) {
      return (
        <>
          <GapRevealedScreen
            partnerName={partnerName}
            liveState={liveState}
            isChecker={isChecker}
            checkerRating={checkerRating!}
            responderRating={responderRating!}
            gapType={gapType}
            gapPoints={gapPoints}
            onExplainBackStart={onExplainBackStart}
            onSkip={onSkip}
            onToggleMode={onToggleMode}
            onExit={onExitMeeting}
          />
          {skipNotificationDialog}
        </>
      );
    }

    // No gap but not 10/10 - show results
    return (
      <>
        <ResultsScreen
          partnerName={partnerName}
          liveState={liveState}
          isChecker={isChecker}
          checkerRating={checkerRating!}
          responderRating={responderRating!}
          onExplainBackStart={onExplainBackStart}
          onSkip={onSkip}
          onToggleMode={onToggleMode}
          onExit={onExitMeeting}
        />
        {skipNotificationDialog}
      </>
    );
  }

  // Phase: Explain-back in progress
  if (ratingPhase === 'explain-back' || liveState.explainBackInProgress) {
    return (
      <>
        <ExplainBackScreen
          partnerName={partnerName}
          liveState={liveState}
          isChecker={isChecker}
          checkerRating={checkerRating}
          responderRating={responderRating}
          onExplainBackRate={onExplainBackRate}
          onSkip={onSkip}
          onToggleMode={onToggleMode}
          onExit={onExitMeeting}
        />
        {skipNotificationDialog}
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
        onSkip={onSkip}
        onToggleMode={onToggleMode}
        onExit={onExitMeeting}
      />
      {skipNotificationDialog}
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
  onToggleMode: () => void;
  /** Required - used when drawer is closed or user declines */
  onSkip: () => void;
  onExit: () => void;
  // Props for responder notification drawer
  showRatingDrawer?: boolean;
  onRatingSubmit?: (rating: number) => void;
}

function IdleScreen({
  partnerName,
  liveState,
  onStartCheck,
  onToggleMode,
  onSkip,
  onExit,
  showRatingDrawer = false,
  onRatingSubmit,
}: IdleScreenProps) {
  const displayPartnerName = capitalizeName(partnerName);
  const checkerName = liveState.checkerName ? capitalizeName(liveState.checkerName) : '';

  return (
    <div className="flex flex-col h-full">
      <LiveHeader partnerName={partnerName} onExit={onExit} />

      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-8">
        <h2 className="text-lg font-semibold text-center">Achieve clarity with {displayPartnerName}</h2>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          <Button
            size="lg"
            className="bg-blue-500 hover:bg-blue-600 w-full"
            onClick={onStartCheck}
            disabled={showRatingDrawer}
          >
            Did <span className="underline font-bold">you</span> get it?
          </Button>

          <Button
            variant="outline"
            size="lg"
            className="w-full"
            disabled
          >
            Did <span className="underline font-bold">I</span> get it?
          </Button>
        </div>
      </div>

      <LiveFooter onToggleMode={onToggleMode} />

      {/* Responder notification drawer - slides up from bottom */}
      <Drawer open={showRatingDrawer} onOpenChange={(open) => { if (!open) onSkip(); }}>
        <DrawerContent>
          <DrawerHeader className="sr-only">
            <DrawerTitle>Rate your understanding</DrawerTitle>
            <DrawerDescription>
              Rate how well you understood {checkerName}
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-8 pt-4 space-y-4">
            <RatingCard
              question={`How well do you feel you understand ${checkerName}?`}
              onSelect={onRatingSubmit || (() => {})}
            />

            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={onSkip} className="text-muted-foreground">
                Decline
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
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
  onRatingSubmit: (rating: number) => void;
  onSkip: () => void;
  onToggleMode: () => void;
  onExit: () => void;
}

function ResponderWaitingWithDrawer({
  partnerName,
  liveState,
  onStartCheck,
  onRatingSubmit,
  onSkip,
  onToggleMode,
  onExit,
}: ResponderWaitingWithDrawerProps) {
  return (
    <IdleScreen
      partnerName={partnerName}
      liveState={liveState}
      onStartCheck={onStartCheck}
      onToggleMode={onToggleMode}
      showRatingDrawer={true}
      onRatingSubmit={onRatingSubmit}
      onSkip={onSkip}
      onExit={onExit}
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
  onToggleMode: () => void;
  onExit: () => void;
}

function RatingScreen({
  partnerName,
  liveState,
  isChecker,
  onRatingSubmit,
  onBack,
  onToggleMode,
  onExit,
}: RatingScreenProps) {
  const displayPartnerName = capitalizeName(partnerName);
  const checkerName = liveState.checkerName ? capitalizeName(liveState.checkerName) : '';

  // Different prompts for checker vs responder
  // Checker: "How well do you feel [Partner] understands you?"
  // Responder: "How well do you feel you understand [Checker]?"
  const prompt = isChecker
    ? `How well do you feel ${displayPartnerName} understands you?`
    : `How well do you feel you understand ${checkerName}?`;

  return (
    <div className="flex flex-col h-full">
      <LiveHeader partnerName={partnerName} onExit={onExit} />

      <div className="flex-1 flex flex-col items-center justify-start pt-12 sm:justify-center sm:pt-0 p-6 space-y-6">
        <RatingCard
          question={prompt}
          onSelect={onRatingSubmit}
          className="w-full max-w-sm"
        />

        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      </div>

      <LiveFooter onToggleMode={onToggleMode} />
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
  onToggleMode: () => void;
  showDrawer: boolean;
  onSkip: () => void;
  onExit: () => void;
}

function RatingScreenWithOptionalDrawer({
  partnerName,
  liveState,
  onRatingSubmit,
  onBack,
  onToggleMode,
  showDrawer,
  onSkip,
  onExit,
}: RatingScreenWithOptionalDrawerProps) {
  const displayPartnerName = capitalizeName(partnerName);
  const checkerName = liveState.checkerName ? capitalizeName(liveState.checkerName) : displayPartnerName;

  // When user is locally rating but hasn't submitted yet, they're asking
  // "How well does [partner] understand me?"
  // But if partner already submitted, they're the checker, so this user is responder
  const prompt = showDrawer
    ? `How well do you feel you understand ${checkerName}?`
    : `How well do you feel ${displayPartnerName} understands you?`;

  return (
    <div className="flex flex-col h-full">
      <LiveHeader partnerName={partnerName} onExit={onExit} />

      <div className="flex-1 flex flex-col items-center justify-start pt-12 sm:justify-center sm:pt-0 p-6 space-y-6">
        <RatingCard
          question={prompt}
          onSelect={onRatingSubmit}
          className="w-full max-w-sm"
        />

        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      </div>

      <LiveFooter onToggleMode={onToggleMode} />

      {/* V10: Drawer notification when partner already submitted */}
      <Drawer open={showDrawer} onOpenChange={(open) => { if (!open) onSkip(); }}>
        <DrawerContent>
          <DrawerHeader className="sr-only">
            <DrawerTitle>Rate your understanding</DrawerTitle>
            <DrawerDescription>
              Rate how well you understood {checkerName}
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-8 pt-4 space-y-4">
            <RatingCard
              question={`How well do you feel you understand ${checkerName}?`}
              onSelect={onRatingSubmit}
            />

            {/* Decline button */}
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={onSkip} className="text-muted-foreground">
                Decline
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

// ============================================================================
// WAITING SCREEN - User who submitted sees their rating, waiting for partner
// ============================================================================

interface WaitingScreenProps {
  partnerName: string;
  liveState: LiveSessionState;
  isChecker: boolean;
  myRating?: number;
  onBackToIdle: () => void;
  onToggleMode: () => void;
  onExit: () => void;
}

function WaitingScreen({
  partnerName,
  liveState,
  isChecker,
  myRating,
  onBackToIdle,
  onToggleMode,
  onExit,
}: WaitingScreenProps) {

  const displayPartnerName = capitalizeName(partnerName);
  const checkerName = liveState.checkerName ? capitalizeName(liveState.checkerName) : '';

  // Waiting message based on role
  const waitingMessage = isChecker
    ? `Waiting for ${displayPartnerName} to rate their understanding...`
    : `Waiting for ${checkerName} to rate their understanding...`;

  // Label for "Your rating" card - consistent "feel" language
  const myRatingLabel = isChecker
    ? <><b className="text-foreground">You feel</b> {displayPartnerName} understands you:</>
    : <><b className="text-foreground">You feel</b> you understand {checkerName}:</>;

  return (
    <div className="flex flex-col h-full">
      <LiveHeader partnerName={partnerName} onExit={onExit} />

      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6">
        {/* Card containing rating + waiting status */}
        <div className="bg-muted rounded-lg p-4 space-y-4 w-full max-w-xs">
          <RatingDisplay
            label={myRatingLabel}
            rating={myRating ?? 0}
          />

          <div className="flex items-center gap-2 pt-2 border-t">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <p className="text-sm text-muted-foreground">{waitingMessage}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4 text-sm">
          <button onClick={onBackToIdle} className="text-muted-foreground hover:text-foreground flex items-center">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </button>
        </div>
      </div>

      <LiveFooter onToggleMode={onToggleMode} />
    </div>
  );
}

// ============================================================================
// GAP REVEALED SCREEN - Shows gap with risk label
// ============================================================================

interface GapRevealedScreenProps {
  partnerName: string;
  liveState: LiveSessionState;
  isChecker: boolean;
  checkerRating: number;
  responderRating: number;
  gapType: GapType;
  gapPoints: number;
  onExplainBackStart: () => void;
  onSkip: () => void;
  onToggleMode: () => void;
  onExit: () => void;
}

function GapRevealedScreen({
  partnerName,
  liveState,
  isChecker,
  checkerRating,
  responderRating,
  gapType,
  gapPoints,
  onExplainBackStart,
  onSkip,
  onToggleMode,
  onExit,
}: GapRevealedScreenProps) {
  const displayPartnerName = capitalizeName(partnerName);
  const checkerName = liveState.checkerName ? capitalizeName(liveState.checkerName) : '';
  const pointLabel = gapPoints === 1 ? 'point' : 'points';

  // Human-friendly insight messages with point count
  // Overconfident = "might have missed something"
  // Underconfident = "might understand more than they think"
  const insightMessage = gapType === 'overconfidence'
    ? (isChecker
        ? `${displayPartnerName} might have missed something (${gapPoints} ${pointLabel} gap)`
        : `You might have missed something (${gapPoints} ${pointLabel} gap)`)
    : (isChecker
        ? `${displayPartnerName} might understand more than they think (${gapPoints} ${pointLabel} gap)`
        : `You might understand more than you think (${gapPoints} ${pointLabel} gap)`);

  return (
    <div className="flex flex-col h-full">
      <LiveHeader partnerName={partnerName} onExit={onExit} />

      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6">
        <div className="text-center space-y-4">
          {/* Framing title - empowers the user */}
          <h2 className="text-lg font-semibold">You identified a gap in understanding</h2>

          {/* Rating data card */}
          <div className="bg-muted rounded-lg p-4 space-y-3">
            <RatingDisplay
              label={isChecker
                ? <><b className="text-foreground">You feel</b> {displayPartnerName} understands you:</>
                : <><b className="text-foreground">{checkerName} feels</b> you understand them:</>
              }
              rating={checkerRating}
            />
            <RatingDisplay
              label={isChecker
                ? <><b className="text-foreground">{displayPartnerName} feels</b> they understand you:</>
                : <><b className="text-foreground">You feel</b> you understand {checkerName}:</>
              }
              rating={responderRating}
            />
          </div>

          {/* Insight/conclusion - comes AFTER the data */}
          <p className="text-blue-600 font-medium">{insightMessage}</p>
        </div>

        <div className="flex flex-col gap-3 w-full max-w-xs">
          {isChecker ? (
            // Checker (speaker) sees waiting state - no button needed
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <p className="text-sm text-muted-foreground">
                  Waiting for {displayPartnerName} to decide...
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onSkip}
                className="text-muted-foreground"
              >
                Good enough
              </Button>
            </div>
          ) : (
            // Listener (responder) sees action buttons immediately
            <>
              <Button
                size="lg"
                className="bg-blue-500 hover:bg-blue-600 w-full"
                onClick={onExplainBackStart}
              >
                Explain back what I heard
              </Button>
              <Button variant="outline" size="sm" onClick={onSkip} className="text-muted-foreground">
                Good enough
              </Button>
            </>
          )}
        </div>
      </div>

      <LiveFooter onToggleMode={onToggleMode} />
    </div>
  );
}

// ============================================================================
// PERFECT UNDERSTANDING SCREEN - Celebration with auto-return
// ============================================================================

interface PerfectUnderstandingScreenProps {
  partnerName: string;
  liveState: LiveSessionState;
  isChecker: boolean;
  checkerRating: number;
  responderRating: number;
  afterExplainBack?: boolean;
  explainBackRating?: number;
  // SCREEN 3b-i: Checker rated 10 but responder was underconfident
  responderUnderconfident?: boolean;
  underconfidenceGap?: number;
  onSkip: () => void;
  onToggleMode: () => void;
  onExit: () => void;
}

function PerfectUnderstandingScreen({
  partnerName,
  liveState,
  isChecker,
  checkerRating,
  responderRating,
  afterExplainBack,
  explainBackRating,
  responderUnderconfident,
  underconfidenceGap,
  onSkip,
  onToggleMode,
  onExit,
}: PerfectUnderstandingScreenProps) {
  const displayPartnerName = capitalizeName(partnerName);
  const checkerName = liveState.checkerName ? capitalizeName(liveState.checkerName) : '';

  // Checker sees: "[Partner] understood you perfectly!"
  // Responder sees: "You understood [Checker] perfectly!"
  const headline = isChecker
    ? `${displayPartnerName} understood you perfectly!`
    : `You understood ${checkerName} perfectly!`;

  // SCREEN 3b-i: Additional underconfidence message
  const underconfidenceMessage = responderUnderconfident && underconfidenceGap
    ? (isChecker
        ? `${displayPartnerName} was underconfident: ${underconfidenceGap} points`
        : `You were underconfident: ${underconfidenceGap} points`)
    : null;

  return (
    <div className="flex flex-col h-full">
      <LiveHeader partnerName={partnerName} onExit={onExit} />

      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6">
        <div className="text-center space-y-4">
          <div className="text-4xl">🎉</div>
          <h2 className="text-xl font-semibold text-green-600">{headline}</h2>

          {/* SCREEN 3b-i: Show underconfidence warning if applicable */}
          {underconfidenceMessage && (
            <p className="text-sm text-blue-600 font-medium">{underconfidenceMessage}</p>
          )}

          <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
            <RatingDisplay
              label={isChecker
                ? <><b className="text-foreground">You feel</b> {displayPartnerName} understands you:</>
                : <><b className="text-foreground">{checkerName} feels</b> you understand them:</>
              }
              rating={checkerRating}
            />
            <RatingDisplay
              label={isChecker
                ? <><b className="text-foreground">{displayPartnerName} feels</b> they understand you:</>
                : <><b className="text-foreground">You feel</b> you understand {checkerName}:</>
              }
              rating={responderRating}
            />
            {afterExplainBack && explainBackRating !== undefined && (
              <div className="pt-2 border-t border-green-200">
                <RatingDisplay
                  label={isChecker ? <>Your final rating:</> : <>{checkerName}'s final rating:</>}
                  rating={explainBackRating}
                  showCurrent
                />
              </div>
            )}
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onSkip}
          className="text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      </div>

      <LiveFooter onToggleMode={onToggleMode} />
    </div>
  );
}

// ============================================================================
// EXPLAIN-BACK SCREEN - Responder explains, checker rates via drawer
// ============================================================================

interface ExplainBackScreenProps {
  partnerName: string;
  liveState: LiveSessionState;
  isChecker: boolean;
  checkerRating?: number;
  responderRating?: number;
  onExplainBackRate: (rating: number) => void;
  onSkip: () => void;
  onToggleMode: () => void;
  onExit: () => void;
}

function ExplainBackScreen({
  partnerName,
  liveState,
  isChecker,
  checkerRating,
  responderRating,
  onExplainBackRate,
  onSkip,
  onToggleMode,
  onExit,
}: ExplainBackScreenProps) {
  const displayPartnerName = capitalizeName(partnerName);
  const checkerName = liveState.checkerName ? capitalizeName(liveState.checkerName) : '';

  // Track whether checker has clicked "Rate their summary" to show rating interface
  const [showRatingInterface, setShowRatingInterface] = useState(false);

  const roundLabel = liveState.explainBackRound > 0
    ? ` (round ${liveState.explainBackRound + 1})`
    : '';

  // Checker (Speaker/Gosha) view:
  // - First: drawer notification that partner is explaining back
  // - After clicking "Ready to rate": drawer closes, rating interface appears on main screen
  if (isChecker) {
    // After acknowledging the notification, show full rating screen (no drawer)
    if (showRatingInterface) {
      return (
        <div className="flex flex-col h-full">
          <LiveHeader partnerName={partnerName} onExit={onExit} />

          <div className="flex-1 flex flex-col items-center justify-start pt-8 p-6 space-y-6">
            {/* Journey so far - context above the CTA */}
            <div className="w-full max-w-sm">
              <p className="text-xs text-muted-foreground mb-2">Journey so far</p>
              <JourneyToUnderstanding
                checkerRating={checkerRating ?? 0}
                responderRating={responderRating ?? 0}
                explainBackRatings={liveState.explainBackRatings}
                isChecker={true}
                displayPartnerName={displayPartnerName}
                checkerName={checkerName}
              />
            </div>

            {/* CTA: Question inside the card */}
            <RatingCard
              question={`How well did ${displayPartnerName} capture your message?`}
              onSelect={onExplainBackRate}
              className="w-full max-w-sm"
            />

            <Button variant="outline" size="sm" onClick={onSkip} className="text-muted-foreground">
              Skip
            </Button>
          </div>

          <LiveFooter onToggleMode={onToggleMode} />
        </div>
      );
    }

    // Initial state: show gap screen with drawer notification
    return (
      <div className="flex flex-col h-full">
        <LiveHeader partnerName={partnerName} onExit={onExit} />

        <div className="flex-1 flex flex-col items-center justify-start pt-8 p-6 space-y-6">
          <div className="w-full max-w-sm">
            <p className="text-xs text-muted-foreground mb-2">Journey so far</p>
            <JourneyToUnderstanding
              checkerRating={checkerRating ?? 0}
              responderRating={responderRating ?? 0}
              explainBackRatings={liveState.explainBackRatings}
              isChecker={true}
              displayPartnerName={displayPartnerName}
              checkerName={checkerName}
            />
          </div>
        </div>

        <LiveFooter onToggleMode={onToggleMode} />

        {/* Drawer notification for checker - slides up from bottom */}
        <Drawer open={true} onOpenChange={(open) => { if (!open) onSkip(); }}>
          <DrawerContent>
            <DrawerHeader className="text-center pb-4">
              <DrawerTitle className="text-lg font-medium">
                {displayPartnerName} is sharing what they heard{roundLabel}
              </DrawerTitle>
              <DrawerDescription className="sr-only">
                Listen and then rate their summary
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-4 pb-8">
              <Button
                size="lg"
                className="bg-blue-500 hover:bg-blue-600 w-full"
                onClick={() => setShowRatingInterface(true)}
              >
                Ready to rate their summary
              </Button>
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    );
  }

  // Responder (Active Listener/Slava) view: explaining back, waiting for re-rate
  return (
    <div className="flex flex-col h-full">
      <LiveHeader partnerName={partnerName} onExit={onExit} />

      <div className="flex-1 flex flex-col items-center justify-start pt-8 p-6 space-y-6">
        {/* Journey so far - context above the CTA */}
        <div className="w-full max-w-sm">
          <p className="text-xs text-muted-foreground mb-2">Journey so far</p>
          <JourneyToUnderstanding
            checkerRating={checkerRating ?? 0}
            responderRating={responderRating ?? 0}
            explainBackRatings={liveState.explainBackRatings}
            isChecker={false}
            displayPartnerName={displayPartnerName}
            checkerName={checkerName}
          />
        </div>

        {/* CTA: Pulsing microphone + instruction */}
        <div className="flex flex-col items-center space-y-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
              <Mic className="w-8 h-8 text-blue-600" />
            </div>
            {/* Pulse ring animation - disabled for users who prefer reduced motion */}
            <div className="absolute inset-0 w-16 h-16 rounded-full bg-blue-400 animate-ping motion-reduce:animate-none opacity-20" />
          </div>

          <h2 className="text-lg font-semibold text-center max-w-xs">
            Please explain back to {checkerName} what you think they meant
          </h2>
        </div>

        {/* Waiting indicator */}
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          <p className="text-sm text-muted-foreground">
            Waiting for {checkerName} to re-evaluate...
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={onSkip} className="text-muted-foreground">
          Skip
        </Button>
      </div>

      <LiveFooter onToggleMode={onToggleMode} />
    </div>
  );
}

// ============================================================================
// RESULTS SCREEN - Shows progression history
// ============================================================================

interface ResultsScreenProps {
  partnerName: string;
  liveState: LiveSessionState;
  isChecker: boolean;
  checkerRating: number;
  responderRating: number;
  onExplainBackStart: () => void;
  onSkip: () => void;
  onToggleMode: () => void;
  onExit: () => void;
}

function ResultsScreen({
  partnerName,
  liveState,
  isChecker,
  checkerRating,
  responderRating,
  onExplainBackStart,
  onSkip,
  onToggleMode,
  onExit,
}: ResultsScreenProps) {

  const displayPartnerName = capitalizeName(partnerName);
  const checkerName = liveState.checkerName ? capitalizeName(liveState.checkerName) : '';

  // Button label for listener (responder) - "again" if there have been previous rounds
  const buttonLabel = liveState.explainBackRatings.length > 0
    ? 'Explain back what I heard again'
    : 'Explain back what I heard';

  return (
    <div className="flex flex-col h-full">
      <LiveHeader partnerName={partnerName} onExit={onExit} />

      <div className="flex-1 flex flex-col items-center justify-start pt-8 p-6 space-y-6">
        <div className="w-full max-w-sm">
          <p className="text-xs text-muted-foreground mb-2">Journey so far</p>
          <JourneyToUnderstanding
            checkerRating={checkerRating}
            responderRating={responderRating}
            explainBackRatings={liveState.explainBackRatings}
            isChecker={isChecker}
            displayPartnerName={displayPartnerName}
            checkerName={checkerName}
          />
        </div>

        <div className="flex flex-col gap-3 w-full max-w-xs">
          {isChecker ? (
            // Checker (speaker) sees waiting state - no button needed
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <p className="text-sm text-muted-foreground">
                  Waiting for {displayPartnerName} to decide...
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onSkip}
                className="text-muted-foreground"
              >
                Good enough
              </Button>
            </div>
          ) : (
            // Listener (responder) sees action buttons immediately
            <>
              <Button
                size="lg"
                className="bg-blue-500 hover:bg-blue-600 w-full"
                onClick={onExplainBackStart}
              >
                {buttonLabel}
              </Button>
              <Button variant="outline" size="sm" onClick={onSkip} className="text-muted-foreground">
                Good enough
              </Button>
            </>
          )}
        </div>
      </div>

      <LiveFooter onToggleMode={onToggleMode} />
    </div>
  );
}

// ============================================================================
// RATING CARD - Reusable question + rating scale component
// ============================================================================

interface RatingCardProps {
  question?: string;
  onSelect: (rating: number) => void;
  className?: string;
}

function RatingCard({ question, onSelect, className = '' }: RatingCardProps) {
  return (
    <div className={`bg-muted rounded-lg p-4 space-y-4 ${className}`}>
      {question && (
        <h2 className="text-lg font-semibold text-center">
          {question}
        </h2>
      )}

      <div className={`flex flex-col items-center space-y-1 ${question ? 'pt-2 border-t' : ''}`}>
        <div className="flex justify-between text-xs text-muted-foreground w-full max-w-[352px]">
          <span>Not at all</span>
          <span>Perfectly</span>
        </div>
        <RatingButtons selectedValue={null} onSelect={onSelect} />
      </div>
    </div>
  );
}

// ============================================================================
// JOURNEY TO UNDERSTANDING - Shows rating history across rounds
// Extracted to DRY up duplicated code across ExplainBackScreen and ResultsScreen
// ============================================================================

/**
 * Min-height of 180px reserves space for approximately 7 rounds of explain-back
 * to prevent layout shift as rounds are added. Each round takes ~24px (text + spacing).
 * 180px = initial round (~48px) + 5-6 explain-back rounds (~24px each) + padding.
 */
const JOURNEY_MIN_HEIGHT = 'min-h-[180px]';

interface JourneyToUnderstandingProps {
  /** Initial checker rating (Round 0) */
  checkerRating: number;
  /** Initial responder rating (Round 0) */
  responderRating: number;
  /** Array of checker ratings after each explain-back round */
  explainBackRatings: number[];
  /** Whether viewing as checker (affects label text) */
  isChecker: boolean;
  /** Display name of partner */
  displayPartnerName: string;
  /** Display name of checker */
  checkerName: string;
  /** Additional CSS classes */
  className?: string;
}

function JourneyToUnderstanding({
  checkerRating,
  responderRating,
  explainBackRatings,
  isChecker,
  displayPartnerName,
  checkerName,
  className = '',
}: JourneyToUnderstandingProps) {
  return (
    <div className={`bg-muted rounded-lg p-4 ${JOURNEY_MIN_HEIGHT} text-left ${className}`}>
      <div className="space-y-3">
        {/* Initial round (Round 0) */}
        <div className="flex gap-4">
          <div className="w-16 shrink-0 text-xs text-muted-foreground pt-0.5">Round 0</div>
          <div className="flex-1 space-y-1">
            <RatingDisplay
              label={isChecker
                ? <><b className="text-foreground">You feel</b> understood:</>
                : <><b className="text-foreground">{checkerName} feels</b> understood:</>
              }
              rating={checkerRating}
            />
            <RatingDisplay
              label={isChecker
                ? <><b className="text-foreground">{displayPartnerName} feels</b> they understand:</>
                : <><b className="text-foreground">You feel</b> you understand:</>
              }
              rating={responderRating}
            />
          </div>
        </div>

        {/* Previous explain-back rounds */}
        {explainBackRatings.map((rating, index) => (
          <div key={index} className="flex gap-4 pt-2 border-t">
            <div className="w-16 shrink-0 text-xs text-muted-foreground pt-0.5">Round {index + 1}</div>
            <div className="flex-1">
              <RatingDisplay
                label={isChecker
                  ? <><b className="text-foreground">You felt</b> understood:</>
                  : <><b className="text-foreground">{checkerName} felt</b> understood:</>
                }
                rating={rating}
              />
            </div>
          </div>
        ))}
      </div>
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
}

function LiveHeader({ partnerName, onExit }: LiveHeaderProps) {
  return <LiveSessionBanner partnerName={partnerName} onExit={onExit} />;
}

interface LiveFooterProps {
  onToggleMode: () => void;
}

function LiveFooter({ onToggleMode }: LiveFooterProps) {
  return (
    <div className="p-4 border-t">
      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleMode}
          className="h-8 px-4 text-sm font-medium"
        >
          History
        </Button>
      </div>
    </div>
  );
}
