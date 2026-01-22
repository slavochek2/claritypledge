import type { PositionType, Position, PositionButtonGroup } from '../../../shared/types';
import { getPositionGroup } from '../../../shared/types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Check, X, HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Position group icons for consistent UI
export const POSITION_ICONS = {
  agree: Check,
  disagree: X,
  unsure: HelpCircle,
} as const;

// 7-point position counts interface
export interface SevenPointCounts {
  strongly_agree: number;     // +3
  agree: number;              // +2
  somewhat_agree: number;     // +1
  unsure: number;             // 0
  somewhat_disagree: number;  // -1
  disagree: number;           // -2
  strongly_disagree: number;  // -3
}

// Backwards compatibility: also export as FivePointCounts for existing code
export type FivePointCounts = SevenPointCounts;

// Position labels for display (full - used in dropdowns)
const POSITION_LABELS: Record<PositionType, string> = {
  strongly_disagree: 'Strongly Disagree',
  disagree: 'Disagree',
  somewhat_disagree: 'Somewhat Disagree',
  unsure: 'Unsure',
  somewhat_agree: 'Somewhat Agree',
  agree: 'Agree',
  strongly_agree: 'Strongly Agree',
};

// Short labels for button display (abbreviated when selected)
const POSITION_SHORT_LABELS: Record<PositionType, string> = {
  strongly_disagree: 'Disagree+',
  disagree: 'Disagree',
  somewhat_disagree: 'Disagree−',
  unsure: 'Unsure',
  somewhat_agree: 'Agree−',
  agree: 'Agree',
  strongly_agree: 'Agree+',
};

// Button group configuration
interface ButtonGroupConfig {
  label: string;
  shortLabel: string; // For compact/mobile display
  defaultPosition: PositionType;
  positions: PositionType[];
  icon: typeof Check;
  activeClass: string;
  inactiveClass: string;
}

const BUTTON_GROUPS: Record<PositionButtonGroup, ButtonGroupConfig> = {
  disagree: {
    label: 'Disagree',
    shortLabel: '', // Icon-only on mobile
    defaultPosition: 'disagree', // -2
    positions: ['strongly_disagree', 'disagree', 'somewhat_disagree'],
    icon: X,
    activeClass: 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600 hover:border-blue-600',
    inactiveClass: 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100 hover:border-gray-300',
  },
  unsure: {
    label: 'Unsure',
    shortLabel: '', // Icon-only on mobile
    defaultPosition: 'unsure', // 0
    positions: ['unsure'],
    icon: HelpCircle,
    activeClass: 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600 hover:border-blue-600',
    inactiveClass: 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100 hover:border-gray-300',
  },
  agree: {
    label: 'Agree',
    shortLabel: '', // Icon-only on mobile
    defaultPosition: 'agree', // +2
    positions: ['strongly_agree', 'agree', 'somewhat_agree'], // Most intense at top
    icon: Check,
    activeClass: 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600 hover:border-blue-600',
    inactiveClass: 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100 hover:border-gray-300',
  },
};

// Display order for button groups (left to right)
const BUTTON_ORDER: PositionButtonGroup[] = ['disagree', 'unsure', 'agree'];

// Calculate aggregated count for a button group
function getGroupCount(counts: SevenPointCounts, group: PositionButtonGroup): number {
  switch (group) {
    case 'disagree':
      return counts.strongly_disagree + counts.disagree + counts.somewhat_disagree;
    case 'unsure':
      return counts.unsure;
    case 'agree':
      return counts.somewhat_agree + counts.agree + counts.strongly_agree;
  }
}

// Get display label for button (shows SHORT label when selected)
function getButtonLabel(group: PositionButtonGroup, userPosition: Position): string {
  const config = BUTTON_GROUPS[group];

  // If user has a position in this group, show the short label
  if (userPosition && getPositionGroup(userPosition) === group) {
    return POSITION_SHORT_LABELS[userPosition];
  }

  return config.label;
}

interface PositionButtonGroupProps {
  group: PositionButtonGroup;
  userPosition: Position;
  count: number;
  onPositionClick: (position: PositionType) => void;
  compact?: boolean;
}

// Tooltip text for default action
const GROUP_TOOLTIPS: Record<PositionButtonGroup, string> = {
  disagree: 'Disagree',
  unsure: 'Unsure',
  agree: 'Agree',
};

function PositionButtonGroupComponent({
  group,
  userPosition,
  count,
  onPositionClick,
  compact = false,
}: PositionButtonGroupProps) {
  const config = BUTTON_GROUPS[group];
  const isActive = userPosition ? getPositionGroup(userPosition) === group : false;
  const buttonLabel = getButtonLabel(group, userPosition);
  const hasDropdown = config.positions.length > 1;

  const handleQuickClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onPositionClick(config.defaultPosition);
  };

  const handleDropdownSelect = (position: PositionType) => {
    onPositionClick(position);
  };

  // Simple button without dropdown (e.g., Unsure with only one option)
  if (!hasDropdown) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleQuickClick}
              className={`inline-flex items-center gap-1 rounded-full border text-xs font-medium px-2.5 py-1 transition-colors hover:opacity-80 ${
                isActive ? config.activeClass : config.inactiveClass
              }`}
            >
              <span>{buttonLabel}</span>
              <span className={isActive ? 'opacity-90' : 'opacity-60'}>({count})</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{GROUP_TOOLTIPS[group]}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Button with dropdown for multiple options (Agree/Disagree)
  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={`inline-flex items-center rounded-full border text-xs font-medium transition-colors ${
          isActive ? config.activeClass : config.inactiveClass
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Main area - quick click with tooltip */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleQuickClick}
              className="flex items-center gap-1 px-2.5 py-1 hover:opacity-80 transition-opacity"
            >
              <span>{buttonLabel}</span>
              <span className={isActive ? 'opacity-90' : 'opacity-60'}>({count})</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{GROUP_TOOLTIPS[group]}</p>
          </TooltipContent>
        </Tooltip>

        {/* Dropdown trigger - arrow inside the same button */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="px-1.5 py-1 hover:opacity-80 transition-opacity"
              aria-label={`${group} options`}
              data-testid={`${group}-dropdown`}
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {config.positions.map((pos) => (
              <DropdownMenuItem
                key={pos}
                onClick={() => handleDropdownSelect(pos)}
                className={userPosition === pos ? 'bg-blue-50' : ''}
              >
                {POSITION_LABELS[pos]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  );
}

// Single position button (kept for backwards compatibility with existing code)
interface PositionButtonProps {
  position: PositionType;
  active: boolean;
  onClick: () => void;
  count: number;
}

export function PositionButton({
  position,
  active,
  onClick,
  count,
}: PositionButtonProps) {
  const group = getPositionGroup(position);
  const config = BUTTON_GROUPS[group];

  return (
    <Button
      onClick={onClick}
      variant="outline"
      size="sm"
      className={`rounded-full text-xs px-2.5 py-1 h-auto ${active ? config.activeClass : config.inactiveClass}`}
    >
      <span>{POSITION_LABELS[position]}</span>
      <span className={active ? 'opacity-90' : 'opacity-60'}>{count}</span>
    </Button>
  );
}

// 3-button + dropdown UI
interface PositionButtonsProps {
  userPosition: Position;
  counts: SevenPointCounts;
  onPositionClick: (position: PositionType) => void;
  /** Compact mode for embedded use (e.g., QuotedPoint) */
  compact?: boolean;
}

export function PositionButtons({ userPosition, counts, onPositionClick, compact = false }: PositionButtonsProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
      {BUTTON_ORDER.map((group) => (
        <PositionButtonGroupComponent
          key={group}
          group={group}
          userPosition={userPosition}
          count={getGroupCount(counts, group)}
          onPositionClick={onPositionClick}
          compact={compact}
        />
      ))}
    </div>
  );
}
