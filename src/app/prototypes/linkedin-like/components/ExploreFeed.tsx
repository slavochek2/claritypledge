import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { PrototypeLayout } from './PrototypeLayout';
import { StoryCard } from './StoryCard';
import { PointCard } from './PointCard';
import { ViewToggle, type ViewMode } from './shared/ViewToggle';
import { CardStack, ParticipantRow, ContentTypeTabs, type ContentFilter } from './card-view';
import { routes } from '../config';
import { getStories, getPoints, mockUsers, currentUser } from '../data/mock-data';
import type { Story, Point, PositionType } from '../../shared/types';

type FeedItem =
  | { type: 'story'; item: Story; sortDate: string }
  | { type: 'point'; item: Point; sortDate: string };

/**
 * Determine default view based on screen width
 * Mobile (< 768px) = cards, Desktop = list
 */
function getDefaultView(): ViewMode {
  if (typeof window !== 'undefined' && window.innerWidth < 768) {
    return 'cards';
  }
  return 'list';
}

/**
 * ExploreFeed - Discovery feed showing both Stories and Points
 * Users can filter by content type, person, and switch between List and Card views.
 *
 * P89: Added Card View with swipeable cards for mobile-first interaction.
 */
export function ExploreFeed() {
  const navigate = useNavigate();

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>(getDefaultView);

  // Filter state (content type only - participant filtering removed, now navigates to profile)
  const [contentFilter, setContentFilter] = useState<ContentFilter>('all');

  // Get all data
  const stories = getStories();
  const points = getPoints();

  // Get all participants (mock users + current user)
  const participants = useMemo(() => {
    return [currentUser, ...mockUsers];
  }, []);

  // Combine and sort by date
  // Card View: Unpositioned items first (for Points), then chronological
  const feedItems = useMemo((): FeedItem[] => {
    const storyItems: FeedItem[] = stories.map(story => ({
      type: 'story' as const,
      item: story,
      sortDate: story.createdAt,
    }));

    const pointItems: FeedItem[] = points.map(point => ({
      type: 'point' as const,
      item: point,
      sortDate: point.createdAt,
    }));

    const allItems = [...storyItems, ...pointItems];

    if (viewMode === 'cards') {
      // Card View: Unpositioned Points first, then chronological
      return allItems.sort((a, b) => {
        // Points without current user position come first
        const aHasPosition = a.type === 'point' && a.item.positions['current'];
        const bHasPosition = b.type === 'point' && b.item.positions['current'];

        if (!aHasPosition && bHasPosition) return -1;
        if (aHasPosition && !bHasPosition) return 1;

        // Then sort by date (newest first)
        return new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime();
      });
    }

    // List View: Just chronological (newest first)
    return allItems.sort((a, b) =>
      new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime()
    );
  }, [stories, points, viewMode]);

  // Apply content type filter
  const filteredItems = useMemo(() => {
    return feedItems.filter(feedItem => {
      if (contentFilter === 'stories') return feedItem.type === 'story';
      if (contentFilter === 'points') return feedItem.type === 'point';
      return true;
    });
  }, [feedItems, contentFilter]);

  // Counts for tabs
  const storiesCount = stories.length;
  const pointsCount = points.length;

  // Handlers
  const handleStoryTap = (storyId: string) => {
    navigate(routes.story(storyId));
  };

  const handlePointTap = (pointId: string) => {
    navigate(routes.point(pointId));
  };

  const handleLiveButtonClick = (story: Story) => {
    // Mock: Show toast instead of opening /live
    toast('Would open /live', {
      description: `Start verification session for this story by ${story.authorId === currentUser.id ? 'you' : 'another user'}`,
    });
  };

  const handlePositionChange = (pointId: string, position: PositionType | null) => {
    // In a real app, this would update the backend
    console.log(`Position changed for point ${pointId}:`, position);
  };

  const handleBackToList = () => {
    setViewMode('list');
  };

  return (
    <PrototypeLayout>
      {viewMode === 'cards' ? (
        // Card View - Full screen
        <div className="h-[calc(100vh-64px)] flex flex-col bg-gray-50">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => navigate(routes.home)}
                className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                <ArrowLeft size={16} className="mr-1" />
                Back
              </button>
              <ViewToggle view={viewMode} onViewChange={setViewMode} />
            </div>

            {/* Participant Row - tap to view profile */}
            <ParticipantRow
              participants={participants}
              currentUserId={currentUser.id}
            />

            {/* Content Type Tabs */}
            <div className="mt-3">
              <ContentTypeTabs
                filter={contentFilter}
                onChange={setContentFilter}
                storiesCount={storiesCount}
                pointsCount={pointsCount}
              />
            </div>
          </div>

          {/* Card Stack */}
          <div className="flex-1 p-4 overflow-hidden">
            <CardStack
              items={filteredItems}
              onStoryTap={handleStoryTap}
              onPointTap={handlePointTap}
              onLiveButtonClick={handleLiveButtonClick}
              onPositionChange={handlePositionChange}
              onBackToList={handleBackToList}
            />
          </div>
        </div>
      ) : (
        // List View
        <div className="container mx-auto max-w-2xl px-4 py-6">
          {/* Back button */}
          <button
            onClick={() => navigate(routes.home)}
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4"
          >
            <ArrowLeft size={16} className="mr-1" />
            Back to Dashboard
          </button>

          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Feed</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Discover stories and points from others
                </p>
              </div>
              <ViewToggle view={viewMode} onViewChange={setViewMode} />
            </div>

            {/* Participant Row - tap to view profile */}
            <div className="mt-4">
              <ParticipantRow
                participants={participants}
                currentUserId={currentUser.id}
              />
            </div>

            {/* Content Type Tabs */}
            <div className="mt-4">
              <ContentTypeTabs
                filter={contentFilter}
                onChange={setContentFilter}
                storiesCount={storiesCount}
                pointsCount={pointsCount}
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
      )}
    </PrototypeLayout>
  );
}
