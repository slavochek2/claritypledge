/**
 * @file letter-prediction-walk.tsx
 * @description P661: Full-screen prediction walk — sender walks through stories
 * one at a time using LiveStoryCardExpanded (readOnly) + RatingButtons.
 * Same pacing as the receiver's reading flow, but with prediction prompt instead of rating.
 */

import { useCallback, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LiveStoryCardExpanded } from '@/app/components/partners/live-story-card-expanded';
import { RatingButtons } from '@/app/components/partners/shared';
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
  onClose: () => void;
  isPublicDoc?: boolean;
}

export function LetterPredictionWalk({
  stories,
  receiverName,
  predictions,
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

  const currentPrediction = predictions.get(currentStory.story_id) ?? null;
  const isLastStory = currentIndex === stories.length - 1;

  const handleNext = () => {
    if (isLastStory) {
      onComplete();
    } else {
      setCurrentIndex((i) => i + 1);
    }
  };

  const promptText = receiverName
    ? `How well do you believe ${receiverName} understands your story?`
    : 'How well do you believe readers will understand your story?';

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-100">
        <button
          type="button"
          onClick={onClose}
          className="p-2.5 -m-1 rounded-md hover:bg-gray-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Close prediction walk"
        >
          <X className="h-5 w-5 text-gray-500" />
        </button>
        <div className="flex-1">
          <LetterProgressBar currentIndex={currentIndex} totalStories={stories.length} />
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          Story {currentIndex + 1} of {stories.length}
        </span>
      </div>

      {/* Story content — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <LiveStoryCardExpanded
            story={adjustedStory ?? currentStory.story}
            defaultExpanded
            revealed={false}
            onPositionSelect={handlePositionSelect}
            onClear={(pointId) => guardedRemovePosition(pointId)}
          />

          {/* Prediction prompt */}
          <div className="space-y-4">
            <p className="text-sm text-[#1A1A1A]/70">
              {promptText}
            </p>
            <RatingButtons
              selectedValue={currentPrediction}
              onSelect={(value) => onPredict(currentStory.story_id, value)}
              fullWidth
            />
          </div>

          {/* Next button */}
          <div className="flex justify-end">
            <Button
              onClick={handleNext}
              disabled={currentPrediction === null}
              className="bg-[#0044CC] hover:bg-[#0033AA] text-white min-h-[44px]"
            >
              {isLastStory ? (isPublicDoc ? 'Seal & Get Link' : 'Review') : 'Next Story'}
            </Button>
          </div>
        </div>
      </div>

      <RemovePositionDialog {...dialogProps} />
    </div>
  );
}
