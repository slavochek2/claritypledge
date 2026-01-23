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
} from '../data/mock-data';
import type { PositionType, Story } from '../../shared/types';
import { getPositionGroup, type PositionButtonGroup } from '../../shared/types';

/**
 * PointDetail - Journey 1: "Explore a debate"
 * Shows a Point with linked Stories grouped by position.
 *
 * Layout:
 * - Filter tabs at top (no "All" tab - click active to deselect)
 * - When filter = 'all': show all position sections
 * - When filter = specific: show only that section
 * - Empty sections show "(no positions yet)"
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

  // Group stories by author's position on this point
  const storiesByPosition: Record<PositionButtonGroup, Story[]> = {
    agree: [],
    disagree: [],
    unsure: [],
  };

  for (const story of linkedStories) {
    const authorPosition = point.positions[story.authorId]?.position;
    if (authorPosition) {
      const group = getPositionGroup(authorPosition as PositionType);
      storiesByPosition[group].push(story);
    }
  }

  const storyCounts = {
    all: linkedStories.length,
    agree: storiesByPosition.agree.length,
    disagree: storiesByPosition.disagree.length,
    unsure: storiesByPosition.unsure.length,
  };

  // Which sections to show based on filter
  const positionsToShow: PositionButtonGroup[] =
    positionFilter === 'all'
      ? ['agree', 'disagree', 'unsure']
      : [positionFilter as PositionButtonGroup];

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

        {/* Point card */}
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

          {/* Position-grouped stories */}
          <div className="p-4 space-y-6">
            {positionsToShow.map(position => (
              <PositionSection
                key={position}
                position={position}
                stories={storiesByPosition[position]}
                positionsByAuthor={point.positions}
                showHeader={positionFilter === 'all'}
              />
            ))}
          </div>
        </div>
      </div>
    </PrototypeLayout>
  );
}

/**
 * Section for a single position group (Agree/Disagree/Unsure)
 * Shows header only when viewing all positions (showHeader=true)
 * Uses thread lines to show hierarchy: Position → Person → Story
 */
function PositionSection({
  position,
  stories,
  positionsByAuthor,
  showHeader,
}: {
  position: PositionButtonGroup;
  stories: Story[];
  /** Map of author ID to their position entry */
  positionsByAuthor: Record<string, { position: PositionType; timestamp: string }>;
  /** Show position label header (when viewing all positions) */
  showHeader: boolean;
}) {
  const labels: Record<PositionButtonGroup, string> = {
    agree: 'Agree',
    disagree: 'Disagree',
    unsure: 'Unsure',
  };

  // When viewing all positions, hide empty sections entirely
  // Only show "(no stories yet)" when explicitly filtering to an empty category
  if (stories.length === 0 && showHeader) {
    return null;
  }

  return (
    <div>
      {/* Position label - shown when viewing all positions */}
      {showHeader && stories.length > 0 && (
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          {labels[position]}
        </div>
      )}

      {/* Stories or empty state (only shown when filtering to specific position) */}
      {stories.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-3">
          (no stories yet)
        </p>
      ) : (
        <div className="relative pl-6">
          {/* Single vertical thread line */}
          <div className="absolute left-2 top-2 bottom-2 w-px bg-gray-300" />

          <div className="space-y-3">
            {stories.map(story => (
              <StoryCard
                key={story.id}
                story={story}
                compact
                context="point-detail"
                authorPosition={positionsByAuthor[story.authorId]?.position}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
