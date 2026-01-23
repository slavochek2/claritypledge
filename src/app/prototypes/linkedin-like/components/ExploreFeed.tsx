import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { PrototypeLayout } from './PrototypeLayout';
import { StoryCard } from './StoryCard';
import { PointCard } from './PointCard';
import { CardStack, ParticipantRow, ContentTypeTabs, type ContentFilter } from './card-view';
import { routes } from '../config';
import { getStories, getPoints, mockUsers, currentUser, getUserById } from '../data/mock-data';
import type { Story, Point, PositionType } from '../../shared/types';

type FeedItem =
  | { type: 'story'; item: Story; sortDate: string }
  | { type: 'point'; item: Point; sortDate: string };

/**
 * ExploreFeed (Home) - Discovery feed showing Stories and Points
 *
 * UX Pattern:
 * - Default: List view of all content
 * - Tap avatar: Opens card view of THAT PERSON's content only (Telegram stories style)
 * - Tap name in cards: Navigate to their full profile
 */
export function ExploreFeed() {
  const navigate = useNavigate();

  // Selected participant for card view (null = list view)
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);

  // Content type filter (shared between list and card view)
  const [contentFilter, setContentFilter] = useState<ContentFilter>('stories');

  // Get all data
  const stories = getStories();
  const points = getPoints();

  // Get all participants (mock users + current user)
  const participants = useMemo(() => {
    return [currentUser, ...mockUsers];
  }, []);

  // Combine and sort by date (newest first)
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

    return allItems.sort((a, b) =>
      new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime()
    );
  }, [stories, points]);

  // Filter items by selected participant (for card view)
  const participantItems = useMemo((): FeedItem[] => {
    if (!selectedParticipantId) return feedItems;

    return feedItems.filter(item => {
      if (item.type === 'story') {
        return item.item.authorId === selectedParticipantId;
      } else {
        // For Points, show if the participant has taken a position
        return item.item.positions[selectedParticipantId] != null;
      }
    });
  }, [feedItems, selectedParticipantId]);

  // Apply content type filter (used in both list and card view)
  const filteredParticipantItems = useMemo(() => {
    return participantItems.filter(feedItem => {
      if (contentFilter === 'stories') return feedItem.type === 'story';
      if (contentFilter === 'points') return feedItem.type === 'point';
      return true;
    });
  }, [participantItems, contentFilter]);

  // Apply content type filter to feed items (for list view)
  const filteredFeedItems = useMemo(() => {
    return feedItems.filter(feedItem => {
      if (contentFilter === 'stories') return feedItem.type === 'story';
      if (contentFilter === 'points') return feedItem.type === 'point';
      return true;
    });
  }, [feedItems, contentFilter]);

  // Counts for tabs
  // In card view: scoped to selected participant
  // In list view: all content
  const storiesCount = selectedParticipantId
    ? participantItems.filter(i => i.type === 'story').length
    : feedItems.filter(i => i.type === 'story').length;
  const pointsCount = selectedParticipantId
    ? participantItems.filter(i => i.type === 'point').length
    : feedItems.filter(i => i.type === 'point').length;

  // Get selected participant info
  const selectedParticipant = selectedParticipantId ? getUserById(selectedParticipantId) : null;

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

  const handlePositionChange = (_pointId: string, _position: PositionType | null) => {
    // In a real app, this would update the backend
  };

  const handleAvatarClick = (userId: string) => {
    setSelectedParticipantId(userId);
    // Keep current filter when switching person
  };

  const handleCloseCards = () => {
    setSelectedParticipantId(null);
  };

  return (
    <PrototypeLayout>
      {selectedParticipantId ? (
        // Card View - Viewing one person's content (Telegram stories style)
        <div className="h-[calc(100vh-64px)] flex flex-col bg-gray-50">
          {/* Header - centered on desktop */}
          <div className="bg-white border-b border-gray-200">
            <div className="max-w-2xl mx-auto px-4 py-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCloseCards}
                    className="inline-flex items-center justify-center w-8 h-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                    aria-label="Close"
                  >
                    <X size={20} />
                  </button>
                  {selectedParticipant && (
                    <div>
                      <button
                        onClick={() => navigate(routes.profileById(selectedParticipantId))}
                        className="font-semibold text-gray-900 hover:underline"
                      >
                        {selectedParticipant.name}
                      </button>
                      <p className="text-xs text-gray-500">
                        {storiesCount} stories · {pointsCount} points
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Participant Row - tap to switch person */}
              <ParticipantRow
                participants={participants}
                currentUserId={currentUser.id}
                onAvatarClick={handleAvatarClick}
                selectedUserId={selectedParticipantId}
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
          </div>

          {/* Card Stack - centered on desktop */}
          <div className="flex-1 p-4 overflow-hidden max-w-2xl mx-auto w-full">
            {filteredParticipantItems.length > 0 ? (
              <CardStack
                items={filteredParticipantItems}
                onStoryTap={handleStoryTap}
                onPointTap={handlePointTap}
                onLiveButtonClick={handleLiveButtonClick}
                onPositionChange={handlePositionChange}
                onBackToList={handleCloseCards}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <p className="text-gray-500 mb-4">
                  {selectedParticipant?.name} hasn't shared any {contentFilter} yet.
                </p>
                <button
                  onClick={() => navigate(routes.profileById(selectedParticipantId))}
                  className="text-blue-600 hover:underline text-sm font-medium"
                >
                  View their profile
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        // List View - Default home view
        <div className="container mx-auto max-w-2xl px-4 py-6">
          {/* Header */}
          <div className="mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Home</h1>
              <p className="text-sm text-gray-500 mt-1">
                Discover stories and points from others
              </p>
            </div>

            {/* Participant Row - tap avatar to see their cards */}
            <div className="mt-4">
              <ParticipantRow
                participants={participants}
                currentUserId={currentUser.id}
                onAvatarClick={handleAvatarClick}
                selectedUserId={selectedParticipantId}
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
            {filteredFeedItems.map(feedItem => (
              feedItem.type === 'story' ? (
                <StoryCard key={`story-${feedItem.item.id}`} story={feedItem.item} />
              ) : (
                <PointCard key={`point-${feedItem.item.id}`} point={feedItem.item} />
              )
            ))}
          </div>

          {filteredFeedItems.length === 0 && (
            <div className="flex items-center justify-center py-16">
              <p className="text-gray-500">No {contentFilter} to show</p>
            </div>
          )}
        </div>
      )}
    </PrototypeLayout>
  );
}
