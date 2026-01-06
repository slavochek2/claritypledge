import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, CheckCircle2, ArrowRightLeft } from 'lucide-react';
import type { Idea, Position } from '../data/mock-data';
import { getUserById, getPositionCounts, formatTimeAgo } from '../data/mock-data';
import { routes } from '../config';

interface IdeaCardProps {
  idea: Idea;
  currentUserPosition?: Position;
  onPositionChange?: (ideaId: string, position: Position) => void;
}

export function IdeaCard({ idea, currentUserPosition, onPositionChange }: IdeaCardProps) {
  const navigate = useNavigate();
  const [selectedPosition, setSelectedPosition] = useState<Position>(currentUserPosition || null);
  const [isPressed, setIsPressed] = useState(false);

  // Sync local state when parent prop changes (fixes state sync anti-pattern)
  useEffect(() => {
    setSelectedPosition(currentUserPosition || null);
  }, [currentUserPosition]);

  const author = getUserById(idea.createdBy);
  const counts = getPositionCounts(idea);

  const handlePositionClick = (e: React.MouseEvent, position: Position) => {
    e.stopPropagation();
    const newPosition = selectedPosition === position ? null : position;
    setSelectedPosition(newPosition);
    onPositionChange?.(idea.id, newPosition);
  };

  const handleCardClick = () => {
    navigate(routes.idea(idea.id));
  };

  const positionButtonClass = (position: Position) => {
    const isSelected = selectedPosition === position;
    const base = 'flex-1 py-2.5 px-3 min-h-[44px] rounded-full text-sm font-medium transition-all duration-200 active:scale-95';

    if (!isSelected) {
      return `${base} bg-gray-100 text-gray-600 hover:bg-gray-200`;
    }

    switch (position) {
      case 'agree':
        return `${base} bg-green-100 text-green-700`;
      case 'disagree':
        return `${base} bg-red-100 text-red-700`;
      case 'dont_know':
        return `${base} bg-gray-200 text-gray-700`;
      default:
        return `${base} bg-gray-100 text-gray-600`;
    }
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
        bg-white rounded-[20px] p-5 cursor-pointer
        shadow-[0_2px_8px_rgba(0,0,0,0.04)]
        transition-transform duration-200
        ${isPressed ? 'scale-[0.98]' : 'scale-100'}
      `}
    >
      {/* Idea Text */}
      <p className="text-[17px] leading-relaxed text-gray-900 font-normal mb-4">
        {idea.text}
      </p>

      {/* Author Row */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs">
          {author?.avatar || '👤'}
        </div>
        <span className="text-[13px] text-gray-500">
          {author?.name || 'Unknown'} · {formatTimeAgo(idea.createdAt)}
        </span>
      </div>

      {/* Position Buttons */}
      <div className="flex gap-2 mb-4" role="group" aria-label="Your position on this idea" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={(e) => handlePositionClick(e, 'agree')}
          className={positionButtonClass('agree')}
          aria-pressed={selectedPosition === 'agree'}
          aria-label="Mark as agree"
        >
          Agree
        </button>
        <button
          onClick={(e) => handlePositionClick(e, 'disagree')}
          className={positionButtonClass('disagree')}
          aria-pressed={selectedPosition === 'disagree'}
          aria-label="Mark as disagree"
        >
          Disagree
        </button>
        <button
          onClick={(e) => handlePositionClick(e, 'dont_know')}
          className={positionButtonClass('dont_know')}
          aria-pressed={selectedPosition === 'dont_know'}
          aria-label="Mark as unsure"
        >
          Unsure
        </button>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-4 text-[13px] text-gray-400">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 size={14} />
          <span>{idea.verificationCount} verified</span>
        </div>
        {idea.crossDisagreementCount > 0 && (
          <div className="flex items-center gap-1.5 text-blue-500">
            <ArrowRightLeft size={14} />
            <span>{idea.crossDisagreementCount} across disagreement</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <MessageCircle size={14} />
          <span>{idea.commentCount}</span>
        </div>
      </div>

      {/* Position Summary */}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-1 text-[12px]">
          <span className="w-2 h-2 rounded-full bg-green-400"></span>
          <span className="text-gray-400">{counts.agree}</span>
        </div>
        <div className="flex items-center gap-1 text-[12px]">
          <span className="w-2 h-2 rounded-full bg-red-400"></span>
          <span className="text-gray-400">{counts.disagree}</span>
        </div>
        <div className="flex items-center gap-1 text-[12px]">
          <span className="w-2 h-2 rounded-full bg-gray-300"></span>
          <span className="text-gray-400">{counts.dont_know}</span>
        </div>
      </div>
    </article>
  );
}
