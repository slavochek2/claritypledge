/**
 * @file story-card-with-links.tsx
 * @description Production StoryCard component with linked Points support
 * Refactored from prototype to accept explicit props instead of using mock data
 */

import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, ChevronDown, ChevronRight, ExternalLink, Pin } from 'lucide-react';
import { LinkedText } from '@/app/components/shared/linked-text';
import { EarBadge } from '@/components/ui/ear-badge';
import { MobileTooltip } from '@/app/components/shared/mobile-tooltip';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import {
  PositionButtons,
  PositionBadge,
  ShareButton,
  VisibilityBadge,
  ThreadLineGroup,
  ThreadLineItem,
  type SevenPointCounts,
} from '@/app/prototypes/linkedin-like/components/shared';
import type { Story, Point, PositionButtonGroup } from '@/app/prototypes/shared/types';
import type { PositionType } from '@/app/prototypes/shared/types';
import { getPositionGroup, getPositionCTACopy } from '@/app/prototypes/shared/types';
import { TagPills } from '@/app/components/shared/tag-pills';
import { stripHashtags } from '@/lib/utils';

/** Display context for StoryCard - controls what's shown */
export type StoryCardContext = 'profile' | 'point-detail' | 'story-detail';

/** Author information for a story */
export interface StoryAuthor {
  id: string;
  name: string;
  role?: string;
  hasPledged?: boolean;
  ear?: number; // Ear credibility count
}

interface StoryCardWithLinksProps {
  story: Story;
  author: StoryAuthor;
  linkedPoints?: Point[];
  compact?: boolean;
  isDetailView?: boolean;
  /** Display context - 'profile' hides QuotedPoints, 'point-detail' hides QuotedPoints */
  context?: StoryCardContext;
  /** Show "Verify" button in card footer */
  showVerifyButton?: boolean;
  /** Callback for verify button */
  onVerify?: (e: React.MouseEvent) => void;
  /** Show thread line styling (used in point-detail hierarchy) */
  showThreadLine?: boolean;
  /** Author's position on the Point (used for data context, display removed to reduce redundancy since position sections already group by stance) */
  profileSubjectPosition?: PositionType;
  /** Hide action buttons (share, visibility) - useful in live session context */
  hideActions?: boolean;
  /** Disable click-to-navigate behavior */
  disableNavigation?: boolean;
  /** Get position counts for a point (for interactive position buttons) */
  getPointPositionCounts?: (point: Point) => SevenPointCounts;
  /** Callback when user clicks on a point */
  onPointClick?: (pointId: string) => void;
  /** Current user ID for position tracking */
  currentUserId?: string;
  /** Map of pointId → viewer's story count for that point (P456) */
  viewerStoriesPerPoint?: Map<string, number>;
  /** P491: Tags for tag pill display (prototype Story type lacks tags) */
  tags?: string[];
}

/**
 * StoryCardWithLinks - displays a personal experience (Story)
 * Visual: Blue left border, author avatar, linked Points shown below
 * Pattern B: Yellow border line shows linked Points
 *
 * Quote Pattern (P103): When context='point-detail' with profileSubjectPosition,
 * shows "{Name} {verb}:" outside a quoted box containing the story.
 */
export function StoryCardWithLinks({
  story,
  author,
  linkedPoints = [],
  compact = false,
  isDetailView = false,
  context,
  showVerifyButton = false,
  onVerify,
  showThreadLine: _showThreadLine = true,
  profileSubjectPosition,
  hideActions = false,
  disableNavigation = false,
  getPointPositionCounts,
  onPointClick,
  currentUserId,
  viewerStoriesPerPoint,
  tags,
}: StoryCardWithLinksProps) {
  const navigate = useNavigate();
  const isEmbed = new URLSearchParams(window.location.search).get('embed') === 'true';
  const embedNavigate = (path: string) => {
    if (isEmbed) {
      window.open(`${window.location.origin}${path}`, '_blank');
    } else {
      navigate(path);
    }
  };
  // In embed mode, never auto-expand points (iframe can't resize)
  const [pointsExpanded, setPointsExpanded] = useState(isDetailView && !isEmbed);
  const [textExpanded, setTextExpanded] = useState(false);

  // In embed mode, clicking "N points" navigates instead of expanding
  const handlePointsToggle = () => {
    if (isEmbed) {
      if (linkedPoints.length === 1) {
        embedNavigate(`/point/${linkedPoints[0].id}`);
      } else {
        embedNavigate(`/story/${story.id}`);
      }
    } else {
      setPointsExpanded(!pointsExpanded);
    }
  };
  useEffect(() => { setTextExpanded(false); }, [story.id]);
  const _isCurrentUserStory = currentUserId && story.authorId === currentUserId;
  // Embed: keep hashtags inline in text (no TagPills), saves vertical space
  // Embed: keep hashtags inline, strip markdown links [text](url) → text and raw URLs
  const rawText = isEmbed ? story.text : stripHashtags(story.text, tags);
  const fullText = isEmbed
    ? rawText.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/https?:\/\/\S+/g, '').replace(/\s{2,}/g, ' ').trim()
    : rawText;
  // In embed mode, truncate long story text to fit fixed-height iframe
  const EMBED_TRUNCATE = 200;
  const displayText = isEmbed && fullText.length > EMBED_TRUNCATE
    ? fullText.slice(0, EMBED_TRUNCATE).trimEnd() + '...'
    : fullText;
  const isStoryTextTruncated = isEmbed && fullText.length > EMBED_TRUNCATE;

  const handleCardClick = () => {
    if (!isDetailView && !disableNavigation) {
      embedNavigate(`/story/${story.id}`);
    }
  };

  // Format timestamp as relative time
  const formatTimeAgo = (timestamp: string): string => {
    const now = new Date();
    const then = new Date(timestamp);
    const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return `${Math.floor(seconds / 604800)}w ago`;
  };

  // Quote pattern: show position label outside when in point-detail context with profileSubjectPosition
  const showQuotePattern = context === 'point-detail' && profileSubjectPosition && author;

  // Quote pattern rendering - when viewing Stories in a Point's position sections
  if (showQuotePattern) {
    return (
      <div className="bg-white rounded-lg overflow-hidden">
        {/* Position label OUTSIDE the quoted box - Avatar → Name → Ear → Badge */}
        <div className="flex items-center gap-1.5 mb-2 text-sm text-gray-700">
          <GravatarAvatar
            name={author.name}
            size="sm"
            isPledger={author.hasPledged ?? false}
            className="!w-5 !h-5 !text-[10px]"
          />
          <span className="font-medium">{author.name}</span>
          <EarBadge count={author.ear ?? 0} name={author.name} />
          <PositionBadge position={profileSubjectPosition} />
        </div>

        {/* Quoted Story box */}
        <div
          role="button"
          tabIndex={0}
          className="bg-gray-50 border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-gray-100 hover:border-gray-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          onClick={handleCardClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleCardClick();
            }
          }}
        >
          {/* Role + date (name/avatar already shown outside) */}
          <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
            <span>
              {author.role || 'Member'} · {formatTimeAgo(story.createdAt)}
            </span>
            {!hideActions && <VisibilityBadge visibility={story.visibility} />}
          </p>

          {/* Story text */}
          {compact && !textExpanded && displayText.length > 150 ? (
            <p className="text-sm text-gray-900 break-words">
              <LinkedText text={displayText.slice(0, 150)} />
              <span
                data-testid="more-link"
                role="button"
                tabIndex={0}
                className="text-blue-600 font-medium cursor-pointer"
                onClick={(e) => { e.stopPropagation(); setTextExpanded(true); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setTextExpanded(true); } }}
              > ...more</span>
            </p>
          ) : (
            <p className={`text-gray-900 break-words ${compact ? 'text-sm' : 'text-base'}`}>
              {isEmbed ? displayText : <LinkedText text={displayText} />}
              {isStoryTextTruncated && (
                <button
                  onClick={(e) => { e.stopPropagation(); embedNavigate(`/story/${story.id}`); }}
                  className="ml-1 text-blue-600 hover:text-blue-700 text-sm"
                >
                  show more
                </button>
              )}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Standard rendering (non-quote pattern)
  const cardClassName = isDetailView
    ? 'bg-white rounded-lg shadow-sm border-l-4 border-l-blue-500 border border-gray-200 overflow-hidden'
    : 'group bg-white rounded-lg shadow-sm border-l-4 border-l-blue-500 border border-gray-200 overflow-hidden cursor-pointer hover:border-blue-300 hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2';

  return (
    <div
      role={!isDetailView && !disableNavigation ? 'button' : undefined}
      tabIndex={!isDetailView && !disableNavigation ? 0 : undefined}
      className={cardClassName}
      onClick={!isDetailView && !disableNavigation ? handleCardClick : undefined}
      onKeyDown={!isDetailView && !disableNavigation ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      } : undefined}
    >
      {/* Main content */}
      <div className="p-4">
        {/* Author row with avatar */}
        <div className="flex items-start gap-3">
          {/* Avatar column */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              embedNavigate(`/p/${author.id}`);
            }}
            className="flex-shrink-0 hover:opacity-80 transition-opacity self-start"
          >
            <GravatarAvatar
              name={author.name}
              size="sm"
              isPledger={author.hasPledged ?? false}
            />
          </button>

          {/* Content column - aligned under avatar */}
          <div className="flex-1 min-w-0">
            {/* Author info row */}
            <div className="mb-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    embedNavigate(`/p/${author.id}`);
                  }}
                  className="font-semibold text-gray-900 hover:underline text-sm"
                >
                  {author.name}
                </button>
                <EarBadge count={author.ear ?? 0} name={author.name} />
              </div>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <span>
                  {author.role || 'Member'} · {formatTimeAgo(story.createdAt)}
                </span>
                {!hideActions && <VisibilityBadge visibility={story.visibility} />}
              </p>
            </div>

            {/* Story text - indented under author */}
            {compact && !textExpanded && displayText.length > 150 ? (
              <p className="text-sm text-gray-900 break-words">
                <LinkedText text={displayText.slice(0, 150)} />
                <span
                  data-testid="more-link"
                  role="button"
                  tabIndex={0}
                  className="text-blue-600 font-medium cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); setTextExpanded(true); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setTextExpanded(true); } }}
                > ...more</span>
              </p>
            ) : (
              <p className={`text-gray-900 break-words ${compact ? 'text-sm' : 'text-base'}`}>
                {isEmbed ? displayText : <LinkedText text={displayText} />}
                {isStoryTextTruncated && (
                  <button
                    onClick={(e) => { e.stopPropagation(); embedNavigate(`/story/${story.id}`); }}
                    className="ml-1 text-blue-600 hover:text-blue-700 text-sm"
                  >
                    show more
                  </button>
                )}
              </p>
            )}

            {/* P491: Tag pills — after text, before stats (hidden in embed — hashtags stay inline) */}
            {!isEmbed && tags && tags.length > 0 && (
              <TagPills tags={tags} context="detail" className="mt-2" />
            )}

            {/* Stats row - icon-only style */}
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-1 text-sm text-gray-600">
                {/* People who understood the story author */}
                <MobileTooltip
                  content={`${author.name.split(' ')[0]} confirmed ${
                    story.verificationCount
                  } ${story.verificationCount === 1 ? 'person' : 'people'} understood this story`}
                >
                  <span className="px-2.5 py-1 bg-gray-100 rounded-full text-sm text-gray-600">
                    {story.verificationCount} understood
                  </span>
                </MobileTooltip>
              </div>
              {showVerifyButton && onVerify && (
                <button
                  onClick={onVerify}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 transition-colors"
                >
                  <MessageCircle size={12} />
                  Verify
                </button>
              )}
            </div>

            {/* point-detail context: Hide QuotedPoints entirely - Stories are already in Point context */}
          </div>
        </div>
      </div>

      {/* Footer row with linked points and action icons - hide in point-detail context */}
      {context !== 'point-detail' && (
        <>
          {/* Footer header row */}
          <div
            role="presentation"
            className="flex items-center justify-between pl-[52px] pr-4 py-3 border-t border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Collapsible trigger (if has linked points) */}
            {linkedPoints.length > 0 ? (
              <button
                onClick={handlePointsToggle}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
                aria-expanded={pointsExpanded}
                aria-label={`${pointsExpanded ? 'Collapse' : 'Expand'} linked points`}
              >
                {pointsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>
                  {linkedPoints.length} {linkedPoints.length === 1 ? 'point' : 'points'} by{' '}
                  {author.name}
                </span>
              </button>
            ) : (
              <span /> /* Empty span for flexbox spacing */
            )}

            {/* Action icons — embed: open button only (no share) */}
            {!hideActions && (
              <div className="flex items-center gap-1">
                {!isEmbed && (
                  <ShareButton
                    type="story"
                    id={story.id}
                    title={`${author.name}'s story`}
                    description={story.text.slice(0, 100)}
                  />
                )}
                {/* External link - always in embed (need escape hatch), feed only otherwise */}
                {(isEmbed || (!isDetailView && !disableNavigation)) && (
                  <MobileTooltip content="Open story">
                    <button
                      onClick={() => embedNavigate(`/story/${story.id}`)}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                      aria-label="Open story"
                    >
                      <ExternalLink size={16} />
                    </button>
                  </MobileTooltip>
                )}
              </div>
            )}
          </div>

          {/* Linked points - expanded content (never in embed — opens new tab instead) */}
          {!isEmbed &&
            pointsExpanded &&
            linkedPoints.length > 0 &&
            (() => {
              const pointsToShow = linkedPoints.slice(0, isDetailView ? undefined : 3);
              const hasMorePoints = !isDetailView && linkedPoints.length > 3;

              return (
                <div className="pl-4 sm:pl-[68px] pr-4 pb-4">
                  {pointsToShow.length === 1 ? (
                    // Single point - no thread lines
                    <QuotedPoint
                      point={pointsToShow[0]}
                      authorName={author.name}
                      authorId={story.authorId}
                      authorEarCount={author.ear}
                      authorHasPledged={author.hasPledged}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onPointClick) {
                          onPointClick(pointsToShow[0].id);
                        } else {
                          embedNavigate(`/point/${pointsToShow[0].id}`);
                        }
                      }}
                      getPointPositionCounts={getPointPositionCounts}
                      currentUserId={currentUserId}
                      viewerStoryCount={viewerStoriesPerPoint?.get(pointsToShow[0].id) ?? 0}
                    />
                  ) : (
                    // 2+ points - show thread lines
                    <ThreadLineGroup>
                      {pointsToShow.map((point, index) => (
                        <ThreadLineItem
                          key={point.id}
                          isLast={index === pointsToShow.length - 1 && !hasMorePoints}
                        >
                          <QuotedPoint
                            point={point}
                            authorName={author.name}
                            authorId={story.authorId}
                            authorEarCount={author.ear}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onPointClick) {
                                onPointClick(point.id);
                              } else {
                                embedNavigate(`/point/${point.id}`);
                              }
                            }}
                            getPointPositionCounts={getPointPositionCounts}
                            currentUserId={currentUserId}
                            viewerStoryCount={viewerStoriesPerPoint?.get(point.id) ?? 0}
                          />
                        </ThreadLineItem>
                      ))}
                      {hasMorePoints && (
                        <ThreadLineItem isLast>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              embedNavigate(`/story/${story.id}`);
                            }}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            +{linkedPoints.length - 3} more points
                          </button>
                        </ThreadLineItem>
                      )}
                    </ThreadLineGroup>
                  )}
                </div>
              );
            })()}
        </>
      )}
    </div>
  );
}

/**
 * Twitter-style quoted Point card - Quote pattern per P103
 * Shows "{Name} {verb}:" outside the Point box, Point content inside quoted box
 * Position buttons are interactive using same style as main PointCard
 */
function QuotedPoint({
  point,
  authorName,
  authorId,
  authorEarCount,
  authorHasPledged,
  onClick,
  getPointPositionCounts,
  currentUserId,
  viewerStoryCount = 0,
}: {
  point: Point;
  authorName: string;
  authorId: string;
  authorEarCount?: number;
  authorHasPledged?: boolean;
  onClick: (e: React.MouseEvent) => void;
  getPointPositionCounts?: (point: Point) => SevenPointCounts;
  currentUserId?: string;
  viewerStoryCount?: number;
}) {
  const navigate = useNavigate();
  const isEmbed = new URLSearchParams(window.location.search).get('embed') === 'true';
  const embedNavigate = (path: string) => {
    if (isEmbed) {
      window.open(`${window.location.origin}${path}`, '_blank');
    } else {
      navigate(path);
    }
  };
  const [userPosition, setUserPosition] = useState<PositionType | null>(
    currentUserId ? point.positions[currentUserId]?.position || null : null
  );
  const profileSubjectPosition = point.positions[authorId]?.position;

  // Get base counts or use defaults
  const baseCounts = useMemo(
    () => getPointPositionCounts?.(point) ?? {
      strongly_agree: 0,
      agree: 0,
      somewhat_agree: 0,
      unsure: 0,
      somewhat_disagree: 0,
      disagree: 0,
      strongly_disagree: 0,
    },
    [getPointPositionCounts, point]
  );

  // Track initial position
  const initialPosition = currentUserId
    ? point.positions[currentUserId]?.position || null
    : null;

  // Compute adjusted counts based on user's current position vs initial
  const counts = useMemo((): SevenPointCounts => {
    const adjusted: SevenPointCounts = {
      strongly_agree: 0,
      agree: baseCounts.agree,
      somewhat_agree: 0,
      unsure: baseCounts.unsure,
      somewhat_disagree: 0,
      disagree: baseCounts.disagree,
      strongly_disagree: 0,
    };

    const getGroup = (pos: PositionType | null): PositionButtonGroup | null => {
      if (!pos) return null;
      return getPositionGroup(pos);
    };

    const initialGroup = getGroup(initialPosition);
    const currentGroup = getGroup(userPosition);

    if (initialGroup !== currentGroup) {
      if (initialGroup === 'agree') adjusted.agree = Math.max(0, adjusted.agree - 1);
      else if (initialGroup === 'disagree')
        adjusted.disagree = Math.max(0, adjusted.disagree - 1);
      else if (initialGroup === 'unsure') adjusted.unsure = Math.max(0, adjusted.unsure - 1);

      if (currentGroup === 'agree') adjusted.agree++;
      else if (currentGroup === 'disagree') adjusted.disagree++;
      else if (currentGroup === 'unsure') adjusted.unsure++;
    }

    return adjusted;
  }, [baseCounts, initialPosition, userPosition]);

  const handlePositionClick = (position: PositionType) => {
    const newPosition = userPosition === position ? null : position;
    setUserPosition(newPosition);
  };

  return (
    <div className="w-full text-left">
      {/* Position label OUTSIDE the quoted box - Avatar → Name → Ear → Badge */}
      {profileSubjectPosition && (
        <div className="flex items-center gap-1.5 mb-1.5 text-sm text-gray-700">
          <GravatarAvatar
            name={authorName}
            size="sm"
            isPledger={authorHasPledged ?? false}
            className="!w-5 !h-5 !text-[10px]"
          />
          <span className="font-medium">{authorName}</span>
          <EarBadge count={authorEarCount ?? 0} name={authorName} size={14} />
          <PositionBadge position={profileSubjectPosition} />
        </div>
      )}

      {/* Quoted Point box — changed from <button> to div[role=button] to fix nested button HTML violation */}
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
          }
        }}
        className="group/quote w-full text-left p-3 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        {/* Two-column layout matching PointCard structure */}
        <div className="flex items-start gap-3">
          {/* Pin icon column */}
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600">
            <Pin size={16} className="rotate-45" />
          </div>

          {/* Content column */}
          <div className="flex-1 min-w-0">
            {/* Point text */}
            <p className="text-sm text-gray-800 break-words"><LinkedText text={point.text} /></p>

            {/* Position buttons - compact */}
            {currentUserId && (
              <div role="presentation" className="mt-2" onClick={(e) => e.stopPropagation()}>
                <PositionButtons
                  userPosition={userPosition}
                  counts={counts}
                  onPositionClick={handlePositionClick}
                  compact
                  narrow
                />
              </div>
            )}
          </div>
        </div>

        {/* P456: Story CTA footer — shown when viewer has taken a position */}
        {userPosition && (() => {
          const positionGroup = getPositionGroup(userPosition);
          const copy = getPositionCTACopy(positionGroup);
          const chatUrl = `/create?pointId=${point.id}`;

          return (
            <div
              role="presentation"
              className="mt-2 pt-2 border-t border-gray-200 pl-[44px] pr-1"
              onClick={e => e.stopPropagation()}
            >
              {viewerStoryCount === 0 ? (
                <div className="flex items-center gap-1 text-sm">
                  <span aria-hidden="true" className="text-gray-600">{copy.symbol}</span>
                  <span className="text-gray-600">{copy.label}</span>
                  <span aria-hidden="true" className="text-gray-400"> · </span>
                  <button
                    onClick={e => { e.stopPropagation(); embedNavigate(chatUrl); }}
                    aria-label={copy.ariaLabel}
                    className="font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    {copy.ctaText}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between w-full">
                  <button
                    onClick={e => { e.stopPropagation(); embedNavigate(`/point/${point.id}`); }}
                    className="flex items-center gap-1 text-sm text-gray-600 hover:text-blue-600 transition-colors"
                  >
                    <span aria-hidden="true">▶</span>
                    <span>{viewerStoryCount} {viewerStoryCount === 1 ? 'story' : 'stories'}</span>
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); embedNavigate(chatUrl); }}
                    className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    + add story →
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
