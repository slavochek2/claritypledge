'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Pin, Ear } from 'lucide-react';
import type { StoryWithPoints, PointSummary, PositionType } from '@/app/types';
import { toSevenPointCounts } from '@/app/utils/position-helpers';
import { formatTimeAgo } from '@/app/utils/format-time';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { InlineVisibilityIcon } from '@/app/components/shared/visibility-badge';
import {
  PositionButtons,
  PositionBadge,
  ThreadLineGroup,
  ThreadLineItem,
} from '@/app/components/shared';
import { linkifyText } from '@/app/utils/linkify';
import { TagPills } from '@/app/components/shared/tag-pills';
import { StoryImage } from '@/app/components/shared/story-image';
import { stripHashtags } from '@/lib/utils';

interface LiveStoryCardExpandedProps {
  story: StoryWithPoints;
  /** When true, the current user owns this story (accepted but no-op after P733 CTA removal) */
  isOwnStory?: boolean;
  /** P490: When true, user is a guest (unauthenticated) — shows "sign up to save" hint instead of CTA */
  isGuest?: boolean;
  onPositionSelect?: (pointId: string, position: PositionType | null) => void;
  className?: string;
  /** When set, overrides authorName in the position badge (used in host view to show partner's name) */
  badgePersonName?: string;
  /** Ear count for badgePersonName — shown in badge when host view is active */
  badgePersonEarsCount?: number;
  /** Avatar URL for badgePersonName — shown when badge person has a profile photo */
  badgePersonAvatarUrl?: string;
  /** Avatar color for badgePersonName — used as fallback when no photo */
  badgePersonAvatarColor?: string;
  /** Whether badge person has pledged — shows blue ring when true */
  badgePersonHasPledged?: boolean;
  /** When true, points are expanded on first render — used for partner view so they can vote immediately */
  defaultExpanded?: boolean;
  /** P661: When true, PositionButtons hidden, story CTA hidden. Does NOT auto-expand (use defaultExpanded for that). Used in letter prediction walk. */
  readOnly?: boolean;
  /** P705: When true, story text starts expanded (full text visible). Defaults to readOnly for backward compat. */
  defaultStoryExpanded?: boolean;
  /** P673: When true, hide the points section entirely (footer trigger + expanded points). Used in letters where points are shown as separate step cards. */
  hidePoints?: boolean;
  /** Slot rendered inside the card at the bottom — used for "Open Story" link in letter results */
  footerSlot?: React.ReactNode;
  /** P711: When false (default true), hides author PositionBadge in letter-mode headers.
   * Non-letter callers always show badge when profileSubjectPosition exists. */
  revealed?: boolean;
}

const STORY_THRESHOLD = 100;

export function LiveStoryCardExpanded({
  story,
  isGuest = false,
  onPositionSelect,
  className,
  badgePersonName,
  badgePersonEarsCount,
  badgePersonAvatarUrl,
  badgePersonAvatarColor,
  badgePersonHasPledged,
  defaultExpanded = false,
  readOnly = false,
  defaultStoryExpanded,
  hidePoints = false,
  footerSlot,
  revealed = true,
}: LiveStoryCardExpandedProps) {
  // defaultStoryExpanded falls back to readOnly for backward compat (readOnly=true → story shown in full)
  const initialStoryExpanded = defaultStoryExpanded ?? readOnly;
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [storyExpanded, setStoryExpanded] = useState(initialStoryExpanded);

  // Reset expand states when the story changes (phase change / story rotation)
  useEffect(() => {
    setStoryExpanded(defaultStoryExpanded ?? readOnly);
    setIsExpanded(defaultExpanded);
  }, [story.id, defaultExpanded, readOnly, defaultStoryExpanded]);

  const strippedContent = stripHashtags(story.content, story.tags);
  const isLongStory = strippedContent.length > STORY_THRESHOLD;
  const displayText =
    isLongStory && !storyExpanded
      ? strippedContent.slice(0, STORY_THRESHOLD) + '…'
      : strippedContent;

  return (
    <div
      data-testid="live-story-card-expanded"
      className={`rounded-lg border-l-4 border-l-blue-500 border border-gray-200 bg-white shadow-sm shrink-0 overflow-hidden ${className ?? ''}`}
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
              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-1.5 py-0.5">
                <Ear size={12} />
                {story.authorEarsCount ?? 0}
              </span>
            </div>
            {(story.authorRole || story.createdAt || story.visibility) && (
              <p className="text-xs text-gray-500 mb-1 inline-flex items-center gap-1">
                <span>{story.authorRole ? `${story.authorRole} · ` : ''}{story.createdAt ? formatTimeAgo(story.createdAt) : ''}</span>
                {story.visibility && <InlineVisibilityIcon visibility={story.visibility} />}
              </p>
            )}
            {story.imageUrl && (
                      <div className="mb-2">
                        <StoryImage
                          src={story.imageUrl}
                          authorName={story.authorName}
                        />
                      </div>
                    )}
            <p id={`live-story-text-${story.id}`} className="text-sm text-gray-900 leading-snug break-words">{linkifyText(displayText)}</p>
            {isLongStory && (
              <button
                type="button"
                onClick={() => { setStoryExpanded((prev) => { if (!prev) setIsExpanded(false); return !prev; }); }}
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

      {/* Footer — "N points" expand trigger + optional right action (hidden when hidePoints) */}
      {story.points.length > 0 && !hidePoints && (
        <div
          role="presentation"
          className="flex items-center justify-between pl-4 sm:pl-[52px] pr-2 py-2.5 border-t border-gray-100"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => { setIsExpanded((prev) => { if (!prev) setStoryExpanded(false); return !prev; }); }}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
            aria-expanded={isExpanded}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>
              {story.points.length} {story.points.length === 1 ? 'point' : 'points'}
            </span>
          </button>
          {footerSlot}
        </div>
      )}

      {/* Expanded points — ThreadLine for all counts (even single point needs
          the connecting line to visually anchor it to the parent story card). */}
      {isExpanded && story.points.length > 0 && !hidePoints && (
        <div className="px-3 pb-3">
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
                  badgePersonAvatarUrl={badgePersonAvatarUrl}
                  badgePersonAvatarColor={badgePersonAvatarColor}
                  badgePersonHasPledged={badgePersonHasPledged}
                  isGuest={isGuest}
                  readOnly={readOnly}
                  revealed={revealed}
                />
              </ThreadLineItem>
            ))}
          </ThreadLineGroup>
        </div>
      )}

      {/* footerSlot fallback — shown only when there are no points (inline slot handled above) */}
      {footerSlot && (story.points.length === 0 || hidePoints) && (
        <div className="border-t border-gray-100">
          {footerSlot}
        </div>
      )}
    </div>
  );
}

export function PointRow({
  point,
  authorName,
  authorAvatarUrl,
  authorAvatarColor,
  authorHasPledged,
  authorEarsCount,
  onPositionSelect,
  badgePersonName,
  badgePersonEarsCount,
  badgePersonAvatarUrl,
  badgePersonAvatarColor,
  badgePersonHasPledged,
  isGuest = false,
  readOnly = false,
  letterMode = false,
  disablePositionButtons = false,
  revealed = false,
  children,
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
  badgePersonAvatarUrl?: string;
  badgePersonAvatarColor?: string;
  badgePersonHasPledged?: boolean;
  isGuest?: boolean;
  readOnly?: boolean;
  /** Letter context: hides story CTA, guest hint, tag pills, visibility icon */
  letterMode?: boolean;
  /** When true, position buttons render but are visually disabled (no hover/click) */
  disablePositionButtons?: boolean;
  /** P711: When true (with letterMode), shows author PositionBadge. Default false (engage = no badge).
   * In non-letter mode, badge always shows when profileSubjectPosition exists. */
  revealed?: boolean;
  /** Render slot after point content (e.g., Submit button, position reveal badges) */
  children?: React.ReactNode;
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
    // Optimistically update immediately (both select and deselect).
    // /live sessions with confirm dialogs rely on useEffect sync from liveState after confirm.
    setUserPosition(next);
    onPositionSelect?.(point.id, next);
    // P451: Story CTA intentionally omitted here — /live has its own post-session story entry point
  };

  return (
    <div className="w-full text-left">
      {/* Position badge above point — shows badge person's stance (author for partner view, partner for host view).
          In letter mode: always renders when authorName exists (identity visible in engage; badge gated by revealed).
          In non-letter mode: renders only when profileSubjectPosition exists (unchanged behavior). */}
      {((letterMode && authorName) || point.profileSubjectPosition) && (
        <div className="flex items-center gap-1.5 mb-1.5 text-sm text-gray-700">
          <GravatarAvatar
            name={badgePersonName ?? authorName}
            photoUrl={badgePersonName ? badgePersonAvatarUrl : authorAvatarUrl}
            avatarColor={badgePersonName ? badgePersonAvatarColor : authorAvatarColor}
            isPledger={badgePersonName ? (badgePersonHasPledged ?? false) : (authorHasPledged ?? false)}
            size="sm"
            className="!w-5 !h-5 !text-[10px]"
          />
          <span className="font-medium">{badgePersonName ?? authorName}</span>
          <span className="inline-flex items-center gap-0.5 text-gray-600 text-xs">
            <Ear size={12} />
            {badgePersonName ? (badgePersonEarsCount ?? 0) : (authorEarsCount ?? 0)}
          </span>
          {point.profileSubjectPosition && (!letterMode || revealed) && (
            <PositionBadge position={point.profileSubjectPosition} />
          )}
        </div>
      )}

      {/* Point content — full text, always visible */}
      <div className="p-3 rounded-lg border border-gray-200 bg-gray-50 space-y-2">
        <div className="flex items-start gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600 mt-0.5">
            <Pin size={12} className="rotate-45" />
          </div>
          <p className="text-sm text-gray-800 flex-1 min-w-0 break-words">
            {!letterMode && <InlineVisibilityIcon visibility={point.visibility} />}{!letterMode && ' '}{linkifyText(stripHashtags(point.statement, point.tags))}
          </p>
        </div>

        {!letterMode && point.tags?.length > 0 && <TagPills tags={point.tags} context="live" className="mt-1" />}
        <PositionButtons
          userPosition={userPosition}
          counts={toSevenPointCounts(point.positionCounts)}
          onPositionClick={handlePositionClick}
          compact
          narrow
          disabled={readOnly || disablePositionButtons}
        />

        {/* P490: Guest hint — positions are ephemeral, prompt to sign up */}
        {!letterMode && !readOnly && isGuest && userPosition && (
          <div className="border-t border-gray-200 pt-2">
            <p className="text-xs text-gray-500">
              Position shared live — sign up to save it
            </p>
          </div>
        )}

        {/* Render slot for letter-specific content (Submit button, position reveal) */}
        {children}
      </div>
    </div>
  );
}
