/**
 * @file StoryCardDetail.tsx
 * @description Story card component for detail views - forked from prototype StoryCard.
 * Accepts data via props instead of importing from mock-data.
 *
 * Visual: Blue left border, author avatar, linked Points shown below with thread lines.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Ear,
  Pin,
} from 'lucide-react';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import {
  PositionButtons,
  PositionBadge,
  ShareButton,
  VisibilityBadge,
  MobileTooltip,
  ThreadLineGroup,
  ThreadLineItem,
  type SevenPointCounts,
} from '@/app/prototypes/linkedin-like/components/shared';
import type { Story, Point, PositionType, PositionButtonGroup } from '@/app/prototypes/shared/types';
import { getPositionGroup } from '@/app/prototypes/shared/types';

/** User info for display */
export interface StoryAuthor {
  id: string;
  name: string;
  role?: string;
  hasPledged: boolean;
}

/** Credibility stats for display */
export interface CredibilityStats {
  ear: number;
  mic: number;
}

/** Display context for StoryCard - controls what's shown */
export type StoryCardContext = 'profile' | 'point-detail' | 'story-detail';

interface StoryCardDetailProps {
  story: Story;
  author: StoryAuthor;
  authorCredibility: CredibilityStats;
  linkedPoints: Point[];
  /** Position counts for each linked point */
  getPointPositionCounts: (point: Point) => SevenPointCounts;
  compact?: boolean;
  isDetailView?: boolean;
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
}

/**
 * StoryCardDetail - displays a personal experience (Story)
 * Visual: Blue left border, author avatar, linked Points shown below
 */
export function StoryCardDetail({
  story,
  author,
  authorCredibility,
  linkedPoints,
  getPointPositionCounts,
  compact = false,
  isDetailView = false,
  context,
  showVerifyButton = false,
  onVerify,
  authorPosition,
  routes = {},
}: StoryCardDetailProps) {
  const navigate = useNavigate();
  const [pointsExpanded, setPointsExpanded] = useState(isDetailView);

  // Default routes
  const storyRoute = routes.story || ((id: string) => `/story/${id}`);
  const pointRoute = routes.point || ((id: string) => `/point/${id}?from=${author.id}`);
  const profileRoute = routes.profile || ((id: string) => `/p/${id}`);

  const handleCardClick = () => {
    if (!isDetailView) {
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
  const showQuotePattern = context === 'point-detail' && authorPosition && author;

  // Quote pattern rendering - when viewing Stories in a Point's position sections
  if (showQuotePattern) {
    return (
      <div className="bg-card rounded-lg overflow-hidden">
        {/* Position label OUTSIDE the quoted box - Avatar → Name → Ear → Badge */}
        <div className="flex items-center gap-1.5 mb-2 text-sm text-foreground">
          <GravatarAvatar
            name={author.name}
            size="sm"
            isPledger={author.hasPledged}
            className="!w-5 !h-5 !text-[10px]"
          />
          <span className="font-medium">{author.name}</span>
          {authorCredibility.ear > 0 && (
            <MobileTooltip
              content={`${author.name.split(' ')[0]} understood ${authorCredibility.ear} ${authorCredibility.ear === 1 ? 'story' : 'stories'} as confirmed by their owners`}
            >
              <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                <Ear size={12} />
                {authorCredibility.ear}
              </span>
            </MobileTooltip>
          )}
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
          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <span>
              {author.role} · {formatTimeAgo(story.createdAt)}
            </span>
            <VisibilityBadge visibility={story.visibility} />
          </p>

          {/* Story text */}
          <p className={`text-foreground ${compact ? 'text-sm line-clamp-3' : 'text-base'}`}>
            {story.text}
          </p>
        </div>
      </div>
    );
  }

  // Standard rendering (non-quote pattern)
  const cardClassName = isDetailView
    ? 'bg-card rounded-lg shadow-sm border-l-4 border-l-blue-500 border border-border overflow-hidden'
    : 'group bg-card rounded-lg shadow-sm border-l-4 border-l-blue-500 border border-border overflow-hidden cursor-pointer hover:border-blue-300 hover:shadow-md transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none';

  return (
    <div
      role={isDetailView ? undefined : 'button'}
      tabIndex={isDetailView ? undefined : 0}
      className={cardClassName}
      onClick={handleCardClick}
      onKeyDown={
        isDetailView
          ? undefined
          : e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleCardClick();
              }
            }
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
              navigate(profileRoute(author.id));
            }}
            className="flex-shrink-0 hover:opacity-80 transition-opacity self-start"
          >
            <GravatarAvatar name={author.name} size="sm" isPledger={author.hasPledged} />
          </button>

          {/* Content column - aligned under avatar */}
          <div className="flex-1 min-w-0">
            {/* Author info row */}
            <div className="mb-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={e => {
                    e.stopPropagation();
                    navigate(profileRoute(author.id));
                  }}
                  className="font-semibold text-foreground hover:underline text-sm"
                >
                  {author.name}
                </button>
                {/* Credibility stats */}
                {authorCredibility.ear > 0 && (
                  <MobileTooltip
                    content={`${author.name.split(' ')[0]} understood ${authorCredibility.ear} ${authorCredibility.ear === 1 ? 'story' : 'stories'} as confirmed by their owners`}
                  >
                    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                      <Ear size={12} />
                      <span>{authorCredibility.ear}</span>
                    </span>
                  </MobileTooltip>
                )}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <span>
                  {author.role} · {formatTimeAgo(story.createdAt)}
                </span>
                <VisibilityBadge visibility={story.visibility} />
              </p>
            </div>

            {/* Story text - indented under author */}
            <p className={`text-foreground ${compact ? 'text-sm line-clamp-3' : 'text-base'}`}>
              {story.text}
            </p>

            {/* Stats row - icon-only style */}
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                {/* People who understood the story author */}
                <MobileTooltip
                  content={`${author.name.split(' ')[0]} confirmed ${story.verificationCount} ${story.verificationCount === 1 ? 'person' : 'people'} understood this story`}
                >
                  <span className="px-2.5 py-1 bg-gray-100 rounded-full text-sm text-muted-foreground">
                    {story.verificationCount} understood
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
          </div>
        </div>
      </div>

      {/* Footer row with linked points and action icons - hide in point-detail context */}
      {context !== 'point-detail' && (
        <>
          {/* Footer header row */}
          <div
            className="flex items-center justify-between pl-[52px] pr-4 py-3 border-t border-gray-100"
            onClick={e => e.stopPropagation()}
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
                  {author.name}
                </span>
              </button>
            ) : (
              <span /> /* Empty span for flexbox spacing */
            )}

            {/* Action icons */}
            <div className="flex items-center gap-1">
              <ShareButton
                type="story"
                id={story.id}
                title={`${author.name}'s story`}
                description={story.text.slice(0, 100)}
              />
              {/* External link - only in feed (redundant in detail view) */}
              {!isDetailView && (
                <MobileTooltip content="Open story">
                  <button
                    onClick={() => navigate(storyRoute(story.id))}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-muted-foreground hover:bg-accent rounded-full transition-colors"
                    aria-label="Open story"
                  >
                    <ExternalLink size={16} />
                  </button>
                </MobileTooltip>
              )}
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
                      authorName={author.name}
                      authorId={author.id}
                      authorEarCount={authorCredibility.ear}
                      getPointPositionCounts={getPointPositionCounts}
                      onClick={e => {
                        e.stopPropagation();
                        navigate(pointRoute(pointsToShow[0].id));
                      }}
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
                            authorId={author.id}
                            authorEarCount={authorCredibility.ear}
                            getPointPositionCounts={getPointPositionCounts}
                            onClick={e => {
                              e.stopPropagation();
                              navigate(pointRoute(point.id));
                            }}
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
  authorId,
  authorEarCount,
  getPointPositionCounts,
  onClick,
}: {
  point: Point;
  authorName: string;
  authorId: string;
  authorEarCount?: number;
  getPointPositionCounts: (point: Point) => SevenPointCounts;
  onClick: (e: React.MouseEvent) => void;
}) {
  const [userPosition, setUserPosition] = useState<PositionType | null>(
    (point.positions['current']?.position as PositionType) || null
  );
  const authorPosition = point.positions[authorId]?.position;
  const baseCounts = getPointPositionCounts(point);

  // Track initial position from mock data
  const initialPosition = (point.positions['current']?.position as PositionType) || null;

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
      else if (initialGroup === 'disagree') adjusted.disagree = Math.max(0, adjusted.disagree - 1);
      else if (initialGroup === 'unsure') adjusted.unsure = Math.max(0, adjusted.unsure - 1);

      if (currentGroup === 'agree') adjusted.agree++;
      else if (currentGroup === 'disagree') adjusted.disagree++;
      else if (currentGroup === 'unsure') adjusted.unsure++;
    }

    return adjusted;
  }, [baseCounts, initialPosition, userPosition]);

  const handlePositionClick = (position: PositionType) => {
    setUserPosition(userPosition === position ? null : position);
  };

  return (
    <div className="w-full text-left">
      {/* Position label OUTSIDE the quoted box - Avatar → Name → Ear → Badge */}
      {authorPosition && (
        <div className="flex items-center gap-1.5 mb-1.5 text-sm text-foreground">
          <GravatarAvatar
            name={authorName}
            size="sm"
            isPledger={false}
            className="!w-5 !h-5 !text-[10px]"
          />
          <span className="font-medium">{authorName}</span>
          {authorEarCount && authorEarCount > 0 && (
            <MobileTooltip
              content={`${authorName.split(' ')[0]} understood ${authorEarCount} ${authorEarCount === 1 ? 'story' : 'stories'} as confirmed by their owners`}
            >
              <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                <Ear size={14} />
                {authorEarCount}
              </span>
            </MobileTooltip>
          )}
          <PositionBadge position={authorPosition as PositionType} />
        </div>
      )}

      {/* Quoted Point box */}
      <button
        onClick={onClick}
        className="group/quote w-full text-left p-3 rounded-lg border border-border bg-muted hover:bg-accent hover:border-border transition-colors"
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
            <p className="text-sm text-gray-800 line-clamp-2">{point.text}</p>

            {/* Position buttons - compact */}
            <div className="mt-2" onClick={e => e.stopPropagation()}>
              <PositionButtons
                userPosition={userPosition}
                counts={counts}
                onPositionClick={handlePositionClick}
                compact
              />
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}
