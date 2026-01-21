import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, Share2, BookOpen, ExternalLink } from 'lucide-react';
import { routes } from '../config';
import {
  getUserById,
  getStoriesForPoint,
  getPointPositionCounts,
  getPointParticipants,
} from '../data/mock-data';
import { PositionBadge, PositionButtons } from './shared';
import type { Point, Story, Position } from '../../shared/types';

interface PointCardProps {
  point: Point;
  compact?: boolean;
  isDetailView?: boolean;
}

/**
 * PointCard - displays a claim about reality (Point)
 * Visual: Gray left border, Clarity logo avatar (platform-owned), position buttons
 * Pattern B: Shows linked Stories expandable section
 */
export function PointCard({ point, compact = false, isDetailView = false }: PointCardProps) {
  const navigate = useNavigate();
  const [userPosition, setUserPosition] = useState<Position>(
    point.positions['current']?.position || null
  );
  const [expanded, setExpanded] = useState(false);

  const linkedStories = getStoriesForPoint(point.id);
  const counts = getPointPositionCounts(point);
  const totalPositions = counts.agree + counts.disagree + counts.dont_know;
  const participants = getPointParticipants(point, 2); // Show 2 avatars + count
  const remainingCount = totalPositions - participants.length;

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
      {/* Main content */}
      <div className="p-4">
        {/* Participant avatars + content row - matches StoryCard structure */}
        <div className="flex gap-3">
          {/* Overlapping participant avatars - tighter overlap */}
          <div className="flex-shrink-0 flex items-start">
            <div className="flex -space-x-3">
              {participants.map((participant, index) => (
                <div
                  key={participant.id}
                  className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-lg border-2 border-white"
                  style={{ zIndex: participants.length - index }}
                  title={participant.name}
                >
                  {participant.avatar}
                </div>
              ))}
              {remainingCount > 0 && (
                <div
                  className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600 border-2 border-white"
                  style={{ zIndex: 0 }}
                >
                  +{remainingCount}
                </div>
              )}
            </div>
          </div>

          {/* Content column */}
          <div className="flex-1 min-w-0">
            {/* Header row - matches StoryCard structure */}
            <div className="mb-2">
              <span className="font-semibold text-gray-900 text-sm">
                {totalPositions} {totalPositions === 1 ? 'person' : 'people'} engaged
              </span>
              <p className="text-xs text-gray-500">Shared Point</p>
            </div>

            {/* Point text */}
            <p className={`text-gray-900 ${compact ? 'text-sm line-clamp-2' : 'text-base'}`}>
              {point.text}
            </p>

            {/* Position buttons */}
            <div
              className="py-3"
              onClick={(e) => e.stopPropagation()}
            >
              <PositionButtons
                userPosition={userPosition}
                counts={counts}
                onPositionClick={handlePositionClick}
              />
            </div>

            {/* Stats row - icon-only style */}
            <div className="flex items-center justify-between text-sm text-gray-500">
              {linkedStories.length > 0 ? (
                <div className="flex items-center gap-3 px-2.5 py-1 bg-gray-100 rounded-full">
                  <span className="flex items-center gap-1" title={`${linkedStories.length} stories`}>
                    <BookOpen size={14} />
                    {linkedStories.length}
                  </span>
                </div>
              ) : (
                <div />
              )}

              {/* Action buttons - appear on hover */}
              {!isDetailView && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // TODO: Share functionality
                    }}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    aria-label="Share point"
                  >
                    <Share2 size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Linked Stories section - Pattern B blue border */}
      {/* Hidden in detail view - stories shown in FilterTabs below */}
      {linkedStories.length > 0 && !isDetailView && (
        <div className="border-t border-gray-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="w-full px-4 py-2 flex items-center justify-between text-sm text-gray-600 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <span className="flex items-center gap-2">
              <BookOpen size={14} className="text-gray-500" />
              Stories ({linkedStories.length})
            </span>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {expanded && (
            <div className="px-4 py-2 space-y-2 bg-gray-50/50">
              {linkedStories.map(story => (
                <LinkedStoryRow
                  key={story.id}
                  story={story}
                  point={point}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(routes.story(story.id));
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Compact row showing a linked Story with author and position badge
 */
function LinkedStoryRow({
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

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-2 rounded-lg hover:bg-gray-100 transition-colors flex items-start gap-3"
    >
      {/* Author avatar */}
      {author && (
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm flex-shrink-0">
          {author.avatar}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-gray-900">{author?.name}</span>
          {authorPosition && (
            <PositionBadge position={authorPosition} />
          )}
        </div>
        <p className="text-sm text-gray-600 line-clamp-1 mt-0.5">{story.text}</p>
      </div>
    </button>
  );
}
