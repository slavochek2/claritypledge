/**
 * @file StoryCardDetail.tsx
 * @description Story card component for detail views - forked from prototype StoryCard.
 * Accepts data via props instead of importing from mock-data.
 *
 * Visual: Blue left border, author avatar, linked Points shown below with thread lines.
 */

import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LinkedText } from '@/app/components/shared/linked-text';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Pin,
} from 'lucide-react';
import { EarBadge } from '@/components/ui/ear-badge';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import {
  PositionButtons,
  PositionBadge,
  ShareButton,
  MobileTooltip,
  ThreadLineGroup,
  ThreadLineItem,
} from '@/app/components/shared';
import type { StoryWithAuthor, PointSummary, PositionType, PointPosition } from '@/app/types';
import { TagPills } from '@/app/components/shared/tag-pills';
import { stripHashtags } from '@/lib/utils';

/** Minimal story shape needed to display a linked story card inside QuotedPoint */
type LinkedStory = Pick<
  StoryWithAuthor,
  'id' | 'content' | 'authorId' | 'authorName' | 'authorSlug' | 'authorAvatarUrl' | 'authorEarsCount' | 'authorHasPledged'
>;
import { getPositionCTACopy, adjustPositionCounts } from '@/app/utils/position-helpers';

/** Display context for StoryCard - controls what's shown */
export type StoryCardContext = 'profile' | 'point-detail' | 'story-detail';

interface StoryCardDetailProps {
  story: StoryWithAuthor;
  linkedPoints: PointSummary[];
  /** Position counts for each linked point - Map<pointId, Record<PositionType, number>> */
  positionCounts: Map<string, Record<PositionType, number>>;
  /** Current user positions - Map<pointId, PointPosition> */
  userPositions: Map<string, PointPosition>;
  /** Profile/story owner positions - Map<pointId, PointPosition>. Drives badges next to author name. */
  profileOwnerPositions?: Map<string, PointPosition>;
  /** Callback when user clicks a position button */
  onPositionClick?: (pointId: string, position: PositionType) => Promise<void>;
  compact?: boolean;
  isDetailView?: boolean;
  /** Suppress card navigation even when not in detail view (e.g. inside live session UI) */
  disableNavigation?: boolean;
  /** Display context - 'profile' hides QuotedPoints, 'point-detail' hides QuotedPoints */
  context?: StoryCardContext;
  /** Show "Verify" button in card footer */
  showVerifyButton?: boolean;
  /** Callback for verify button */
  onVerify?: (e: React.MouseEvent) => void;
  /** Author's position on the Point (used for data context in point-detail view) */
  authorPosition?: PositionType;
  /** Route generator - defaults to /story/:id and /point/:id */
  routes?: {
    story?: (id: string) => string;
    point?: (id: string) => string;
    profile?: (id: string) => string;
  };
  /** Other stories that contain each linked point. Map<pointId, stories[]> */
  linkedStoriesForPoints?: Map<string, LinkedStory[]>;
  /** Visibility indicator rendered inline after the date. Pass a dropdown for authors, static icon for others. */
  visibilitySlot?: React.ReactNode;
  /** Icon-only action buttons rendered in the footer row before Share. Author-only (edit, delete). */
  footerActionsSlot?: React.ReactNode;
  /** Current viewer's user ID — used to scope story CTA count (P456) */
  currentUserId?: string;
  /** Suppress share + external-link action icons in the footer (default: false) */
  hideActions?: boolean;
}

/**
 * StoryCardDetail - displays a personal experience (Story)
 * Visual: Blue left border, author avatar, linked Points shown below
 */
export function StoryCardDetail({
  story,
  linkedPoints,
  positionCounts,
  userPositions,
  profileOwnerPositions,
  onPositionClick,
  compact = false,
  isDetailView = false,
  disableNavigation = false,
  context,
  showVerifyButton = false,
  onVerify,
  authorPosition,
  routes = {},
  linkedStoriesForPoints,
  visibilitySlot,
  footerActionsSlot,
  currentUserId,
  hideActions = false,
}: StoryCardDetailProps) {
  const navigate = useNavigate();
  const [pointsExpanded, setPointsExpanded] = useState(isDetailView);

  // Default routes
  const storyRoute = routes.story || ((id: string) => `/story/${id}`);
  const pointRoute = routes.point || ((id: string) => `/point/${id}?from=${story.authorId}`);
  const profileRoute = routes.profile || ((id: string) => `/p/${id}`);

  const handleCardClick = () => {
    if (!isDetailView && !disableNavigation) {
      navigate(storyRoute(story.id));
    }
  };

  // Format time ago
  const formatTimeAgo = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
  };

  // Quote pattern: show position label outside when in point-detail context with authorPosition
  const showQuotePattern = context === 'point-detail' && authorPosition;

  // Quote pattern rendering - when viewing Stories in a Point's position sections
  if (showQuotePattern) {
    return (
      <div className="bg-card rounded-lg overflow-hidden">
        {/* Position label OUTSIDE the quoted box - Avatar → Name → Ear → Badge */}
        <div className="flex items-center gap-1.5 mb-2 text-sm text-foreground">
          <GravatarAvatar
            name={story.authorName}
            photoUrl={story.authorAvatarUrl}
            size="sm"
            isPledger={story.authorHasPledged ?? false}
            className="!w-5 !h-5 !text-[10px]"
          />
          <span className="font-medium">{story.authorName}</span>
          <EarBadge count={story.authorEarsCount ?? 0} name={story.authorName} />
          <PositionBadge position={authorPosition} />
        </div>

        {/* Quoted Story box */}
        <div
          role="button"
          tabIndex={0}
          className="bg-muted border border-border rounded-lg p-3 cursor-pointer hover:bg-accent hover:border-border transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          onClick={handleCardClick}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleCardClick();
            }
          }}
        >
          {/* Role + date (name/avatar already shown outside) */}
          <p className="text-xs text-muted-foreground mb-2">
            {formatTimeAgo(story.createdAt)}
          </p>

          {/* Story text */}
          <p className={`text-foreground break-words ${compact ? 'text-sm line-clamp-3' : 'text-base'}`}>
            <LinkedText text={stripHashtags(story.content, story.tags)} />
          </p>
        </div>
      </div>
    );
  }

  // Standard rendering (non-quote pattern)
  // Note: removed overflow-hidden to prevent dropdown menus from being clipped
  const cardClassName = isDetailView
    ? 'bg-card rounded-lg shadow-sm border-l-4 border-l-blue-500 border border-border'
    : 'group bg-card rounded-lg shadow-sm border-l-4 border-l-blue-500 border border-border cursor-pointer hover:border-blue-300 hover:shadow-md transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none';

  return (
    <div
      role={!isDetailView && !disableNavigation ? 'button' : undefined}
      tabIndex={!isDetailView && !disableNavigation ? 0 : undefined}
      className={cardClassName}
      onClick={!isDetailView && !disableNavigation ? handleCardClick : undefined}
      onKeyDown={
        !isDetailView && !disableNavigation
          ? e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleCardClick();
              }
            }
          : undefined
      }
    >
      {/* Main content */}
      <div className="p-4">
        {/* Author row with avatar */}
        <div className="flex items-start gap-3">
          {/* Avatar column */}
          <button
            onClick={e => {
              e.stopPropagation();
              navigate(profileRoute(story.authorSlug));
            }}
            className="flex-shrink-0 hover:opacity-80 transition-opacity self-start"
          >
            <GravatarAvatar name={story.authorName} photoUrl={story.authorAvatarUrl} size="sm" isPledger={story.authorHasPledged ?? false} />
          </button>

          {/* Content column - aligned under avatar */}
          <div className="flex-1 min-w-0">
            {/* Author info row */}
            <div className="mb-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={e => {
                    e.stopPropagation();
                    navigate(profileRoute(story.authorSlug));
                  }}
                  className="font-semibold text-foreground hover:underline text-sm"
                >
                  {story.authorName}
                </button>
                {/* Credibility stats */}
                <EarBadge count={story.authorEarsCount ?? 0} name={story.authorName} />
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>{formatTimeAgo(story.createdAt)}</span>
                {visibilitySlot && (
                  <>
                    <span className="opacity-40">·</span>
                    {visibilitySlot}
                  </>
                )}
              </div>
            </div>

            {/* Story text - indented under author */}
            <p className={`text-foreground break-words ${compact ? 'text-sm line-clamp-3' : 'text-base'}`}>
              <LinkedText text={stripHashtags(story.content, story.tags)} />
            </p>

            {/* Stats row - icon-only style */}
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                {/* People who understood the story author */}
                <MobileTooltip
                  content={`${story.authorName.split(' ')[0]} confirmed ${story.understoodCount} ${story.understoodCount === 1 ? 'person' : 'people'} understood this story`}
                >
                  <span className="px-2.5 py-1 bg-gray-100 rounded-full text-sm text-muted-foreground">
                    {story.understoodCount} understood
                  </span>
                </MobileTooltip>
              </div>
              {showVerifyButton && (
                <button
                  onClick={onVerify}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 transition-colors"
                >
                  Verify
                </button>
              )}
            </div>

            {/* P491: Tag pills */}
            {story.tags && story.tags.length > 0 && (
              <TagPills tags={story.tags} context="detail" className="mt-2" />
            )}
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
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
          >
            {/* Collapsible trigger (if has linked points) */}
            {linkedPoints.length > 0 ? (
              <button
                onClick={() => setPointsExpanded(!pointsExpanded)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-blue-600 transition-colors"
                aria-expanded={pointsExpanded}
                aria-label={`${pointsExpanded ? 'Collapse' : 'Expand'} linked points`}
              >
                {pointsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>
                  {linkedPoints.length} {linkedPoints.length === 1 ? 'point' : 'points'} by{' '}
                  {story.authorName}
                </span>
              </button>
            ) : (
              <span /> /* Empty span for flexbox spacing */
            )}

            {/* Action icons */}
            <div className="flex items-center gap-1">
              {footerActionsSlot}
              {!hideActions && (
                <ShareButton
                  type="story"
                  id={story.id}
                  title={`${story.authorName}'s story`}
                  description={story.content.slice(0, 100)}
                />
              )}
              <MobileTooltip content="Open story">
                <button
                  onClick={() => isDetailView
                    ? window.open(storyRoute(story.id), '_blank', 'noopener,noreferrer')
                    : navigate(storyRoute(story.id))
                  }
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-muted-foreground hover:bg-accent rounded-full transition-colors"
                  aria-label="Open story"
                >
                  <ExternalLink size={16} />
                </button>
              </MobileTooltip>
            </div>
          </div>

          {/* Linked points - expanded content */}
          {pointsExpanded &&
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
                      authorName={story.authorName}
                      authorAvatarUrl={story.authorAvatarUrl}
                      authorEarCount={story.authorEarsCount}
                      positionCounts={positionCounts}
                      userPositions={userPositions}
                      profileOwnerPositions={profileOwnerPositions}
                      onPositionClick={onPositionClick}
                      onClick={e => {
                        e.stopPropagation();
                        navigate(pointRoute(pointsToShow[0].id));
                      }}
                      linkedStories={linkedStoriesForPoints?.get(pointsToShow[0].id) ?? []}
                      onStoryClick={storyId => navigate(storyRoute(storyId))}
                      currentUserId={currentUserId}
                      hideLinkedStories
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
                            authorName={story.authorName}
                            authorAvatarUrl={story.authorAvatarUrl}
                            authorEarCount={story.authorEarsCount}
                            positionCounts={positionCounts}
                            userPositions={userPositions}
                            profileOwnerPositions={profileOwnerPositions}
                            onPositionClick={onPositionClick}
                            onClick={e => {
                              e.stopPropagation();
                              navigate(pointRoute(point.id));
                            }}
                            linkedStories={linkedStoriesForPoints?.get(point.id) ?? []}
                            onStoryClick={storyId => navigate(storyRoute(storyId))}
                            currentUserId={currentUserId}
                            hideLinkedStories
                          />
                        </ThreadLineItem>
                      ))}
                      {hasMorePoints && (
                        <ThreadLineItem isLast>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              navigate(storyRoute(story.id));
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
 * Twitter-style quoted Point card - shown within story card
 * Position buttons are interactive using same style as main PointCard
 */
function QuotedPoint({
  point,
  authorName,
  authorAvatarUrl,
  authorEarCount,
  positionCounts,
  userPositions,
  profileOwnerPositions,
  onPositionClick,
  onClick,
  linkedStories = [],
  onStoryClick,
  currentUserId,
  hideLinkedStories = false,
}: {
  point: PointSummary;
  authorName: string;
  authorAvatarUrl?: string;
  authorEarCount?: number;
  positionCounts: Map<string, Record<PositionType, number>>;
  userPositions: Map<string, PointPosition>;
  profileOwnerPositions?: Map<string, PointPosition>;
  onPositionClick?: (pointId: string, position: PositionType) => Promise<void>;
  onClick: (e: React.MouseEvent) => void;
  linkedStories?: LinkedStory[];
  onStoryClick?: (storyId: string) => void;
  currentUserId?: string;
  hideLinkedStories?: boolean;
}) {
  const navigate = useNavigate();
  const [storiesExpanded, setStoriesExpanded] = useState(false);
  const userPosition = userPositions.get(point.id);
  // Badge next to the author name shows the profile/story owner's own position (not the viewer's)
  const ownerPosition = profileOwnerPositions?.get(point.id);
  const baseCounts = useMemo(
    () => positionCounts.get(point.id) ?? {
      strongly_agree: 0,
      agree: 0,
      somewhat_agree: 0,
      unsure: 0,
      somewhat_disagree: 0,
      disagree: 0,
      strongly_disagree: 0,
    },
    [positionCounts, point.id]
  );

  // Optimistic override — cleared once parent confirms the update
  const [localPosition, setLocalPosition] = useState<PositionType | null>(null);
  const serverPosition = userPosition?.position ?? null;
  const effectivePosition = localPosition ?? serverPosition;

  // Clear local override once parent propagates the new server position
  useEffect(() => {
    if (localPosition !== null && localPosition === serverPosition) {
      setLocalPosition(null);
    } else if (localPosition === null && serverPosition === null) {
      // toggled off and server confirmed
    } else if (localPosition !== null && serverPosition !== localPosition) {
      // still in-flight — keep local override
    }
  }, [serverPosition, localPosition]);

  // Compute adjusted counts based on effective position vs server position
  const counts = useMemo(
    () => adjustPositionCounts(baseCounts, serverPosition, effectivePosition),
    [baseCounts, serverPosition, effectivePosition],
  );

  const handlePositionClick = async (position: PositionType) => {
    const newPosition = effectivePosition === position ? null : position;
    setLocalPosition(newPosition);
    if (onPositionClick) {
      await onPositionClick(point.id, position);
    }
  };

  return (
    <div className="w-full text-left">
      {/* Author header - always shown (position badge only when author has taken a position) */}
      <div className="flex items-center gap-1.5 mb-1.5 text-sm text-foreground">
        <GravatarAvatar
          name={authorName}
          photoUrl={authorAvatarUrl}
          size="sm"
          isPledger={false}
          className="!w-5 !h-5 !text-[10px]"
        />
        <span className="font-medium">{authorName}</span>
        <EarBadge count={authorEarCount ?? 0} name={authorName} size={14} />
        {ownerPosition && <PositionBadge position={ownerPosition.position} />}
      </div>

      {/* Quoted Point box */}
      {/* Note: removed overflow-hidden to prevent dropdown chevrons from being clipped */}
      {/* Changed from button to div to avoid nested button HTML violation (position buttons inside) */}
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(e as React.MouseEvent<HTMLDivElement>);
          }
        }}
        className="group/quote w-full text-left p-3 rounded-lg border border-border bg-muted hover:bg-accent hover:border-border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
            <p className="text-sm text-gray-800 break-words"><LinkedText text={stripHashtags(point.statement, point.tags)} /></p>
            {point.tags?.length > 0 && <TagPills tags={point.tags} context="detail" className="mt-1" />}

            {/* Position buttons - scaled to 85% to fit within quoted card width while keeping button proportions */}
            <div role="presentation" className="mt-2" onClick={e => e.stopPropagation()}>
              <PositionButtons
                userPosition={effectivePosition}
                counts={counts}
                onPositionClick={handlePositionClick}
                narrow
              />
            </div>
          </div>
        </div>

        {/* P456: Linked stories toggle — hidden on story detail (circular: shows the story you're reading) */}
        {!hideLinkedStories && linkedStories.length > 0 && (
          <div
            role="presentation"
            className="mt-2 pt-2 border-t border-gray-200 pl-[44px]"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setStoriesExpanded(v => !v)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-blue-600 transition-colors"
            >
              {storiesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>
                {linkedStories.length} {linkedStories.length === 1 ? 'story' : 'stories'}
              </span>
            </button>
            {storiesExpanded && (
              <div className="mt-2 space-y-2">
                {linkedStories.slice(0, 3).map(story => (
                  <LinkedStoryCard
                    key={story.id}
                    story={story}
                    onClick={() => onStoryClick?.(story.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* P456: Story CTA footer — hidden on story detail (redundant: you're already on a story for this point) */}
        {!hideLinkedStories && effectivePosition && (() => {
          const positionGroup = getPositionGroup(effectivePosition);
          const copy = getPositionCTACopy(positionGroup);
          const viewerStoryCount = linkedStories.filter(s => s.authorId === currentUserId).length;
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
                    onClick={e => { e.stopPropagation(); navigate(chatUrl); }}
                    aria-label={copy.ariaLabel}
                    className="font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    {copy.ctaText}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between w-full pr-2">
                  <button
                    onClick={e => { e.stopPropagation(); setStoriesExpanded(v => !v); }}
                    className="flex items-center gap-1 text-sm text-gray-600 hover:text-blue-600 transition-colors"
                  >
                    <span aria-hidden="true">▶</span>
                    <span>{viewerStoryCount} {viewerStoryCount === 1 ? 'story' : 'stories'}</span>
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); navigate(chatUrl); }}
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

/**
 * Compact story card shown inside a QuotedPoint's linked-stories section.
 */
function LinkedStoryCard({
  story,
  onClick,
}: {
  story: LinkedStory;
  onClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="flex items-center gap-1.5 mb-1">
        <GravatarAvatar
          name={story.authorName}
          photoUrl={story.authorAvatarUrl}
          size="sm"
          isPledger={story.authorHasPledged ?? false}
          className="!w-5 !h-5 !text-[10px]"
        />
        <span className="text-xs font-medium text-muted-foreground">{story.authorName}</span>
        <EarBadge count={story.authorEarsCount ?? 0} name={story.authorName} size={11} />
      </div>
      <p className="text-sm text-foreground line-clamp-2 break-words"><LinkedText text={story.content} /></p>
    </div>
  );
}
