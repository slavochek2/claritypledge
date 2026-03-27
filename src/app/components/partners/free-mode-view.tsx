/**
 * @file free-mode-view.tsx
 * @description P562: Free mode phase engine — renders the correct UI for each FreePhase.
 *
 * Phases: sealed-bid → waiting → reveal → paraphrase → unlocked → success/exit
 *
 * This component runs parallel to guided mode's rendering in LiveModeView.
 * When liveState.sessionMode === 'free' and a round is active, LiveModeView
 * renders this instead of the guided-mode phases.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import type { LiveSessionState, FreePhase, FreeRoundRecord } from '@/app/types';
import { getFirstName, RatingButtons } from './shared';
import { SliderTrack } from './slider-track';
import { FreeModeSuccess } from './free-mode-success';
import { LiveStoryCardExpanded } from './live-story-card-expanded';
import type { StoryWithPoints } from '@/app/types';

// ── DotBar helper ────────────────────────────────────────────────────────────

function DotBar({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-px text-xs tracking-tight">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={i < value ? 'text-foreground' : 'text-gray-300'}>●</span>
      ))}
    </span>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface FreeModeViewProps {
  liveState: LiveSessionState;
  partnerName: string;
  /** Whether current user is the session creator */
  isCreator: boolean;
  /** Current user's name */
  currentUserName: string;
  /** Submit sealed bid rating */
  onSealedBidSubmit: (rating: number) => void;
  /** Listener clicks "I paraphrased" */
  onParaphraseDone: () => void;
  /** Slider value changed (debounced write to live_state) */
  onSliderChange: (value: number) => void;
  /** "Speak freely" — exit round, return to entry */
  onSpeakFreely: () => void;
  /** Round completed with 10/10 — write verification + return to success */
  onRoundComplete: () => void;
  /** "Discuss another story" from success screen */
  onDiscussAnother: () => void;
  /** "End session" from success screen */
  onEndSession: () => void;
  /** Story title for success screen */
  storyTitle?: string;
  /** Selected story to display during the round */
  selectedStory?: StoryWithPoints | null;
}

// ── FreeModeView ─────────────────────────────────────────────────────────────

export function FreeModeView({
  liveState,
  partnerName,
  isCreator,
  currentUserName: _currentUserName,
  onSealedBidSubmit,
  onParaphraseDone,
  onSliderChange,
  onSpeakFreely,
  onRoundComplete,
  onDiscussAnother,
  onEndSession,
  storyTitle,
  selectedStory,
}: FreeModeViewProps) {
  const displayPartnerName = getFirstName(partnerName);
  const freePhase = liveState.freePhase as FreePhase;

  // Determine role: checker = speaker (initiated the round), responder = listener
  const isChecker = liveState.checkerIsCreator === isCreator;

  // Local slider value for immediate feedback
  const [localSliderValue, setLocalSliderValue] = useState(0);
  // Sealed-bid uses 0-10 buttons (same as guided mode), not slider
  const [selectedRating, setSelectedRating] = useState<number | null>(null);

  // Sync local slider with sealed-bid value when entering unlocked phase
  const prevPhaseRef = useRef<FreePhase | undefined>();
  useEffect(() => {
    if (freePhase === 'unlocked' && prevPhaseRef.current !== 'unlocked') {
      // Initialize to sealed-bid value
      const mySealed = isChecker
        ? (liveState.checkerRating ?? 0)
        : (liveState.responderRating ?? 0);
      setLocalSliderValue(mySealed);
    }
    prevPhaseRef.current = freePhase;
  }, [freePhase, isChecker, liveState.checkerRating, liveState.responderRating]);

  // ── 10/10 detection + 2-second hold timer (AD-4) ──────────────────────

  const holdTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const mySliderValue = isCreator ? liveState.freeSliderCreator : liveState.freeSliderJoiner;
  const partnerSliderValue = isCreator ? liveState.freeSliderJoiner : liveState.freeSliderCreator;

  // Use local value for own slider in unlocked phase (more responsive)
  const effectiveMyValue = freePhase === 'unlocked' ? localSliderValue : (mySliderValue ?? 0);
  const effectivePartnerValue = partnerSliderValue ?? 0;
  const bothAtTen = effectiveMyValue === 10 && effectivePartnerValue === 10;
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    if (freePhase !== 'unlocked') {
      setShowCelebration(false);
      return;
    }

    if (bothAtTen) {
      setShowCelebration(true);
      holdTimerRef.current = setTimeout(() => {
        onRoundComplete();
      }, 2000);
    } else {
      setShowCelebration(false);
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = undefined;
      }
    }

    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, [bothAtTen, freePhase, onRoundComplete]);

  // ── Reveal auto-transition (1.5s → paraphrase) ────────────────────────
  // NOTE: This is handled by the parent (clarity-live-page) writing the phase transition.
  // The auto-transition is driven by the phase setter, not by this component.

  // ── Derived values ─────────────────────────────────────────────────────

  const rounds: FreeRoundRecord[] = liveState.freeRounds ?? [];

  // Sealed bid values for reveal display
  const listenerConfidence = isChecker
    ? (liveState.responderRating ?? 0)
    : (liveState.checkerRating ?? 0);
  const speakerBelief = isChecker
    ? (liveState.checkerRating ?? 0)
    : (liveState.responderRating ?? 0);

  // Live values for Journey in unlocked phase
  const liveListenerConfidence = isChecker ? effectivePartnerValue : effectiveMyValue;
  const liveSpeakerBelief = isChecker ? effectiveMyValue : effectivePartnerValue;

  const gap = Math.abs(listenerConfidence - speakerBelief);

  // Question text based on role
  const questionText = isChecker
    ? <>How well do you believe <span className="font-semibold">{displayPartnerName}</span> understands your intention?</>
    : <>How well do you believe you understand <span className="font-semibold">{displayPartnerName}</span>&apos;s intention?</>;

  // ── Sealed bid handler ─────────────────────────────────────────────────

  const handleSealedSubmit = useCallback(() => {
    if (selectedRating === null) return;
    onSealedBidSubmit(selectedRating);
  }, [onSealedBidSubmit, selectedRating]);

  // ── Debounced slider change for unlocked mode ──────────────────────────

  const handleDebouncedSliderChange = useCallback((value: number) => {
    onSliderChange(value);
  }, [onSliderChange]);

  // ── Success phase ──────────────────────────────────────────────────────

  if (freePhase === 'success') {
    return (
      <FreeModeSuccess
        partnerName={displayPartnerName}
        isChecker={isChecker}
        rounds={rounds}
        storyTitle={storyTitle}
        onDiscussAnother={onDiscussAnother}
        onEndSession={onEndSession}
      />
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  const showJourney = freePhase === 'reveal' || freePhase === 'paraphrase' || freePhase === 'unlocked';
  const showGapBadge = freePhase === 'reveal' || freePhase === 'paraphrase';

  return (
    <div className="flex flex-col min-h-[calc(100vh-120px)]">
      {/* Main content area — Journey + gap badge */}
      <div className="flex-1 flex flex-col justify-end px-4 pt-4">
        <div className="space-y-3 mb-4 max-w-sm mx-auto w-full">

          {/* Story card (if selected) */}
          {selectedStory && (
            <LiveStoryCardExpanded
              story={selectedStory}
              isOwnStory={isChecker}
              isGuest={false}
              className="w-full max-w-sm mb-2"
              defaultExpanded={false}
            />
          )}

          {/* Journey to Understand */}
          {showJourney && (
            <div className="bg-muted/50 border border-border rounded-lg p-4 text-left">
              <p className="text-sm text-muted-foreground text-center mb-3">
                {isChecker
                  ? <>{displayPartnerName}&apos;s journey to <span className="font-semibold text-foreground">understand you</span></>
                  : <>Your journey to <span className="font-semibold text-foreground">understand {displayPartnerName}</span></>
                }
              </p>

              {/* Committed rounds */}
              {rounds.map((round, i) => (
                <div key={i} className="space-y-1 mb-2 pb-2 border-b border-border/50 last:border-0 last:mb-0 last:pb-0">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground w-4 text-right mr-2">{round.label}</span>
                    <span className="text-muted-foreground flex-1">
                      {isChecker ? `${displayPartnerName}'s confidence` : 'Your confidence'}
                    </span>
                    <DotBar value={round.listenerConfidence} />
                    <span className="font-medium tabular-nums w-6 text-right ml-1">{round.listenerConfidence}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="w-4 mr-2" />
                    <span className="font-semibold text-foreground flex-1">
                      {isChecker ? 'Your belief' : `${displayPartnerName}'s belief`}
                    </span>
                    <DotBar value={round.speakerBelief} />
                    <span className="font-medium tabular-nums w-6 text-right ml-1">{round.speakerBelief}</span>
                  </div>
                </div>
              ))}

              {/* Sealed bid display (reveal/paraphrase — before rounds are committed) */}
              {(freePhase === 'reveal' || freePhase === 'paraphrase') && rounds.length === 0 && (
                <div className="space-y-1 mb-2 pb-2 border-b border-border/50">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex-1">
                      {isChecker ? `${displayPartnerName}'s confidence` : 'Your confidence'}
                    </span>
                    <DotBar value={listenerConfidence} />
                    <span className="font-medium tabular-nums w-6 text-right ml-1">{listenerConfidence}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-foreground flex-1">
                      {isChecker ? 'Your belief' : `${displayPartnerName}'s belief`}
                    </span>
                    <DotBar value={speakerBelief} />
                    <span className="font-medium tabular-nums w-6 text-right ml-1">{speakerBelief}</span>
                  </div>
                </div>
              )}

              {/* Live-updating row (unlocked phase) */}
              {freePhase === 'unlocked' && (
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex-1">
                      {isChecker ? `${displayPartnerName}'s confidence` : 'Your confidence'}
                    </span>
                    <DotBar value={liveListenerConfidence} />
                    <span className="font-medium tabular-nums w-6 text-right ml-1">{liveListenerConfidence}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-foreground flex-1">
                      {isChecker ? 'Your belief' : `${displayPartnerName}'s belief`}
                    </span>
                    <DotBar value={liveSpeakerBelief} />
                    <span className="font-medium tabular-nums w-6 text-right ml-1">{liveSpeakerBelief}</span>
                  </div>
                </div>
              )}

              {/* Both at 10 celebration */}
              {showCelebration && (
                <div className="text-center py-2 animate-pulse">
                  <span className="text-green-600 font-serif text-sm">Both at 10</span>
                </div>
              )}
            </div>
          )}

          {/* Gap badge (reveal/paraphrase only per UI Contract) */}
          {showGapBadge && (
            <div className="text-center py-2">
              {listenerConfidence === 10 && speakerBelief === 10 ? (
                <span className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1 animate-pulse">
                  Both at 10
                </span>
              ) : gap <= 1 ? (
                <span className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1">
                  Well calibrated!
                </span>
              ) : (
                <>
                  <span className="inline-block text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-3 py-1 mb-2">
                    {gap} {gap === 1 ? 'point' : 'points'} gap
                  </span>
                  <p className="text-sm font-medium text-foreground">
                    Help {isChecker ? displayPartnerName : 'yourself'} understand {isChecker ? 'you' : displayPartnerName} better.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Drawer ─────────────────────────────────────────────────── */}
        <div className="bg-muted/30 border-t border-border rounded-t-2xl px-6 pt-5 pb-6 -mx-4 mt-auto shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">

          {/* Phase: Sealed bid */}
          {freePhase === 'sealed-bid' && (
            <>
              <h3 className="text-base font-medium text-center mb-5">
                {questionText}
              </h3>
              <div className="flex flex-col items-center space-y-3">
                <div className="flex justify-between text-xs text-muted-foreground w-full max-w-sm">
                  <span>Not at all</span>
                  <span>Complete cognitive understanding</span>
                </div>
                <RatingButtons selectedValue={selectedRating} onSelect={setSelectedRating} />
                <Button
                  size="sm"
                  onClick={handleSealedSubmit}
                  className="bg-blue-500 hover:bg-blue-600 w-full max-w-[200px] mt-2"
                  disabled={selectedRating === null}
                >
                  Submit
                </Button>
                <button
                  onClick={onSpeakFreely}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors mt-6 mx-auto block min-h-[44px]"
                >
                  Speak freely
                </button>
              </div>
            </>
          )}

          {/* Phase: Waiting (submitted, partner hasn't) */}
          {freePhase === 'waiting' && (
            <div className="text-center py-8">
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <p className="text-sm text-muted-foreground">
                  Waiting for <span className="font-semibold">{displayPartnerName}</span> to submit...
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Your answer: {isChecker ? liveState.checkerRating : liveState.responderRating}/10
              </p>
            </div>
          )}

          {/* Phase: Reveal (auto-transitions to paraphrase after 1.5s) */}
          {freePhase === 'reveal' && (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground">Initial guesses revealed</p>
            </div>
          )}

          {/* Phase: Paraphrase */}
          {freePhase === 'paraphrase' && (
            <div className="text-center">
              {!isChecker ? (
                // Listener view
                <>
                  <p className="text-base font-medium mb-4">
                    Paraphrase what you understood back to <span className="font-semibold">{displayPartnerName}</span>
                  </p>
                  <Button
                    onClick={onParaphraseDone}
                    className="w-full bg-blue-500 hover:bg-blue-600"
                  >
                    I paraphrased
                  </Button>
                </>
              ) : (
                // Speaker view
                <>
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                    <p className="text-sm text-muted-foreground">
                      Waiting for <span className="font-semibold">{displayPartnerName}</span> to paraphrase...
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">Listen carefully to their explanation</p>
                </>
              )}
            </div>
          )}

          {/* Phase: Unlocked (continuous slider) */}
          {freePhase === 'unlocked' && (
            <>
              <h3 className="text-base font-medium text-center mb-5">
                {questionText}
              </h3>
              <div className="flex justify-between mb-1 text-xs text-gray-500">
                <span>Not at all</span>
                <span>Complete cognitive understanding</span>
              </div>
              <div className="px-2">
                <SliderTrack
                  value={localSliderValue}
                  onChange={setLocalSliderValue}
                  onDebouncedChange={handleDebouncedSliderChange}
                />
              </div>
              <button
                onClick={onSpeakFreely}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors mt-8 mx-auto block min-h-[44px]"
              >
                Speak freely
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
