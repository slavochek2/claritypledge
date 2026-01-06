import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { mockIdeas, currentUser, type Position } from '../data/mock-data';
import { IdeaCard } from './IdeaCard';
import { BottomNav } from './BottomNav';
import { routes } from '../config';

export function Feed() {
  const navigate = useNavigate();
  const [userPositions, setUserPositions] = useState<Record<string, Position>>({});

  const handlePositionChange = (ideaId: string, position: Position) => {
    setUserPositions(prev => ({
      ...prev,
      [ideaId]: position
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-gray-200/50">
        <div className="flex items-center justify-between px-5 h-14 max-w-[500px] mx-auto">
          <h1 className="text-[28px] font-semibold tracking-tight text-gray-900">
            Ideas
          </h1>
          <button
            onClick={() => navigate(routes.profile)}
            aria-label="View your profile"
            className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm transition-transform active:scale-95"
          >
            {currentUser.avatar}
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="px-5 pt-4 pb-28 max-w-[500px] mx-auto">
        <div className="space-y-4">
          {mockIdeas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              currentUserPosition={userPositions[idea.id]}
              onPositionChange={handlePositionChange}
            />
          ))}
        </div>
      </main>

      {/* FAB - Create New Idea */}
      <button
        onClick={() => {/* TODO: Open create idea modal */}}
        aria-label="Create new idea"
        className="
          fixed right-5 bottom-24 z-20
          w-14 h-14 rounded-full
          bg-blue-500 text-white
          shadow-lg shadow-blue-500/30
          flex items-center justify-center
          transition-transform active:scale-95
          hover:bg-blue-600
        "
      >
        <Plus size={28} strokeWidth={2} aria-hidden="true" />
      </button>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
