import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, CheckCircle2, ArrowRightLeft } from 'lucide-react';
import type { Idea, Position } from '../data/mock-data';
import { getPositionCounts, getVerificationCount, getCrossDisagreementCount, formatTimeAgo } from '../data/mock-data';
import { routes } from '../config';
import { PositionButtons } from './shared/PositionButtons';

interface IdeaCardProps {
  idea: Idea;
  currentUserPosition?: Position;
  onPositionChange?: (ideaId: string, position: Position) => void;
}

export function IdeaCard({ idea, currentUserPosition, onPositionChange }: IdeaCardProps) {
  const navigate = useNavigate();
  const [selectedPosition, setSelectedPosition] = useState<Position>(currentUserPosition || null);
  const [isPressed, setIsPressed] = useState(false);

  useEffect(() => {
    setSelectedPosition(currentUserPosition || null);
  }, [currentUserPosition]);

  const counts = getPositionCounts(idea);
  const verifiedCount = getVerificationCount(idea);
  const crossDisagreementCount = getCrossDisagreementCount(idea);

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
      {/* Idea Text */}
      <p className="text-[16px] leading-relaxed text-gray-900 font-normal mb-4">
        {idea.text}
      </p>

      {/* Position Buttons - counts inside buttons per wildcard/feed.png */}
      <div onClick={(e) => e.stopPropagation()} className="mb-3">
        <PositionButtons
          selectedPosition={selectedPosition}
          onPositionChange={handlePositionClick}
          counts={counts}
          showCounts={true}
        />
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-4 text-[12px] text-gray-400 pt-2 border-t border-gray-100">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 size={14} />
          <span>{verifiedCount} verified</span>
        </div>
        {crossDisagreementCount > 0 && (
          <div className="flex items-center gap-1.5 text-purple-500">
            <ArrowRightLeft size={14} />
            <span>{crossDisagreementCount} across disagreement</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <MessageCircle size={14} />
          <span>{idea.comments.length}</span>
        </div>
      </div>

      {/* Timestamp */}
      <div className="text-[11px] text-gray-400 mt-2">
        {formatTimeAgo(idea.createdAt)}
      </div>
    </article>
  );
}
