/**
 * @file letter-prediction-walk.tsx
 * @description P968: Sender prediction walk — reuses reading components (ComprehensionRatingCard
 * in FixedBottomBar) matching the receiver's story-rate phase. Fixes the LetterProgressBar
 * prop-name mismatch ("Chapter NaN of undefined") and removes the bespoke parallel layout.
 */

import { useCallback, useMemo, useState } from 'react';
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
  predictions: Map<string, number>;
  onPredict: (storyId: string, value: number) => void;
  onComplete: () => void;
  /** Kept for backward compat with parent; not rendered — exit is browser-back (P968). */
  onClose: () => void;
  isPublicDoc?: boolean;
}

export function LetterPredictionWalk({
  stories,
  receiverName,
  onPredict,
  onComplete,
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
      {/* Header: eyebrow + progress bar (no X — exit is browser-back, P968) */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-100">
        <span className="text-sm text-muted-foreground whitespace-nowrap flex-shrink-0">
          Preparing letter for sending
        </span>
        <div className="flex-1 min-w-0">
          <LetterProgressBar currentChapter={currentIndex} totalChapters={stories.length} />
        </div>
      </div>

      {/* Story content — scrollable; pb-56 clears FixedBottomBar height */}
      <div className="flex-1 overflow-y-auto px-4 py-6 pb-56">
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
