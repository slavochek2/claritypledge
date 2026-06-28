/**
 * @file letter-prediction-walk.tsx
 * @description P968: Sender prediction walk — reuses reading components (ComprehensionRatingCard
 * in FixedBottomBar) matching the receiver's story-rate phase. Fixes the LetterProgressBar
 * prop-name mismatch ("Chapter NaN of undefined") and removes the bespoke parallel layout.
 */

import { useCallback, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { LiveStoryCardExpanded } from '@/app/components/partners/live-story-card-expanded';
import { ComprehensionRatingCard } from '@/app/components/shared/comprehension-rating-card';
import { FixedBottomBar } from '@/app/components/shared/fixed-bottom-bar';
import { LetterProgressBar } from './letter-progress-bar';
import { RemovePositionDialog, useRemovePositionGuard } from '@/app/components/shared/remove-position-dialog';
import type { DocStory, PositionType } from '@/app/types';
import { useAuth } from '@/auth';
import { pointsService } from '@/app/data/points-service';

interface LetterPredictionWalkProps {
  stories: DocStory[];
  receiverName: string;
  /**
   * Pre-existing predictions from prior ratings. Not consumed by the UI — ComprehensionRatingCard
   * has no controlled/initial-value prop and always starts blank. Back-navigating from the review
   * screen requires re-rating; predictions already written to the Map are preserved in the parent.
   */
  predictions: Map<string, number>;
  onPredict: (storyId: string, value: number) => void;
  onComplete: () => void;
  /** Exit the prepare flow — wired to the header back affordance (P968 UAT: senders need a visible exit). */
  onClose: () => void;
  isPublicDoc?: boolean;
}

export function LetterPredictionWalk({
  stories,
  receiverName,
  predictions: _predictions,
  onPredict,
  onComplete,
  onClose,
  isPublicDoc,
}: LetterPredictionWalkProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentStory = stories[currentIndex];
  const { user } = useAuth();

  // P847: Wire onClear at this page-level component. Guard handles the
  // confirmation dialog; pointsService.removePosition fires on confirm.
  //
  // Visual sync: the cleared position lives in point_positions (live profile).
  // The story prop's points[].userPosition is sourced from the parent and
  // does not refresh after the live removal. Track the user's latest live
  // intent locally and override userPosition with it before rendering. Map
  // is updated only after onAfterRemove fires (dialog confirmed), so cancel
  // leaves the highlight untouched.
  //
  // TODO(p847): letter-context dialog copy mismatch — the default
  // "Removing your position will remove this point from your profile" wording
  // is misleading in a sender draft/prediction context (no profile change
  // happens). Needs founder review for a copy variant.
  const [livePositions, setLivePositions] = useState<Map<string, PositionType | null>>(
    () => new Map(),
  );
  const { dialogProps, guardedRemovePosition } = useRemovePositionGuard({
    userId: user?.id ?? '',
    onAfterRemove: (pointId) => {
      setLivePositions((prev) => new Map(prev).set(pointId, null));
    },
  });

  // P711: Author's own positions are live (P705 H2) — write to point_positions while composing.
  const handlePositionSelect = useCallback(async (pointId: string, position: PositionType | null) => {
    setLivePositions((prev) => new Map(prev).set(pointId, position));
    if (!user) return;
    try {
      if (position === null) {
        await pointsService.removePosition(pointId, user.id);
      } else {
        await pointsService.setPosition(pointId, user.id, position);
      }
    } catch {
      // Non-fatal — optimistic UI update already applied
    }
  }, [user]);

  const adjustedStory = useMemo(() => {
    if (!currentStory || livePositions.size === 0) return currentStory?.story;
    return {
      ...currentStory.story,
      points: currentStory.story.points.map((p) =>
        livePositions.has(p.id) ? { ...p, userPosition: livePositions.get(p.id) ?? null } : p,
      ),
    };
  }, [currentStory, livePositions]);

  if (!currentStory) return null;

  const isLastStory = currentIndex === stories.length - 1;

  const handlePredictAndAdvance = (rating: number) => {
    onPredict(currentStory.story_id, rating);
    if (isLastStory) {
      onComplete();
    } else {
      setCurrentIndex((i) => i + 1);
    }
  };

  const promptText = receiverName
    ? `How well do you believe ${receiverName} understands your intended meaning behind your story?`
    : 'How well do you believe readers will understand your intended meaning behind your story?';

  const ctaLabel = isLastStory ? (isPublicDoc ? 'Seal & Get Link' : 'Review') : 'Continue';

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header: back affordance + eyebrow + progress bar.
          P968 UAT: senders are mid-authoring and need a visible exit — app uses a
          back arrow, not an X (matches FocusHeader convention). The progress bar is
          hidden for single-chapter letters: a 1-of-1 bar conveys no progress and
          rendered at 5% it reads as an endless track. */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        <button
          type="button"
          onClick={onClose}
          aria-label="Exit letter preparation"
          className="flex-shrink-0 -ml-1 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="text-sm text-muted-foreground whitespace-nowrap flex-shrink-0">
          Preparing to send
        </span>
        {stories.length > 1 && (
          <>
            <span className="h-4 w-px bg-gray-200 flex-shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <LetterProgressBar currentChapter={currentIndex} totalChapters={stories.length} />
            </div>
          </>
        )}
      </div>

      {/* Story content — scrollable; pb-80 (320px) safely clears FixedBottomBar on mobile */}
      <div className="flex-1 overflow-y-auto px-4 py-6 pb-80">
        <div className="max-w-2xl mx-auto">
          <LiveStoryCardExpanded
            story={adjustedStory ?? currentStory.story}
            defaultExpanded
            revealed={false}
            onPositionSelect={handlePositionSelect}
            onClear={(pointId) => guardedRemovePosition(pointId)}
          />
        </div>
      </div>

      {/* Rating drawer — mirrors receiver's story-rate FixedBottomBar */}
      <FixedBottomBar>
        <ComprehensionRatingCard
          key={currentStory.story_id}
          question={promptText}
          onSelect={handlePredictAndAdvance}
          submitLabel={ctaLabel}
          ctaClassName="bg-[#0044CC] hover:bg-[#0033AA] w-full max-w-sm mx-auto rounded-full font-bold text-base min-h-[56px] mt-3"
        />
      </FixedBottomBar>

      <RemovePositionDialog {...dialogProps} />
    </div>
  );
}
