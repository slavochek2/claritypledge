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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
  activeClass: string;
  inactiveClass: string;
}

const BUTTON_GROUPS: Record<PositionButtonGroup, ButtonGroupConfig> = {
  disagree: {
    label: 'Disagree',
    shortLabel: '',
    defaultPosition: 'disagree', // -2
    positions: ['strongly_disagree', 'disagree', 'somewhat_disagree'],
    activeClass: 'bg-blue-600 text-white',
    inactiveClass: 'bg-white text-gray-700 hover:bg-gray-50',
  },
  unsure: {
    label: 'Unsure',
    shortLabel: '',
    defaultPosition: 'unsure', // 0
    positions: ['unsure'],
    activeClass: 'bg-blue-600 text-white',
    inactiveClass: 'bg-white text-gray-700 hover:bg-gray-50',
  },
  agree: {
    label: 'Agree',
    shortLabel: '',
    defaultPosition: 'agree', // +2
    positions: ['strongly_agree', 'agree', 'somewhat_agree'], // Most intense at top
    activeClass: 'bg-blue-600 text-white',
    inactiveClass: 'bg-white text-gray-700 hover:bg-gray-50',
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

// Tooltip text - shows current position if selected, or default action
function getTooltipText(group: PositionButtonGroup, userPosition: Position): string {
  // If user has a position in this group, show the full label of their selection
  if (userPosition && getPositionGroup(userPosition) === group) {
    return POSITION_LABELS[userPosition];
  }
  // Default: show the group name (what clicking will do)
  const defaults: Record<PositionButtonGroup, string> = {
    disagree: 'Disagree',
    unsure: 'Unsure',
    agree: 'Agree',
  };
  return defaults[group];
}

/**
 * Shared button content with tooltip - extracted to reduce duplication.
 * Used by all segment variants (compact, simple, dropdown).
 */
interface SegmentButtonContentProps {
  buttonLabel: string;
  count: number;
  isActive: boolean;
  tooltipText: string;
  onClick: (e: React.MouseEvent) => void;
}

function SegmentButtonContent({
  buttonLabel,
  count,
  isActive,
  tooltipText,
  onClick,
}: SegmentButtonContentProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className="flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-3 py-1.5 sm:py-2 min-h-[32px] sm:min-h-[44px] hover:opacity-80 transition-opacity whitespace-nowrap text-[11px] sm:text-xs"
          >
            <span>{buttonLabel}</span>
            <span className={isActive ? 'opacity-90' : 'opacity-60'}>({count})</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Individual segment within the segmented control.
 * Connected segments share a single outer border (no gaps).
 */
function PositionSegment({
  group,
  userPosition,
  count,
  onPositionClick,
  compact = false,
  isFirst = false,
}: PositionButtonGroupProps & { isFirst?: boolean }) {
  const config = BUTTON_GROUPS[group];
  const isActive = userPosition ? getPositionGroup(userPosition) === group : false;
  const buttonLabel = getButtonLabel(group, userPosition);
  const hasDropdown = config.positions.length > 1;
  const showDropdown = hasDropdown && !compact;

  const handleQuickClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onPositionClick(config.defaultPosition);
  };

  const handleDropdownSelect = (position: PositionType) => {
    onPositionClick(position);
  };

  // Segment styling - flex-1 on mobile for equal width, min-width on desktop for consistency
  // Border-l shown for all non-first segments (consistent regardless of active state)
  const segmentClass = `
    min-h-[32px] sm:min-h-[44px] flex flex-1 sm:flex-initial sm:min-w-[90px] items-center justify-center text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap
    ${isActive ? config.activeClass : config.inactiveClass}
    ${!isFirst ? 'border-l border-gray-200' : ''}
  `.trim().replace(/\s+/g, ' ');

  // Compact mode: simplified for embedded use (e.g., QuotedPoint).
  // Intentionally only allows default position selection - users who want
  // intensity options should tap through to the full view.
  // Also used for Unsure (single option, no dropdown needed).
  if (!showDropdown) {
    return (
      <div className={segmentClass} onClick={(e) => e.stopPropagation()}>
        <SegmentButtonContent
          buttonLabel={buttonLabel}
          count={count}
          isActive={isActive}
          tooltipText={getTooltipText(group, userPosition)}
          onClick={handleQuickClick}
        />
      </div>
    );
  }

  // Segment with dropdown for multiple options (Agree/Disagree in full mode)
  return (
    <div className={`${segmentClass} gap-0`} onClick={(e) => e.stopPropagation()}>
      <SegmentButtonContent
        buttonLabel={buttonLabel}
        count={count}
        isActive={isActive}
        tooltipText={getTooltipText(group, userPosition)}
        onClick={handleQuickClick}
      />

      {/* Dropdown trigger - separated from main button */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="pl-0.5 sm:pl-1 pr-1 sm:pr-2 min-h-[32px] sm:min-h-[44px] hover:opacity-80 transition-opacity"
            aria-label={`${group} options`}
            data-testid={`${group}-dropdown`}
          >
            <ChevronDown className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          {config.positions.map((pos) => (
            <DropdownMenuItem
              key={pos}
              onClick={() => handleDropdownSelect(pos)}
              className={`min-h-[44px] ${userPosition === pos ? 'bg-blue-50' : ''}`}
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
  // Segmented control: full-width on mobile, content-sized on desktop
  return (
    <div className="inline-flex w-full sm:w-auto rounded-lg border border-gray-200 overflow-hidden bg-white">
      {BUTTON_ORDER.map((group, index) => (
        <PositionSegment
          key={group}
          group={group}
          userPosition={userPosition}
          count={getGroupCount(counts, group)}
          onPositionClick={onPositionClick}
          compact={compact}
          isFirst={index === 0}
        />
      ))}
    </div>
  );
}
