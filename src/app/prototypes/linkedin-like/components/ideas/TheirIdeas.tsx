/**
 * @file TheirIdeas.tsx
 * @description Ideas you've surfaced for the other person to review.
 * Shows their position (if taken) with a banner, and allows you to stake your own position.
 */
import { useState } from 'react';
import { Lightbulb, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { SurfacedIdea } from '../../data/mock-data';
import { mockYourSurfacedIdeas } from '../../data/mock-data';
import type { PositionType, Position } from '../../../shared/types';
import { PositionButtons, type SevenPointCounts } from '../shared';

interface TheirIdeasProps {
  partnerName?: string;
  onSurfaceIdea?: () => void;
}

interface IdeaWithPositions extends SurfacedIdea {
  yourPosition?: Position;
  theirPosition?: Position;
}

// Empty counts for position buttons (this UI doesn't show community counts)
const EMPTY_COUNTS: SevenPointCounts = {
  strongly_agree: 0,
  agree: 0,
  somewhat_agree: 0,
  unsure: 0,
  somewhat_disagree: 0,
  disagree: 0,
  strongly_disagree: 0,
};

export function TheirIdeas({ partnerName = 'Alice', onSurfaceIdea }: TheirIdeasProps) {
  // Ideas with mock positions
  const [ideas, setIdeas] = useState<IdeaWithPositions[]>(() =>
    mockYourSurfacedIdeas.map((idea, index) => ({
      ...idea,
      yourPosition: index === 0 ? 'agree' : null, // First idea has your position
      theirPosition: index === 0 ? 'disagree' : null, // Alice disagreed with first
    }))
  );

  const handlePositionChange = (position: PositionType, ideaId: string) => {
    setIdeas(prev => prev.map(idea => {
      if (idea.id !== ideaId) return idea;

      const isRemoving = idea.yourPosition === position;
      const newPosition = isRemoving ? null : position;

      // Show toast
      if (newPosition) {
        const positionLabels: Record<string, string> = {
          strongly_agree: 'strongly agreed with',
          agree: 'agreed with',
          somewhat_agree: 'somewhat agreed with',
          strongly_disagree: 'strongly disagreed with',
          disagree: 'disagreed with',
          somewhat_disagree: 'somewhat disagreed with',
          unsure: "aren't sure about",
        };
        toast.success(`Position staked!`, {
          description: `You ${positionLabels[newPosition] || 'took a position on'} this idea`,
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
  onPositionChange: (position: PositionType, ideaId: string) => void;
}

function TheirIdeaCard({ idea, partnerName, onPositionChange }: TheirIdeaCardProps) {
  const hasTheirPosition = idea.theirPosition !== null;
  const positionsDiffer = idea.yourPosition && idea.theirPosition && idea.yourPosition !== idea.theirPosition;

  // Position banner styling - map 7-point scale to 3 display groups
  const getBannerStyle = () => {
    if (!hasTheirPosition || !idea.theirPosition) return null;

    // Map positions to display groups
    const agreePositions = ['strongly_agree', 'agree', 'somewhat_agree'];
    const disagreePositions = ['strongly_disagree', 'disagree', 'somewhat_disagree'];
    const unsurePositions = ['unsure'];

    if (agreePositions.includes(idea.theirPosition)) {
      return { bg: 'bg-blue-50', text: 'text-blue-700', label: 'agrees' };
    }
    if (disagreePositions.includes(idea.theirPosition)) {
      return { bg: 'bg-slate-50', text: 'text-slate-700', label: 'disagrees' };
    }
    if (unsurePositions.includes(idea.theirPosition)) {
      return { bg: 'bg-gray-100', text: 'text-gray-600', label: 'is unsure' };
    }
    return null;
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

        {/* Position buttons - using shared component */}
        <div className="mt-3 flex items-center justify-end">
          <PositionButtons
            userPosition={idea.yourPosition || null}
            counts={EMPTY_COUNTS}
            onPositionClick={(position) => onPositionChange(position, idea.id)}
            compact
          />
        </div>
      </div>
    </div>
  );
}
