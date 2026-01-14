import { BottomNav } from './BottomNav';
import { IdeaCard } from './IdeaCard';
import { mockIdeas } from '../data/mock-data';

export function Feed() {
  return (
    <div className="min-h-screen bg-gray-100 pb-16">
      {/* Feed content */}
      <main className="max-w-lg mx-auto">
        {/* Ideas list */}
        <div className="space-y-2 mt-2 px-2">
          {mockIdeas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} />
          ))}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
