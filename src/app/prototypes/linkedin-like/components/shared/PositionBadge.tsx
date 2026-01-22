import type { PositionType } from '../../../shared/types';

interface PositionBadgeProps {
  position: PositionType;
  /** Name to display before position (e.g., "Alice agrees") */
  name?: string;
  /** Use "You" for current user's position */
  isCurrentUser?: boolean;
}

/**
 * Displays a position as inline colored text with optional name.
 * Returns null for current user (buttons already show their position).
 *
 * Format: "{Name} agrees/disagrees/is unsure"
 * - Name in gray, position in blue (all positions same color)
 *
 * Examples:
 * - "Alice Agrees" (third-person)
 * - "Agrees" (when name is omitted)
 */
export function PositionBadge({
  position,
  name,
  isCurrentUser = false,
}: PositionBadgeProps) {
  // Don't show badge for current user - buttons already indicate their position
  if (isCurrentUser) {
    return null;
  }

  // All positions use same blue styling for visual consistency
  const badgeClass = 'bg-blue-100 text-blue-700';

  const config = {
    agree: { label: 'Agrees' },
    disagree: { label: 'Disagrees' },
    dont_know: { label: 'Unsure' },
  };

  const c = config[position];

  // If no name provided, just show the position as a badge
  if (!name) {
    return (
      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${badgeClass}`}>
        {c.label}
      </span>
    );
  }

  return (
    <span className="text-xs flex items-center gap-1">
      <span className="text-gray-500">{name}</span>
      <span className={`font-medium px-1.5 py-0.5 rounded ${badgeClass}`}>{c.label}</span>
    </span>
  );
}
