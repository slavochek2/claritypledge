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
  /**
   * When true, removes the max-w-sm cap so buttons fill their container.
   * Use when embedding inside a chat bubble (P467).
   */
  fullWidth?: boolean;
  /**
   * P1542 (founder 2026-10-26): on a narrow screen the scale takes two rows, 0-5 then 6-10 centred under it, so every
   * number is a >= 40px target; one row again from 520px. Off by default: other surfaces are unchanged.
   */
  wrap?: boolean;
}

export function RatingButtons({ selectedValue, onSelect, disabled, fullWidth, wrap = false }: RatingButtonsProps) {
  return (
    <div
      role="group"
      aria-label="Rating scale from 0 to 10"
      data-wrap={wrap ? '' : undefined}
      className={wrap
        ? `grid grid-cols-12 gap-1 w-full min-[520px]:flex${fullWidth ? '' : ' max-w-sm'}`
        : `flex gap-1 w-full${fullWidth ? '' : ' max-w-sm'}`}
    >
      {RATING_OPTIONS.map((option) => (
        <button
          type="button"
          key={option.value}
          onClick={() => !disabled && onSelect(option.value)}
          disabled={disabled}
          aria-label={`Rate ${option.value}`}
          aria-pressed={selectedValue === option.value ? 'true' : 'false'}
          aria-disabled={disabled ? 'true' : undefined}
          tabIndex={disabled ? -1 : undefined}
          className={`
            flex-1 min-w-0 min-h-11 py-2.5 rounded-md text-xs font-medium transition-all
            ${wrap ? `col-span-2 text-sm min-[520px]:text-xs${option.value === 6 ? ' col-start-2' : ''}` : ''}
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

