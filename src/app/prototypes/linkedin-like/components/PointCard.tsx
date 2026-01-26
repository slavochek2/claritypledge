import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pin, Ear, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { MobileTooltip } from './shared/MobileTooltip';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { routes } from '../config';
import {
  getStoriesForPoint,
  getPointPositionCounts,
  getUserById,
  currentUser,
  getUserCredibilityStats,
} from '../data/mock-data';
import { PointHeader, PositionButtons, PositionBadge, ShareButton, ThreadLineGroup, ThreadLineItem, type SevenPointCounts } from './shared';
import type { Point, Position, Story, PositionType, PositionButtonGroup } from '../../shared/types';
import { getPositionGroup } from '../../shared/types';

interface PointCardProps {
  point: Point;
  compact?: boolean;
  isDetailView?: boolean;
  /** When viewing on someone's profile, show their linked Story */
  profileOwnerId?: string;
}

/**
 * PointCard - displays a claim about reality (Point)
 * Visual: Gray left border, Clarity logo avatar (platform-owned), position buttons
 * Pattern B: Shows linked Stories expandable section
 */
export function PointCard({ point, compact = false, isDetailView = false, profileOwnerId }: PointCardProps) {
  const navigate = useNavigate();
  const [userPosition, setUserPosition] = useState<Position>(
    point.positions['current']?.position || null
  );
  const [storiesExpanded, setStoriesExpanded] = useState(false);
  const linkedStories = getStoriesForPoint(point.id);
  const baseCounts = getPointPositionCounts(point);

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
  const filteredStories = profileOwnerId
    ? linkedStories.filter(s => s.authorId === profileOwnerId)
    : linkedStories;
  const storiesToShow = filteredStories.slice(0, 3);

  // Get the profile owner's position on this point (for header display)
  const profileOwnerPosition = profileOwnerId
    ? point.positions[profileOwnerId]?.position
    : null;

  // Get profile owner's name and credibility for position badge
  const profileOwner = profileOwnerId ? getUserById(profileOwnerId) : null;
  const profileOwnerCredibility = profileOwnerId ? getUserCredibilityStats(profileOwnerId) : null;

  const handleCardClick = () => {
    if (!isDetailView) {
      navigate(routes.point(point.id));
    }
  };

  const handlePositionClick = (position: Position) => {
    // Toggle: clicking same position removes it
    setUserPosition(userPosition === position ? null : position);
  };

  const cardClassName = isDetailView
    ? "bg-white rounded-lg shadow-sm border-l-4 border-l-slate-400 border border-gray-200 overflow-hidden"
    : "group bg-white rounded-lg shadow-sm border-l-4 border-l-slate-400 border border-gray-200 overflow-hidden cursor-pointer hover:border-slate-300 hover:shadow-md transition-all";

  // Quote pattern: when on profile, show position label outside, Point in quoted box
  const showQuotePattern = profileOwnerId && profileOwnerPosition && profileOwner;

  return (
    <div
      className={cardClassName}
      onClick={handleCardClick}
    >
      {/* Main content */}
      <div className="p-4">
        {showQuotePattern ? (
          // Quote pattern: "{Name} {verb}:" outside, Point content in quoted box
          <>
            {/* Position label OUTSIDE the quoted box - Avatar + Name + Badge grouped */}
            <div className="flex items-center gap-1.5 mb-2 text-sm text-gray-700">
              <GravatarAvatar
                name={profileOwner.name}
                size="sm"
                isPledger={profileOwner.hasPledged}
                className="!w-5 !h-5 !text-[10px]"
              />
              <span className="font-medium">{profileOwner.name}</span>
              {profileOwnerCredibility && profileOwnerCredibility.ear > 0 && (
                <MobileTooltip content={`${profileOwner.name.split(' ')[0]} understood ${profileOwnerCredibility.ear} ${profileOwnerCredibility.ear === 1 ? 'story' : 'stories'} as confirmed by their owners`}>
                  <span className="inline-flex items-center gap-0.5 text-gray-600">
                    <Ear size={14} />
                    {profileOwnerCredibility.ear}
                  </span>
                </MobileTooltip>
              )}
              <PositionBadge position={profileOwnerPosition} />
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
                  <p className={`text-gray-900 ${compact ? 'text-sm line-clamp-2' : 'text-base'}`}>
                    {point.text}
                  </p>

                  {/* Position buttons */}
                  <div
                    className="mt-3"
                    onClick={(e) => e.stopPropagation()}
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
                      {filteredStories.length} {filteredStories.length === 1 ? 'story' : 'stories'} by {profileOwner?.name}
                    </span>
                  </button>
                ) : (
                  <span />
                )}

                {/* Action icons */}
                <div className="flex items-center gap-1">
                  <ShareButton
                    type="point"
                    id={point.id}
                    description={point.text.slice(0, 100)}
                  />
                  {!isDetailView && (
                    <MobileTooltip content="Open point">
                      <button
                        onClick={() => navigate(routes.point(point.id))}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
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
                  authorPosition={profileOwnerPosition}
                  authorName={profileOwner?.name}
                  authorEarCount={profileOwnerCredibility?.ear}
                />
              </div>

              {/* Point text - same position as StoryCard text */}
              <p className={`text-gray-900 ${compact ? 'text-sm line-clamp-2' : 'text-base'}`}>
                {point.text}
              </p>

              {/* Position buttons */}
              <div
                className="mt-3"
                onClick={(e) => e.stopPropagation()}
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
          className="flex items-center justify-between pl-[52px] pr-4 py-3 border-t border-gray-100"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Collapsible trigger (if has linked stories on profile, only in feed view) */}
          {!isDetailView && profileOwnerId && filteredStories.length > 0 ? (
            <button
              onClick={() => setStoriesExpanded(!storiesExpanded)}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
              aria-expanded={storiesExpanded}
              aria-label={`${storiesExpanded ? 'Collapse' : 'Expand'} linked stories`}
            >
              {storiesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>
                {filteredStories.length} {filteredStories.length === 1 ? 'story' : 'stories'} by {profileOwner?.name}
              </span>
            </button>
          ) : (
            <span /> /* Empty span for flexbox spacing */
          )}

          {/* Action icons */}
          <div className="flex items-center gap-1">
            <ShareButton
              type="point"
              id={point.id}
              description={point.text.slice(0, 100)}
            />
            {/* External link - only in feed (redundant in detail view) */}
            {!isDetailView && (
              <MobileTooltip content="Open point">
                <button
                  onClick={() => navigate(routes.point(point.id))}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
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
      {!isDetailView && storiesExpanded && profileOwnerId && storiesToShow.length > 0 && (
        <div className={showQuotePattern ? "pl-[60px] pr-4 pb-4" : "pl-[68px] pr-4 pb-4"}>
          {storiesToShow.length === 1 ? (
            // Single story - no thread lines
            <QuotedStory
              story={storiesToShow[0]}
              onClick={(e) => {
                e.stopPropagation();
                navigate(routes.story(storiesToShow[0].id));
              }}
              onAuthorClick={(e) => {
                e.stopPropagation();
                navigate(routes.profileById(storiesToShow[0].authorId));
              }}
            />
          ) : (
            // 2+ stories - show thread lines
            <ThreadLineGroup>
              {storiesToShow.map((story, index) => (
                <ThreadLineItem key={story.id} isLast={index === storiesToShow.length - 1 && filteredStories.length <= 3}>
                  <QuotedStory
                    story={story}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(routes.story(story.id));
                    }}
                    onAuthorClick={(e) => {
                      e.stopPropagation();
                      navigate(routes.profileById(story.authorId));
                    }}
                  />
                </ThreadLineItem>
              ))}
              {filteredStories.length > 3 && (
                <ThreadLineItem isLast>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(routes.point(point.id));
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
  );
}

/**
 * Twitter-style quoted Story card - shows a linked story within a Point.
 * Position badge removed per P88 — position is shown in Point header, not here.
 * Actions (share, open) added per P103 for consistency with QuotedPoint.
 */
function QuotedStory({
  story,
  onClick,
  onAuthorClick
}: {
  story: Story;
  onClick: (e: React.MouseEvent) => void;
  /** Callback when author name/avatar is clicked */
  onAuthorClick?: (e: React.MouseEvent) => void;
}) {
  const navigate = useNavigate();
  const author = getUserById(story.authorId);
  const credibilityStats = author ? getUserCredibilityStats(author.id) : { ear: 0, mic: 0 };

  return (
    <div
      onClick={onClick}
      className="group/quote w-full text-left p-3 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-colors cursor-pointer"
    >
      {/* Author info at top */}
      <div className="flex items-center gap-2 mb-1.5">
        {author && (
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
        )}
        {/* Ear indicator - understanding credibility */}
        {author && credibilityStats.ear > 0 && (
          <MobileTooltip content={`${author.name.split(' ')[0]} understood ${credibilityStats.ear} ${credibilityStats.ear === 1 ? 'story' : 'stories'} as confirmed by their owners`}>
            <span className="inline-flex items-center gap-0.5 text-xs text-gray-600">
              <Ear size={12} />
              {credibilityStats.ear}
            </span>
          </MobileTooltip>
        )}
      </div>
      {/* Story text */}
      <p className="text-sm text-gray-800 line-clamp-2">{story.text}</p>
    </div>
  );
}
