/**
 * @file shared.tsx
 * @description Shared components for Clarity Partners feature.
 * Note: Constants and utilities moved to separate files for Fast Refresh compatibility.
 */

import { RATING_OPTIONS } from './constants';

// Re-export for backward compatibility
// eslint-disable-next-line react-refresh/only-export-components
export { RATING_OPTIONS } from './constants';
// eslint-disable-next-line react-refresh/only-export-components
export { capitalizeName, getFirstName } from './utils';

/**
 * Rating buttons component - shared between rating-card and live-mode-view.
 */
interface RatingButtonsProps {
  selectedValue: number | null;
  onSelect: (value: number) => void;
  disabled?: boolean;
}

export function RatingButtons({ selectedValue, onSelect, disabled }: RatingButtonsProps) {
  return (
    <div className="flex gap-1 w-full max-w-sm">
      {RATING_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => onSelect(option.value)}
          disabled={disabled}
          className={`
            flex-1 min-w-0 py-2.5 rounded-md text-xs font-medium transition-all
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            ${
              selectedValue === option.value
                ? 'bg-blue-500 text-white ring-2 ring-blue-500 ring-offset-1'
                : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'
            }
          `}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
