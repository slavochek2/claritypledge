'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Pin, Ear } from 'lucide-react';
import type { StoryWithPoints, PointSummary, PositionType } from '@/app/types';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import {
  PositionButtons,
  PositionBadge,
  ThreadLineGroup,
  ThreadLineItem,
  type SevenPointCounts,
} from '@/app/prototypes/linkedin-like/components/shared';

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
  return { ...ZERO_COUNTS, ...positionCounts } as SevenPointCounts;
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

  const preview = story.content.length > 120 ? story.content.slice(0, 120) + '…' : story.content;

  return (
    <div
      data-testid="live-story-card-expanded"
      className={`rounded-lg border-l-4 border-l-blue-500 border border-gray-200 bg-white shadow-sm overflow-hidden ${className ?? ''}`}
    >
      {/* Main content */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <GravatarAvatar
            name={story.authorName}
            photoUrl={story.authorAvatarUrl}
            avatarColor={story.authorAvatarColor}
            size="sm"
            isPledger={story.authorHasPledged ?? false}
            className="flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="font-semibold text-gray-900 text-sm">{story.authorName}</span>
              {(story.authorEarsCount ?? 0) > 0 && (
                <span className="inline-flex items-center gap-0.5 text-gray-500 text-xs">
                  <Ear size={12} />
                  {story.authorEarsCount}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-900 leading-snug">{preview}</p>
          </div>
        </div>
      </div>

      {/* Footer — "N points by Name" expand trigger */}
      {story.points.length > 0 && (
        <div
          className="flex items-center pl-[52px] pr-4 py-2.5 border-t border-gray-100"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
            aria-expanded={isExpanded}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>
              {story.points.length} {story.points.length === 1 ? 'point' : 'points'} by{' '}
              {story.authorName}
            </span>
          </button>
        </div>
      )}

      {/* Expanded points.
          Single point: pl-[40px] gives visible "shift" matching profile, and leaves
          exactly 308px for the position buttons (306px needed).
          Multiple points: px-3 because ThreadLine indentation (~28px extra left) would
          push buttons over budget; ThreadLines themselves provide visual hierarchy. */}
      {isExpanded && story.points.length > 0 && (
        <div className={story.points.length === 1 ? 'pl-[40px] pr-3 pb-3' : 'px-3 pb-3'}>
          {story.points.length === 1 ? (
            <PointRow
              point={story.points[0]}
              authorName={story.authorName}
              authorAvatarUrl={story.authorAvatarUrl}
              authorAvatarColor={story.authorAvatarColor}
              authorHasPledged={story.authorHasPledged}
              authorEarsCount={story.authorEarsCount}
              onPositionSelect={onPositionSelect}
            />
          ) : (
            <ThreadLineGroup>
              {story.points.map((point, index) => (
                <ThreadLineItem key={point.id} isLast={index === story.points.length - 1}>
                  <PointRow
                    point={point}
                    authorName={story.authorName}
                    authorAvatarUrl={story.authorAvatarUrl}
                    authorAvatarColor={story.authorAvatarColor}
                    authorHasPledged={story.authorHasPledged}
                    authorEarsCount={story.authorEarsCount}
                    onPositionSelect={onPositionSelect}
                  />
                </ThreadLineItem>
              ))}
            </ThreadLineGroup>
          )}
        </div>
      )}
    </div>
  );
}

function PointRow({
  point,
  authorName,
  authorAvatarUrl,
  authorAvatarColor,
  authorHasPledged,
  authorEarsCount,
  onPositionSelect,
}: {
  point: PointSummary;
  authorName: string;
  authorAvatarUrl?: string;
  authorAvatarColor?: string;
  authorHasPledged?: boolean;
  authorEarsCount?: number;
  onPositionSelect?: (pointId: string, position: PositionType | null) => void;
}) {
  // Local state so button highlights immediately on click, independent of the
  // frozen selectedStoryData snapshot. Echoes to onPositionSelect for liveState sync.
  const [userPosition, setUserPosition] = useState<PositionType | null>(point.userPosition ?? null);

  const handlePositionClick = (position: PositionType) => {
    const next = userPosition === position ? null : position; // toggle same position off
    setUserPosition(next);
    onPositionSelect?.(point.id, next);
  };

  return (
    <div className="w-full text-left">
      {/* Story author's stance on this point — matches profile QuotedPoint pattern */}
      {point.profileSubjectPosition && (
        <div className="flex items-center gap-1.5 mb-1.5 text-sm text-gray-700">
          <GravatarAvatar name={authorName} photoUrl={authorAvatarUrl} avatarColor={authorAvatarColor} isPledger={authorHasPledged ?? false} size="sm" className="!w-5 !h-5 !text-[10px]" />
          <span className="font-medium">{authorName}</span>
          {(authorEarsCount ?? 0) > 0 && (
            <span className="inline-flex items-center gap-0.5 text-gray-600 text-xs">
              <Ear size={12} />
              {authorEarsCount}
            </span>
          )}
          <PositionBadge position={point.profileSubjectPosition} />
        </div>
      )}

      {/* Quoted point box — buttons on own row so they get full box width */}
      <div className="p-3 rounded-lg border border-gray-200 bg-gray-50 space-y-2">
        <div className="flex items-start gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600 mt-0.5">
            <Pin size={12} className="rotate-45" />
          </div>
          <p className="text-sm text-gray-800 flex-1">{point.statement}</p>
        </div>
        <PositionButtons
          userPosition={userPosition}
          counts={toSevenPointCounts(point.positionCounts)}
          onPositionClick={handlePositionClick}
          compact
          narrow
        />
      </div>
    </div>
  );
}
