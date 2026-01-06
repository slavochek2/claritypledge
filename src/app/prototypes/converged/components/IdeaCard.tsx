import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, ThumbsUp, ThumbsDown, HelpCircle, Sparkles, Users } from 'lucide-react';
import type { Idea, Position } from '../data/mock-data';
import { getIdeaStats, formatTimeAgo, getIdeaAttribution } from '../data/mock-data';
import { routes } from '../config';
import { PositionButtons } from './shared/PositionButtons';
import { ReactionsModal } from './ReactionsModal';

interface IdeaCardProps {
  idea: Idea;
  currentUserPosition?: Position;
  onPositionChange?: (ideaId: string, position: Position) => void;
}

export function IdeaCard({ idea, currentUserPosition, onPositionChange }: IdeaCardProps) {
  const navigate = useNavigate();
  const [selectedPosition, setSelectedPosition] = useState<Position>(currentUserPosition || null);
  const [isPressed, setIsPressed] = useState(false);
  const [showReactions, setShowReactions] = useState<Position>(null);

  useEffect(() => {
    setSelectedPosition(currentUserPosition || null);
  }, [currentUserPosition]);

  const stats = getIdeaStats(idea);
  const attribution = getIdeaAttribution(idea);

  const handlePositionClick = (position: Position) => {
    setSelectedPosition(position);
    onPositionChange?.(idea.id, position);
  };

  const handleCardClick = () => {
    navigate(routes.idea(idea.id));
  };

  return (
    <article
      onClick={handleCardClick}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
      onTouchStart={() => setIsPressed(true)}
      onTouchEnd={() => setIsPressed(false)}
      className={`
        bg-white rounded-2xl p-4 cursor-pointer
        shadow-sm border border-gray-100
        transition-transform duration-200
        ${isPressed ? 'scale-[0.98]' : 'scale-100'}
      `}
    >
      {/* Attribution line */}
      {attribution && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
          <Users className="w-4 h-4" />
          <span>{attribution}</span>
        </div>
      )}

      {/* Idea Text */}
      <p className="text-[16px] leading-relaxed text-gray-900 font-normal mb-4">
        {idea.text}
      </p>

      {/* Stats row (clickable) - ABOVE buttons per P32.4_04 */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-6 mb-4"
      >
        <button
          onClick={() => setShowReactions('agree')}
          className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-blue-600 transition-colors"
        >
          <ThumbsUp className="w-4 h-4" />
          <span className="font-medium">{stats.agree}</span>
        </button>

        <button
          onClick={() => setShowReactions('disagree')}
          className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-blue-600 transition-colors"
        >
          <ThumbsDown className="w-4 h-4" />
          <span className="font-medium">{stats.disagree}</span>
        </button>

        <button
          onClick={() => setShowReactions('unsure')}
          className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-blue-600 transition-colors"
        >
          <HelpCircle className="w-4 h-4" />
          <span className="font-medium">{stats.unsure}</span>
        </button>
      </div>

      {/* Position Buttons (no counts) - BELOW stats per P32.4_04 */}
      <div onClick={(e) => e.stopPropagation()} className="mb-4">
        <PositionButtons
          selectedPosition={selectedPosition}
          onPositionChange={handlePositionClick}
          showCounts={false}
        />
      </div>

      {/* Meta row */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-3">
          {stats.crossVerified > 0 && (
            <span className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              {stats.crossVerified} cross-verified
            </span>
          )}
          <span className="flex items-center gap-1">
            <MessageCircle className="w-3.5 h-3.5" />
            {stats.comments}
          </span>
        </div>
        <span>{formatTimeAgo(idea.createdAt)}</span>
      </div>

      {/* Reactions Modal */}
      {showReactions && (
        <ReactionsModal
          idea={idea}
          filter={showReactions}
          onClose={() => setShowReactions(null)}
        />
      )}
    </article>
  );
}
