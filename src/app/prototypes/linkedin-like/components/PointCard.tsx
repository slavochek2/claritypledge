import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ExternalLink, Pin, Radio, Zap } from 'lucide-react';
import { routes } from '../config';
import {
  getStoriesForPoint,
  getPointPositionCounts,
  getUserById,
  getPointsForStory,
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
  const ownerStory = profileOwnerId
    ? linkedStories.find(s => s.authorId === profileOwnerId)
    : null;

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
              <span className="text-xs text-gray-500">Shared Point</span>
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
              <div className="flex items-center mt-3 text-sm text-gray-500">
                <div className="flex items-center gap-3 px-2.5 py-1 bg-gray-100 rounded-full">
                  <span className="flex items-center gap-1" title={`${linkedStories.length} stories`}>
                    <BookOpen size={14} />
                    {linkedStories.length}
                  </span>
                </div>
              </div>
            )}

            {/* Owner's linked Story - shown on profile pages */}
            {ownerStory && (
              <div className="mt-3">
                <QuotedStory
                  story={ownerStory}
                  point={point}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(routes.story(ownerStory.id));
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
 */
function QuotedStory({
  story,
  point,
  onClick
}: {
  story: Story;
  point: Point;
  onClick: (e: React.MouseEvent) => void;
}) {
  const author = getUserById(story.authorId);
  const authorPosition = point.positions[story.authorId]?.position;
  const storyLinkedPoints = getPointsForStory(story.id);

  return (
    <button
      onClick={onClick}
      className="group/quote w-full text-left p-3 rounded-lg border border-gray-200 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-200 transition-colors"
    >
      {/* Author info at top */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          {author && (
            <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-xs">
              {author.avatar}
            </div>
          )}
          <span className="text-xs font-medium text-gray-700">
            {author?.name.split(' ')[0]}
          </span>
          {authorPosition && <PositionBadge position={authorPosition} />}
        </div>
        <ExternalLink size={10} className="text-blue-400 opacity-100 sm:opacity-0 sm:group-hover/quote:opacity-100 transition-opacity" />
      </div>
      {/* Story text */}
      <p className="text-sm text-gray-700 line-clamp-2">{story.text}</p>
      {/* Stats row */}
      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
        <span className="flex items-center gap-1" title="Linked points">
          <Pin size={12} />
          {storyLinkedPoints.length}
        </span>
        <span className="flex items-center gap-1" title="Clarity sessions">
          <Radio size={12} />
          {story.verificationCount}
        </span>
        <span className="flex items-center gap-1" title="Clarity across disagreement">
          <Zap size={12} />
          {story.crossDisagreementCount ?? 0}
        </span>
      </div>
    </button>
  );
}
