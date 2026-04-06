/**
 * @file letter-prediction-walk.tsx
 * @description P661: Full-screen prediction walk — sender walks through stories
 * one at a time using LiveStoryCardExpanded (readOnly) + RatingButtons.
 * Same pacing as the receiver's reading flow, but with prediction prompt instead of rating.
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LiveStoryCardExpanded } from '@/app/components/partners/live-story-card-expanded';
import { RatingButtons } from '@/app/components/partners/shared';
import { LetterProgressBar } from './letter-progress-bar';
import type { DocStory } from '@/app/types';

interface LetterPredictionWalkProps {
  stories: DocStory[];
  receiverName: string;
  predictions: Map<string, number>;
  onPredict: (storyId: string, value: number) => void;
  onComplete: () => void;
  onClose: () => void;
}

export function LetterPredictionWalk({
  stories,
  receiverName,
  predictions,
  onPredict,
  onComplete,
  onClose,
}: LetterPredictionWalkProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentStory = stories[currentIndex];

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
            story={currentStory.story}
            readOnly
            defaultExpanded
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
              {isLastStory ? 'Review' : 'Next Story'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
