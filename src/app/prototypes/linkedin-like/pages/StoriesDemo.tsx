import { useState } from 'react';
import { IdeasStories } from '../components/ideas/IdeasStories';
import type { StoryIdea, Position } from '../components/ideas/types';

// Demo data - simulating a live conversation session
// Using fixed timestamps for deterministic rendering and testing (M4)
const initialIdeas: StoryIdea[] = [
  {
    id: 'idea-1',
    text: 'Remote work is more productive than office work for knowledge workers',
    author: { id: 'alice', name: 'Alice', avatar: '👩' },
    myPosition: null,
    partnerPosition: 'agree',
    isVerified: false,
    timestamp: '2026-01-23T10:00:00Z',
  },
  {
    id: 'idea-2',
    text: 'AI will replace most knowledge work within 10 years',
    author: { id: 'bob', name: 'Bob', avatar: '🧑' },
    myPosition: 'disagree',
    partnerPosition: 'agree',
    isVerified: false,
    timestamp: '2026-01-23T10:05:00Z',
  },
  {
    id: 'idea-3',
    text: 'Code reviews are more valuable than automated testing',
    author: { id: 'you', name: 'You', avatar: '👤' },
    myPosition: 'agree',
    partnerPosition: 'agree',
    isVerified: true,
    timestamp: '2026-01-23T10:10:00Z',
  },
  {
    id: 'idea-4',
    text: 'Most meetings could be replaced with async communication',
    author: { id: 'alice', name: 'Alice', avatar: '👩' },
    myPosition: 'agree',
    partnerPosition: 'disagree',
    isVerified: false,
    timestamp: '2026-01-23T10:15:00Z',
  },
];

export function StoriesDemo() {
  const [ideas, setIdeas] = useState<StoryIdea[]>(initialIdeas);
  const [showStories, setShowStories] = useState(true);
  const [startIndex, setStartIndex] = useState(0);
  const [pendingVerification, setPendingVerification] = useState<string | undefined>(undefined);

  const handlePositionChange = (ideaId: string, position: Position) => {
    setIdeas((prev) =>
      prev.map((idea) =>
        idea.id === ideaId ? { ...idea, myPosition: position } : idea
      )
    );
  };

  const handleVerify = (ideaId: string) => {
    setIdeas((prev) =>
      prev.map((idea) =>
        idea.id === ideaId ? { ...idea, isVerified: true } : idea
      )
    );
  };

  const handleRespondToVerification = (ideaId: string) => {
    // In real app, this would open verification flow
    setPendingVerification(undefined);
    setIdeas((prev) =>
      prev.map((idea) =>
        idea.id === ideaId ? { ...idea, isVerified: true } : idea
      )
    );
  };

  const handleAddIdea = () => {
    // Use Date.now() only for unique ID generation, not for display
    const newIdea: StoryIdea = {
      id: `idea-${Date.now()}`,
      text: 'New idea surfaced from conversation...',
      author: { id: 'you', name: 'You', avatar: '👤' },
      myPosition: null,
      partnerPosition: null,
      isVerified: false,
      timestamp: new Date().toISOString(), // Runtime-generated for new ideas is OK
    };
    setIdeas((prev) => [newIdea, ...prev]);
    setStartIndex(0);
  };

  const handleInsertFromProfile = () => {
    // In real app, this would open profile ideas picker
    const profileIdea: StoryIdea = {
      id: `idea-${Date.now()}`,
      text: 'Working from home increases productivity by 13% according to Stanford research',
      author: { id: 'you', name: 'You', avatar: '👤' },
      myPosition: 'agree',
      partnerPosition: null,
      isVerified: false,
      timestamp: new Date().toISOString(), // Runtime-generated for new ideas is OK
    };
    setIdeas((prev) => [profileIdea, ...prev]);
    setStartIndex(0);
  };

  const handleClose = () => {
    setShowStories(false);
  };

  if (!showStories) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            P55.1 Variant E: Stories
          </h1>
          <p className="text-gray-600">Instagram Stories-inspired Ideas UX</p>
        </div>

        <div className="space-y-4 w-full max-w-xs">
          <button
            onClick={() => {
              setShowStories(true);
              setStartIndex(0);
            }}
            className="w-full py-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium"
          >
            Open Stories
          </button>

          <button
            onClick={() => {
              setIdeas([]);
              setShowStories(true);
            }}
            className="w-full py-4 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-medium"
          >
            Test Empty State
          </button>

          <button
            onClick={() => {
              setIdeas(initialIdeas);
              setShowStories(true);
              setStartIndex(1);
            }}
            className="w-full py-4 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-medium"
          >
            Jump to Divergent
          </button>

          <button
            onClick={() => {
              setIdeas(initialIdeas);
              setShowStories(true);
              setStartIndex(2);
            }}
            className="w-full py-4 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium"
          >
            Jump to Verified
          </button>

          <button
            onClick={() => {
              setIdeas(initialIdeas);
              setPendingVerification('idea-2'); // Bob's AI idea
              setShowStories(true);
              setStartIndex(1);
            }}
            className="w-full py-4 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-xl font-medium"
          >
            Test Verification Request (J7)
          </button>
        </div>

        {/* History preview */}
        <div className="mt-8 w-full max-w-xs">
          <h2 className="text-sm font-semibold text-gray-500 mb-3">
            IDEAS ({ideas.length})
          </h2>
          <div className="space-y-2">
            {ideas.map((idea, idx) => (
              <button
                key={idea.id}
                onClick={() => {
                  setShowStories(true);
                  setStartIndex(idx);
                }}
                className="w-full text-left p-3 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow"
              >
                <p className="text-sm text-gray-900 line-clamp-2">{idea.text}</p>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  {idea.isVerified && (
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">
                      Verified
                    </span>
                  )}
                  {idea.myPosition &&
                    idea.partnerPosition &&
                    idea.myPosition !== idea.partnerPosition &&
                    !idea.isVerified && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                        Divergent
                      </span>
                    )}
                  {!idea.myPosition && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                      Pending
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <IdeasStories
      ideas={ideas}
      startIndex={startIndex}
      pendingVerificationRequest={pendingVerification}
      onPositionChange={handlePositionChange}
      onVerify={handleVerify}
      onRespondToVerification={handleRespondToVerification}
      onAddIdea={handleAddIdea}
      onInsertFromProfile={handleInsertFromProfile}
      onClose={handleClose}
    />
  );
}
