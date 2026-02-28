/**
 * @file point-card-with-links.tsx
 * @description Production PointCard component with linked Stories support
 * Refactored from prototype to accept explicit props instead of using mock data
 */

import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pin, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { EarBadge } from '@/components/ui/ear-badge';
import { MobileTooltip } from '@/app/components/shared/mobile-tooltip';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import {
  PointHeader,
  PositionButtons,
  PositionBadge,
  ShareButton,
  ThreadLineGroup,
  ThreadLineItem,
  type SevenPointCounts,
} from '@/app/prototypes/linkedin-like/components/shared';
import type { Point, Position, Story, PositionType, PositionButtonGroup } from '@/app/prototypes/shared/types';
import { getPositionGroup, getPositionCTACopy } from '@/app/prototypes/shared/types';

/** Author information for a story in quoted context */
export interface StoryAuthor {
  id: string;
  name: string;
  role?: string;
  hasPledged?: boolean;
  ear?: number;
  avatarUrl?: string;
}

/** Profile owner information for point context */
export interface PointProfileOwner {
  id: string;
  name: string;
  hasPledged?: boolean;
  ear?: number;
  position?: PositionType;
  avatarUrl?: string;
}

interface PointCardWithLinksProps {
  point: Point;
  linkedStories?: Story[];
  compact?: boolean;
  isDetailView?: boolean;
  /** When viewing on someone's profile, show their linked Story */
  profileOwner?: PointProfileOwner;
  /** Hide position buttons and action icons */
  hideActions?: boolean;
  /** Disable click-to-navigate behavior */
  disableNavigation?: boolean;
  /** Replace the "Tell your story →" CTA with a custom node (e.g. a status chip in /chat) */
  storyCTAOverride?: React.ReactNode;
  /** Live session mode: shows position buttons + expandable stories, hides share/open */
  liveSessionMode?: boolean;
  /** Callback when position is selected (live session mode) */
  onPositionSelect?: (position: Position) => void;
  /** Pre-selected position (live session mode) */
  selectedPosition?: Position;
  /** Get position counts for the point */
  getPointPositionCounts?: (point: Point) => SevenPointCounts;
  /** Current user ID for position tracking */
  currentUserId?: string;
  /** Get author info for a story */
  getStoryAuthor?: (authorId: string) => StoryAuthor | undefined;
  /** Callback when user clicks on a story */
  onStoryClick?: (storyId: string) => void;
}

/**
 * PointCardWithLinks - displays a claim about reality (Point)
 * Visual: Gray left border, Clarity logo avatar (platform-owned), position buttons
 * Pattern B: Shows linked Stories expandable section
 */
export function PointCardWithLinks({
  point,
  linkedStories = [],
  compact = false,
  isDetailView = false,
  profileOwner,
  hideActions = false,
  disableNavigation = false,
  liveSessionMode = false,
  storyCTAOverride,
  onPositionSelect,
  selectedPosition,
  getPointPositionCounts,
  currentUserId,
  getStoryAuthor,
  onStoryClick,
}: PointCardWithLinksProps) {
  const navigate = useNavigate();
  const [userPosition, setUserPosition] = useState<Position>(
    selectedPosition ?? (currentUserId ? point.positions[currentUserId]?.position ?? null : null)
  );
  const [storiesExpanded, setStoriesExpanded] = useState(false);
  const showStoryCTA = !!userPosition;

  // P154: Sync userPosition state when position prop changes (after refetch)
  useEffect(() => {
    if (selectedPosition !== undefined) {
      setUserPosition(selectedPosition);
    } else if (currentUserId) {
      const propPosition = point.positions[currentUserId]?.position ?? null;
      setUserPosition(propPosition);
    }
  }, [point.positions, currentUserId, selectedPosition]);

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

  // In live session mode, show all linked stories (not filtered by owner)
  const allLinkedStories = linkedStories;

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

    const initialGroup = getGroup(initialPosition as PositionType | null);
    const currentGroup = getGroup(userPosition as PositionType | null);

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

  // Show all linked stories (max 3) - points can be referenced by anyone's stories
  // Unlike StoryCard, we don't filter by profileOwner because:
  // - Stories are authored by the profile owner (filter their content)
  // - Points are validated by the profile owner (show who references them)
  const filteredStories = linkedStories;
  const storiesToShow = filteredStories.slice(0, 3);

  const handleCardClick = () => {
    if (!isDetailView && !disableNavigation) {
      navigate(`/point/${point.id}`);
    }
  };

  const handlePositionClick = (position: Position) => {
    // Toggle: clicking same position removes it
    const newPosition = userPosition === position ? null : position;
    // Only optimistically update for selection; removal waits for dialog confirm
    if (newPosition !== null) {
      setUserPosition(newPosition);
    }
    onPositionSelect?.(newPosition);
  };

  const cardClassName = isDetailView
    ? 'bg-white rounded-lg shadow-sm border-l-4 border-l-slate-400 border border-gray-200 overflow-hidden'
    : 'group bg-white rounded-lg shadow-sm border-l-4 border-l-slate-400 border border-gray-200 overflow-hidden cursor-pointer hover:border-slate-300 hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2';

  // Quote pattern: when on profile, show position label outside, Point in quoted box
  const showQuotePattern =
    profileOwner && profileOwner.position;

  return (
    <>
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
        {showQuotePattern && profileOwner && profileOwner.position ? (
          // Quote pattern: "{Name} {verb}:" outside, Point content in quoted box
          <>
            {/* Position label OUTSIDE the quoted box - Avatar + Name + Badge grouped */}
            <div className="flex items-center gap-1.5 mb-2 text-sm text-gray-700">
              <GravatarAvatar
                name={profileOwner.name}
                photoUrl={profileOwner.avatarUrl}
                size="sm"
                isPledger={profileOwner.hasPledged ?? false}
                className="!w-5 !h-5 !text-[10px]"
              />
              <span className="font-medium">{profileOwner.name}</span>
              <EarBadge count={profileOwner.ear ?? 0} name={profileOwner.name} size={14} />
              <PositionBadge position={profileOwner.position} />
            </div>

            {/* Quoted Point box */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              {/* Two-column layout matching StoryCard structure */}
              <div className="flex items-start gap-3">
                {/* Pin icon column - matches StoryCard avatar width */}
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600">
                  <Pin size={16} className="rotate-45" />
                </div>

                {/* Content column */}
                <div className="flex-1 min-w-0">
                  {/* Point text */}
                  <p className={`text-gray-900 ${compact ? 'text-sm' : 'text-base'}`}>
                    {point.text}
                  </p>

                  {/* Position buttons */}
                  {!hideActions && currentUserId && (
                    <div role="presentation" className="mt-3" onClick={(e) => e.stopPropagation()}>
                      <PositionButtons
                        userPosition={userPosition}
                        counts={counts}
                        onPositionClick={handlePositionClick}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Footer - inside quoted box, pl-[44px] aligns with content column (32px icon + 12px gap) */}
              <div
                role="presentation"
                className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 pl-[44px]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Collapsible trigger (if has linked stories) */}
                {!isDetailView && filteredStories.length > 0 ? (
                  <button
                    onClick={() => setStoriesExpanded(!storiesExpanded)}
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
                    aria-expanded={storiesExpanded}
                    aria-label={`${storiesExpanded ? 'Collapse' : 'Expand'} linked stories`}
                  >
                    {storiesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span>
                      {filteredStories.length} {filteredStories.length === 1 ? 'story' : 'stories'}{profileOwner ? ` by ${profileOwner.name}` : ''}
                    </span>
                  </button>
                ) : (
                  <span />
                )}

                {/* Action icons - hidden in live session mode */}
                {!hideActions && !liveSessionMode && (
                  <div className="flex items-center gap-1">
                    <ShareButton
                      type="point"
                      id={point.id}
                      description={point.text.slice(0, 100)}
                    />
                    {!isDetailView && !disableNavigation && (
                      <MobileTooltip content="Open point">
                        <button
                          onClick={() => navigate(`/point/${point.id}`)}
                          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                          aria-label="Open point"
                        >
                          <ExternalLink size={16} />
                        </button>
                      </MobileTooltip>
                    )}
                  </div>
                )}
              </div>

              {/* P456: Story CTA footer — shown when viewer has taken a position */}
              {userPosition && !liveSessionMode && (() => {
                const positionGroup = getPositionGroup(userPosition as PositionType);
                const copy = getPositionCTACopy(positionGroup);
                const viewerStoryCount = filteredStories.filter(s => s.authorId === currentUserId).length;

                return (
                  <div
                    role="presentation"
                    className="flex items-center pl-[44px] pr-1 py-2 border-t border-gray-200"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {viewerStoryCount === 0 ? (
                      <div className="flex items-center gap-1 text-sm">
                        <span aria-hidden="true" className="text-gray-600">{copy.symbol}</span>
                        <span className="text-gray-600">{copy.label}</span>
                        <span aria-hidden="true" className="text-gray-400"> · </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/chat?from=position&pointId=${point.id}`); }}
                          aria-label={copy.ariaLabel}
                          className="font-medium text-blue-600 hover:text-blue-700 transition-colors"
                        >
                          {copy.ctaText}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between w-full">
                        <button
                          onClick={(e) => { e.stopPropagation(); setStoriesExpanded(v => !v); }}
                          className="flex items-center gap-1 text-sm text-gray-600 hover:text-blue-600 transition-colors"
                        >
                          <span aria-hidden="true">▶</span>
                          <span>{viewerStoryCount} {viewerStoryCount === 1 ? 'story' : 'stories'}</span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/chat?from=position&pointId=${point.id}`); }}
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
                  authorPosition={profileOwner?.position}
                  authorName={profileOwner?.name}
                  authorEarCount={profileOwner?.ear}
                />
              </div>

              {/* Point text - same position as StoryCard text */}
              <p className={`text-gray-900 ${compact ? 'text-sm' : 'text-base'}`}>
                {point.text}
              </p>

              {/* Position buttons */}
              {!hideActions && currentUserId && (
                <div role="presentation" className="mt-3" onClick={(e) => e.stopPropagation()}>
                  <PositionButtons
                    userPosition={userPosition}
                    counts={counts}
                    onPositionClick={handlePositionClick}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer row - only for feed view (non-quote pattern) or live session mode */}
      {(!showQuotePattern || liveSessionMode) && (
        <>
        <div
          role="presentation"
          className="flex items-center justify-between pl-[52px] pr-4 py-3 border-t border-gray-100"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Collapsible trigger - show in live session mode with all stories, or on profile/feed with any linked stories */}
          {!isDetailView &&
          (liveSessionMode
            ? allLinkedStories.length > 0
            : filteredStories.length > 0) ? (
            <button
              onClick={() => setStoriesExpanded(!storiesExpanded)}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
              aria-expanded={storiesExpanded}
              aria-label={`${storiesExpanded ? 'Collapse' : 'Expand'} linked stories`}
            >
              {storiesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>
                {liveSessionMode
                  ? `${allLinkedStories.length} ${
                      allLinkedStories.length === 1 ? 'story' : 'stories'
                    }`
                  : `${filteredStories.length} ${filteredStories.length === 1 ? 'story' : 'stories'}${profileOwner ? ` by ${profileOwner.name}` : ''}`}
              </span>
            </button>
          ) : (
            <span /> /* Empty span for flexbox spacing */
          )}

          {/* Action icons - hidden in live session mode */}
          {!hideActions && !liveSessionMode && (
            <div className="flex items-center gap-1">
              <ShareButton type="point" id={point.id} description={point.text.slice(0, 100)} />
              {/* External link - only in feed (redundant in detail view) */}
              {!isDetailView && !disableNavigation && (
                <MobileTooltip content="Open point">
                  <button
                    onClick={() => navigate(`/point/${point.id}`)}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    aria-label="Open point"
                  >
                    <ExternalLink size={16} />
                  </button>
                </MobileTooltip>
              )}
            </div>
          )}
        </div>

        {/* P456: Story CTA footer row for feed view — shown when viewer has taken a position */}
        {userPosition && !liveSessionMode && (() => {
          const positionGroup = getPositionGroup(userPosition as PositionType);
          const copy = getPositionCTACopy(positionGroup);
          const viewerStoryCount = filteredStories.filter(s => s.authorId === currentUserId).length;

          return (
            <div
              role="presentation"
              className="flex items-center pl-[52px] pr-4 py-2.5 border-t border-gray-100"
              onClick={(e) => e.stopPropagation()}
            >
              {viewerStoryCount === 0 ? (
                <div className="flex items-center gap-1 text-sm">
                  <span aria-hidden="true" className="text-gray-600">{copy.symbol}</span>
                  <span className="text-gray-600">{copy.label}</span>
                  <span aria-hidden="true" className="text-gray-400"> · </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/chat?from=position&pointId=${point.id}`); }}
                    aria-label={copy.ariaLabel}
                    className="font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    {copy.ctaText}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between w-full">
                  <button
                    onClick={(e) => { e.stopPropagation(); setStoriesExpanded(v => !v); }}
                    className="flex items-center gap-1 text-sm text-gray-600 hover:text-blue-600 transition-colors"
                  >
                    <span aria-hidden="true">▶</span>
                    <span>{viewerStoryCount} {viewerStoryCount === 1 ? 'story' : 'stories'}</span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/chat?from=position&pointId=${point.id}`); }}
                    className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    + add story →
                  </button>
                </div>
              )}
            </div>
          );
        })()}
        </>
      )}

      {/* Expanded linked stories - in feed view or live session mode */}
      {!isDetailView &&
        storiesExpanded &&
        (liveSessionMode || profileOwner) &&
        (liveSessionMode ? allLinkedStories : storiesToShow).length > 0 && (
          <div
            className={
              showQuotePattern ? 'pl-4 sm:pl-[60px] pr-4 pb-4' : 'pl-4 sm:pl-[68px] pr-4 pb-4'
            }
          >
            {(() => {
              const stories = liveSessionMode ? allLinkedStories.slice(0, 3) : storiesToShow;
              const totalStories = liveSessionMode ? allLinkedStories.length : filteredStories.length;

              if (stories.length === 1) {
                // Single story - no thread lines
                return (
                  <QuotedStory
                    story={stories[0]}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onStoryClick) {
                        onStoryClick(stories[0].id);
                      } else if (!liveSessionMode) {
                        navigate(`/story/${stories[0].id}`);
                      }
                    }}
                    onAuthorClick={(e) => {
                      e.stopPropagation();
                      if (!liveSessionMode) navigate(`/p/${stories[0].authorId}`);
                    }}
                    getStoryAuthor={getStoryAuthor}
                  />
                );
              }

              // 2+ stories - show thread lines
              return (
                <ThreadLineGroup>
                  {stories.map((story, index) => (
                    <ThreadLineItem
                      key={story.id}
                      isLast={index === stories.length - 1 && totalStories <= 3}
                    >
                      <QuotedStory
                        story={story}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onStoryClick) {
                            onStoryClick(story.id);
                          } else if (!liveSessionMode) {
                            navigate(`/story/${story.id}`);
                          }
                        }}
                        onAuthorClick={(e) => {
                          e.stopPropagation();
                          if (!liveSessionMode) navigate(`/p/${story.authorId}`);
                        }}
                        getStoryAuthor={getStoryAuthor}
                      />
                    </ThreadLineItem>
                  ))}
                  {totalStories > 3 && (
                    <ThreadLineItem isLast>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!liveSessionMode) navigate(`/point/${point.id}`);
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        +{totalStories - 3} more stories
                      </button>
                    </ThreadLineItem>
                  )}
                </ThreadLineGroup>
              );
            })()}
          </div>
        )}
    </div>
    {/* P451: Story CTA — shown after staking a position */}
    {showStoryCTA && !liveSessionMode && (
      storyCTAOverride !== undefined ? storyCTAOverride : (
        <button
          type="button"
          className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium"
          onClick={() => navigate(`/chat?from=position&pointId=${point.id}`)}
        >
          Tell your story →
        </button>
      )
    )}
    </>
  );
}

/**
 * Twitter-style quoted Story card - shows a linked story within a Point.
 */
function QuotedStory({
  story,
  onClick,
  onAuthorClick,
  getStoryAuthor,
}: {
  story: Story;
  onClick: (e: React.MouseEvent) => void;
  /** Callback when author name/avatar is clicked */
  onAuthorClick?: (e: React.MouseEvent) => void;
  /** Get author info for the story */
  getStoryAuthor?: (authorId: string) => StoryAuthor | undefined;
}) {
  const author = getStoryAuthor?.(story.authorId);
  const [textExpanded, setTextExpanded] = useState(false);
  useEffect(() => { setTextExpanded(false); }, [story.id]);

  return (
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
      {/* Author info at top */}
      {author && (
        <div className="flex items-center gap-2 mb-1.5">
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onAuthorClick?.(e);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onAuthorClick?.(e as unknown as React.MouseEvent);
              }
            }}
            className="hover:opacity-80 transition-opacity cursor-pointer"
          >
            <GravatarAvatar
              name={author.name}
              photoUrl={author.avatarUrl}
              size="sm"
              isPledger={author.hasPledged ?? false}
              className="!w-6 !h-6 !text-[11px]"
            />
          </span>
          {/* Author name - clickable */}
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onAuthorClick?.(e);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onAuthorClick?.(e as unknown as React.MouseEvent);
              }
            }}
            className="text-xs font-medium text-gray-700 hover:underline cursor-pointer"
          >
            {author.name}
          </span>
          {/* Ear indicator - understanding credibility */}
          <EarBadge count={author.ear ?? 0} name={author.name} />
        </div>
      )}
      {/* Story text */}
      {!textExpanded && story.text.length > 100 ? (
        <p className="text-sm text-gray-800">
          {story.text.slice(0, 100)}
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
        <p className="text-sm text-gray-800">{story.text}</p>
      )}
    </div>
  );
}
