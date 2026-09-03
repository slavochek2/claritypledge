/**
 * @file story-card-with-links.tsx
 * @description Production StoryCard component with linked Points support
 * Refactored from prototype to accept explicit props instead of using mock data
 */

import { useState, useMemo, useEffect } from 'react';
import { MessageCircle, ChevronDown, ChevronRight, ExternalLink, Pin, Unlink2 } from 'lucide-react';
import { linkifyText } from '@/app/utils/linkify';
import { EarBadge } from '@/components/ui/ear-badge';
import { UnderstoodBadge } from '@/components/ui/understood-badge';
import { useEmbedNavigation } from '@/app/hooks/useEmbedNavigation';
import { MobileTooltip } from '@/app/components/shared/mobile-tooltip';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { useAgentAccountIds } from '@/app/contexts/agent-accounts-context';
import {
  PositionButtons,
  PositionBadge,
  ShareButton,
  InlineVisibilityIcon,
  ThreadLineGroup,
  ThreadLineItem,
  type SevenPointCounts,
} from '@/app/components/shared';
import type { PositionType } from '@/app/types';
import { getPositionGroup, getPositionCTACopy, adjustPositionCounts } from '@/app/utils/position-helpers';
import type { Story, Point } from '@/app/components/shared/prototype-types';
import { TagPills } from '@/app/components/shared/tag-pills';
import { StoryMedia } from '@/app/components/shared/story-media';
import { AgentByline } from '@/app/components/shared/agent-byline';
import { normalizeVideoQuotes } from '@/lib/video';
import { stripHashtags } from '@/lib/utils';
import { storyTextForDisplay } from '@/lib/story-quotes';
import type { StoryAuthor } from '@/app/components/social/point-card-with-links';

/** Display context for StoryCard - controls what's shown */
export type StoryCardContext = 'profile' | 'point-detail' | 'story-detail';

// Re-export for consumers that import StoryAuthor from here
export type { StoryAuthor };

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
  /** P621: Callback to unlink this story from a point (point-detail context only) */
  onUnlinkPoint?: (storyId: string) => void;
  /** P847: Clear viewer's persisted position. Wire onClear once at page level. Do not instantiate a per-row guard. */
  onClear?: () => void;
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
  onUnlinkPoint,
  onClear,
}: StoryCardWithLinksProps) {
  const { isEmbed, isExpanded, embedNavigate } = useEmbedNavigation();
  // Points collapsed by default — position badge outside quoted box already shows author's stance
  const [pointsExpanded, setPointsExpanded] = useState(isDetailView || isExpanded);
  const [textExpanded, setTextExpanded] = useState(false);

  // Toggle linked points expansion (works in both embed and regular mode)
  const handlePointsToggle = () => {
    setPointsExpanded(!pointsExpanded);
  };
  useEffect(() => { setTextExpanded(false); }, [story.id]);
  const isAuthor = currentUserId ? story.authorId === currentUserId : false;
  const { isAgentAccountId, isLoading: identityPending } = useAgentAccountIds();
  const isAgent = isAgentAccountId(story.authorId);
  // P1212 §1 — the quote label belongs to StoryVideoQuotes,
  // which is the only thing that renders the quote BODIES. This surface renders neither,
  // so it renders no label either: a heading with nothing under it is the defect §1 makes
  // visible, not a smaller version of it.
  const rawText = storyTextForDisplay(story.text, tags);
  const fullText = rawText;
  // In embed mode, truncate long story text to keep embed compact
  const EMBED_TRUNCATE = 750;
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
        <div className={`flex items-center gap-1.5 mb-2 text-sm text-gray-700${isAgent ? ' agent-card-drained' : ''}`} {...(isAgent ? { 'data-agent-row': 'true' } : {})}>
          <GravatarAvatar
            name={author.name}
            photoUrl={author.avatarUrl}
            avatarColor={author.avatarColor}
            size="sm"
            isPledger={author.hasPledged ?? false}
            isAgent={isAgent}
            identityPending={identityPending}
            className="!w-5 !h-5 !text-[10px]"
          />
          <span className={`inline-flex items-center gap-1.5${isAgent ? ' agent-drained-chrome' : ''}`}>
            {/* P1141 amendment: an agent account is named the same way on every surface;
                the raw stored `Agent · {Name}` used to leak through here. */}
            {isAgent ? (
              <AgentByline name={author.name} />
            ) : (
              <span className="font-medium">{author.name}</span>
            )}
            {!isAgent && !identityPending && <EarBadge count={author.ear ?? 0} name={author.name} />}
            <PositionBadge position={profileSubjectPosition} />
          </span>
        </div>

        {/* Quoted Story box */}
        <div
          role="button"
          tabIndex={0}
          className="relative bg-gray-50 border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-gray-100 hover:border-gray-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          onClick={handleCardClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleCardClick();
            }
          }}
        >
          {/* Role + date (name/avatar already shown outside) */}
          <p className="text-xs text-gray-500 mb-2">
            {author.role || 'Member'} · {formatTimeAgo(story.createdAt)}
            {!hideActions && <> · <InlineVisibilityIcon visibility={story.visibility} /></>}
          </p>

          {/* Story text */}
          {compact && !textExpanded && displayText.length > 280 ? (
            <p className="text-sm text-gray-900 break-words">
              {linkifyText(displayText.slice(0, 280))}
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
              {linkifyText(displayText)}
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
  // P586: amber border for private stories, blue for public
  const isPrivateStory = story.visibility === 'private';
  const storyBorderColor = isPrivateStory ? 'border-l-amber-400' : 'border-l-blue-500';
  const storyBgTint = isPrivateStory ? 'bg-amber-50/50' : 'bg-white';
  const storyHoverBorder = isPrivateStory ? 'hover:border-amber-300' : 'hover:border-blue-300';
  const cardClassName = isDetailView
    ? `relative ${storyBgTint} rounded-lg shadow-sm border-l-4 ${storyBorderColor} border border-gray-200 overflow-hidden`
    : `relative group ${storyBgTint} rounded-lg shadow-sm border-l-4 ${storyBorderColor} border border-gray-200 overflow-hidden cursor-pointer ${storyHoverBorder} hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2`;

  return (
    <div
      role={!isDetailView && !disableNavigation ? 'button' : undefined}
      tabIndex={!isDetailView && !disableNavigation ? 0 : undefined}
      className={`${cardClassName}${isAgent ? ' agent-card-drained' : ''}`}
      {...(isAgent ? { 'data-agent-row': 'true' } : {})}
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
              photoUrl={author.avatarUrl}
              avatarColor={author.avatarColor}
              size="sm"
              isPledger={author.hasPledged ?? false}
              isAgent={isAgent}
              identityPending={identityPending}
            />
          </button>

          {/* P1141 amendment: the drain is NOT applied here — it used to wrap this whole
              content column and greyed the video, the quote pills and the viewer's own
              controls. See src/index.css. */}
          <div className="flex-1 min-w-0">
            {/* Author info row */}
            <div className="mb-2">
              <div className="flex min-w-0 items-center gap-1.5">
                {/* P1141: `[MACHINE] reading of {Full Name}`, NAME is the only link.
                    AgentByline owns its own button — never wrap it in one. */}
                {isAgent && !identityPending ? (
                  <AgentByline
                    name={author.name}
                    onNameClick={(e) => {
                      e.stopPropagation();
                      embedNavigate(`/p/${author.id}`);
                    }}
                  />
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      embedNavigate(`/p/${author.id}`);
                    }}
                    className="font-semibold text-gray-900 hover:underline text-sm min-w-0"
                  >
                    {author.name}
                  </button>
                )}
                {!isAgent && !identityPending && <EarBadge count={author.ear ?? 0} name={author.name} />}
              </div>
              <p className="text-xs text-gray-500 inline-flex items-center gap-1">
                <span>{author.role || 'Member'} · {formatTimeAgo(story.createdAt)}</span>
                {!hideActions && <InlineVisibilityIcon visibility={story.visibility} />}
              </p>
            </div>

            {/* Supporting image. P1141: video wins when present; the image path is untouched. */}
            {(story.videoUrl || story.imageUrl) && (
              <StoryMedia
                videoUrl={story.videoUrl}
                durationSeconds={normalizeVideoQuotes(story.videoQuotes).durationSeconds}
                mode="thumbnail"
                storyHref={`/story/${story.id}`}
                className="mt-1 mb-2"
                imageProps={story.imageUrl ? {
                  src: story.imageUrl,
                  authorName: author.name,
                  className: 'mt-1 mb-2',
                } : undefined}
              />
            )}

            {/* Story text - indented under author */}
            {compact && !textExpanded && displayText.length > 280 ? (
              <p className="text-sm text-gray-900 break-words">
                {linkifyText(displayText.slice(0, 280))}
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
                {linkifyText(displayText)}
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

            {/* P491: Tag pills — after text, before stats */}
            {tags && tags.length > 0 && (
              <TagPills tags={tags} context="detail" className="mt-2" />
            )}

            {/* Stats row - icon-only style */}
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-1 text-sm text-gray-600">
                {/* P1141: gated on identityPending too — the registry fails closed, and reading
                    isAgent while it loads renders an agent story as a human one. */}
                {!isAgent && !identityPending && <UnderstoodBadge count={story.understoodCount} />}
              </div>
              <div className="flex items-center gap-1">
                {showVerifyButton && onVerify && !isAgent && !identityPending && (
                  <button
                    onClick={onVerify}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 transition-colors"
                  >
                    <MessageCircle size={12} />
                    Verify
                  </button>
                )}
                {/* P621: Unlink button for story author in point-detail context */}
                {context === 'point-detail' && !hideActions && !isEmbed && onUnlinkPoint && (
                  <MobileTooltip content="Unlink point from story">
                    <button
                      onClick={(e) => { e.stopPropagation(); onUnlinkPoint(story.id); }}
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      aria-label="Unlink point from story"
                    >
                      <Unlink2 size={16} />
                    </button>
                  </MobileTooltip>
                )}
                {/* P542: Share button in stats row for point-detail context (footer is hidden) */}
                {context === 'point-detail' && !hideActions && !isEmbed && (
                  <ShareButton
                    type="story"
                    id={story.id}
                    title={`${author.name}'s story`}
                    description={story.text.slice(0, 100)}
                  />
                )}
              </div>
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
            className="flex items-center justify-between pl-4 sm:pl-[52px] pr-4 py-3 border-t border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Point count (always shown) + author CTA */}
            <div className="flex items-center gap-2">
              {linkedPoints.length > 0 ? (
                <button
                  onClick={handlePointsToggle}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
                  aria-expanded={pointsExpanded}
                  aria-label={`${pointsExpanded ? 'Collapse' : 'Expand'} linked points`}
                >
                  {pointsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>
                    {linkedPoints.length} {linkedPoints.length === 1 ? 'point' : 'points'}
                  </span>
                </button>
              ) : (
                <span className="text-sm text-gray-600">0 points</span>
              )}
              {/* Author CTA — hidden in embed and live session modes */}
              {!isEmbed && !hideActions && isAuthor && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    embedNavigate(`/story/${story.id}?addPoint=true`);
                  }}
                  className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 transition-colors whitespace-nowrap"
                  aria-label="Add a point to this story"
                >
                  + Add point
                </button>
              )}
            </div>

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

          {/* Linked points - expanded content (shown in embed to display author's stance) */}
          {pointsExpanded &&
            linkedPoints.length > 0 &&
            (() => {
              return (
                <div className="pl-4 sm:pl-[68px] pr-4 pb-4">
                  {linkedPoints.length === 1 ? (
                    // Single point - no thread lines
                    <QuotedPoint
                      point={linkedPoints[0]}
                      authorName={author.name}
                      authorId={story.authorId}
                      authorEarCount={author.ear}
                      authorHasPledged={author.hasPledged}
                      authorAvatarUrl={author.avatarUrl}
                      authorAvatarColor={author.avatarColor}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onPointClick) {
                          onPointClick(linkedPoints[0].id);
                        } else {
                          embedNavigate(`/point/${linkedPoints[0].id}`);
                        }
                      }}
                      getPointPositionCounts={getPointPositionCounts}
                      currentUserId={currentUserId}
                      viewerStoryCount={viewerStoriesPerPoint?.get(linkedPoints[0].id) ?? 0}
                      onClear={onClear}
                    />
                  ) : (
                    // 2+ points - show thread lines
                    <ThreadLineGroup>
                      {linkedPoints.map((point, index) => (
                        <ThreadLineItem
                          key={point.id}
                          isLast={index === linkedPoints.length - 1}
                        >
                          <QuotedPoint
                            point={point}
                            authorName={author.name}
                            authorId={story.authorId}
                            authorEarCount={author.ear}
                            authorAvatarUrl={author.avatarUrl}
                            authorAvatarColor={author.avatarColor}
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
                            onClear={onClear}
                          />
                        </ThreadLineItem>
                      ))}
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
  authorAvatarUrl,
  authorAvatarColor,
  onClick,
  getPointPositionCounts,
  currentUserId,
  viewerStoryCount = 0,
  onClear,
}: {
  point: Point;
  authorName: string;
  authorId: string;
  authorEarCount?: number;
  authorHasPledged?: boolean;
  authorAvatarUrl?: string;
  authorAvatarColor?: string;
  onClick: (e: React.MouseEvent) => void;
  getPointPositionCounts?: (point: Point) => SevenPointCounts;
  currentUserId?: string;
  viewerStoryCount?: number;
  // P847: Wire onClear once at page level. Do not instantiate a per-row guard.
  onClear?: () => void;
}) {
  const { isEmbed, embedNavigate } = useEmbedNavigation();
  const { isAgentAccountId, isLoading: identityPending } = useAgentAccountIds();
  const isAgent = isAgentAccountId(authorId);
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
  const counts = useMemo(
    () => adjustPositionCounts(baseCounts, initialPosition, userPosition),
    [baseCounts, initialPosition, userPosition],
  );

  const handlePositionClick = (position: PositionType) => {
    const newPosition = userPosition === position ? null : position;
    setUserPosition(newPosition);
  };

  return (
    <div className="w-full text-left">
      {/* Identity-and-position row: reserved for the other person. Hidden when viewer === story author. */}
      {profileSubjectPosition && currentUserId !== authorId && (
        <div className={`flex items-center gap-1.5 mb-1.5 text-sm text-gray-700${isAgent ? ' agent-card-drained' : ''}`} {...(isAgent ? { 'data-agent-row': 'true' } : {})}>
          <GravatarAvatar
            name={authorName}
            photoUrl={authorAvatarUrl}
            avatarColor={authorAvatarColor}
            size="sm"
            isPledger={authorHasPledged ?? false}
            isAgent={isAgent}
            identityPending={identityPending}
            className="!w-5 !h-5 !text-[10px]"
          />
          <span className={`inline-flex items-center gap-1.5${isAgent ? ' agent-drained-chrome' : ''}`}>
            {/* P1141 amendment: an agent account is named the same way on every surface;
                the raw stored `Agent · {Name}` used to leak through here. */}
            {isAgent ? (
              <AgentByline name={authorName} />
            ) : (
              <span className="font-medium">{authorName}</span>
            )}
            {!isAgent && !identityPending && <EarBadge count={authorEarCount ?? 0} name={authorName} size={14} />}
            <PositionBadge position={profileSubjectPosition} />
          </span>
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
            <p className="text-sm text-gray-800 break-words">{linkifyText(stripHashtags(point.text, point.tags))}</p>
            {point.tags?.length > 0 && <TagPills tags={point.tags} context="detail" className="mt-1" />}

            {/* Position buttons - compact */}
            {currentUserId && (
              <div role="presentation" className="mt-2" onClick={(e) => e.stopPropagation()}>
                <PositionButtons
                  userPosition={userPosition}
                  counts={counts}
                  onPositionClick={handlePositionClick}
                  compact
                  narrow
                  onClear={onClear}
                />
              </div>
            )}
          </div>
        </div>

        {/* P456: Story CTA footer — hidden in embeds (read-only previews) */}
        {!isEmbed && userPosition && (() => {
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
                    className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    + Add story
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
