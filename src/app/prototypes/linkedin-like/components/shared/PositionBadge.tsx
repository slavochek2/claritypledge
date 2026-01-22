import type { PositionType } from '../../../shared/types';
import { Check, X, HelpCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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
 * Format: "{Name} strongly agrees/agrees/is unsure/disagrees/strongly disagrees"
 * - Name in gray, position in colored badge
 * - ALL positions use blue - taking any stance is equally valuable
 * - Icons differentiate: ✓ (agree), ✗ (disagree), ? (unsure)
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
  // All positions use blue - taking any stance is equally valuable
  // Icons differentiate: ✓ (agree), ✗ (disagree), ? (unsure)
  const blueBadge = 'bg-blue-100 text-blue-700';
  const config: Record<PositionType, { label: string; badgeClass: string; icon: LucideIcon }> = {
    strongly_agree: {
      label: 'Strongly Agrees',
      badgeClass: blueBadge,
      icon: Check,
    },
    agree: {
      label: 'Agrees',
      badgeClass: blueBadge,
      icon: Check,
    },
    somewhat_agree: {
      label: 'Somewhat Agrees',
      badgeClass: blueBadge,
      icon: Check,
    },
    unsure: {
      label: 'Unsure',
      badgeClass: blueBadge,
      icon: HelpCircle,
    },
    somewhat_disagree: {
      label: 'Somewhat Disagrees',
      badgeClass: blueBadge,
      icon: X,
    },
    disagree: {
      label: 'Disagrees',
      badgeClass: blueBadge,
      icon: X,
    },
    strongly_disagree: {
      label: 'Strongly Disagrees',
      badgeClass: blueBadge,
      icon: X,
    },
  };

  const c = config[position];
  const displayName = isCurrentUser ? 'You' : name;
  const Icon = c.icon;

  // If no name provided, just show the position as a badge (use semantic colors)
  if (!displayName) {
    return (
      <span className={`text-xs font-medium px-1.5 py-0.5 rounded flex items-center gap-1 ${c.badgeClass}`}>
        <Icon className="h-3 w-3" />
        {c.label}
      </span>
    );
  }

  return (
    <span className="text-xs flex items-center gap-1">
      <span className="text-gray-500">{displayName}</span>
      <span className={`font-medium px-1.5 py-0.5 rounded flex items-center gap-1 ${c.badgeClass}`}>
        <Icon className="h-3 w-3" />
        {c.label}
      </span>
    </span>
  );
}
