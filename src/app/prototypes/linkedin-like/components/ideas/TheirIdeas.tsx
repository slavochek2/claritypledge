/**
 * @file TheirIdeas.tsx
 * @description Ideas you've surfaced for the other person to review.
 * Shows their position (if taken) with a banner, and allows you to stake your own position.
 */
import { useState } from 'react';
import { Lightbulb, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { SurfacedIdea, PositionType } from '../../data/mock-data';
import { mockYourSurfacedIdeas, getUserById } from '../../data/mock-data';

interface TheirIdeasProps {
  partnerName?: string;
  onSurfaceIdea?: () => void;
}

interface IdeaWithPositions extends SurfacedIdea {
  yourPosition?: PositionType | null;
  theirPosition?: PositionType | null;
}

export function TheirIdeas({ partnerName = 'Alice', onSurfaceIdea }: TheirIdeasProps) {
  // Ideas with mock positions
  const [ideas, setIdeas] = useState<IdeaWithPositions[]>(() =>
    mockYourSurfacedIdeas.map((idea, index) => ({
      ...idea,
      yourPosition: index === 0 ? 'agree' : null, // First idea has your position
      theirPosition: index === 0 ? 'disagree' : null, // Alice disagreed with first
    }))
  );

  const handlePositionChange = (ideaId: string, position: PositionType) => {
    setIdeas(prev => prev.map(idea => {
      if (idea.id !== ideaId) return idea;

      const isRemoving = idea.yourPosition === position;
      const newPosition = isRemoving ? null : position;

      // Show toast
      if (newPosition) {
        const positionLabels: Record<PositionType, string> = {
          agree: 'agreed with',
          disagree: 'disagreed with',
          dont_know: "aren't sure about",
        };
        toast.success(`Position staked!`, {
          description: `You ${positionLabels[newPosition]} this idea`,
        });
      }

      return { ...idea, yourPosition: newPosition };
    }));
  };

  // Empty state
  if (ideas.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
          <Lightbulb className="w-8 h-8 text-blue-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No ideas surfaced yet</h3>
        <p className="text-sm text-gray-500 max-w-xs mb-4">
          Surface an idea you'd like to verify understanding on with {partnerName}.
        </p>
        <button
          onClick={onSurfaceIdea}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Surface an Idea
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto">
      {/* Header with add button */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-700">
          Ideas for {partnerName} to review
        </h3>
        <button
          onClick={onSurfaceIdea}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {/* Ideas list */}
      <div className="space-y-3">
        {ideas.map(idea => (
          <TheirIdeaCard
            key={idea.id}
            idea={idea}
            partnerName={partnerName}
            onPositionChange={handlePositionChange}
          />
        ))}
      </div>
    </div>
  );
}

// Individual idea card with position staking
interface TheirIdeaCardProps {
  idea: IdeaWithPositions;
  partnerName: string;
  onPositionChange: (ideaId: string, position: PositionType) => void;
}

function TheirIdeaCard({ idea, partnerName, onPositionChange }: TheirIdeaCardProps) {
  const hasTheirPosition = idea.theirPosition !== null;
  const positionsDiffer = idea.yourPosition && idea.theirPosition && idea.yourPosition !== idea.theirPosition;

  // Position banner styling
  const getBannerStyle = () => {
    if (!hasTheirPosition) return null;

    const styles: Record<PositionType, { bg: string; text: string; label: string }> = {
      agree: { bg: 'bg-green-50', text: 'text-green-700', label: 'agrees' },
      disagree: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'disagrees' },
      dont_know: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'is unsure' },
    };

    return styles[idea.theirPosition!];
  };

  const bannerStyle = getBannerStyle();

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Position divergence banner */}
      {bannerStyle && (
        <div className={`px-4 py-2 ${bannerStyle.bg} ${bannerStyle.text} text-sm border-b`}>
          <span className="font-medium">{partnerName}</span> {bannerStyle.label}
          {positionsDiffer && (
            <span className="ml-1 text-xs opacity-75">(You have different positions)</span>
          )}
        </div>
      )}

      {/* Idea content */}
      <div className="p-4">
        <p className="text-gray-900">"{idea.text}"</p>

        {/* Position buttons */}
        <div className="mt-3 flex items-center justify-end gap-2">
          <PositionButton
            position="disagree"
            isActive={idea.yourPosition === 'disagree'}
            onClick={() => onPositionChange(idea.id, 'disagree')}
          />
          <PositionButton
            position="dont_know"
            isActive={idea.yourPosition === 'dont_know'}
            onClick={() => onPositionChange(idea.id, 'dont_know')}
          />
          <PositionButton
            position="agree"
            isActive={idea.yourPosition === 'agree'}
            onClick={() => onPositionChange(idea.id, 'agree')}
          />
        </div>
      </div>
    </div>
  );
}

// Position button component
interface PositionButtonProps {
  position: PositionType;
  isActive: boolean;
  onClick: () => void;
}

function PositionButton({ position, isActive, onClick }: PositionButtonProps) {
  const config: Record<PositionType, { icon: string; activeClass: string; inactiveClass: string }> = {
    agree: {
      icon: '✓',
      activeClass: 'bg-green-500 text-white border-green-500',
      inactiveClass: 'text-green-600 border-green-200 hover:bg-green-50',
    },
    disagree: {
      icon: '✗',
      activeClass: 'bg-blue-500 text-white border-blue-500',
      inactiveClass: 'text-blue-600 border-blue-200 hover:bg-blue-50',
    },
    dont_know: {
      icon: '?',
      activeClass: 'bg-gray-500 text-white border-gray-500',
      inactiveClass: 'text-gray-600 border-gray-200 hover:bg-gray-50',
    },
  };

  const { icon, activeClass, inactiveClass } = config[position];

  return (
    <button
      onClick={onClick}
      className={`w-9 h-9 rounded-full border-2 flex items-center justify-center font-medium transition-all ${
        isActive ? activeClass : inactiveClass
      }`}
    >
      {icon}
    </button>
  );
}
