import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PrototypeLayout } from './PrototypeLayout';
import { StoryCard } from './StoryCard';
import { PointCard } from './PointCard';
import { routes } from '../config';
import { getStories, getPoints } from '../data/mock-data';
import type { Story, Point } from '../../shared/types';

type FeedItem =
  | { type: 'story'; item: Story; sortDate: string }
  | { type: 'point'; item: Point; sortDate: string };

type FilterType = 'all' | 'stories' | 'points';

/**
 * ExploreFeed - Discovery feed showing both Stories and Points
 * Users can filter by content type and explore debates or personal experiences.
 */
export function ExploreFeed() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterType>('all');

  const stories = getStories();
  const points = getPoints();

  // Combine and sort by date
  const feedItems: FeedItem[] = [
    ...stories.map(story => ({
      type: 'story' as const,
      item: story,
      sortDate: story.createdAt,
    })),
    ...points.map(point => ({
      type: 'point' as const,
      item: point,
      sortDate: point.createdAt,
    })),
  ].sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());

  // Filter items
  const filteredItems = feedItems.filter(feedItem => {
    if (filter === 'all') return true;
    if (filter === 'stories') return feedItem.type === 'story';
    if (filter === 'points') return feedItem.type === 'point';
    return true;
  });

  return (
    <PrototypeLayout>
      <div className="container mx-auto max-w-2xl px-4 py-6">
        {/* Back button - matches Profile pattern for main nav pages */}
        <button
          onClick={() => navigate(routes.home)}
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4"
        >
          <ArrowLeft size={16} className="mr-1" />
          Back to Dashboard
        </button>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Feed</h1>
          <p className="text-sm text-gray-500 mt-1">
            Discover stories and points from others
          </p>

          {/* Filter tabs */}
          <div className="flex gap-2 mt-4">
            <FilterButton
              label="All"
              active={filter === 'all'}
              onClick={() => setFilter('all')}
            />
            <FilterButton
              label="Stories"
              active={filter === 'stories'}
              onClick={() => setFilter('stories')}
              activeColor="bg-blue-50 text-blue-700 border-blue-200"
            />
            <FilterButton
              label="Points"
              active={filter === 'points'}
              onClick={() => setFilter('points')}
              activeColor="bg-gray-100 text-gray-700 border-gray-300"
            />
          </div>
        </div>

        {/* Feed items */}
        <div className="space-y-4">
          {filteredItems.map(feedItem => (
            feedItem.type === 'story' ? (
              <StoryCard key={`story-${feedItem.item.id}`} story={feedItem.item} />
            ) : (
              <PointCard key={`point-${feedItem.item.id}`} point={feedItem.item} />
            )
          ))}
        </div>

        {filteredItems.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <p className="text-gray-500">No items to show</p>
          </div>
        )}
      </div>
    </PrototypeLayout>
  );
}

function FilterButton({
  label,
  active,
  onClick,
  activeColor = 'bg-gray-100 text-gray-900 border-gray-300',
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  activeColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium rounded-full border transition-colors ${
        active
          ? activeColor
          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  );
}
