import type { PositionType, Position, PositionButtonGroup } from '../../../shared/types';
import { getPositionGroup } from '../../../shared/types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';

// 7-point position counts interface (plus false_premise)
export interface SevenPointCounts {
  strongly_agree: number;     // +3
  agree: number;              // +2
  somewhat_agree: number;     // +1
  unsure: number;             // 0
  false_premise: number;      // flag
  somewhat_disagree: number;  // -1
  disagree: number;           // -2
  strongly_disagree: number;  // -3
}

// Backwards compatibility: also export as FivePointCounts for existing code
export type FivePointCounts = SevenPointCounts;

// Position labels for display
const POSITION_LABELS: Record<PositionType, string> = {
  strongly_disagree: 'Strongly Disagree',
  disagree: 'Disagree',
  somewhat_disagree: 'Somewhat Disagree',
  unsure: 'Unsure',
  false_premise: 'False Premise',
  somewhat_agree: 'Somewhat Agree',
  agree: 'Agree',
  strongly_agree: 'Strongly Agree',
};

// Button group configuration
interface ButtonGroupConfig {
  label: string;
  defaultPosition: PositionType;
  positions: PositionType[];
  activeClass: string;
  inactiveClass: string;
}

const BUTTON_GROUPS: Record<PositionButtonGroup, ButtonGroupConfig> = {
  disagree: {
    label: 'Disagree',
    defaultPosition: 'disagree', // -2
    positions: ['strongly_disagree', 'disagree', 'somewhat_disagree'],
    activeClass: 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600 hover:border-blue-600',
    inactiveClass: 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100 hover:border-gray-300',
  },
  unsure: {
    label: 'Unsure',
    defaultPosition: 'unsure', // 0
    positions: ['unsure', 'false_premise'],
    activeClass: 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600 hover:border-blue-600',
    inactiveClass: 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100 hover:border-gray-300',
  },
  agree: {
    label: 'Agree',
    defaultPosition: 'agree', // +2
    positions: ['somewhat_agree', 'agree', 'strongly_agree'],
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
      return counts.unsure + counts.false_premise;
    case 'agree':
      return counts.somewhat_agree + counts.agree + counts.strongly_agree;
  }
}

// Get display label for button (shows specific position if selected)
function getButtonLabel(group: PositionButtonGroup, userPosition: Position): string {
  const config = BUTTON_GROUPS[group];

  // If user has a position in this group, show the specific label
  if (userPosition && getPositionGroup(userPosition) === group) {
    // For default positions, just show the group label
    if (userPosition === config.defaultPosition) {
      return config.label;
    }
    // For non-default positions, show specific label
    return POSITION_LABELS[userPosition];
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

  const handleQuickClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onPositionClick(config.defaultPosition);
  };

  const handleDropdownSelect = (position: PositionType) => {
    onPositionClick(position);
  };

  if (compact) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors flex items-center gap-0.5 ${
              isActive ? config.activeClass : config.inactiveClass
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <span>{buttonLabel}</span>
            <span className={isActive ? 'opacity-90' : 'opacity-60'}>{count}</span>
            <ChevronDown className="h-3 w-3 opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
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
    );
  }

  return (
    <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
      {/* Main button - quick click */}
      <Button
        onClick={handleQuickClick}
        variant="outline"
        size="sm"
        className={`rounded-l-full rounded-r-none text-xs px-3 py-1 h-auto border-r-0 ${
          isActive ? config.activeClass : config.inactiveClass
        }`}
      >
        <span>{buttonLabel}</span>
        <span className={`ml-1 ${isActive ? 'opacity-90' : 'opacity-60'}`}>{count}</span>
      </Button>

      {/* Dropdown trigger */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`rounded-r-full rounded-l-none text-xs px-1.5 py-1 h-auto ${
              isActive ? config.activeClass : config.inactiveClass
            }`}
            aria-label={`${group} options`}
            data-testid={`${group}-dropdown`}
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
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
    <div className={`flex items-center ${compact ? 'gap-1 flex-wrap' : 'justify-start gap-1.5'}`}>
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
