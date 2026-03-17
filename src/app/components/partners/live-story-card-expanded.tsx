'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Pin, Ear } from 'lucide-react';
import type { StoryWithPoints, PointSummary, PositionType } from '@/app/types';
import { getPositionGroup, getPositionCTACopy, shouldShowStoryCTA, toSevenPointCounts } from '@/app/utils/position-helpers';
import { formatTimeAgo } from '@/app/utils/format-time';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { VisibilityBadge } from '@/app/components/shared/visibility-badge';
import {
  PositionButtons,
  PositionBadge,
  ThreadLineGroup,
  ThreadLineItem,
} from '@/app/components/shared';
import { LinkedText } from '@/app/components/shared/linked-text';
import { TagPills } from '@/app/components/shared/tag-pills';
import { stripHashtags } from '@/lib/utils';

interface LiveStoryCardExpandedProps {
  story: StoryWithPoints;
  /** When true, the current user owns this story — suppresses the "Tell your story" CTA */
  isOwnStory?: boolean;
  /** P490: When true, user is a guest (unauthenticated) — shows "sign up to save" hint instead of CTA */
  isGuest?: boolean;
  onPositionSelect?: (pointId: string, position: PositionType | null) => void;
  className?: string;
  /** When set, overrides authorName in the position badge (used in host view to show partner's name) */
  badgePersonName?: string;
  /** Ear count for badgePersonName — shown in badge when host view is active */
  badgePersonEarsCount?: number;
  /** When true, points are expanded on first render — used for partner view so they can vote immediately */
  defaultExpanded?: boolean;
}

const STORY_THRESHOLD = 100;

export function LiveStoryCardExpanded({
  story,
  isOwnStory = false,
  isGuest = false,
  onPositionSelect,
  className,
  badgePersonName,
  badgePersonEarsCount,
  defaultExpanded = false,
}: LiveStoryCardExpandedProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [storyExpanded, setStoryExpanded] = useState(false);

  // Reset expand state when the story changes (e.g. live session rotates to next story)
  useEffect(() => {
    setStoryExpanded(false);
  }, [story.id]);

  const strippedContent = stripHashtags(story.content, story.tags);
  const isLongStory = strippedContent.length > STORY_THRESHOLD;
  const displayText =
    isLongStory && !storyExpanded
      ? strippedContent.slice(0, STORY_THRESHOLD) + '…'
      : strippedContent;

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
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="font-semibold text-gray-900 text-sm">{story.authorName}</span>
              <span className="inline-flex items-center gap-0.5 text-gray-500 text-xs">
                <Ear size={12} />
                {story.authorEarsCount ?? 0}
              </span>
            </div>
            {(story.authorRole || story.createdAt) && (
              <p className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                <span>
                  {story.authorRole ? `${story.authorRole} · ` : ''}{story.createdAt ? formatTimeAgo(story.createdAt) : ''}
                </span>
                {story.visibility && <VisibilityBadge visibility={story.visibility} />}
              </p>
            )}
            <p id={`live-story-text-${story.id}`} className="text-sm text-gray-900 leading-snug break-words"><LinkedText text={displayText} /></p>
            {isLongStory && (
              <button
                type="button"
                onClick={() => setStoryExpanded((prev) => !prev)}
                aria-expanded={storyExpanded}
                aria-controls={`live-story-text-${story.id}`}
                className="text-sm text-blue-600 hover:text-blue-700 mt-1"
              >
                {storyExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        </div>

        {/* P491: Tag pills (display-only in live context) */}
        {story.tags && story.tags.length > 0 && (
          <TagPills tags={story.tags} context="live" className="mt-2 pl-[52px]" />
        )}
      </div>

      {/* Footer — "N points" expand trigger */}
      {story.points.length > 0 && (
        <div
          role="presentation"
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
              {story.points.length} {story.points.length === 1 ? 'point' : 'points'}
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
              badgePersonName={badgePersonName}
              badgePersonEarsCount={badgePersonEarsCount}
              isOwnStory={isOwnStory}
              isGuest={isGuest}
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
                    badgePersonName={badgePersonName}
                    badgePersonEarsCount={badgePersonEarsCount}
                    isOwnStory={isOwnStory}
                    isGuest={isGuest}
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
  badgePersonName,
  badgePersonEarsCount,
  isOwnStory = false,
  isGuest = false,
}: {
  point: PointSummary;
  authorName: string;
  authorAvatarUrl?: string;
  authorAvatarColor?: string;
  authorHasPledged?: boolean;
  authorEarsCount?: number;
  onPositionSelect?: (pointId: string, position: PositionType | null) => void;
  badgePersonName?: string;
  badgePersonEarsCount?: number;
  isOwnStory?: boolean;
  isGuest?: boolean;
}) {
  // Local state so button highlights immediately on click, independent of the
  // frozen selectedStoryData snapshot. Echoes to onPositionSelect for liveState sync.
  const [userPosition, setUserPosition] = useState<PositionType | null>(point.userPosition ?? null);

  // Sync from prop when liveState updates (e.g. after confirm removes position via guard dialog)
  useEffect(() => {
    setUserPosition(point.userPosition ?? null);
  }, [point.userPosition]);

  const handlePositionClick = (position: PositionType) => {
    const next = userPosition === position ? null : position; // toggle same position off
    // Only optimistically update for selection; removal waits for dialog confirm
    if (next !== null) {
      setUserPosition(next);
    }
    onPositionSelect?.(point.id, next);
    // P451: Story CTA intentionally omitted here — /live has its own post-session story entry point
  };

  return (
    <div className="w-full text-left">
      {/* Position badge above point — shows badge person's stance (author for partner view, partner for host view) */}
      {point.profileSubjectPosition && (
        <div className="flex items-center gap-1.5 mb-1.5 text-sm text-gray-700">
          <GravatarAvatar
            name={badgePersonName ?? authorName}
            photoUrl={badgePersonName ? undefined : authorAvatarUrl}
            avatarColor={badgePersonName ? undefined : authorAvatarColor}
            isPledger={badgePersonName ? false : (authorHasPledged ?? false)}
            size="sm"
            className="!w-5 !h-5 !text-[10px]"
          />
          <span className="font-medium">{badgePersonName ?? authorName}</span>
          <span className="inline-flex items-center gap-0.5 text-gray-600 text-xs">
            <Ear size={12} />
            {badgePersonName ? (badgePersonEarsCount ?? 0) : (authorEarsCount ?? 0)}
          </span>
          <PositionBadge position={point.profileSubjectPosition} />
        </div>
      )}

      {/* Quoted point box — buttons on own row so they get full box width */}
      <div className="p-3 rounded-lg border border-gray-200 bg-gray-50 space-y-2">
        <div className="flex items-start gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600 mt-0.5">
            <Pin size={12} className="rotate-45" />
          </div>
          <p className="text-sm text-gray-800 flex-1 min-w-0 break-words"><LinkedText text={stripHashtags(point.statement, point.tags)} /></p>
          {point.tags?.length > 0 && <TagPills tags={point.tags} context="live" className="mt-1" />}
        </div>
        <PositionButtons
          userPosition={userPosition}
          counts={toSevenPointCounts(point.positionCounts)}
          onPositionClick={handlePositionClick}
          compact
          narrow
        />

        {/* P490: Guest hint — positions are ephemeral, prompt to sign up */}
        {isGuest && userPosition && (
          <div className="border-t border-gray-200 pt-2">
            <p className="text-xs text-gray-500">
              Position shared live — sign up to save it
            </p>
          </div>
        )}

        {/* P456: Disabled story CTA footer — visible but non-interactive in /live session.
            P487+: Hidden on own story — use shouldShowStoryCTA shared utility. */}
        {!isGuest && shouldShowStoryCTA({ userPosition, isOwnStory }) === 'show' && (() => {
          const positionGroup = getPositionGroup(userPosition!);
          const copy = getPositionCTACopy(positionGroup);

          return (
            <div className="border-t border-gray-200 pt-2">
              {/* CTA row — disabled, decorative only */}
              <div className="flex items-center gap-1 opacity-50 pointer-events-none">
                <span aria-hidden="true" className="text-sm text-gray-600">{copy.symbol}</span>
                <span className="text-sm text-gray-600">{copy.label}</span>
                <span aria-hidden="true" className="text-sm text-gray-400"> · </span>
                <button
                  disabled
                  aria-disabled="true"
                  aria-describedby={`live-cta-hint-${point.id}`}
                  className="text-sm font-medium text-blue-600"
                >
                  Tell your story →
                </button>
              </div>
              {/* Hint row */}
              <p id={`live-cta-hint-${point.id}`} className="text-xs text-gray-400 mt-1">
                Available after the session
              </p>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
