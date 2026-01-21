import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Share2, BookOpen, ExternalLink, Pin } from 'lucide-react';
import { routes } from '../config';
import {
  getStoriesForPoint,
  getPointPositionCounts,
} from '../data/mock-data';
import { PositionButtons } from './shared';
import type { Point, Position } from '../../shared/types';

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
            <div className="mb-2">
              <span className="font-semibold text-gray-900 text-sm">
                {totalPositions} {totalPositions === 1 ? 'owner' : 'owners'}
              </span>
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
            <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
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

    </div>
  );
}
