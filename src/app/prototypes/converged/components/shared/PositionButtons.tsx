import { Check, X, HelpCircle } from 'lucide-react';
import type { Position } from '../../data/mock-data';

interface PositionButtonsProps {
  selectedPosition: Position;
  onPositionChange: (position: Position) => void;
  counts?: { agree: number; disagree: number; unsure: number };
  showCounts?: boolean;
  size?: 'sm' | 'md';
}

export function PositionButtons({
  selectedPosition,
  onPositionChange,
  counts,
  showCounts = true,
  size = 'md',
}: PositionButtonsProps) {
  const handleClick = (e: React.MouseEvent, position: Position) => {
    e.stopPropagation();
    const newPosition = selectedPosition === position ? null : position;
    onPositionChange(newPosition);
  };

  const buttonClass = (position: Position) => {
    const isSelected = selectedPosition === position;
    const sizeClasses = size === 'sm' ? 'py-2 px-3 text-xs' : 'py-2.5 px-4 text-sm';
    const base = `flex-1 flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg font-medium transition-all duration-200 active:scale-95 border ${sizeClasses}`;

    // Always show position-specific colors (like wildcard/feed.png reference)
    switch (position) {
      case 'agree':
        return isSelected
          ? `${base} bg-emerald-500 text-white border-emerald-500`
          : `${base} bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100`;
      case 'disagree':
        return isSelected
          ? `${base} bg-red-500 text-white border-red-500`
          : `${base} bg-red-50 text-red-700 border-red-200 hover:bg-red-100`;
      case 'unsure':
        return isSelected
          ? `${base} bg-gray-600 text-white border-gray-600`
          : `${base} bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200`;
      default:
        return `${base} bg-gray-100 text-gray-600 border-gray-200`;
    }
  };

  const getIcon = (position: Position) => {
    const iconSize = size === 'sm' ? 14 : 16;
    switch (position) {
      case 'agree':
        return <Check size={iconSize} strokeWidth={2.5} />;
      case 'disagree':
        return <X size={iconSize} strokeWidth={2.5} />;
      case 'unsure':
        return <HelpCircle size={iconSize} />;
      default:
        return null;
    }
  };

  const getLabel = (position: Position) => {
    switch (position) {
      case 'agree':
        return showCounts && counts ? `Yes (${counts.agree})` : 'Yes';
      case 'disagree':
        return showCounts && counts ? `No (${counts.disagree})` : 'No';
      case 'unsure':
        return showCounts && counts ? `? (${counts.unsure})` : '?';
      default:
        return '';
    }
  };

  return (
    <div className="flex gap-2" role="group" aria-label="Your position">
      <button
        onClick={(e) => handleClick(e, 'agree')}
        className={buttonClass('agree')}
        aria-pressed={selectedPosition === 'agree'}
        aria-label="Mark as agree"
      >
        {getIcon('agree')}
        <span>{getLabel('agree')}</span>
      </button>
      <button
        onClick={(e) => handleClick(e, 'disagree')}
        className={buttonClass('disagree')}
        aria-pressed={selectedPosition === 'disagree'}
        aria-label="Mark as disagree"
      >
        {getIcon('disagree')}
        <span>{getLabel('disagree')}</span>
      </button>
      <button
        onClick={(e) => handleClick(e, 'unsure')}
        className={buttonClass('unsure')}
        aria-pressed={selectedPosition === 'unsure'}
        aria-label="Mark as unsure"
      >
        {getIcon('unsure')}
        <span>{getLabel('unsure')}</span>
      </button>
    </div>
  );
}
