import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, ChevronDown, ChevronUp, Share2, BookOpen, Crosshair } from 'lucide-react';
import { routes } from '../config';
import {
  getUserById,
  getStoriesForPoint,
  getPointPositionCounts,
} from '../data/mock-data';
import { PositionButtons } from './shared';
import type { Point, Story, Position, PositionType } from '../../shared/types';

interface PointCardProps {
  point: Point;
  compact?: boolean;
  isDetailView?: boolean;
}

/**
 * PointCard - displays a claim about reality (Point)
 * Visual: Yellow left border, NO avatar (ownerless/global), position buttons
 * Pattern B: Blue border line shows linked Stories
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
    : "bg-white rounded-lg shadow-sm border-l-4 border-l-slate-400 border border-gray-200 overflow-hidden cursor-pointer hover:border-slate-300 hover:shadow-md transition-all";

  return (
    <div
      className={cardClassName}
      onClick={handleCardClick}
    >
      {/* Main content */}
      <div className="p-4">
        {/* Header - no avatar, just Point label with icon */}
        <div className="flex items-center justify-end mb-3">
          <span className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
            <Crosshair size={12} />
            Point
          </span>
        </div>

        {/* Point text */}
        <p className={`text-gray-900 font-medium ${compact ? 'text-sm line-clamp-2' : 'text-base'}`}>
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
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1" title={`${totalPositions} positions`}>
              <Users size={14} />
              {totalPositions}
            </span>
            {linkedStories.length > 0 && (
              <span className="flex items-center gap-1" title={`${linkedStories.length} stories`}>
                <BookOpen size={14} />
                {linkedStories.length}
              </span>
            )}
          </div>

          {/* Share button - always visible for mobile, hover effect for desktop */}
          {!isDetailView && (
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
          )}
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
            className="w-full px-4 py-2 flex items-center justify-between text-sm text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
          >
            <span className="flex items-center gap-2">
              <BookOpen size={14} className="text-blue-500" />
              Stories ({linkedStories.length})
            </span>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {expanded && (
            <div className="px-4 py-2 space-y-2 bg-blue-50/50">
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
      className="w-full text-left p-2 rounded-lg hover:bg-blue-100 transition-colors flex items-start gap-3"
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

function PositionBadge({ position }: { position: PositionType }) {
  const config = {
    agree: { label: 'Agrees', className: 'bg-blue-100 text-blue-700' },
    disagree: { label: 'Disagrees', className: 'bg-slate-100 text-slate-700' },
    dont_know: { label: 'Unsure', className: 'bg-gray-100 text-gray-600' },
  };
  const c = config[position];
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${c.className}`}>
      {c.label}
    </span>
  );
}
