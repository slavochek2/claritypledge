import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PrototypeLayout } from './PrototypeLayout';
import { PointCard } from './PointCard';
import { StoryCard } from './StoryCard';
import { FilterTabs, type PositionFilter } from './shared';
import { routes } from '../config';
import {
  getPointById,
  getStoriesForPoint,
  getPointPositionCounts,
} from '../data/mock-data';
import type { Point } from '../../shared/types';

/**
 * PointDetail - Journey 1: "Explore a debate"
 * Shows a Point with linked Stories, filterable by position.
 * Users can stake their position and find people who disagree.
 */
export function PointDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const point = getPointById(id || '');
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('all');

  if (!point) {
    return (
      <PrototypeLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <p className="text-gray-500">Point not found</p>
        </div>
      </PrototypeLayout>
    );
  }

  const linkedStories = getStoriesForPoint(point.id);
  const counts = getPointPositionCounts(point);

  // Count stories by author's position on this point
  const storyCounts = {
    all: linkedStories.length,
    agree: 0,
    disagree: 0,
    dont_know: 0,
  };

  for (const story of linkedStories) {
    const authorPosition = point.positions[story.authorId]?.position;
    if (authorPosition) {
      storyCounts[authorPosition]++;
    }
  }

  // Filter stories by author's position
  const filteredStories = linkedStories.filter(story => {
    if (positionFilter === 'all') return true;
    const authorPosition = point.positions[story.authorId]?.position;
    return authorPosition === positionFilter;
  });

  return (
    <PrototypeLayout>
      <div className="max-w-lg mx-auto pb-8">
        {/* Back button */}
        <div className="px-4 pt-3">
          <button
            onClick={() => {
              // If there's history, go back; otherwise go to explore
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate(routes.explore);
              }
            }}
            className="p-1 text-gray-500 hover:text-gray-700 -ml-1"
          >
            <ArrowLeft size={18} />
          </button>
        </div>

        {/* Point card - reusing component in detail view mode */}
        <div className="px-2 pt-2">
          <PointCard point={point} isDetailView />
        </div>

        {/* Stories section */}
        <div className="bg-white border border-gray-200 mx-2 mt-3 rounded-lg">
          {/* Filter tabs */}
          <FilterTabs
            activeFilter={positionFilter}
            onFilterChange={setPositionFilter}
            counts={storyCounts}
          />

          {/* Stories list */}
          <div className="p-4">
            {filteredStories.length === 0 ? (
              <p className="text-center text-gray-500 py-4">
                No stories with this position yet
              </p>
            ) : (
              <div className="space-y-3">
                {filteredStories.map(story => (
                  <StoryCard
                    key={story.id}
                    story={story}
                    compact
                    authorPosition={point.positions[story.authorId]?.position}
                    showVerifyButton
                    hideLinkedPoints
                    onVerify={(e) => {
                      e.stopPropagation();
                      navigate(routes.live);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </PrototypeLayout>
  );
}
