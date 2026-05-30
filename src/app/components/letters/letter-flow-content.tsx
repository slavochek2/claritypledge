/**
 * @file letter-flow-content.tsx
 * @description P696 T10+T13+T14+T15: Shared phase-rendering component for all 3 letter flow
 * variants (receiver reading page, preview, public one-to-many).
 *
 * Features:
 * - T10: Pure structural extraction — handles all 6 phases + completion
 * - T13: Drawer-everywhere — every action phase uses a bottom-docked Drawer
 * - T14: PositionSelector in Drawer for point-engage phases; 400ms reveal delay
 * - T15: Semantic button labels; PointRow (revealed=true) for point-revealed phases (P711)
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Ear } from 'lucide-react';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { LetterProgressBar } from '@/app/components/letters/letter-progress-bar';
import { LetterPointCard } from '@/app/components/letters/letter-point-card';
import { LetterPrimaryCta } from '@/app/components/letters/letter-primary-cta';
import { LetterRevealCard } from '@/app/components/letters/letter-reveal-card';
import { LetterRevealOrdinal } from '@/app/components/letters/letter-reveal-ordinal';
import { LetterRevealNumeric } from '@/app/components/letters/letter-reveal-numeric';
import { GapBanner } from '@/app/components/shared/gap-banner';
import { LiveStoryCardExpanded } from '@/app/components/partners/live-story-card-expanded';
import { ComprehensionRatingCard } from '@/app/components/shared/comprehension-rating-card';
import { PositionButtons } from '@/app/components/shared/PositionButton';
import { RemovePositionDialog, useRemovePositionGuard } from '@/app/components/shared/remove-position-dialog';
import type { PointProfileOwner } from '@/app/components/social/point-card-with-links';
import type { UseLetterReadingStateReturn, StoryPhase } from '@/app/hooks/useLetterReadingState';
import { snapshotToStoryWithPoints } from '@/app/utils/letter-snapshot-mapper';
import { FixedBottomBar } from '@/app/components/shared/fixed-bottom-bar';
import { ZERO_COUNTS } from '@/app/utils/position-helpers';
import { useAuth } from '@/auth';
import { analytics } from '@/lib/mixpanel';
import type { LetterStorySnapshot, PositionType } from '@/app/types';
import { POSITION_VALUES } from '@/app/types';

type RevealStageType = 'anti-point' | 'story' | 'point';

// ============================================================================
// TYPES
// ============================================================================

export interface LetterFlowContentProps {
  // Data
  snapshots: LetterStorySnapshot[];
  senderName: string;
  senderProfileOwner: PointProfileOwner;
  /** P852 Phase-3: reader's own profile — sources the reader avatar + pledge ring
   *  on reveal screens so the reader sees their own Google photo (not initials).
   *  Optional: omit for unauthenticated flows (renders initials, no ring). */
  readerProfileOwner?: PointProfileOwner;
  // State machine (from useLetterReadingState)
  readingState: UseLetterReadingStateReturn;
  // Variant configuration
  /** When false, parent already provides a header (e.g. preview amber banner) */
  showFocusHeader: boolean;
  /** Sign-in prompt for authed reading; undefined for others. Replaces Drawer in story-rate. */
  authGateAtStoryRate?: ReactNode;
  // Completion
  /** Each variant provides its own completion JSX */
  renderCompletion: () => ReactNode;
  // Optional analytics
  onStoryRated?: (index: number, rating: number) => void;
  /** P711: Post-reveal position writes — calls pointsService.setPosition directly (does not transition phase).
   * Omit in preview (no writes) and public/local modes. */
  onLivePositionChange?: (pointId: string, position: PositionType | null) => void;
}

// ============================================================================
// REVEAL PHASES CONSTANT
// ============================================================================

const REVEAL_PHASES: StoryPhase[] = [
  'point-revealed',
  'story-revealed',
  'remaining-point-revealed',
];

const ENGAGE_PHASES: StoryPhase[] = [
  'point-engage',
  'story-rate',
  'remaining-point-engage',
];

/**
 * P852: Discoverability hint for PositionButtons' tap-again intensity menu.
 * Reserved line height (always rendered, opacity-toggled) avoids layout shift
 * when the position-selection state changes — the LetterPointCard above stays put.
 * /80 + ChevronDown prefix signals "tap reveals more" without escalating to a
 * directive that nudges intensity re-deliberation pre-commit (docs/decisions.md:57).
 */
function FineTuneHint({ visible }: { visible: boolean }) {
  return (
    <p
      aria-hidden={!visible}
      className={`text-sm text-[#1A1A1A]/80 flex items-center justify-center gap-1.5 mt-3 transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <ChevronDown className="w-4 h-4" aria-hidden="true" />
      Tap again to refine intensity.
    </p>
  );
}

// Committed steps = how many engage→reveal pairs have completed in the current chapter.
// Drives the progress bar tick fill-on-commit behavior.
function getCommittedSteps(phase: StoryPhase, pointIndex: number, pointCount: number): number {
  if (pointCount >= 2) {
    switch (phase) {
      case 'point-engage':             return 0;
      case 'point-revealed':           return 1;
      case 'story-rate':               return 1;
      case 'story-revealed':           return 2;
      case 'remaining-point-engage':   return 2 + (pointIndex - 1);
      case 'remaining-point-revealed': return 2 + pointIndex;
      default:                         return 0;
    }
  }
  if (pointCount === 1) {
    switch (phase) {
      case 'story-rate':               return 0;
      case 'story-revealed':           return 1;
      case 'remaining-point-engage':   return 1;
      case 'remaining-point-revealed': return 2;
      default:                         return 0;
    }
  }
  // 0 visible points — story-only chapter
  return phase === 'story-revealed' ? 1 : 0;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function LetterFlowContent({
  snapshots,
  senderName,
  senderProfileOwner,
  readerProfileOwner,
  readingState,
  showFocusHeader,
  authGateAtStoryRate,
  renderCompletion,
  onStoryRated,
  onLivePositionChange: _onLivePositionChange, // P852: post-reveal position editing removed in new design
}: LetterFlowContentProps) {
  const { state, currentPhase, submitPointPosition, submitStoryRating, advanceFromPointReveal,
    advanceFromStoryReveal, advanceFromRemainingPointReveal, isSubmitting } = readingState;

  // P852 Phase-3: shorter author display in all in-flow contexts (reveal cards,
  // CTAs, story-rate question, story card byline). Full name lives only on the
  // cover's identity row. "Read Vyacheslav's story" reads cleaner than the
  // full surname version. First-token split is good enough for current data.
  const firstName = senderName.split(' ')[0];

  const { session } = useAuth();

  // P847: Wire onClear once at page level. Guard is shared across both
  // revealed-phase PointRow renders (point-revealed and remaining-point-revealed).
  // useRemovePositionGuard.handleConfirm supports multi-entry via pendingPointId.
  //
  // Visual sync: the cleared position lives in point_positions (live profile),
  // not point_responses (the letter response mirrored in
  // useLetterReadingState.state.stories[].positions). The receiver-response
  // prop driving PointRow's userPosition never refreshes on a live-profile
  // change. Track the user's latest live intent locally and override the
  // userPosition prop with it. Overrides are set on confirmed clear
  // (onAfterRemove) and on every revealed-phase position selection. Missing
  // key = fall back to the response. Dialog cancel leaves the map untouched
  // so the highlight is unchanged.
  const [livePositions, setLivePositions] = useState<Map<string, PositionType | null>>(
    () => new Map(),
  );
  const { dialogProps } = useRemovePositionGuard({
    userId: session?.user?.id ?? '',
    onAfterRemove: (pointId) => {
      setLivePositions((prev) => new Map(prev).set(pointId, null));
    },
  });

  const resolveRevealedUserPosition = useCallback(
    (pointId: string): PositionType | null => {
      if (livePositions.has(pointId)) {
        return livePositions.get(pointId) ?? null;
      }
      return (state.stories[state.currentStoryIndex]?.positions[pointId] ?? null) as PositionType | null;
    },
    [livePositions, state.currentStoryIndex, state.stories],
  );

  // ── Local state ────────────────────────────────────────────────────────────

  /** Position selected in the Drawer PositionSelector for engage phases */
  const [selectedPosition, setSelectedPosition] = useState<PositionType | null>(null);

  /** Controls opacity transition for reveal-phase advance button */
  const [showAdvanceButton, setShowAdvanceButton] = useState(false);

  /**
   * Tracks whether we're resuming into a reveal phase (no delay needed)
   * vs. entering it fresh via a transition (400ms delay).
   */
  const isInitialTransitionRef = useRef(false);

  // ── 400ms delayed button (T14 — AD3) ──────────────────────────────────────

  useEffect(() => {
    if (REVEAL_PHASES.includes(currentPhase)) {
      if (isInitialTransitionRef.current) {
        // Resume after nav-away — no delay
        setShowAdvanceButton(true);
      } else {
        isInitialTransitionRef.current = true;
        setShowAdvanceButton(false);
        const timer = setTimeout(() => setShowAdvanceButton(true), 400);
        return () => clearTimeout(timer);
      }
    } else {
      isInitialTransitionRef.current = false;
      setShowAdvanceButton(false);
    }
  }, [currentPhase]);

  // ── Reset position when phase changes ────────────────────────────────────

  useEffect(() => {
    setSelectedPosition(null);
  }, [currentPhase, state.currentStoryIndex]);

  // ── Per-story derived values (nullable-safe so hooks below can run unconditionally) ──

  const currentSnapshot = snapshots[state.currentStoryIndex];
  const currentStory = state.stories[state.currentStoryIndex];

  // P852 Phase-3: the story-card byline (LiveStoryCardExpanded From-row) is
  // a stand-alone identity surface — render the full sender name there to match
  // the cover. In-flow CTAs/reveal labels still use firstName below for tone.
  const storyWithPoints = currentSnapshot
    ? snapshotToStoryWithPoints(currentSnapshot, {
        name: senderName,
        avatarUrl: senderProfileOwner.avatarUrl,
        avatarColor: senderProfileOwner.avatarColor,
        hasPledged: senderProfileOwner.hasPledged ?? false,
      })
    : null;
  const visiblePoints = storyWithPoints?.points ?? [];
  const currentPoint = currentStory ? visiblePoints[currentStory.currentPointIndex] : undefined;

  const gap =
    currentStory && currentStory.rating !== null && currentStory.prediction !== null
      ? Math.abs(currentStory.rating - currentStory.prediction)
      : null;

  const isFinalStory = state.currentStoryIndex === snapshots.length - 1;

  // P852: Progress bar — step-tick derivations
  const stepCount = Math.max(1, visiblePoints.length + 1);
  const committedSteps = currentStory
    ? getCommittedSteps(currentPhase, currentStory.currentPointIndex, visiblePoints.length)
    : 0;
  const isEngagePhase = ENGAGE_PHASES.includes(currentPhase);

  // ── P849: Reveal dwell instrumentation ────────────────────────────────────
  // Fires `letter_reveal_viewed` on phase exit (advance click OR unmount) with
  // the elapsed dwell. Cleanup runs when stageKey changes — that's the exit moment.
  const revealStageType: RevealStageType | null =
    currentPhase === 'point-revealed'
      ? 'anti-point'
      : currentPhase === 'story-revealed'
        ? 'story'
        : currentPhase === 'remaining-point-revealed'
          ? 'point'
          : null;

  const revealGap: number | null = (() => {
    if (!currentStory) return null;
    if (currentPhase === 'story-revealed') {
      if (currentStory.rating !== null && currentStory.prediction !== null) {
        return currentStory.rating - currentStory.prediction;
      }
      return null;
    }
    if (
      (currentPhase === 'point-revealed' || currentPhase === 'remaining-point-revealed') &&
      currentPoint
    ) {
      const readerPos = currentStory.positions[currentPoint.id] as PositionType | undefined;
      const authorPos = currentPoint.profileSubjectPosition as PositionType | null | undefined;
      if (readerPos && authorPos) {
        return POSITION_VALUES[readerPos] - POSITION_VALUES[authorPos];
      }
    }
    return null;
  })();

  const revealStageKey =
    `${state.currentStoryIndex}:${currentPhase}:${currentStory?.currentPointIndex ?? 0}`;
  const letterId = snapshots[0]?.letter_id ?? null;
  const stageIndex = state.currentStoryIndex + 1;

  useEffect(() => {
    if (!revealStageType || !letterId) return undefined;
    const start = Date.now();
    return () => {
      analytics.track('letter_reveal_viewed', {
        letter_id: letterId,
        stage_type: revealStageType,
        stage_index: stageIndex,
        time_to_next_click_ms: Date.now() - start,
        gap: revealGap,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- closure values are stable per stage; stageKey is the reset trigger
  }, [revealStageKey]);

  // Guard narrows storyWithPoints too — null only when currentSnapshot is falsy,
  // but TS can't propagate that narrowing across sibling variables.
  if (!currentSnapshot || !currentStory || !storyWithPoints) return null;

  // Completion — delegate to the variant
  if (state.isComplete) {
    return <>{renderCompletion()}</>;
  }

  // ── Submit handlers ───────────────────────────────────────────────────────

  const handleSubmitPosition = async () => {
    if (!selectedPosition || !currentPoint) return;
    await submitPointPosition(currentPoint.id, selectedPosition);
    setSelectedPosition(null);
  };

  const handleSubmitRating = async (rating: number) => {
    await submitStoryRating(rating);
    onStoryRated?.(state.currentStoryIndex, rating);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {showFocusHeader && (
        <FocusHeader onBack={() => window.history.back()} label="Leave letter" />
      )}

      {/* P848: position:fixed (not sticky) because [data-letter-scroll]
          (overflow-y-auto from P777) is not always the actually scrolling
          element — outer min-h-[100dvh] lets the page grow past viewport
          and the WINDOW scrolls instead. sticky in a non-scrolling
          overflow-auto container is a no-op.
          P852: bar moved to top-0 (the ClarityPledge brand nav is suppressed on
          letter routes in clarity-landing-layout.tsx). Browser back is the
          exit affordance — no in-bar Leave button (matches Kindle/Pocket pattern). */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-background py-3 border-b border-foreground/5">
        <div className="max-w-2xl mx-auto w-full px-4">
          <LetterProgressBar
            currentChapter={state.currentStoryIndex}
            totalChapters={snapshots.length}
            stepCount={stepCount}
            committedSteps={committedSteps}
            isEngagePhase={isEngagePhase}
          />
        </div>
      </div>

      {/* Spacer reserves the fixed bar's vertical footprint:
          py-3 (24px) + items-center row (max of text-sm label 20px, h-2.5 bar 10px = 20px)
          + border-b (1px) = 45px. h-14 (56px) for safety + breathing room below the bar. */}
      <div className="h-14" aria-hidden />

      {/* P852: vertical centering for the four short phases (point-engage,
          point-revealed, remaining-point-engage, remaining-point-revealed).
          story-rate and story-revealed stay top-aligned — tall content
          (LiveStoryCardExpanded on story-rate; the reveal stack on
          story-revealed) would clip above the viewport under flex-col
          justify-center. The fixed bar (~47px) + completion footer aren't part
          of in-flow content, so min-h-[calc(100dvh-150px)] gives breathing
          room without overflow. */}
      {(() => {
        const isShortPhase =
          currentPhase === 'point-engage' ||
          currentPhase === 'point-revealed' ||
          currentPhase === 'remaining-point-engage' ||
          currentPhase === 'remaining-point-revealed';
        const wrapperClass = isShortPhase
          ? 'max-w-2xl mx-auto w-full space-y-6 min-h-[calc(100dvh-200px)] flex flex-col justify-center'
          : 'max-w-2xl mx-auto w-full space-y-6 mt-4';
        return (
      <div className={wrapperClass}>

        {/* ── PHASE: point-engage ─────────────────────────────────────────── */}
        {currentPhase === 'point-engage' && currentPoint && (
          <>
            <LetterPointCard
              statement={currentPoint.statement}
              framingQuestion="To what extent do you agree?"
            >
              <PositionButtons
                userPosition={selectedPosition}
                counts={ZERO_COUNTS} // priming gate: never pass real counts pre-commit (Locked Decision 5)
                onPositionClick={(p) => setSelectedPosition(p)}
                onClear={() => setSelectedPosition(null)}
                size="lg"
              />
            </LetterPointCard>
            <FineTuneHint visible={selectedPosition !== null} />
            <FixedBottomBar>
              <LetterPrimaryCta
                label="Lock in your position"
                onClick={handleSubmitPosition}
                disabled={!selectedPosition || isSubmitting}
                icon="lock"
              />
            </FixedBottomBar>
          </>
        )}

        {/* ── PHASE: point-revealed ───────────────────────────────────────── */}
        {currentPhase === 'point-revealed' && currentPoint && (
          <>
            <LetterRevealCard>
              {currentPoint.profileSubjectPosition && resolveRevealedUserPosition(currentPoint.id) ? (
              <LetterRevealOrdinal
                readerPosition={resolveRevealedUserPosition(currentPoint.id) as PositionType}
                authorPosition={currentPoint.profileSubjectPosition as PositionType}
                statement={currentPoint.statement}
                authorName={firstName}
                authorPhotoUrl={senderProfileOwner.avatarUrl ?? undefined}
                authorAvatarColor={senderProfileOwner.avatarColor}
                authorHasPledged={senderProfileOwner.hasPledged ?? false}
                readerPhotoUrl={readerProfileOwner?.avatarUrl ?? undefined}
                readerAvatarColor={readerProfileOwner?.avatarColor ?? '#0044CC'}
                readerHasPledged={readerProfileOwner?.hasPledged ?? false}
              />
              ) : (
                <p className="text-sm text-[#1A1A1A]/50 text-center py-4">
                  Position data unavailable.
                </p>
              )}
            </LetterRevealCard>
            {showAdvanceButton && (
              <FixedBottomBar>
                <LetterPrimaryCta
                  label={`Read ${firstName}'s story`}
                  onClick={advanceFromPointReveal}
                  icon="arrow"
                />
              </FixedBottomBar>
            )}
          </>
        )}

        {/* ── PHASE: story-rate ───────────────────────────────────────────── */}
        {currentPhase === 'story-rate' && (
          <>
            <LiveStoryCardExpanded
              story={storyWithPoints}
              hidePoints
              readOnly
              className="w-full max-w-2xl mx-auto"
            />
            {authGateAtStoryRate ?? (
              // P852: story-rate scroll affordance — the story above scrolls behind
              // the rating drawer with no native scroll cue. Three cues, layered:
              //   (a) gradient fade above the drawer (signals "content continues above"),
              //   (b) upward shadow (separates the drawer as an elevated layer),
              //   (c) subtle pulsing ChevronDown above the drawer (names the action).
              // Scoped via className so other FixedBottomBar consumers stay unchanged.
              <FixedBottomBar className="shadow-[0_-4px_16px_-4px_rgba(0,0,0,0.10)] before:content-[''] before:absolute before:inset-x-0 before:-top-12 before:h-12 before:bg-gradient-to-t before:from-background before:to-transparent before:pointer-events-none">
                <ChevronDown
                  className="absolute -top-7 left-1/2 -translate-x-1/2 w-5 h-5 text-[#1A1A1A]/30 animate-pulse [animation-duration:2.5s] pointer-events-none"
                  aria-hidden="true"
                />
                <h2 className="sr-only">Rate this story</h2>
                <p className="sr-only">Rate how well you understood this story.</p>
                <ComprehensionRatingCard
                  question={`How well do you believe you understand ${firstName}'s intention behind their story?`}
                  questionClassName="text-xl font-semibold text-center"
                  onSelect={handleSubmitRating}
                  disabled={isSubmitting || currentStory.rating !== null}
                  submitLabel="Continue"
                  ctaClassName="bg-[#0044CC] hover:bg-[#0033AA] w-full max-w-sm mx-auto rounded-full font-bold text-base min-h-[56px] mt-3"
                />
              </FixedBottomBar>
            )}
          </>
        )}

        {/* ── PHASE: story-revealed ───────────────────────────────────────── */}
        {currentPhase === 'story-revealed' && (
          <>
            <LetterRevealCard>
              {currentStory.rating !== null && currentStory.prediction !== null ? (
                <div className="flex flex-col items-center gap-5 w-full">
                  {/* P852 Phase-3: stacked calibration — GapBanner names the verdict
                      ("/live" voice, handles gap=0 cleanly), LetterRevealNumeric
                      provides the 0-10 visualization (prediction vs. actual with
                      avatars). Banner above, scale below — both kept on purpose. */}
                  <p className="flex items-center justify-center gap-1.5 text-xs uppercase tracking-widest text-[#1A1A1A]/40 text-center">
                    <Ear className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                    Listening calibration
                  </p>
                  <GapBanner
                    gap={gap ?? 0}
                    senderName={firstName}
                    isOverconfident={currentStory.prediction < currentStory.rating}
                    className="w-full"
                  />
                  <LetterRevealNumeric
                    readerRating={currentStory.rating}
                    authorRating={currentStory.prediction}
                    gap={gap ?? 0}
                    authorName={firstName}
                    authorPhotoUrl={senderProfileOwner.avatarUrl ?? undefined}
                    authorAvatarColor={senderProfileOwner.avatarColor}
                    authorHasPledged={senderProfileOwner.hasPledged ?? false}
                    readerName={readerProfileOwner?.name ?? 'You'}
                    readerPhotoUrl={readerProfileOwner?.avatarUrl ?? undefined}
                    readerAvatarColor={readerProfileOwner?.avatarColor ?? '#0044CC'}
                    readerHasPledged={readerProfileOwner?.hasPledged ?? false}
                    compact
                  />
                </div>
              ) : (
                <p className="text-sm text-[#1A1A1A]/50 text-center py-4">
                  Calibration data unavailable.
                </p>
              )}
            </LetterRevealCard>
            {showAdvanceButton && (() => {
              const hasRemainingPoints = visiblePoints.length > 0;
              const storyRevealCta = hasRemainingPoints
                ? 'Next point'
                : isFinalStory
                  ? 'Complete Letter'
                  : 'Next chapter';
              return (
                <FixedBottomBar>
                  <LetterPrimaryCta
                    label={storyRevealCta}
                    onClick={advanceFromStoryReveal}
                    icon="arrow"
                  />
                </FixedBottomBar>
              );
            })()}
          </>
        )}

        {/* ── PHASE: remaining-point-engage ───────────────────────────────── */}
        {currentPhase === 'remaining-point-engage' && currentPoint && (
          <>
            <LetterPointCard
              statement={currentPoint.statement}
              framingQuestion="To what extent do you agree?"
            >
              <PositionButtons
                userPosition={selectedPosition}
                counts={ZERO_COUNTS} // priming gate: never pass real counts pre-commit (Locked Decision 5)
                onPositionClick={(p) => setSelectedPosition(p)}
                onClear={() => setSelectedPosition(null)}
                size="lg"
              />
            </LetterPointCard>
            <FineTuneHint visible={selectedPosition !== null} />
            <FixedBottomBar>
              <LetterPrimaryCta
                label="Lock in your position"
                onClick={handleSubmitPosition}
                disabled={!selectedPosition || isSubmitting}
                icon="lock"
              />
            </FixedBottomBar>
          </>
        )}

        {/* ── PHASE: remaining-point-revealed ─────────────────────────────── */}
        {currentPhase === 'remaining-point-revealed' && currentPoint && (
          <>
            <LetterRevealCard>
              {currentPoint.profileSubjectPosition && resolveRevealedUserPosition(currentPoint.id) ? (
              <LetterRevealOrdinal
                readerPosition={resolveRevealedUserPosition(currentPoint.id) as PositionType}
                authorPosition={currentPoint.profileSubjectPosition as PositionType}
                statement={currentPoint.statement}
                authorName={firstName}
                authorPhotoUrl={senderProfileOwner.avatarUrl ?? undefined}
                authorAvatarColor={senderProfileOwner.avatarColor}
                authorHasPledged={senderProfileOwner.hasPledged ?? false}
                readerPhotoUrl={readerProfileOwner?.avatarUrl ?? undefined}
                readerAvatarColor={readerProfileOwner?.avatarColor ?? '#0044CC'}
                readerHasPledged={readerProfileOwner?.hasPledged ?? false}
              />
              ) : (
                <p className="text-sm text-[#1A1A1A]/50 text-center py-4">
                  Position data unavailable.
                </p>
              )}
            </LetterRevealCard>
            {showAdvanceButton && (() => {
              const isLastPoint = currentStory.currentPointIndex === visiblePoints.length - 1;
              const remainingPointRevealCta = isFinalStory && isLastPoint
                ? 'Complete Letter'
                : isLastPoint
                  ? 'Next chapter'
                  : 'Next point';
              return (
                <FixedBottomBar>
                  <LetterPrimaryCta
                    label={remainingPointRevealCta}
                    onClick={advanceFromRemainingPointReveal}
                    icon="arrow"
                  />
                </FixedBottomBar>
              );
            })()}
          </>
        )}

      </div>
        );
      })()}

      <RemovePositionDialog {...dialogProps} />
    </>
  );
}
