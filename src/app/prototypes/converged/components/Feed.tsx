import { useState } from 'react';
import { ideas, getUserEngagement, type Position } from '../data/mock-data';
import { StoriesRow } from './StoriesRow';
import { FeedHeader } from './FeedHeader';
import { IdeaCard } from './IdeaCard';
import { CreateIdea } from './CreateIdea';
import { BottomNav } from './BottomNav';

export function Feed() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [userPositions, setUserPositions] = useState<Record<string, Position>>({});

  const handlePositionChange = (ideaId: string, position: Position) => {
    setUserPositions((prev) => ({
      ...prev,
      [ideaId]: position,
    }));
  };

  const getUserPosition = (ideaId: string): Position => {
    // Check local state first, then mock data
    if (userPositions[ideaId] !== undefined) {
      return userPositions[ideaId];
    }
    const engagement = getUserEngagement(ideas.find(i => i.id === ideaId)!, 'current');
    return engagement?.position || null;
  };

  // Filter ideas based on active filter
  const filteredIdeas = ideas.filter((idea) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'disputed') {
      const counts = idea.engagements.reduce(
        (acc, e) => {
          if (e.position === 'agree') acc.agree++;
          if (e.position === 'disagree') acc.disagree++;
          return acc;
        },
        { agree: 0, disagree: 0 }
      );
      return counts.agree > 0 && counts.disagree > 0;
    }
    if (activeFilter === 'verified') {
      return idea.engagements.some(e => e.isVerified);
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header with search and filters */}
      <FeedHeader
        onCreateIdea={() => setShowCreateModal(true)}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
      />

      {/* Stories Row */}
      <StoriesRow />

      {/* Ideas Feed */}
      <div className="px-4 py-4 space-y-3">
        {filteredIdeas.map((idea) => (
          <IdeaCard
            key={idea.id}
            idea={idea}
            currentUserPosition={getUserPosition(idea.id)}
            onPositionChange={handlePositionChange}
          />
        ))}
      </div>

      {/* Bottom Navigation */}
      <BottomNav />

      {/* Create Idea Modal */}
      {showCreateModal && (
        <CreateIdea onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}
