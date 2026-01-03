/**
 * @file shared.tsx
 * @description Shared components and utilities for Clarity Partners feature.
 */

// Rating button configuration - 0 to 10 scale
export const RATING_OPTIONS = [
  { value: 0, label: '0' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5' },
  { value: 6, label: '6' },
  { value: 7, label: '7' },
  { value: 8, label: '8' },
  { value: 9, label: '9' },
  { value: 10, label: '10' },
] as const;

/**
 * Capitalizes the first letter of each word in a name.
 */
export function capitalizeName(name: string): string {
  return name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Extracts the first name from a full name and capitalizes it.
 * Used in live meetings for more compact display.
 */
export function getFirstName(name: string): string {
  const firstName = name.trim().split(' ')[0] || name;
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
}

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
