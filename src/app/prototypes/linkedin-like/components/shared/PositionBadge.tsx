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
 * Format: "{Name} strongly agrees/agrees/is unsure/disagrees/strongly disagrees"
 * - Name in gray, position in colored text
 * - Agree variants: blue, Disagree variants: slate, Unsure/False Premise: gray
 *
 * Examples:
 * - "Alice strongly agrees" (on someone's profile)
 * - "You agree" (on your own profile)
 * - "disagrees" (when name is omitted)
 */
export function PositionBadge({
  position,
  name,
  isCurrentUser = false,
}: PositionBadgeProps) {
  // When showing YOUR position, all badges use blue (it's your action)
  // When showing someone else's position, use semantic colors
  const yourBadgeClass = 'bg-blue-100 text-blue-700';

  // 7-point scale + false_premise configuration
  const config: Record<PositionType, { label: string; badgeClass: string }> = {
    strongly_agree: {
      label: 'Strongly Agrees',
      badgeClass: 'bg-blue-100 text-blue-700'
    },
    agree: {
      label: 'Agrees',
      badgeClass: 'bg-blue-100 text-blue-700'
    },
    somewhat_agree: {
      label: 'Somewhat Agrees',
      badgeClass: 'bg-blue-100 text-blue-700'
    },
    unsure: {
      label: 'Unsure',
      badgeClass: 'bg-slate-100 text-slate-600'
    },
    false_premise: {
      label: 'False Premise',
      badgeClass: 'bg-slate-100 text-slate-600'
    },
    somewhat_disagree: {
      label: 'Somewhat Disagrees',
      badgeClass: 'bg-slate-100 text-slate-700'
    },
    disagree: {
      label: 'Disagrees',
      badgeClass: 'bg-slate-100 text-slate-700'
    },
    strongly_disagree: {
      label: 'Strongly Disagrees',
      badgeClass: 'bg-slate-100 text-slate-700'
    },
  };

  const c = config[position];
  const displayName = isCurrentUser ? 'You' : name;

  // Use blue for YOUR position (any stance), semantic colors for others
  const badgeClass = isCurrentUser ? yourBadgeClass : c.badgeClass;

  // If no name provided, just show the position as a badge (use semantic colors)
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
      <span className={`font-medium px-1.5 py-0.5 rounded ${badgeClass}`}>{c.label}</span>
    </span>
  );
}
