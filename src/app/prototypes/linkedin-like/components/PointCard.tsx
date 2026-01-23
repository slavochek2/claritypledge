import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Mic, Pin, Ear, ChevronDown, ChevronRight } from 'lucide-react';
import { MobileTooltip } from './shared/MobileTooltip';
import { routes } from '../config';
import {
  getStoriesForPoint,
  getPointPositionCounts,
  getUserById,
  currentUser,
  getUserCredibilityStats,
} from '../data/mock-data';
import { PointHeader, PositionButtons, ShareButton, type SevenPointCounts } from './shared';
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

  return (
    <div
      className={cardClassName}
      onClick={handleCardClick}
    >
      {/* Main content - matches StoryCard structure */}
      <div className="p-4">
        <div className="flex gap-3">
          {/* Pin icon - same width as StoryCard avatar, blue to distinguish from Stories */}
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600">
            <Pin size={20} />
          </div>

          {/* Content column - aligned with StoryCard */}
          <div className="flex-1 min-w-0">
            {/* Header row - matches StoryCard's author info structure */}
            <div className="flex items-center justify-between mb-2">
              <PointHeader
                authorPosition={profileOwnerPosition}
                authorName={profileOwner?.name}
                authorEarCount={profileOwnerCredibility?.ear}
              />
              {/* Action buttons - appear on hover (always visible on touch devices) */}
              {!isDetailView && (
                <div
                  className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(routes.point(point.id));
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-full hover:bg-blue-100 transition-colors"
                  >
                    <ExternalLink size={12} />
                    Open Point
                  </button>
                  <ShareButton
                      type="point"
                      id={point.id}
                      description={point.text.slice(0, 100)}
                    />
                </div>
              )}
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
      </div>

      {/* Linked Stories Footer - collapsible section */}
      {profileOwnerId && !isDetailView && filteredStories.length > 0 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setStoriesExpanded(!storiesExpanded);
            }}
            className="w-full flex items-center gap-2 pl-[52px] pr-4 py-3 border-t border-gray-100 text-sm text-gray-500 hover:text-blue-600 hover:bg-gray-50 transition-colors"
            aria-expanded={storiesExpanded}
            aria-label={`${storiesExpanded ? 'Collapse' : 'Expand'} linked stories`}
          >
            {storiesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>
              Supported by {filteredStories.length} of {profileOwner?.name?.split(' ')[0] || 'their'}'s {filteredStories.length === 1 ? 'story' : 'stories'}
            </span>
          </button>

          {/* Expanded linked stories */}
          {storiesExpanded && storiesToShow.length > 0 && (
            <div className="pl-[52px] pr-4 pb-4 relative">
              {/* Single vertical thread line */}
              <div className="absolute left-[56px] top-0 bottom-3 w-px bg-gray-300" />

              <div className="space-y-2 pl-3">
                {storiesToShow.map(story => (
                  <QuotedStory
                    key={story.id}
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
                ))}
                {filteredStories.length > 3 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(routes.point(point.id));
                    }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    +{filteredStories.length - 3} more stories
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Twitter-style quoted Story card - shows a linked story within a Point.
 * Position badge removed per P88 — position is shown in Point header, not here.
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
  const author = getUserById(story.authorId);
  const credibilityStats = author ? getUserCredibilityStats(author.id) : { ear: 0, mic: 0 };

  return (
    <button
      onClick={onClick}
      className="group/quote w-full text-left p-3 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-colors"
    >
      {/* Author info at top */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
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
              className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-xs hover:ring-2 hover:ring-blue-200 transition-all cursor-pointer"
            >
              {author.avatar}
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
              <span className="inline-flex items-center gap-0.5 text-xs text-gray-400">
                <Ear size={12} />
                {credibilityStats.ear}
              </span>
            </MobileTooltip>
          )}
        </div>
        <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-full hover:bg-blue-100 transition-colors opacity-100 sm:opacity-0 sm:group-hover/quote:opacity-100">
          <ExternalLink size={10} />
          Open Story
        </span>
      </div>
      {/* Story text */}
      <p className="text-sm text-gray-700 line-clamp-2">{story.text}</p>
      {/* Stats row - verification count only */}
      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
        <MobileTooltip content={`${author?.name.split(' ')[0] || 'Author'} confirmed ${story.verificationCount} ${story.verificationCount === 1 ? 'person' : 'people'} understood this story`}>
          <span className="flex items-center gap-1">
            <Mic size={12} />
            {story.verificationCount}
          </span>
        </MobileTooltip>
      </div>
    </button>
  );
}
