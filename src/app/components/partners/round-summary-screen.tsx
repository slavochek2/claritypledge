/**
 * @file round-summary-screen.tsx
 * @description P398: Round summary view — renders journey data for a completed session round.
 * Used in /live (inline, standalone) and /sessions (full-page stack, hideBack=true).
 */
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { JourneyToUnderstanding } from './live-mode-view';
import { LiveStoryCardExpanded } from './live-story-card-expanded';
import type { SessionHistoryItem, LiveStoryData, StoryWithPoints, PositionType, ContentVisibility } from '@/app/types';
import { getFirstName } from './shared';

interface RoundSummaryScreenProps {
  item: SessionHistoryItem;
  onBack: () => void;
  storyData?: LiveStoryData;
  onPositionSelect?: (pointId: string, position: PositionType | null) => void;
  /** When true, page chrome (title + back) is handled by the parent — hide both here */
  hideBack?: boolean;
}

/** Adapts LiveStoryData snapshot to StoryWithPoints for LiveStoryCardExpanded */
function toStoryWithPoints(data: LiveStoryData): StoryWithPoints {
  return {
    id: data.id,
    authorId: data.authorId ?? '',
    content: data.content,
    visibility: data.visibility,
    currentVersion: 1,
    understoodCount: 0,
    createdAt: data.createdAt ?? '',
    updatedAt: data.createdAt ?? '',
    tags: [],
    authorName: data.authorName,
    authorSlug: data.authorSlug,
    authorAvatarColor: data.authorAvatarColor,
    authorAvatarUrl: data.authorAvatarUrl,
    authorRole: data.authorRole,
    authorEarsCount: data.authorEarsCount,
    authorHasPledged: data.authorHasPledged,
    points: data.points.map(p => ({
      ...p,
      visibility: ((p.visibility ?? 'public') as ContentVisibility),
    })),
  };
}

export function RoundSummaryScreen({ item, onBack, storyData, onPositionSelect, hideBack = false }: RoundSummaryScreenProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onBack();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  const checkerName = item.checkerName ? getFirstName(item.checkerName) : '';
  const partnerDisplayName = item.partnerName ? getFirstName(item.partnerName) : '';
  const story = storyData ? toStoryWithPoints(storyData) : null;

  return (
    <div className="w-full max-w-sm space-y-4">
      {/* Title: only when no story card and not in page-chrome context */}
      {!story && !hideBack && (
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

      {!hideBack && (
        <Button variant="outline" className="w-full" onClick={onBack}>
          Back
        </Button>
      )}
    </div>
  );
}
