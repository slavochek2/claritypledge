import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ExternalLink, Pin, Mic } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { routes } from '../config';
import {
  getStoriesForPoint,
  getPointPositionCounts,
  getUserById,
  getPointsForStory,
  currentUser,
} from '../data/mock-data';
import { PositionBadge, PositionButtons, ShareDropdown } from './shared';
import type { Point, Position, Story } from '../../shared/types';

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
  const linkedStories = getStoriesForPoint(point.id);
  const counts = getPointPositionCounts(point);

  // On profile page, find the profile owner's story linked to this point
  // In feed (no profileOwnerId), show first linked story for context
  const ownerStory = profileOwnerId
    ? linkedStories.find(s => s.authorId === profileOwnerId)
    : null;
  const storyToShow = ownerStory || linkedStories[0] || null;

  // Get the profile owner's position on this point (for header display)
  const profileOwnerPosition = profileOwnerId
    ? point.positions[profileOwnerId]?.position
    : null;

  // Get profile owner's name for position badge
  const profileOwner = profileOwnerId ? getUserById(profileOwnerId) : null;
  const isCurrentUserProfile = profileOwnerId === currentUser.id;

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
          {/* Pin icon - same width as StoryCard avatar */}
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 text-slate-500">
            <Pin size={20} />
          </div>

          {/* Content column - aligned with StoryCard */}
          <div className="flex-1 min-w-0">
            {/* Header row - matches StoryCard's author info structure */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">Point</span>
                {profileOwnerPosition && (
                  <span className="text-xs text-gray-400">·</span>
                )}
                {profileOwnerPosition && (
                  <PositionBadge
                    position={profileOwnerPosition}
                    name={profileOwner?.name.split(' ')[0]}
                    isCurrentUser={isCurrentUserProfile}
                  />
                )}
              </div>
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
                    Open
                  </button>
                  <ShareDropdown type="point" id={point.id} />
                </div>
              )}
            </div>

            {/* Point text - same position as StoryCard text */}
            <p className={`text-gray-900 ${compact ? 'text-sm line-clamp-2' : 'text-base'}`}>
              {point.text}
            </p>

            {/* Position buttons - compact */}
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

            {/* Stats row - icon-only style, matches StoryCard */}
            {linkedStories.length > 0 && (
              <TooltipProvider delayDuration={100}>
                <div className="flex items-center mt-3 text-sm text-gray-500">
                  <div className="flex items-center gap-3 px-2.5 py-1 bg-gray-100 rounded-full">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1 cursor-default">
                          <BookOpen size={14} />
                          {linkedStories.length}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Linked stories</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </TooltipProvider>
            )}

            {/* Linked Story - shown on profile pages (owner's) or in feed (first linked) */}
            {storyToShow && (
              <div className="mt-3">
                <QuotedStory
                  story={storyToShow}
                  point={point}
                  isAuthorTheProfileOwner={!!profileOwnerId && storyToShow.authorId === profileOwnerId}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(routes.story(storyToShow.id));
                  }}
                  onAuthorClick={(e) => {
                    e.stopPropagation();
                    navigate(routes.profileById(storyToShow.authorId));
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

/**
 * Twitter-style quoted Story card - shows why someone took a position
 *
 * When viewing on a profile page where the story author IS the profile owner,
 * we show "[Name]'s Story" instead of position badge because
 * authoring a story is different from voting on a point.
 */
function QuotedStory({
  story,
  point,
  isAuthorTheProfileOwner,
  onClick,
  onAuthorClick
}: {
  story: Story;
  point: Point;
  /** When true, show "Author's Story" instead of position badge */
  isAuthorTheProfileOwner?: boolean;
  onClick: (e: React.MouseEvent) => void;
  /** Callback when author name/avatar is clicked */
  onAuthorClick?: (e: React.MouseEvent) => void;
}) {
  const author = getUserById(story.authorId);
  const authorPosition = point.positions[story.authorId]?.position;
  const storyLinkedPoints = getPointsForStory(story.id);
  const isCurrentUser = story.authorId === currentUser.id;

  return (
    <button
      onClick={onClick}
      className="group/quote w-full text-left p-3 rounded-lg border border-gray-200 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-200 transition-colors"
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
          {isAuthorTheProfileOwner ? (
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
              {isCurrentUser ? 'Your' : `${author?.name.split(' ')[0]}'s`} Story
            </span>
          ) : (
            authorPosition && (
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
                className="cursor-pointer hover:underline"
              >
                <PositionBadge
                  position={authorPosition}
                  name={author?.name.split(' ')[0]}
                  isCurrentUser={isCurrentUser}
                />
              </span>
            )
          )}
        </div>
        <ExternalLink size={10} className="text-blue-400 opacity-100 sm:opacity-0 sm:group-hover/quote:opacity-100 transition-opacity" />
      </div>
      {/* Story text */}
      <p className="text-sm text-gray-700 line-clamp-2">{story.text}</p>
      {/* Stats row */}
      <TooltipProvider delayDuration={100}>
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1 cursor-default">
                <Pin size={12} />
                {storyLinkedPoints.length}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>Linked points</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1 cursor-default">
                <Mic size={12} />
                {story.verificationCount}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>People understood this story</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </button>
  );
}
