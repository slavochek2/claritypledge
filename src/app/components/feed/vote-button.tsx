/**
 * @file vote-button.tsx
 * @description Shared VoteButton component for idea feed voting UI.
 */
import { ThumbsUp, ThumbsDown, HelpCircle } from 'lucide-react';
import type { FeedVote } from '@/app/types';

interface VoteButtonProps {
  type: FeedVote;
  count: number;
  isActive: boolean;
  onClick: () => void;
  disabled: boolean;
  /** If provided, clicking the count opens voter list (detail page only) */
  onCountClick?: () => void;
}

const voteConfig = {
  agree: {
    icon: ThumbsUp,
    label: 'Agree',
    activeClass: 'bg-green-100 text-green-700 border-green-300',
    hoverClass: 'hover:bg-green-50 hover:text-green-600 hover:border-green-200',
  },
  disagree: {
    icon: ThumbsDown,
    label: 'Disagree',
    activeClass: 'bg-red-100 text-red-700 border-red-300',
    hoverClass: 'hover:bg-red-50 hover:text-red-600 hover:border-red-200',
  },
  dont_know: {
    icon: HelpCircle,
    label: "Don't Know",
    activeClass: 'bg-gray-100 text-gray-700 border-gray-300',
    hoverClass: 'hover:bg-gray-50 hover:text-gray-600 hover:border-gray-200',
  },
};

export function VoteButton({
  type,
  count,
  isActive,
  onClick,
  disabled,
  onCountClick,
}: VoteButtonProps) {
  const { icon: Icon, label, activeClass, hoverClass } = voteConfig[type];

  // Simple variant (feed page) - count is inline
  if (!onCountClick) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium
          transition-colors
          ${isActive ? activeClass : `border-gray-200 text-gray-500 ${hoverClass}`}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <Icon className="h-4 w-4" />
        <span>{label}</span>
        {count > 0 && <span className="ml-1 text-xs opacity-70">{count}</span>}
      </button>
    );
  }

  // Split variant (detail page) - count is clickable
  return (
    <div className="flex items-center">
      <button
        onClick={onClick}
        disabled={disabled}
        className={`
          flex items-center gap-1.5 px-3 py-2 rounded-l-full border text-sm font-medium
          transition-colors
          ${isActive ? activeClass : `border-gray-200 text-gray-500 ${hoverClass}`}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </button>
      {count > 0 ? (
        <button
          onClick={onCountClick}
          className={`
            px-2 py-2 rounded-r-full border-t border-r border-b text-sm font-medium
            hover:bg-gray-50 transition-colors
            ${isActive ? activeClass : 'border-gray-200 text-gray-500'}
          `}
        >
          {count}
        </button>
      ) : (
        <span
          className={`
            px-2 py-2 rounded-r-full border-t border-r border-b text-sm opacity-50
            ${isActive ? activeClass : 'border-gray-200 text-gray-400'}
          `}
        >
          0
        </span>
      )}
    </div>
  );
}
