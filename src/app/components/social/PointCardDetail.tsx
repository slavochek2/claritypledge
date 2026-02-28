/**
 * @file PointCardDetail.tsx
 * @description Point card component for detail views - forked from prototype PointCard.
 * Accepts data via props instead of importing from mock-data.
 *
 * Visual: Gray left border, pin icon, position buttons, linked Stories below.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pin, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { EarBadge } from '@/components/ui/ear-badge';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import {
  PointHeader,
  PositionButtons,
  PositionBadge,
  ShareButton,
  MobileTooltip,
  ThreadLineGroup,
  ThreadLineItem,
  type SevenPointCounts,
} from '@/app/prototypes/linkedin-like/components/shared';
import type { Point, Position, Story, PositionType, PositionButtonGroup } from '@/app/prototypes/shared/types';
import { getPositionGroup } from '@/app/prototypes/shared/types';

/** User info for display */
export interface PointUser {
  id: string;
  name: string;
  role?: string;
  company?: string;
  hasPledged: boolean;
}

/** Credibility stats for display */
export interface CredibilityStats {
  ear: number;
  mic: number;
}

interface PointCardDetailProps {
  point: Point;
  linkedStories: Story[];
  /** When viewing on someone's profile, show their linked Story */
  profileOwner?: PointUser;
  profileOwnerCredibility?: CredibilityStats;
  /** Get user by ID for displaying story authors */
  getUserById?: (id: string) => PointUser | undefined;
  /** Get credibility stats for a user */
  getUserCredibilityStats?: (id: string) => CredibilityStats;
  /** Get position counts for the point */
  getPointPositionCounts: (point: Point) => SevenPointCounts;
  compact?: boolean;
  isDetailView?: boolean;
  /** Suppress card navigation even when not in detail view (e.g. inside live session UI) */
  disableNavigation?: boolean;
  /** Route generator - defaults to /story/:id and /point/:id */
  routes?: {
    story?: (id: string) => string;
    point?: (id: string) => string;
    profile?: (id: string) => string;
  };
}

/**
 * PointCardDetail - displays a claim about reality (Point)
 * Visual: Gray left border, pin icon, position buttons
 */
export function PointCardDetail({
  point,
  linkedStories,
  profileOwner,
  profileOwnerCredibility,
  getUserById,
  getUserCredibilityStats,
  getPointPositionCounts,
  compact = false,
  isDetailView = false,
  disableNavigation = false,
  routes = {},
}: PointCardDetailProps) {
  const navigate = useNavigate();
  const [userPosition, setUserPosition] = useState<Position>(
    point.positions['current']?.position || null
  );
  const [storiesExpanded, setStoriesExpanded] = useState(false);
  const showStoryCTA = !!userPosition;
  const baseCounts = getPointPositionCounts(point);

  // Default routes
  const storyRoute = routes.story || ((id: string) => `/story/${id}`);
  const pointRoute = routes.point || ((id: string) => `/point/${id}`);
  const profileRoute = routes.profile || ((id: string) => `/p/${id}`);

  // Track initial position from mock data
  const initialPosition = point.positions['current']?.position || null;

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

    const initialGroup = getGroup(initialPosition as PositionType | null);
    const currentGroup = getGroup(userPosition as PositionType | null);

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

  // On profile page, only show stories from the profile owner (max 3)
  // On feed/detail pages, show all linked stories (max 3)
  const filteredStories = profileOwner
    ? linkedStories.filter(s => s.authorId === profileOwner.id)
    : linkedStories;
  const storiesToShow = filteredStories.slice(0, 3);

  // Get the profile owner's position on this point (for header display)
  const profileOwnerPosition = profileOwner
    ? point.positions[profileOwner.id]?.position
    : null;

  const handleCardClick = () => {
    if (!isDetailView && !disableNavigation) {
      navigate(pointRoute(point.id));
    }
  };

  const handlePositionClick = (position: Position) => {
    // Toggle: clicking same position removes it
    const newPosition = userPosition === position ? null : position;
    setUserPosition(newPosition);
  };

  const cardClassName = isDetailView
    ? 'bg-card rounded-lg shadow-sm border-l-4 border-l-slate-400 border border-border overflow-hidden'
    : 'group bg-card rounded-lg shadow-sm border-l-4 border-l-slate-400 border border-border overflow-hidden cursor-pointer hover:border-slate-300 hover:shadow-md transition-all';

  // Quote pattern: when on profile, show position label outside, Point in quoted box
  const showQuotePattern = profileOwner && profileOwnerPosition;

  return (
    <>
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
        {showQuotePattern ? (
          // Quote pattern: "{Name} {verb}:" outside, Point content in quoted box
          <>
            {/* Position label OUTSIDE the quoted box - Avatar + Name + Badge grouped */}
            <div className="flex items-center gap-1.5 mb-2 text-sm text-foreground">
              <GravatarAvatar
                name={profileOwner.name}
                size="sm"
                isPledger={profileOwner.hasPledged}
                className="!w-5 !h-5 !text-[10px]"
              />
              <span className="font-medium">{profileOwner.name}</span>
              <EarBadge count={profileOwnerCredibility?.ear ?? 0} name={profileOwner.name} size={14} />
              <PositionBadge position={profileOwnerPosition as PositionType} />
            </div>

            {/* Quoted Point box */}
            <div className="bg-muted border border-border rounded-lg p-3">
              {/* Two-column layout matching StoryCard structure */}
              <div className="flex items-start gap-3">
                {/* Pin icon column - matches StoryCard avatar width */}
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600">
                  <Pin size={16} className="rotate-45" />
                </div>

                {/* Content column */}
                <div className="flex-1 min-w-0">
                  {/* Point text */}
                  <p className={`text-foreground ${compact ? 'text-sm' : 'text-base'}`}>
                    {point.text}
                  </p>

                  {/* Position buttons */}
                  <div
                    role="presentation"
                    className="mt-3"
                    onClick={e => e.stopPropagation()}
                    onKeyDown={e => e.stopPropagation()}
                  >
                    <PositionButtons
                      userPosition={userPosition}
                      counts={counts}
                      onPositionClick={handlePositionClick}
                    />
                  </div>
                </div>
              </div>

              {/* Footer - inside quoted box, pl-[44px] aligns with content column (32px icon + 12px gap) */}
              <div
                role="presentation"
                className="flex items-center justify-between mt-3 pt-3 border-t border-border pl-[44px]"
                onClick={e => e.stopPropagation()}
                onKeyDown={e => e.stopPropagation()}
              >
                {/* Collapsible trigger (if has linked stories) */}
                {!isDetailView && filteredStories.length > 0 ? (
                  <button
                    onClick={() => setStoriesExpanded(!storiesExpanded)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-blue-600 transition-colors"
                    aria-expanded={storiesExpanded}
                    aria-label={`${storiesExpanded ? 'Collapse' : 'Expand'} linked stories`}
                  >
                    {storiesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span>
                      {filteredStories.length} {filteredStories.length === 1 ? 'story' : 'stories'}{' '}
                      by {profileOwner?.name}
                    </span>
                  </button>
                ) : (
                  <span />
                )}

                {/* Action icons */}
                <div className="flex items-center gap-1">
                  <ShareButton type="point" id={point.id} description={point.text.slice(0, 100)} />
                  {!isDetailView && (
                    <MobileTooltip content="Open point">
                      <button
                        onClick={() => navigate(pointRoute(point.id))}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-muted-foreground hover:bg-accent rounded-full transition-colors"
                        aria-label="Open point"
                      >
                        <ExternalLink size={16} />
                      </button>
                    </MobileTooltip>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          // Feed view: original layout with pin icon column
          <div className="flex gap-3">
            {/* Pin icon - same width as StoryCard avatar, blue to distinguish from Stories */}
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600">
              <Pin size={20} />
            </div>

            {/* Content column - aligned with StoryCard */}
            <div className="flex-1 min-w-0">
              {/* Header row - matches StoryCard's author info structure */}
              <div className="mb-2">
                <PointHeader
                  authorPosition={profileOwnerPosition as PositionType | undefined}
                  authorName={profileOwner?.name}
                  authorEarCount={profileOwnerCredibility?.ear}
                />
              </div>

              {/* Point text - same position as StoryCard text */}
              <p className={`text-foreground ${compact ? 'text-sm' : 'text-base'}`}>
                {point.text}
              </p>

              {/* Position buttons */}
              <div
                role="presentation"
                className="mt-3"
                onClick={e => e.stopPropagation()}
                onKeyDown={e => e.stopPropagation()}
              >
                <PositionButtons
                  userPosition={userPosition}
                  counts={counts}
                  onPositionClick={handlePositionClick}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer row - only for feed view (non-quote pattern) */}
      {!showQuotePattern && (
        <div
          role="presentation"
          className="flex items-center justify-between pl-[52px] pr-4 py-3 border-t border-gray-100"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
        >
          {/* Collapsible trigger (if has linked stories on profile, only in feed view) */}
          {!isDetailView && profileOwner && filteredStories.length > 0 ? (
            <button
              onClick={() => setStoriesExpanded(!storiesExpanded)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-blue-600 transition-colors"
              aria-expanded={storiesExpanded}
              aria-label={`${storiesExpanded ? 'Collapse' : 'Expand'} linked stories`}
            >
              {storiesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>
                {filteredStories.length} {filteredStories.length === 1 ? 'story' : 'stories'} by{' '}
                {profileOwner?.name}
              </span>
            </button>
          ) : (
            <span /> /* Empty span for flexbox spacing */
          )}

          {/* Action icons */}
          <div className="flex items-center gap-1">
            <ShareButton type="point" id={point.id} description={point.text.slice(0, 100)} />
            {/* External link - only in feed (redundant in detail view) */}
            {!isDetailView && (
              <MobileTooltip content="Open point">
                <button
                  onClick={() => navigate(pointRoute(point.id))}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-muted-foreground hover:bg-accent rounded-full transition-colors"
                  aria-label="Open point"
                >
                  <ExternalLink size={16} />
                </button>
              </MobileTooltip>
            )}
          </div>
        </div>
      )}

      {/* Expanded linked stories - only in feed view */}
      {!isDetailView && storiesExpanded && profileOwner && storiesToShow.length > 0 && (
        <div
          className={showQuotePattern ? 'pl-4 sm:pl-[60px] pr-4 pb-4' : 'pl-4 sm:pl-[68px] pr-4 pb-4'}
        >
          {storiesToShow.length === 1 ? (
            // Single story - no thread lines
            <QuotedStory
              story={storiesToShow[0]}
              getUserById={getUserById}
              getUserCredibilityStats={getUserCredibilityStats}
              onClick={e => {
                e.stopPropagation();
                navigate(storyRoute(storiesToShow[0].id));
              }}
              onAuthorClick={e => {
                e.stopPropagation();
                navigate(profileRoute(storiesToShow[0].authorId));
              }}
            />
          ) : (
            // 2+ stories - show thread lines
            <ThreadLineGroup>
              {storiesToShow.map((story, index) => (
                <ThreadLineItem
                  key={story.id}
                  isLast={index === storiesToShow.length - 1 && filteredStories.length <= 3}
                >
                  <QuotedStory
                    story={story}
                    getUserById={getUserById}
                    getUserCredibilityStats={getUserCredibilityStats}
                    onClick={e => {
                      e.stopPropagation();
                      navigate(storyRoute(story.id));
                    }}
                    onAuthorClick={e => {
                      e.stopPropagation();
                      navigate(profileRoute(story.authorId));
                    }}
                  />
                </ThreadLineItem>
              ))}
              {filteredStories.length > 3 && (
                <ThreadLineItem isLast>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      navigate(pointRoute(point.id));
                    }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    +{filteredStories.length - 3} more stories
                  </button>
                </ThreadLineItem>
              )}
            </ThreadLineGroup>
          )}
        </div>
      )}
    </div>
    {/* P451: Story CTA — shown after staking a position */}
    {showStoryCTA && (
      <button
        type="button"
        className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium"
        onClick={() => navigate(`/chat?from=position&pointId=${point.id}`)}
      >
        Tell your story →
      </button>
    )}
    </>
  );
}

/**
 * Twitter-style quoted Story card - shows a linked story within a Point.
 */
function QuotedStory({
  story,
  getUserById,
  getUserCredibilityStats,
  onClick,
  onAuthorClick,
}: {
  story: Story;
  getUserById?: (id: string) => PointUser | undefined;
  getUserCredibilityStats?: (id: string) => CredibilityStats;
  onClick: (e: React.MouseEvent) => void;
  onAuthorClick?: (e: React.MouseEvent) => void;
}) {
  const author = getUserById?.(story.authorId);
  const credibilityStats = author && getUserCredibilityStats
    ? getUserCredibilityStats(author.id)
    : { ear: 0, mic: 0 };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(e as unknown as React.MouseEvent);
        }
      }}
      className="group/quote w-full text-left p-3 rounded-lg border border-border bg-muted hover:bg-accent hover:border-border transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      {/* Author info at top */}
      <div className="flex items-center gap-2 mb-1.5">
        {author && (
          <span
            role="button"
            tabIndex={0}
            onClick={e => {
              e.stopPropagation();
              onAuthorClick?.(e);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onAuthorClick?.(e as unknown as React.MouseEvent);
              }
            }}
            className="hover:opacity-80 transition-opacity cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-full focus-visible:outline-none"
          >
            <GravatarAvatar
              name={author.name}
              size="sm"
              isPledger={author.hasPledged}
              className="!w-6 !h-6 !text-[11px]"
            />
          </span>
        )}
        {/* Author name - clickable */}
        {author && (
          <span
            role="button"
            tabIndex={0}
            onClick={e => {
              e.stopPropagation();
              onAuthorClick?.(e);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onAuthorClick?.(e as unknown as React.MouseEvent);
              }
            }}
            className="text-xs font-medium text-foreground hover:underline cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none focus-visible:rounded"
          >
            {author.name}
          </span>
        )}
        {/* Ear indicator - understanding credibility */}
        {author && <EarBadge count={credibilityStats.ear} name={author.name} />}
      </div>
      {/* Story text */}
      <p className="text-sm text-gray-800 line-clamp-2">{story.text}</p>
    </div>
  );
}
