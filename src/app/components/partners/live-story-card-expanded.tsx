'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { StoryWithPoints, PositionType } from '@/app/types';
import { PositionButtons } from '@/app/prototypes/linkedin-like/components/shared/PositionButton';
import type { SevenPointCounts } from '@/app/prototypes/linkedin-like/components/shared/PositionButton';

const ZERO_COUNTS: SevenPointCounts = {
  strongly_agree: 0,
  agree: 0,
  somewhat_agree: 0,
  unsure: 0,
  somewhat_disagree: 0,
  disagree: 0,
  strongly_disagree: 0,
};

function toSevenPointCounts(positionCounts?: Record<string, number>): SevenPointCounts {
  if (!positionCounts) return ZERO_COUNTS;
  return {
    ...ZERO_COUNTS,
    ...positionCounts,
  } as SevenPointCounts;
}

interface LiveStoryCardExpandedProps {
  story: StoryWithPoints;
  currentUserId?: string;
  onPositionSelect?: (pointId: string, position: PositionType | null) => void;
  className?: string;
}

export function LiveStoryCardExpanded({
  story,
  onPositionSelect,
  className,
}: LiveStoryCardExpandedProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const avatarLetter = story.authorName ? story.authorName[0].toUpperCase() : '?';
  const avatarBg = story.authorAvatarColor ?? '#6366f1';
  const preview = story.content.length > 80 ? story.content.slice(0, 80) + '…' : story.content;

  return (
    <div
      data-testid="live-story-card-expanded"
      className={`rounded-lg border border-gray-200 bg-white p-3 ${className ?? ''}`}
    >
      {/* Header row: avatar + preview + toggle */}
      <div className="flex items-start gap-2">
        {/* Author avatar */}
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: avatarBg }}
          aria-hidden="true"
        >
          {avatarLetter}
        </div>

        {/* Story preview */}
        <p className="flex-1 text-sm text-gray-700 leading-snug">
          {isExpanded ? story.content : preview}
        </p>

        {/* Expand / collapse toggle */}
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Collapse linked points' : 'Expand linked points'}
          className="ml-1 flex-shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
        >
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-3 space-y-4">
          {/* Full story text (scrollable) */}
          <div className="max-h-[200px] overflow-y-auto rounded bg-gray-50 p-2 text-sm text-gray-700 leading-relaxed">
            {story.content}
          </div>

          {/* Linked points */}
          <div className="space-y-3">
            {story.points.length === 0 ? (
              <p className="text-sm text-muted-foreground">No points linked to this story.</p>
            ) : (
              story.points.map((point) => (
                <div key={point.id} className="space-y-2">
                  <p className="text-sm font-medium text-gray-800">{point.statement}</p>
                  <PositionButtons
                    userPosition={point.userPosition ?? null}
                    counts={toSevenPointCounts(point.positionCounts)}
                    onPositionClick={(position: PositionType) => {
                      onPositionSelect?.(point.id, position);
                    }}
                    compact
                  />
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
