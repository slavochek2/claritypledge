/**
 * @file free-mode-view.tsx
 * @description P562: Free mode unlocked slider phase + success screen.
 *
 * The structured start (sealed-bid → reveal → explain-back → speaker re-rates)
 * is handled by guided mode's existing state machine. FreeModeView takes over
 * ONLY after the first guided round completes — when handleCelebrationComplete
 * sets freePhase: 'unlocked'.
 *
 * Phases handled here: unlocked → success
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { LiveSessionState, FreePhase, FreeRoundRecord } from '@/app/types';
import { getFirstName } from './shared';
import { SliderTrack } from './slider-track';
import { FreeModeSuccess } from './free-mode-success';
import { LiveStoryCardExpanded } from './live-story-card-expanded';
import type { StoryWithPoints } from '@/app/types';

// ── DotBar helper ────────────────────────────────────────────────────────────

function DotBar({ value, filledClass = 'text-foreground' }: { value: number; filledClass?: string }) {
  return (
    <span className="inline-flex gap-px text-xs tracking-tight">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={i < value ? filledClass : 'text-gray-300'}>●</span>
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
  /** Slider value changed (debounced write to live_state) */
  onSliderChange: (value: number) => void;
  /** "Speak freely" — exit round, return to entry */
  onSpeakFreely: () => void;
  /** Round completed with 10/10 — write verification + return to success */
  onRoundComplete: () => void;
  /** "Continue" from success screen (dual-ack pattern) */
  onDiscussAnother: () => void;
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
  onSliderChange,
  onSpeakFreely,
  onRoundComplete,
  onDiscussAnother,
  storyTitle,
  selectedStory,
}: FreeModeViewProps) {
  const displayPartnerName = getFirstName(partnerName);
  const freePhase = liveState.freePhase as FreePhase;

  // Determine role: checker = speaker (initiated the round), responder = listener
  const isChecker = liveState.checkerIsCreator === isCreator;

  // Local slider value for immediate feedback
  const [localSliderValue, setLocalSliderValue] = useState(0);

  // Initialize slider from the last committed rating when entering unlocked phase
  const prevPhaseRef = useRef<FreePhase | undefined>();
  useEffect(() => {
    if (freePhase === 'unlocked' && prevPhaseRef.current !== 'unlocked') {
      const myValue = isCreator ? liveState.freeSliderCreator : liveState.freeSliderJoiner;
      setLocalSliderValue(myValue ?? 0);
    }
    prevPhaseRef.current = freePhase;
  }, [freePhase, isCreator, liveState.freeSliderCreator, liveState.freeSliderJoiner]);

  // ── 10/10 detection + 2-second hold timer (AD-4) ──────────────────────

  const holdTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const partnerSliderValue = isCreator ? liveState.freeSliderJoiner : liveState.freeSliderCreator;
  const effectivePartnerValue = partnerSliderValue ?? 0;
  const bothAtTen = localSliderValue === 10 && effectivePartnerValue === 10;
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

  // ── Derived values ─────────────────────────────────────────────────────

  const rounds: FreeRoundRecord[] = liveState.freeRounds ?? [];
  const liveListenerConfidence = isChecker ? effectivePartnerValue : localSliderValue;
  const liveSpeakerBelief = isChecker ? localSliderValue : effectivePartnerValue;

  const questionText = isChecker
    ? <>How well do you believe <span className="font-semibold">{displayPartnerName}</span> understands your intention?</>
    : <>How well do you believe you understand <span className="font-semibold">{displayPartnerName}</span>&apos;s intention?</>;

  const handleDebouncedSliderChange = useCallback((value: number) => {
    onSliderChange(value);
  }, [onSliderChange]);

  // ── Success phase ──────────────────────────────────────────────────────

  if (freePhase === 'success') {
    // P592: Dual-ack — show waiting state if I already clicked but partner hasn't
    const myAck = isCreator
      ? liveState.celebrationAcknowledgedByCreator === true
      : liveState.celebrationAcknowledgedByJoiner === true;

    return (
      <FreeModeSuccess
        partnerName={displayPartnerName}
        isChecker={isChecker}
        rounds={rounds}
        storyTitle={storyTitle}
        onContinue={onDiscussAnother}
        isWaiting={myAck}
      />
    );
  }

  // ── Unlocked phase (the only active rendering phase) ───────────────────

  return (
    <div className="flex flex-col min-h-[calc(100vh-120px)]">
      <div className="flex-1 flex flex-col justify-end px-4 pt-4">
        <div className="space-y-3 mb-4 max-w-sm mx-auto w-full">

          {/* P600: Journey FIRST, story SECOND (same fix as P400 Bug 3 in guided mode) */}

          {/* Journey to Understand — committed rounds + live row */}
          <div className="bg-muted/50 border border-border rounded-lg p-4 text-left">
            <p className="text-sm text-muted-foreground text-center mb-3">
              {isChecker
                ? <>{displayPartnerName}&apos;s journey to <span className="font-semibold text-foreground">understand you</span></>
                : <>Your journey to <span className="font-semibold text-foreground">understand {displayPartnerName}</span></>
              }
            </p>

            {/* Committed rounds from guided mode first round */}
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

            {/* Live-updating row — blue dots to distinguish from committed rounds */}
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex-1">
                  {isChecker ? `${displayPartnerName}'s confidence` : 'Your confidence'}
                </span>
                <DotBar value={liveListenerConfidence} filledClass="text-blue-500" />
                <span className="font-medium tabular-nums w-6 text-right ml-1">{liveListenerConfidence}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground flex-1">
                  {isChecker ? 'Your belief' : `${displayPartnerName}'s belief`}
                </span>
                <DotBar value={liveSpeakerBelief} filledClass="text-blue-500" />
                <span className="font-medium tabular-nums w-6 text-right ml-1">{liveSpeakerBelief}</span>
              </div>
            </div>

            {/* Both at 10 celebration */}
            {showCelebration && (
              <div className="text-center py-2 animate-pulse">
                <span className="text-green-600 font-serif text-sm">Both at 10</span>
              </div>
            )}
          </div>

          {/* Story card (if selected) — rendered AFTER Journey */}
          {selectedStory && (
            <LiveStoryCardExpanded
              story={selectedStory}
              isOwnStory={isChecker}
              isGuest={false}
              className="w-full max-w-sm mb-2"
              defaultExpanded={false}
            />
          )}
        </div>

        {/* Drawer — continuous slider */}
        <div className="bg-muted/30 border-t border-border rounded-t-2xl px-6 pt-5 pb-6 -mx-4 mt-auto shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
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
        </div>
      </div>
    </div>
  );
}
