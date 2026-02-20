/**
 * @file round-summary-screen.tsx
 * @description P398: Inline round summary view — replaces idle screen body content.
 * Renders the journey data for a completed session round using JourneyToUnderstanding.
 */
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { JourneyToUnderstanding } from './live-mode-view';
import { LiveStoryCardExpanded } from './live-story-card-expanded';
import type { SessionHistoryItem, StoryWithPoints, PositionType } from '@/app/types';
import { getFirstName } from './shared';

interface RoundSummaryScreenProps {
  item: SessionHistoryItem;
  onBack: () => void;
  story?: StoryWithPoints | null;
  onPositionSelect?: (pointId: string, position: PositionType | null) => void;
}

export function RoundSummaryScreen({ item, onBack, story, onPositionSelect }: RoundSummaryScreenProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Focus heading on mount for screen reader announcement
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  const checkerName = item.checkerName ? getFirstName(item.checkerName) : '';
  const partnerDisplayName = item.partnerName ? getFirstName(item.partnerName) : '';

  return (
    <div className="w-full max-w-sm space-y-4">
      {!story && (
        <h2
          ref={titleRef}
          tabIndex={-1}
          className="text-base font-semibold text-foreground line-clamp-2 outline-none"
        >
          {item.title}
        </h2>
      )}

      {story && (
        <LiveStoryCardExpanded
          story={story}
          onPositionSelect={onPositionSelect}
          defaultExpanded={false}
          className="w-full"
        />
      )}

      <JourneyToUnderstanding
        checkerRating={item.checkerRating}
        responderRating={item.responderRating}
        explainBackRatings={item.explainBackRatings ?? []}
        isChecker={item.isChecker ?? false}
        displayPartnerName={partnerDisplayName}
        checkerName={checkerName}
        hideUntilBothSubmitted={false}
        className="w-full"
      />

      <Button
        variant="outline"
        className="w-full"
        onClick={onBack}
      >
        Back
      </Button>
    </div>
  );
}
