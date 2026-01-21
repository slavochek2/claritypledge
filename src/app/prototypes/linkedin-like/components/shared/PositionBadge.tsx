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
 *
 * Format: "{Name} agrees/disagrees/is unsure"
 * - Name in gray, position in colored text
 * - Agree: blue, Disagree: slate, Unsure: gray
 *
 * Examples:
 * - "Alice agrees" (on someone's profile)
 * - "You agree" (on your own profile)
 * - "agrees" (when name is omitted)
 */
export function PositionBadge({
  position,
  name,
  isCurrentUser = false,
}: PositionBadgeProps) {
  const config = {
    agree: {
      label: 'Agrees',
      badgeClass: 'bg-blue-100 text-blue-700'
    },
    disagree: {
      label: 'Disagrees',
      badgeClass: 'bg-slate-100 text-slate-700'
    },
    dont_know: {
      label: 'Unsure',
      badgeClass: 'bg-gray-100 text-gray-600'
    },
  };

  const c = config[position];
  const displayName = isCurrentUser ? 'You' : name;

  // If no name provided, just show the position as a badge
  if (!displayName) {
    return (
      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${c.badgeClass}`}>
        {c.label}
      </span>
    );
  }

  return (
    <span className="text-xs flex items-center gap-1">
      <span className="text-gray-500">{displayName}</span>
      <span className={`font-medium px-1.5 py-0.5 rounded ${c.badgeClass}`}>{c.label}</span>
    </span>
  );
}
