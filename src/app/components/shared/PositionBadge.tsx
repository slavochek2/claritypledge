import type { PositionType } from '@/app/types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface PositionBadgeProps {
  position: PositionType;
  /** Name to display before position (e.g., "Alice agrees") */
  name?: string;
  /** Whether this is the current user's position (currently unused, kept for API compatibility) */
  isCurrentUser?: boolean;
}

// Short labels matching button notation
const POSITION_SHORT_LABELS: Record<PositionType, string> = {
  strongly_agree: 'Agrees+',
  agree: 'Agrees',
  somewhat_agree: 'Agrees−',
  unsure: 'Unsure',
  somewhat_disagree: 'Disagrees−',
  disagree: 'Disagrees',
  strongly_disagree: 'Disagrees+',
};

// Full labels for tooltips
const POSITION_FULL_LABELS: Record<PositionType, string> = {
  strongly_agree: 'Strongly Agrees',
  agree: 'Agrees',
  somewhat_agree: 'Somewhat Agrees',
  unsure: 'Unsure',
  somewhat_disagree: 'Somewhat Disagrees',
  disagree: 'Disagrees',
  strongly_disagree: 'Strongly Disagrees',
};

/**
 * Returns the lowercase verb form for a position.
 * Used in quote pattern: "{Name} agrees:" outside the Point box.
 *
 * Examples:
 * - 'agree' → 'agrees'
 * - 'strongly_agree' → 'strongly agrees'
 * - 'unsure' → 'unsure' (no "is" prefix for natural reading)
 */
// eslint-disable-next-line react-refresh/only-export-components
export function getPositionVerb(position: PositionType): string {
  return POSITION_FULL_LABELS[position].toLowerCase();
}

/**
 * Displays a position as inline colored text with optional name.
 *
 * Format: "{Name} Agrees+/Agrees/Agrees−/Unsure/Disagrees−/Disagrees/Disagrees+"
 * - Name in gray, position in colored badge
 * - ALL positions use blue - taking any stance is equally valuable
 * - Tooltip shows full label (e.g., "Strongly Agrees")
 *
 * Examples:
 * - "Alice Agrees+" with tooltip "Strongly Agrees"
 * - "Jordan Agrees" with tooltip "Agrees"
 * - "Disagrees−" (when name is omitted) with tooltip "Somewhat Disagrees"
 */
export function PositionBadge({
  position,
  name,
}: PositionBadgeProps) {
  const blueBadge = 'bg-blue-100 text-blue-700';
  const displayName = name;
  const shortLabel = POSITION_SHORT_LABELS[position];
  const fullLabel = POSITION_FULL_LABELS[position];

  // If no name provided, just show the position as a badge
  if (!displayName) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded cursor-default ${blueBadge}`}>
              {shortLabel}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{fullLabel}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-xs flex items-center gap-1 cursor-default">
            <span className="text-gray-500">{displayName}</span>
            <span className={`font-medium px-1.5 py-0.5 rounded ${blueBadge}`}>
              {shortLabel}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>{fullLabel}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
