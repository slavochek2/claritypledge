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
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
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
  /** V11: Listener taps "Done Explaining" to unlock speaker's feeling interface */
  onExplainBackDone: () => void;
  /** Called when user clicks "Continue" on celebration screen - resets shared state for new rounds */
  onCelebrationComplete: () => void;
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
  onStartProve,
  onBackToIdle,
  onClearSkipNotification,
  isLocallyRating,
  onCancelLocalRating,
  onExitMeeting,
  onExplainBackDone,
  onCelebrationComplete,
}: LiveModeViewProps) {

  // Track previous skip state to detect new skips
  const prevSkippedByRef = useRef<string | undefined>(undefined);
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

  // Track celebration acknowledgment from shared state
  // User has acknowledged if their name is in the celebrationAcknowledgedBy array
  const acknowledged = liveState.celebrationAcknowledgedBy || [];
  const iHaveAcknowledged = acknowledged.includes(currentUserName);
  const partnerHasAcknowledged = acknowledged.includes(partnerName);
  const waitingForPartner = iHaveAcknowledged && !partnerHasAcknowledged;

  // Show dialog when partner clicks "Good enough"
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

  // Skip notification dialog - shown when partner clicks "Good enough"
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

  // Confirmation dialog for skip/good-enough/decline actions
  const confirmSkipTitle = confirmSkipType === 'decline'
    ? 'Decline to rate?'
    : confirmSkipType === 'good-enough'
      ? 'Move forward?'
      : 'Skip this round?';
  const confirmSkipDescription = confirmSkipType === 'decline'
    ? 'This will end the current round without your rating.'
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

  // User clicked "Continue" but partner hasn't yet - show idle with disabled buttons
  // This prevents starting a new round before partner acknowledges the celebration
  if (waitingForPartner) {
    return (
      <>
        <IdleScreen
          partnerName={partnerName}
          liveState={liveState}
          onStartCheck={onStartCheck}
          onStartProve={onStartProve}
          onSkip={() => handleRequestSkip('good-enough')}
          onToggleMode={onToggleMode}
          onExit={onExitMeeting}
          hideHistory={true}
          waitingForPartnerToContinue={true}
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
          onToggleMode={onToggleMode}
          showDrawer={partnerAlreadySubmitted}
          onSkip={() => handleRequestSkip('decline')}
          onExit={onExitMeeting}
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
          onToggleMode={onToggleMode}
          onExit={onExitMeeting}
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
          onToggleMode={onToggleMode}
          onExit={onExitMeeting}
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
            onToggleMode={onToggleMode}
            onExit={onExitMeeting}
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
          onToggleMode={onToggleMode}
          onExit={onExitMeeting}
          onCelebrationContinue={handleCelebrationContinue}
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
          onToggleMode={onToggleMode}
          onExit={onExitMeeting}
          onCelebrationContinue={handleCelebrationContinue}
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
        onToggleMode={onToggleMode}
        onExit={onExitMeeting}
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
  onToggleMode: () => void;
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
}

function IdleScreen({
  partnerName,
  liveState,
  onStartCheck,
  onStartProve,
  onToggleMode,
  onSkip,
  onExit,
  showRatingDrawer = false,
  onRatingSubmit,
  hideHistory = false,
  waitingForPartnerToContinue = false,
}: IdleScreenProps) {
  const displayPartnerName = capitalizeName(partnerName);
  const checkerName = liveState.checkerName ? capitalizeName(liveState.checkerName) : '';
  const proverName = liveState.proverName ? capitalizeName(liveState.proverName) : '';

  // P23.3: Detect "Did I get it?" flow for drawer messaging
  const isProverInitiated = liveState.proverName !== undefined;

  // Check if we have any rating data to show (from a previous round)
  // But hide it if explicitly requested (e.g., returning from celebration)
  const hasRatingData = !hideHistory && (
    liveState.checkerRating !== undefined ||
    liveState.responderRating !== undefined ||
    liveState.explainBackRatings.length > 0
  );

  // Use top-aligned layout when drawer is open (to match post-rating screens)
  // Use centered layout when no drawer (idle state with no prior data)
  const layoutClass = showRatingDrawer || hasRatingData
    ? "flex-1 flex flex-col items-center justify-start pt-8 p-6 space-y-6"
    : "flex-1 flex flex-col items-center justify-center p-6 space-y-8";

  return (
    <div className="flex flex-col h-full">
      <LiveHeader partnerName={partnerName} onExit={onExit} />

      <div className={layoutClass}>
        {/* Show journey card if there's rating history or drawer is open */}
        {(hasRatingData || showRatingDrawer) && (
          <JourneyToUnderstanding
            checkerRating={liveState.checkerRating}
            responderRating={liveState.responderRating}
            explainBackRatings={liveState.explainBackRatings}
            isChecker={false} // On idle screen, show neutral perspective (listener view)
            displayPartnerName={displayPartnerName}
            checkerName={checkerName}
            proverName={liveState.proverName ? capitalizeName(liveState.proverName) : undefined}
            className="w-full max-w-sm"
            hideUntilBothSubmitted={showRatingDrawer}
          />
        )}

        <h2 className="text-lg font-semibold text-center">Achieve clarity with {displayPartnerName}</h2>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          <Button
            size="lg"
            className="bg-blue-500 hover:bg-blue-600 w-full"
            onClick={onStartCheck}
            disabled={showRatingDrawer || waitingForPartnerToContinue}
            data-testid="start-check"
          >
            Did <span className="font-bold">you</span> get me?
          </Button>

          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={onStartProve}
            disabled={showRatingDrawer || waitingForPartnerToContinue}
            data-testid="start-prove"
          >
            Did <span className="font-bold">I</span> get you?
          </Button>
        </div>

        {/* Waiting for partner to continue indicator */}
        {waitingForPartnerToContinue && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <p className="text-sm text-muted-foreground">
              Waiting for {displayPartnerName} to continue...
            </p>
          </div>
        )}
      </div>

      <LiveFooter onToggleMode={onToggleMode} />

      {/* Responder notification drawer - slides up from bottom */}
      {/* Only render when showRatingDrawer is true AND onRatingSubmit is provided */}
      {showRatingDrawer && onRatingSubmit && (
        <Drawer open={true} onOpenChange={(open) => { if (!open) onSkip(); }}>
          <DrawerContent>
            <DrawerHeader className={isProverInitiated ? "text-center pb-2" : "sr-only"}>
              <DrawerTitle>
                {isProverInitiated
                  ? `${proverName} wants to prove they understand you`
                  : "Rate your understanding"}
              </DrawerTitle>
              <DrawerDescription className="sr-only">
                {isProverInitiated
                  ? `Rate how well you feel understood by ${proverName}`
                  : `Rate how well you understood ${checkerName}`}
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-4 pb-8 pt-4 space-y-4">
              <RatingCard
                question={isProverInitiated
                  ? `How well do you feel understood by ${proverName}?`
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
  onToggleMode: () => void;
  onExit: () => void;
}

function ResponderWaitingWithDrawer({
  partnerName,
  liveState,
  onStartCheck,
  onStartProve,
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
      onStartProve={onStartProve}
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

  // P23.3: Detect "Did I get it?" flow
  const isProverInitiated = liveState.proverName !== undefined;

  // Different prompts based on flow type and role
  let prompt: string;
  if (isProverInitiated) {
    // "Did I get it?" flow - listener initiated
    // Prover (listener): "How confident are you that you understand [Speaker]?"
    // Checker (speaker): "How well do you feel understood by [Prover]?"
    prompt = isChecker
      ? `How well do you feel understood by ${displayPartnerName}?`
      : `How confident are you that you understand ${checkerName}?`;
  } else {
    // "Did you get it?" flow - speaker initiated (existing)
    // Checker (speaker): "How well do you feel [Partner] understands you?"
    // Responder (listener): "How confident are you that you understand [Checker]?"
    prompt = isChecker
      ? `How well do you feel ${displayPartnerName} understands you?`
      : `How confident are you that you understand ${checkerName}?`;
  }

  // Only show journey card if there's prior history (not on first rating submission)
  // First rating = no prior completed round, no explain-back ratings
  const hasHistory = liveState.explainBackRatings.length > 0;

  return (
    <div className="flex flex-col h-full">
      <LiveHeader partnerName={partnerName} onExit={onExit} />

      <div className="flex-1 flex flex-col items-center justify-end p-6 space-y-6">
        {/* Only show journey card if there's history from previous rounds */}
        {hasHistory && (
          <JourneyToUnderstanding
            checkerRating={liveState.checkerRating}
            responderRating={liveState.responderRating}
            explainBackRatings={liveState.explainBackRatings}
            isChecker={isChecker}
            displayPartnerName={displayPartnerName}
            checkerName={checkerName}
            proverName={liveState.proverName ? capitalizeName(liveState.proverName) : undefined}
            className="w-full max-w-sm"
            hideUntilBothSubmitted={true}
          />
        )}

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

  // P23.3: Detect if this is a "Did I get it?" (prover-initiated) flow
  const isProverInitiated = liveState.proverName !== undefined;

  // Determine the rating prompt based on context:
  // 1. If drawer is showing: Partner submitted as checker, so user is responder
  //    → "How confident are you that you understand {checker}?"
  // 2. If prover-initiated and no drawer: User is the prover (responder) rating first
  //    → "How confident are you that you understand {checker}?"
  // 3. If checker-initiated and no drawer: User is the checker rating first
  //    → "How well do you feel {partner} understands you?"
  let prompt: string;
  if (showDrawer) {
    // Partner already submitted as checker, user is responder
    prompt = `How confident are you that you understand ${checkerName}?`;
  } else if (isProverInitiated) {
    // P23.3: Prover-initiated flow - prover (responder) is rating their confidence
    prompt = `How confident are you that you understand ${checkerName}?`;
  } else {
    // Checker-initiated flow - checker is rating how understood they feel
    prompt = `How well do you feel ${displayPartnerName} understands you?`;
  }

  // When user is locally rating, determine their role for journey card
  // If showDrawer is true or prover-initiated, user is responder; otherwise checker
  const isChecker = !showDrawer && !isProverInitiated;

  // Only show journey card if there's prior history (not on first rating submission)
  const hasHistory = liveState.explainBackRatings.length > 0;

  return (
    <div className="flex flex-col h-full">
      <LiveHeader partnerName={partnerName} onExit={onExit} />

      <div className="flex-1 flex flex-col items-center justify-end p-6 space-y-6">
        {/* Only show journey card if there's history from previous rounds */}
        {hasHistory && (
          <JourneyToUnderstanding
            checkerRating={liveState.checkerRating}
            responderRating={liveState.responderRating}
            explainBackRatings={liveState.explainBackRatings}
            isChecker={isChecker}
            displayPartnerName={displayPartnerName}
            checkerName={checkerName}
            proverName={liveState.proverName ? capitalizeName(liveState.proverName) : undefined}
            className="w-full max-w-sm"
            hideUntilBothSubmitted={true}
          />
        )}

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
              question={`How confident are you that you understand ${checkerName}?`}
              onSelect={onRatingSubmit}
              onSkip={onSkip}
              skipLabel="Decline"
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
}

function RatingCard({ question, onSelect, className = '', onSkip, skipLabel = 'Skip' }: RatingCardProps) {
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
        <div className="flex justify-between text-xs text-muted-foreground w-full max-w-[352px]">
          <span>Not at all</span>
          <span>Perfectly</span>
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
            className="text-muted-foreground"
          >
            {skipLabel}
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

interface JourneyToUnderstandingProps {
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

function JourneyToUnderstanding({
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
  let headerText: string;
  if (isProverInitiated) {
    // "Did I get it?" flow - listener (prover) initiated
    // For checker (speaker): Show prover's journey to understand them
    // For prover (listener): Show your own journey to understand the speaker
    headerText = isChecker
      ? `${proverName}'s journey to understand you`
      : `Your journey to understand ${checkerName}`;
  } else {
    // "Did you get it?" flow - speaker (checker) initiated
    // For checker (speaker): Show partner's journey to understand them
    // For responder (listener): Show your own journey to understand the speaker
    headerText = isChecker
      ? `${displayPartnerName}'s journey to understand you`
      : `Your journey to understand ${checkerName}`;
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
      // I'm the checker (speaker) - show my feeling, hide responder's confidence
      shouldRevealCheckerRating = hasCheckerRating;
      shouldRevealResponderRating = false;
    } else {
      // I'm the responder (listener) - show my confidence, hide checker's feeling
      shouldRevealCheckerRating = false;
      shouldRevealResponderRating = hasResponderRating;
    }
  }

  // Background color based on variant
  // History cards are muted with subtle border to differentiate from active RatingCard
  const bgClass = variant === 'success'
    ? 'bg-green-50 border border-green-200'
    : 'bg-gray-50 border border-gray-200';

  // In compact mode, skip round numbers and min-height
  if (compact) {
    return (
      <div className={`${bgClass} rounded-lg p-4 text-left ${className}`}>
        <div className="space-y-2">
          {/* Show ratings - in sealed-bid mode, only reveal when both submitted */}
          {isChecker ? (
            <>
              {/* Speaker view: show listener's confidence (if available), then your feeling */}
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
                  label={<><b className="text-foreground">Your feeling</b></>}
                  rating={checkerRating}
                />
              ) : (
                <RatingDisplayPending
                  label={<><b className="text-foreground">Your feeling</b></>}
                />
              )}
            </>
          ) : (
            <>
              {/* Listener view: show your confidence (if available), then speaker's feeling */}
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
                  label={<><b className="text-foreground">{checkerName}'s feeling</b></>}
                  rating={checkerRating}
                />
              ) : (
                <RatingDisplayPending
                  label={<><b className="text-foreground">{checkerName}'s feeling</b></>}
                />
              )}
            </>
          )}

          {/* Explain-back ratings */}
          {explainBackRatings.map((rating, index) => (
            <div key={index} className="pt-2 border-t">
              <RatingDisplay
                label={isChecker
                  ? <><b className="text-foreground">Your feeling</b> (round {index + 1})</>
                  : <><b className="text-foreground">{checkerName}'s feeling</b> (round {index + 1})</>
                }
                rating={rating}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Full mode with round numbers and header
  return (
    <div className={`${bgClass} rounded-lg p-4 ${JOURNEY_MIN_HEIGHT} text-left ${className}`}>
      {/* Section header - personal and directional */}
      <p className="text-xs text-muted-foreground mb-3">{headerText}</p>

      <div className="space-y-2">
        {/* Initial round (0) - show one-time rating first for each role */}
        {/* Speaker rates "feeling" (subjective), Listener rates "confidence" (self-assessment) */}
        {/* In sealed-bid mode, only reveal ratings when BOTH have submitted */}
        <div className="flex gap-3">
          <div className="w-4 shrink-0 text-xs text-muted-foreground pt-0.5 text-right">0</div>
          <div className="flex-1 space-y-1">
            {isChecker ? (
              <>
                {/* Speaker view: show listener's confidence first (one-time, muted), then your feeling */}
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
                    label={<><b className="text-foreground">Your feeling</b></>}
                    rating={checkerRating}
                  />
                ) : (
                  <RatingDisplayPending
                    label={<><b className="text-foreground">Your feeling</b></>}
                  />
                )}
              </>
            ) : (
              <>
                {/* Listener view: show your confidence first (one-time, muted), then speaker's feeling */}
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
                    label={<><b className="text-foreground">{checkerName}'s feeling</b></>}
                    rating={checkerRating}
                  />
                ) : (
                  <RatingDisplayPending
                    label={<><b className="text-foreground">{checkerName}'s feeling</b></>}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* Previous explain-back rounds - only speaker's feeling after each explain-back */}
        {explainBackRatings.map((rating, index) => (
          <div key={index} className="flex gap-3 pt-2 border-t">
            <div className="w-4 shrink-0 text-xs text-muted-foreground pt-0.5 text-right">{index + 1}</div>
            <div className="flex-1">
              <RatingDisplay
                label={isChecker
                  ? <><b className="text-foreground">Your feeling</b></>
                  : <><b className="text-foreground">{checkerName}'s feeling</b></>
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
  | 'gap-revealed'   // Both submitted, gap detected
  | 'perfect'        // Both submitted, checker rated 10
  | 'results'        // After explain-back, showing history
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
  onToggleMode: () => void;
  onExit: () => void;
  onCelebrationContinue: () => void;
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
  onToggleMode,
  onExit,
  onCelebrationContinue,
}: UnderstandingScreenProps) {
  const displayPartnerName = capitalizeName(partnerName);
  const checkerName = liveState.checkerName ? capitalizeName(liveState.checkerName) : '';

  // Determine phase based on state
  const bothSubmitted = liveState.checkerSubmitted && liveState.responderSubmitted;
  const isPerfect = bothSubmitted && checkerRating === 10 && responderRating === 10;
  const isPerfectWithUnderconfidence = bothSubmitted && checkerRating === 10 && responderRating !== undefined && responderRating < 10;
  const gap = bothSubmitted && checkerRating !== undefined && responderRating !== undefined
    ? responderRating - checkerRating
    : 0;
  const gapType: GapType = gap > 0 ? 'overconfidence' : gap < 0 ? 'underconfidence' : 'none';
  const gapPoints = Math.abs(gap);

  // Check if latest rating (from explain-back or initial) is 10
  const latestCheckerRating = liveState.explainBackRatings.length > 0
    ? liveState.explainBackRatings[liveState.explainBackRatings.length - 1]
    : checkerRating;
  const reachedPerfect = latestCheckerRating === 10;

  // Check if current user has acknowledged the celebration (from shared state)
  const acknowledged = liveState.celebrationAcknowledgedBy || [];
  const userHasAcknowledged = acknowledged.includes(currentUserName);

  // Determine which phase we're in
  let phase: UnderstandingPhase;
  if (liveState.ratingPhase === 'explain-back') {
    phase = 'explain-back';
  } else if (reachedPerfect && !userHasAcknowledged) {
    // Perfect understanding achieved - show celebration (takes priority over 'results')
    // But if user already acknowledged, skip to results (which will show idle)
    phase = 'perfect';
  } else if (liveState.ratingPhase === 'results') {
    phase = 'results';
  } else if (!bothSubmitted) {
    phase = 'waiting';
  } else if (isPerfect || isPerfectWithUnderconfidence) {
    phase = 'perfect';
  } else if (gapPoints > 0) {
    phase = 'gap-revealed';
  } else {
    phase = 'results'; // No gap, show results
  }

  // V11: Check if listener has tapped "Done Explaining"
  const listenerDone = liveState.explainBackDone === true;

  // Button label for listener (responder) - "again" if there have been previous rounds
  const explainBackButtonLabel = liveState.explainBackRatings.length > 0
    ? 'Explain back what I heard again'
    : 'Explain back what I heard';

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
            <LiveHeader partnerName={partnerName} onExit={onExit} />
            <div className="flex-1 flex flex-col items-center justify-start pt-8 p-6 space-y-6">
              <JourneyToUnderstanding
                checkerRating={checkerRating}
                responderRating={responderRating}
                explainBackRatings={liveState.explainBackRatings}
                isChecker={true}
                displayPartnerName={displayPartnerName}
                checkerName={checkerName}
                proverName={liveState.proverName ? capitalizeName(liveState.proverName) : undefined}
                className="w-full max-w-sm"
              />
              <div className="flex flex-col items-center space-y-4">
                <div className="w-24 h-24 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center">
                  <span className="text-4xl">👂</span>
                </div>
                <h2 className="text-lg font-semibold text-center max-w-xs">
                  Listen to {displayPartnerName} explain back what they understood
                </h2>
              </div>
              <div className="bg-muted rounded-lg px-4 py-3 max-w-xs space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  <p className="text-sm text-muted-foreground">
                    Waiting for {displayPartnerName} to finish explaining
                  </p>
                </div>
                <div className="flex justify-center">
                  <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
                    Skip
                  </Button>
                </div>
              </div>
            </div>
            <LiveFooter onToggleMode={onToggleMode} />
          </div>
        );
      }

      // Branch 2: Listener tapped Done - show rating card directly (no drawer)
      return (
        <div className="flex flex-col h-full">
          <LiveHeader partnerName={partnerName} onExit={onExit} />
          <div className="flex-1 flex flex-col items-center justify-start pt-8 p-6 space-y-6">
            <JourneyToUnderstanding
              checkerRating={checkerRating}
              responderRating={responderRating}
              explainBackRatings={liveState.explainBackRatings}
              isChecker={true}
              displayPartnerName={displayPartnerName}
              checkerName={checkerName}
              proverName={liveState.proverName ? capitalizeName(liveState.proverName) : undefined}
              className="w-full max-w-sm"
            />
            <RatingCard
              question={`How well did ${displayPartnerName} capture your message?`}
              onSelect={onExplainBackRate}
              onSkip={onSkip}
              className="w-full max-w-sm"
            />
          </div>
          <LiveFooter onToggleMode={onToggleMode} />
        </div>
      );
    }

    // Responder (Listener) view: explaining back
    const hasTappedDone = liveState.explainBackDone === true;

    // AFTER tapping "Done Explaining" - show waiting state (no microphone)
    if (hasTappedDone) {
      return (
        <div className="flex flex-col h-full">
          <LiveHeader partnerName={partnerName} onExit={onExit} />
          <div className="flex-1 flex flex-col items-center justify-start pt-8 p-6 space-y-6">
            <JourneyToUnderstanding
              checkerRating={checkerRating}
              responderRating={responderRating}
              explainBackRatings={liveState.explainBackRatings}
              isChecker={false}
              displayPartnerName={displayPartnerName}
              checkerName={checkerName}
              proverName={liveState.proverName ? capitalizeName(liveState.proverName) : undefined}
              className="w-full max-w-sm"
            />
            <div className="flex flex-col items-center space-y-4">
              <div className="w-24 h-24 rounded-full bg-muted border-2 border-muted-foreground/20 flex items-center justify-center">
                <span className="text-4xl">⏳</span>
              </div>
              <h2 className="text-lg font-semibold text-center max-w-xs">
                Waiting for {checkerName} to rate your explanation
              </h2>
            </div>
            <div className="bg-muted rounded-lg px-4 py-3 max-w-xs space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <p className="text-sm text-muted-foreground">
                  {checkerName} is reviewing...
                </p>
              </div>
              <div className="flex justify-center">
                <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
                  Skip
                </Button>
              </div>
            </div>
          </div>
          <LiveFooter onToggleMode={onToggleMode} />
        </div>
      );
    }

    // BEFORE tapping "Done Explaining" - show microphone/speaking state
    return (
      <div className="flex flex-col h-full">
        <LiveHeader partnerName={partnerName} onExit={onExit} />
        <div className="flex-1 flex flex-col items-center justify-start pt-8 p-6 space-y-6">
          <JourneyToUnderstanding
            checkerRating={checkerRating}
            responderRating={responderRating}
            explainBackRatings={liveState.explainBackRatings}
            isChecker={false}
            displayPartnerName={displayPartnerName}
            checkerName={checkerName}
            proverName={liveState.proverName ? capitalizeName(liveState.proverName) : undefined}
            className="w-full max-w-sm"
          />
          <div className="flex flex-col items-center space-y-4">
            <div className="w-24 h-24 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center">
              <span className="text-4xl">🎤</span>
            </div>
            <h2 className="text-lg font-semibold text-center max-w-xs">
              Please explain back to {checkerName} what you think they meant
            </h2>
          </div>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <Button
              size="lg"
              className="bg-blue-500 hover:bg-blue-600 w-full"
              onClick={onExplainBackDone}
            >
              I'm done explaining
            </Button>
            <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground mx-auto">
              Skip
            </Button>
          </div>
        </div>
        <LiveFooter onToggleMode={onToggleMode} />
      </div>
    );
  }

  // ============================================================================
  // PHASE: WAITING (one user submitted, waiting for partner)
  // ============================================================================
  if (phase === 'waiting') {
    const waitingMessage = isChecker
      ? `Waiting for ${displayPartnerName} to rate their understanding...`
      : `Waiting for ${checkerName} to rate their understanding...`;

    return (
      <div className="flex flex-col h-full">
        <LiveHeader partnerName={partnerName} onExit={onExit} />
        <div className="flex-1 flex flex-col items-center justify-start pt-8 p-6 space-y-6">
          {/* Hide ratings until both submit to prevent bias */}
          <JourneyToUnderstanding
            checkerRating={checkerRating}
            responderRating={responderRating}
            explainBackRatings={liveState.explainBackRatings}
            isChecker={isChecker}
            displayPartnerName={displayPartnerName}
            checkerName={checkerName}
            proverName={liveState.proverName ? capitalizeName(liveState.proverName) : undefined}
            className="w-full max-w-sm"
            hideUntilBothSubmitted={true}
          />

          {/* Waiting indicator below the card */}
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <p className="text-sm text-muted-foreground">{waitingMessage}</p>
          </div>

          <button onClick={onBackToIdle} className="text-muted-foreground hover:text-foreground flex items-center text-sm">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </button>
        </div>
        <LiveFooter onToggleMode={onToggleMode} />
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
        <LiveHeader partnerName={partnerName} onExit={onExit} />
        <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6">
          <div className="text-center space-y-4">
            <div className="text-4xl">🎉</div>
            <h2 className="text-xl font-semibold text-green-600">{headline}</h2>
            {roundsMessage && (
              <p className="text-sm text-muted-foreground">{roundsMessage}</p>
            )}
            {underconfidenceMessage && (
              <p className="text-sm text-blue-600 font-medium">{underconfidenceMessage}</p>
            )}
            <JourneyToUnderstanding
              checkerRating={checkerRating}
              responderRating={responderRating}
              explainBackRatings={liveState.explainBackRatings}
              isChecker={isChecker}
              displayPartnerName={displayPartnerName}
              checkerName={checkerName}
              proverName={liveState.proverName ? capitalizeName(liveState.proverName) : undefined}
              variant="success"
              className="w-full max-w-sm"
            />
          </div>
          <Button
            size="lg"
            className="bg-blue-500 hover:bg-blue-600 w-full max-w-xs"
            onClick={onCelebrationContinue}
          >
            Continue
          </Button>
        </div>
        <LiveFooter onToggleMode={onToggleMode} />
      </div>
    );
  }

  // ============================================================================
  // PHASE: GAP-REVEALED (gap detected, offer explain-back)
  // ============================================================================
  if (phase === 'gap-revealed') {
    const pointLabel = gapPoints === 1 ? 'point' : 'points';
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
        <div className="flex-1 flex flex-col items-center justify-start pt-8 p-6 space-y-6">
          <JourneyToUnderstanding
            checkerRating={checkerRating}
            responderRating={responderRating}
            explainBackRatings={liveState.explainBackRatings}
            isChecker={isChecker}
            displayPartnerName={displayPartnerName}
            checkerName={checkerName}
            proverName={liveState.proverName ? capitalizeName(liveState.proverName) : undefined}
            className="w-full max-w-sm"
          />
          <p className="text-blue-600 font-medium">{insightMessage}</p>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            {isChecker ? (
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  <p className="text-sm text-muted-foreground">
                    Waiting for {displayPartnerName} to decide...
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={onSkip} className="text-muted-foreground">
                  Good enough
                </Button>
              </div>
            ) : (
              <>
                <Button
                  size="lg"
                  className="bg-blue-500 hover:bg-blue-600 w-full"
                  onClick={onExplainBackStart}
                >
                  {explainBackButtonLabel}
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
  // PHASE: RESULTS (after explain-back or no gap)
  // ============================================================================
  return (
    <div className="flex flex-col h-full">
      <LiveHeader partnerName={partnerName} onExit={onExit} />
      <div className="flex-1 flex flex-col items-center justify-start pt-8 p-6 space-y-6">
        <JourneyToUnderstanding
          checkerRating={checkerRating}
          responderRating={responderRating}
          explainBackRatings={liveState.explainBackRatings}
          isChecker={isChecker}
          displayPartnerName={displayPartnerName}
          checkerName={checkerName}
          proverName={liveState.proverName ? capitalizeName(liveState.proverName) : undefined}
          className="w-full max-w-sm"
        />
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {isChecker ? (
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <p className="text-sm text-muted-foreground">
                  Waiting for {displayPartnerName} to decide...
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={onSkip} className="text-muted-foreground">
                Good enough
              </Button>
            </div>
          ) : (
            <>
              <Button
                size="lg"
                className="bg-blue-500 hover:bg-blue-600 w-full"
                onClick={onExplainBackStart}
              >
                {explainBackButtonLabel}
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
