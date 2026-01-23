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

        {/* Point card - reusing component in detail view mode */}
        <div className="px-2 pt-2">
          <PointCard point={point} isDetailView />
        </div>

        {/* Stories section */}
        <div className="bg-white border border-gray-200 mx-2 mt-3 rounded-lg">
          {/* Filter tabs - click active to deselect (shows all) */}
          <FilterTabs
            activeFilter={positionFilter}
            onFilterChange={setPositionFilter}
            counts={storyCounts}
          />

          {/* Position-grouped stories */}
          <div className="p-4 space-y-4">
            {positionsToShow.map(position => (
              <PositionSection
                key={position}
                position={position}
                stories={storiesByPosition[position]}
                point={point}
                showHeader={positionFilter === 'all'}
                hidePositionBadge={positionFilter !== 'all'}
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
 * When filtered to single position, tab already indicates the position
 */
function PositionSection({
  position,
  stories,
  point,
  showHeader,
  hidePositionBadge,
}: {
  position: PositionButtonGroup;
  stories: Story[];
  point: ReturnType<typeof getPointById>;
  /** Show section header - false when filtered to single position (tab is the header) */
  showHeader: boolean;
  /** Hide position badge on cards - true when filtered (tab already shows position) */
  hidePositionBadge: boolean;
}) {
  const labels: Record<PositionButtonGroup, string> = {
    agree: 'Agree',
    disagree: 'Disagree',
    unsure: 'Unsure',
  };

  return (
    <div>
      {/* Section header - only when viewing all positions */}
      {showHeader && (
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            {labels[position]} ({stories.length})
          </span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>
      )}

      {/* Stories or empty state */}
      {stories.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-3">
          (no stories yet)
        </p>
      ) : (
        <div className="space-y-3">
          {stories.map(story => (
            <StoryCard
              key={story.id}
              story={story}
              compact
              context="point-detail"
              authorPosition={point?.positions[story.authorId]?.position}
              hidePositionBadge={hidePositionBadge}
            />
          ))}
        </div>
      )}
    </div>
  );
}
