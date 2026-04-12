/**
 * @file letter-flow-content.tsx
 * @description P696 T10+T13+T14+T15: Shared phase-rendering component for all 3 letter flow
 * variants (receiver reading page, preview, public one-to-many).
 *
 * Features:
 * - T10: Pure structural extraction — handles all 6 phases + completion
 * - T13: Drawer-everywhere — every action phase uses a bottom-docked Drawer
 * - T14: PositionSelector in Drawer for point-engage phases; 400ms reveal delay
 * - T15: Semantic button labels; PositionComparisonCard for point-revealed phases
 */

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { LetterProgressBar } from '@/app/components/letters/letter-progress-bar';
import { PositionComparisonCard } from '@/app/components/letters/position-comparison-card';
import { LiveStoryCardExpanded } from '@/app/components/partners/live-story-card-expanded';
import { JourneyToUnderstanding } from '@/app/components/partners/live-mode-view';
import { GapBanner } from '@/app/components/shared/gap-banner';
import { ComprehensionRatingCard } from '@/app/components/shared/comprehension-rating-card';
import { PointCardWithLinks } from '@/app/components/social/point-card-with-links';
import type { PointProfileOwner } from '@/app/components/social/point-card-with-links';
import type { Position } from '@/app/components/shared/prototype-types';
import { Button } from '@/components/ui/button';
import type { UseLetterReadingStateReturn, StoryPhase } from '@/app/hooks/useLetterReadingState';
import { snapshotToStoryWithPoints, pointSummaryToProtoPoint } from '@/app/utils/letter-snapshot-mapper';
import { calculateStoryProgress } from '@/app/utils/letter-reading-utils';
import type { LetterStorySnapshot, PositionType } from '@/app/types';

// ============================================================================
// TYPES
// ============================================================================

export interface LetterFlowContentProps {
  // Data
  snapshots: LetterStorySnapshot[];
  senderName: string;
  senderProfileOwner: PointProfileOwner;
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
}

// ============================================================================
// REVEAL PHASES CONSTANT
// ============================================================================

const REVEAL_PHASES: StoryPhase[] = [
  'point-revealed',
  'story-revealed',
  'remaining-point-revealed',
];

// ============================================================================
// COMPONENT
// ============================================================================

export function LetterFlowContent({
  snapshots,
  senderName,
  senderProfileOwner,
  readingState,
  showFocusHeader,
  authGateAtStoryRate,
  renderCompletion,
  onStoryRated,
}: LetterFlowContentProps) {
  const { state, currentPhase, submitPointPosition, submitStoryRating, advanceFromPointReveal,
    advanceFromStoryReveal, advanceFromRemainingPointReveal, nextStory, isSubmitting } = readingState;

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

  // ── Per-story derived values ──────────────────────────────────────────────

  const currentSnapshot = snapshots[state.currentStoryIndex];
  const currentStory = state.stories[state.currentStoryIndex];

  if (!currentSnapshot || !currentStory) return null;

  // Completion — delegate to the variant
  if (state.isComplete) {
    return <>{renderCompletion()}</>;
  }

  const storyWithPoints = snapshotToStoryWithPoints(currentSnapshot, {
    name: senderName,
    avatarUrl: senderProfileOwner.avatarUrl,
    avatarColor: senderProfileOwner.avatarColor,
    hasPledged: senderProfileOwner.hasPledged ?? false,
  });
  const visiblePoints = storyWithPoints.points;
  const currentPoint = visiblePoints[currentStory.currentPointIndex];

  const gap =
    currentStory.rating !== null && currentStory.prediction !== null
      ? Math.abs(currentStory.rating - currentStory.prediction)
      : null;

  const isOverconfident =
    currentStory.rating !== null && currentStory.prediction !== null
      ? currentStory.prediction > currentStory.rating
      : false;

  const storyProgress = calculateStoryProgress(
    currentPhase,
    currentStory.currentPointIndex,
    visiblePoints.length
  );

  const isFinalStory = state.currentStoryIndex === snapshots.length - 1;

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

      <LetterProgressBar
        currentIndex={state.currentStoryIndex}
        totalStories={snapshots.length}
        storyProgress={storyProgress}
      />

      <div className="max-w-md mx-auto w-full space-y-6">

        {/* ── PHASE: point-engage ─────────────────────────────────────────── */}
        {currentPhase === 'point-engage' && currentPoint && (
          <>
            <div className="w-full max-w-sm mx-auto">
              <PointCardWithLinks
                point={pointSummaryToProtoPoint(currentPoint)}
                profileOwner={senderProfileOwner}
                liveSessionMode
                disableNavigation
                currentUserId="__receiver__"
                onPositionSelect={(pos) => setSelectedPosition(pos as PositionType | null)}
                selectedPosition={selectedPosition as Position}
              />
            </div>
            <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center rounded-t-[10px] border bg-background p-4">
              <Button
                onClick={handleSubmitPosition}
                disabled={!selectedPosition || isSubmitting}
                className="w-full max-w-[200px] bg-[#0044CC] hover:bg-[#0033AA] text-white min-h-[44px]"
              >
                Submit
              </Button>
            </div>
          </>
        )}

        {/* ── PHASE: point-revealed ───────────────────────────────────────── */}
        {currentPhase === 'point-revealed' && currentPoint && (
          <>
            <div className="w-full max-w-sm mx-auto">
              <PositionComparisonCard
                readerPosition={currentStory.positions[currentPoint.id] as PositionType}
                authorPosition={currentPoint.profileSubjectPosition as PositionType}
                authorName={senderName}
                pointStatement={currentPoint.statement}
              />
            </div>
            {showAdvanceButton && (
              <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center rounded-t-[10px] border bg-background p-4">
                <Button
                  onClick={advanceFromPointReveal}
                  className="w-full max-w-[200px] bg-[#0044CC] hover:bg-[#0033AA] text-white min-h-[44px]"
                >
                  Next
                </Button>
              </div>
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
              className="w-full max-w-sm mx-auto"
            />
            {authGateAtStoryRate ?? (
              <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center rounded-t-[10px] border bg-background p-4">
                <h2 className="sr-only">Rate this story</h2>
                <p className="sr-only">Rate how well you understood this story.</p>
                <ComprehensionRatingCard
                  question={`How well do you believe you understand ${senderName}'s intention behind their story?`}
                  onSelect={handleSubmitRating}
                  disabled={isSubmitting || currentStory.rating !== null}
                  submitLabel="Submit"
                />
              </div>
            )}
          </>
        )}

        {/* ── PHASE: story-revealed ───────────────────────────────────────── */}
        {currentPhase === 'story-revealed' && (
          <>
            <JourneyToUnderstanding
              checkerRating={currentStory.prediction ?? undefined}
              responderRating={currentStory.rating ?? undefined}
              explainBackRatings={[]}
              isChecker={false}
              displayPartnerName={senderName}
              checkerName={senderName}
              compact
              className="w-full max-w-sm mx-auto"
            />
            {gap !== null && (
              <GapBanner
                gap={gap}
                senderName={senderName}
                isOverconfident={isOverconfident}
                className="-mt-3"
              />
            )}
            <LiveStoryCardExpanded
              story={storyWithPoints}
              hidePoints
              readOnly
              className="w-full max-w-sm mx-auto"
            />
            {showAdvanceButton && (
              <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center rounded-t-[10px] border bg-background p-4">
                <Button
                  onClick={isFinalStory ? nextStory : advanceFromStoryReveal}
                  className="w-full max-w-[200px] bg-[#0044CC] hover:bg-[#0033AA] text-white min-h-[44px]"
                >
                  {isFinalStory ? 'Complete Letter' : 'Next Story'}
                </Button>
              </div>
            )}
          </>
        )}

        {/* ── PHASE: remaining-point-engage ───────────────────────────────── */}
        {currentPhase === 'remaining-point-engage' && currentPoint && (
          <>
            <div className="w-full max-w-sm mx-auto">
              <PointCardWithLinks
                point={pointSummaryToProtoPoint(currentPoint)}
                profileOwner={senderProfileOwner}
                liveSessionMode
                disableNavigation
                currentUserId="__receiver__"
                onPositionSelect={(pos) => setSelectedPosition(pos as PositionType | null)}
                selectedPosition={selectedPosition as Position}
              />
            </div>
            <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center rounded-t-[10px] border bg-background p-4">
              <Button
                onClick={handleSubmitPosition}
                disabled={!selectedPosition || isSubmitting}
                className="w-full max-w-[200px] bg-[#0044CC] hover:bg-[#0033AA] text-white min-h-[44px]"
              >
                Submit
              </Button>
            </div>
          </>
        )}

        {/* ── PHASE: remaining-point-revealed ─────────────────────────────── */}
        {currentPhase === 'remaining-point-revealed' && currentPoint && (
          <>
            <div className="w-full max-w-sm mx-auto">
              <PositionComparisonCard
                readerPosition={currentStory.positions[currentPoint.id] as PositionType}
                authorPosition={currentPoint.profileSubjectPosition as PositionType}
                authorName={senderName}
                pointStatement={currentPoint.statement}
              />
            </div>
            {showAdvanceButton && (
              <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center rounded-t-[10px] border bg-background p-4">
                <Button
                  onClick={advanceFromRemainingPointReveal}
                  className="w-full max-w-[200px] bg-[#0044CC] hover:bg-[#0033AA] text-white min-h-[44px]"
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}

      </div>
    </>
  );
}
