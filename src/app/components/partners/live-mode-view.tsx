/**
 * @file live-mode-view.tsx
 * @description P23.1 V6: Sealed-bid rating flow for Clarity Live sessions.
 *
 * V6 Changes (sealed-bid pattern):
 * - Both users rate simultaneously, ratings hidden until both submit
 * - Speaker rates: "How much listener understands me"
 * - Listener rates: "How much I understand speaker"
 * - Gap surfaced only after both submit with explain-back options
 * - Overconfidence/underconfidence risk labeling
 * - Multiple explain-back rounds with history tracking
 *
 * V9 Changes:
 * - Toast notification when responder declines explain-back request
 */
import { useEffect, useRef } from 'react';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { type ClaritySession, type LiveSessionState, type GapType } from '@/app/types';
import { LiveSessionBanner } from './live-session-banner';
import { capitalizeName, RatingButtons } from './shared';

interface LiveModeViewProps {
  /** Session object - kept for API compatibility, may be used for future features */
  session: ClaritySession;
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
  /** Local rating state - true when user tapped "I spoke" but hasn't submitted yet */
  isLocallyRating: boolean;
  onCancelLocalRating: () => void;
  /** Exit the meeting entirely and return to the join/lobby screen */
  onExitMeeting: () => void;
}

export function LiveModeView({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Kept for API compatibility, may be used for future features
  session: _session,
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
  isLocallyRating,
  onCancelLocalRating,
  onExitMeeting,
}: LiveModeViewProps) {

  // V9: Track previous decline state to detect new declines
  const prevDeclinedByRef = useRef<string | undefined>(undefined);

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

  // V10: Local rating - user tapped "I spoke" but hasn't submitted yet
  // This check comes FIRST - local state takes priority over shared state
  // This is purely local, doesn't affect partner's screen
  // BUT: if partner already submitted, show the drawer notification on top
  if (isLocallyRating) {
    const partnerAlreadySubmitted = liveState.checkerSubmitted && liveState.checkerName !== currentUserName;

    return (
      <RatingScreenWithOptionalDrawer
        partnerName={partnerName}
        liveState={liveState}
        onRatingSubmit={onRatingSubmit}
        onBack={onCancelLocalRating}
        onToggleMode={onToggleMode}
        showDrawer={partnerAlreadySubmitted}
        onSkip={onSkip}
      />
    );
  }

  // Phase: Idle - show Check/Prove buttons (P23.2 start screen)
  // IMPORTANT: Responder stays on idle until checker submits their rating
  if (ratingPhase === 'idle') {
    return (
      <IdleScreen
        partnerName={partnerName}
        liveState={liveState}
        onStartCheck={onStartCheck}
        onSkip={onSkip}
        onToggleMode={onToggleMode}
      />
    );
  }

  // Phase: Rating - checker is re-rating (after change rating)
  if (ratingPhase === 'rating' && isChecker && !myRatingSubmitted) {
    return (
      <RatingScreen
        partnerName={partnerName}
        liveState={liveState}
        isChecker={isChecker}
        onRatingSubmit={onRatingSubmit}
        onBack={onBackToIdle}
        onToggleMode={onToggleMode}
      />
    );
  }

  // Phase: Waiting (one user submitted, waiting for partner)
  // Checker submitted → show checker "waiting", show responder IdleScreen with drawer
  if (ratingPhase === 'waiting' || (myRatingSubmitted !== partnerRatingSubmitted)) {
    const iHaveSubmitted = (isChecker ? checkerRating : responderRating) !== undefined;

    // Responder: hasn't submitted yet, checker has → show IdleScreen with drawer
    if (!iHaveSubmitted && partnerRatingSubmitted) {
      return (
        <ResponderWaitingWithDrawer
          partnerName={partnerName}
          liveState={liveState}
          onStartCheck={onStartCheck}
          onRatingSubmit={onRatingSubmit}
          onSkip={onSkip}
          onToggleMode={onToggleMode}
        />
      );
    }

    // Checker or responder who submitted: show waiting screen
    return (
      <WaitingScreen
        partnerName={partnerName}
        liveState={liveState}
        isChecker={isChecker}
        myRating={isChecker ? checkerRating : responderRating}
        onBackToIdle={onBackToIdle}
        onToggleMode={onToggleMode}
      />
    );
  }

  // Phase: Results (after explain-back) - MUST come before 'revealed' check
  // because bothSubmitted is still true after explain-back
  if (ratingPhase === 'results') {
    const latestRating = liveState.explainBackRatings[liveState.explainBackRatings.length - 1];
    const isPerfectNow = latestRating === 10;

    if (isPerfectNow) {
      return (
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
        />
      );
    }

    return (
      <ResultsScreen
        partnerName={partnerName}
        liveState={liveState}
        isChecker={isChecker}
        checkerRating={checkerRating!}
        responderRating={responderRating!}
        onExplainBackStart={onExplainBackStart}
        onSkip={onSkip}
        onToggleMode={onToggleMode}
      />
    );
  }

  // Phase: Revealed - check if perfect understanding
  if (ratingPhase === 'revealed' || (bothSubmitted && !liveState.explainBackInProgress)) {
    // SCREEN 3b-ii: Both believe 10/10 - pure celebration
    if (isPerfect) {
      return (
        <PerfectUnderstandingScreen
          partnerName={partnerName}
          liveState={liveState}
          isChecker={isChecker}
          checkerRating={checkerRating!}
          responderRating={responderRating!}
          onSkip={onSkip}
          onToggleMode={onToggleMode}
        />
      );
    }

    // SCREEN 3b-i: Checker believes 10/10 but responder was underconfident
    // Show "understood perfectly" + underconfidence warning, auto-return
    if (checkerRating === 10 && responderRating !== undefined && responderRating < 10) {
      return (
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
        />
      );
    }

    // Gap detected - show gap screen
    if (gapPoints > 0) {
      return (
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
        />
      );
    }

    // No gap but not 10/10 - show results
    return (
      <ResultsScreen
        partnerName={partnerName}
        liveState={liveState}
        isChecker={isChecker}
        checkerRating={checkerRating!}
        responderRating={responderRating!}
        onExplainBackStart={onExplainBackStart}
        onSkip={onSkip}
        onToggleMode={onToggleMode}
      />
    );
  }

  // Phase: Explain-back in progress
  if (ratingPhase === 'explain-back' || liveState.explainBackInProgress) {
    return (
      <ExplainBackScreen
        partnerName={partnerName}
        liveState={liveState}
        isChecker={isChecker}
        checkerRating={checkerRating}
        responderRating={responderRating}
        onExplainBackRate={onExplainBackRate}
        onSkip={onSkip}
        onToggleMode={onToggleMode}
      />
    );
  }

  // Fallback to idle screen
  return (
    <IdleScreen
      partnerName={partnerName}
      liveState={liveState}
      onStartCheck={onStartCheck}
      onSkip={onSkip}
      onToggleMode={onToggleMode}
    />
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
            I spoke
          </Button>

          <Button
            variant="outline"
            size="lg"
            className="w-full h-auto py-4 opacity-50 cursor-not-allowed"
            disabled
          >
            <div className="text-center">
              <div className="font-semibold">I listened</div>
              <div className="text-xs opacity-80 mt-1">Coming soon</div>
            </div>
          </Button>
        </div>
      </div>

      <LiveFooter onToggleMode={onToggleMode} />

      {/* Responder notification drawer - slides up from bottom */}
      <Drawer open={showRatingDrawer} onOpenChange={(open) => { if (!open) onSkip(); }}>
        <DrawerContent>
          <DrawerHeader className="text-center pb-2">
            <DrawerTitle className="text-sm font-normal text-muted-foreground">
              {checkerName} spoke.
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              Rate your understanding
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-8 space-y-4">
            {/* Question - large and prominent */}
            <h2 className="text-lg font-semibold text-center">
              How well do you feel you understand {checkerName}?
            </h2>

            {/* Rating scale with anchors above */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground px-1">
                <span>Not at all</span>
                <span>Perfectly</span>
              </div>
              <div className="flex justify-center">
                <RatingButtons selectedValue={null} onSelect={onRatingSubmit || (() => {})} />
              </div>
            </div>

            {/* Decline - clearly a button, not a label */}
            <div className="flex justify-center pt-4">
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
}

function ResponderWaitingWithDrawer({
  partnerName,
  liveState,
  onStartCheck,
  onRatingSubmit,
  onSkip,
  onToggleMode,
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
}

function RatingScreen({
  partnerName,
  liveState,
  isChecker,
  onRatingSubmit,
  onBack,
  onToggleMode,
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
      <LiveHeader partnerName={partnerName} />

      <div className="flex-1 flex flex-col items-center justify-start pt-12 sm:justify-center sm:pt-0 p-6 space-y-6">
        {/* Card containing question + rating scale */}
        <div className="bg-muted rounded-lg p-4 space-y-4 w-full max-w-sm">
          {/* Question */}
          <h2 className="text-lg font-semibold text-center">
            {prompt}
          </h2>

          {/* Rating scale with anchors above */}
          <div className="pt-2 border-t space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground px-1">
              <span>Not at all</span>
              <span>Perfectly</span>
            </div>
            <div className="flex justify-center">
              <RatingButtons selectedValue={null} onSelect={onRatingSubmit} />
            </div>
          </div>
        </div>

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
}

function RatingScreenWithOptionalDrawer({
  partnerName,
  liveState,
  onRatingSubmit,
  onBack,
  onToggleMode,
  showDrawer,
  onSkip,
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
      <LiveHeader partnerName={partnerName} />

      <div className="flex-1 flex flex-col items-center justify-start pt-12 sm:justify-center sm:pt-0 p-6 space-y-6">
        {/* Card containing question + rating scale */}
        <div className="bg-muted rounded-lg p-4 space-y-4 w-full max-w-sm">
          {/* Question */}
          <h2 className="text-lg font-semibold text-center">
            {prompt}
          </h2>

          {/* Rating scale with anchors above */}
          <div className="pt-2 border-t space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground px-1">
              <span>Not at all</span>
              <span>Perfectly</span>
            </div>
            <div className="flex justify-center">
              <RatingButtons selectedValue={null} onSelect={onRatingSubmit} />
            </div>
          </div>
        </div>

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
          <DrawerHeader className="text-center pb-2">
            <DrawerTitle className="text-sm font-normal text-muted-foreground">
              {checkerName} spoke.
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              Rate your understanding
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-8 space-y-4">
            {/* Question - large and prominent */}
            <h2 className="text-lg font-semibold text-center">
              How well do you feel you understand {checkerName}?
            </h2>

            {/* Rating scale with anchors above */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground px-1">
                <span>Not at all</span>
                <span>Perfectly</span>
              </div>
              <div className="flex justify-center">
                <RatingButtons selectedValue={null} onSelect={onRatingSubmit} />
              </div>
            </div>

            {/* Decline - clearly a button, not a label */}
            <div className="flex justify-center pt-4">
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
}

function WaitingScreen({
  partnerName,
  liveState,
  isChecker,
  myRating,
  onBackToIdle,
  onToggleMode,
}: WaitingScreenProps) {

  const displayPartnerName = capitalizeName(partnerName);
  const checkerName = liveState.checkerName ? capitalizeName(liveState.checkerName) : '';

  // Waiting message based on role - short
  const waitingMessage = isChecker
    ? `Waiting for ${displayPartnerName}...`
    : `Waiting for ${checkerName}...`;

  // Label for "Your rating" card - consistent "feel" language
  const myRatingLabel = isChecker
    ? <><b className="text-foreground">You feel</b> {displayPartnerName} understands you:</>
    : <><b className="text-foreground">You feel</b> you understand {checkerName}:</>;

  return (
    <div className="flex flex-col h-full">
      <LiveHeader partnerName={partnerName} />

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
      <LiveHeader partnerName={partnerName} />

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
                Move on
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
      <LiveHeader partnerName={partnerName} />

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
// EXPLAIN-BACK SCREEN - Responder explains, checker rates
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
}: ExplainBackScreenProps) {
  const displayPartnerName = capitalizeName(partnerName);
  const checkerName = liveState.checkerName ? capitalizeName(liveState.checkerName) : '';

  const roundLabel = liveState.explainBackRound > 0
    ? ` (round ${liveState.explainBackRound + 1})`
    : '';

  return (
    <div className="flex flex-col h-full">
      <LiveHeader partnerName={partnerName} />

      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6">
        {isChecker ? (
          <>
            <div className="text-center space-y-4">
              <p className="text-lg font-medium">
                Waiting for {displayPartnerName} to explain back...{roundLabel}
              </p>

              <div className="bg-muted rounded-lg p-4 space-y-3">
                <RatingDisplay
                  label={<><b className="text-foreground">You feel</b> {displayPartnerName} understands you:</>}
                  rating={checkerRating ?? 0}
                />
                <RatingDisplay
                  label={<><b className="text-foreground">{displayPartnerName} feels</b> they understand you:</>}
                  rating={responderRating ?? 0}
                />
              </div>
            </div>

            {/* Rating card - consistent with RatingScreen */}
            <div className="bg-muted rounded-lg p-4 space-y-4 w-full max-w-sm">
              <h2 className="text-lg font-semibold text-center">
                How much does <b>{displayPartnerName}</b> actually understand you?
              </h2>
              <div className="pt-2 border-t space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground px-1">
                  <span>Not at all</span>
                  <span>Perfectly</span>
                </div>
                <div className="flex justify-center">
                  <RatingButtons selectedValue={null} onSelect={onExplainBackRate} />
                </div>
              </div>
            </div>

            <Button variant="outline" size="sm" onClick={onSkip} className="text-muted-foreground">
              Skip
            </Button>
          </>
        ) : (
          <>
            <div className="text-center space-y-4">
              <p className="text-lg font-medium">Please explain back...{roundLabel}</p>

              <div className="bg-muted rounded-lg p-4 space-y-3">
                <RatingDisplay
                  label={<><b className="text-foreground">{checkerName} feels</b> you understand them:</>}
                  rating={checkerRating ?? 0}
                />
                <RatingDisplay
                  label={<><b className="text-foreground">You feel</b> you understand {checkerName}:</>}
                  rating={responderRating ?? 0}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <p className="text-sm text-muted-foreground">
                Waiting for {checkerName} to re-rate...
              </p>
            </div>

            <Button variant="outline" size="sm" onClick={onSkip} className="text-muted-foreground">
              Skip
            </Button>
          </>
        )}
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
}: ResultsScreenProps) {

  const displayPartnerName = capitalizeName(partnerName);
  const checkerName = liveState.checkerName ? capitalizeName(liveState.checkerName) : '';

  // Button label for listener (responder) - "again" if there have been previous rounds
  const buttonLabel = liveState.explainBackRatings.length > 0
    ? 'Explain back what I heard again'
    : 'Explain back what I heard';

  return (
    <div className="flex flex-col h-full">
      <LiveHeader partnerName={partnerName} />

      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6">
        <div className="text-center space-y-4">
          <h2 className="text-lg font-semibold">Journey to Understanding</h2>

          <div className="bg-muted rounded-lg p-4">
            {/* Timeline layout: round labels left, ratings right */}
            <div className="space-y-3">
              {/* Initial round */}
              <div className="flex gap-4">
                <div className="w-16 shrink-0 text-xs text-muted-foreground pt-0.5">Initial</div>
                <div className="flex-1 space-y-1">
                  <RatingDisplay
                    label={isChecker
                      ? <><b className="text-foreground">{checkerName} feels</b> understood:</>
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

              {/* Explain-back rounds */}
              {liveState.explainBackRatings.map((rating, index) => (
                <div key={index} className="flex gap-4 pt-2 border-t">
                  <div className="w-16 shrink-0 text-xs text-muted-foreground pt-0.5">Round {index + 1}</div>
                  <div className="flex-1">
                    <RatingDisplay
                      label={isChecker
                        ? <><b className="text-foreground">{checkerName} feels</b> understood:</>
                        : <><b className="text-foreground">{checkerName} feels</b> understood:</>
                      }
                      rating={rating}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
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
                Move on
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
          className="h-8 px-4 text-sm font-medium border-gray-300 hover:bg-gray-100"
        >
          History
        </Button>
      </div>
    </div>
  );
}
