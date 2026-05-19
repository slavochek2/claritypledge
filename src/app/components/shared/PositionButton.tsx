import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { PositionType, PositionButtonGroup } from '@/app/types';
import type { Position } from './prototype-types';
import { getPositionGroup } from '@/app/utils/position-helpers';
import { Button } from '@/components/ui/button';
import { Check, X, HelpCircle, Trash2 } from 'lucide-react';
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

// Short labels for active button display (intensity notation) \u2014 see @/app/utils/position-labels.
import { POSITION_SHORT_LABELS } from '@/app/utils/position-labels';

// Button group configuration
interface ButtonGroupConfig {
  label: string;
  icon: typeof Check;
  defaultPosition: PositionType;
  positions: PositionType[];
  activeClass: string;
  inactiveClass: string;
}

const BUTTON_GROUPS: Record<PositionButtonGroup, ButtonGroupConfig> = {
  disagree: {
    label: 'Disagree',
    icon: X,
    defaultPosition: 'disagree',
    positions: ['somewhat_disagree', 'disagree', 'strongly_disagree'],
    activeClass: 'bg-blue-600 text-white',
    inactiveClass: 'bg-white text-gray-700 hover:bg-gray-50',
  },
  unsure: {
    label: 'Unsure',
    icon: HelpCircle,
    defaultPosition: 'unsure',
    positions: ['unsure'],
    activeClass: 'bg-blue-600 text-white',
    inactiveClass: 'bg-white text-gray-700 hover:bg-gray-50',
  },
  agree: {
    label: 'Agree',
    icon: Check,
    defaultPosition: 'agree',
    positions: ['somewhat_agree', 'agree', 'strongly_agree'],
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

// Map intensity key to PositionType for a given group
function intensityToPosition(group: PositionButtonGroup, intensity: 'somewhat' | 'default' | 'strongly'): PositionType {
  const map: Record<PositionButtonGroup, Record<string, PositionType>> = {
    disagree: { somewhat: 'somewhat_disagree', default: 'disagree', strongly: 'strongly_disagree' },
    unsure: { default: 'unsure', somewhat: 'unsure', strongly: 'unsure' },
    agree: { somewhat: 'somewhat_agree', default: 'agree', strongly: 'strongly_agree' },
  };
  return map[group][intensity];
}

// Map PositionType to intensity key for a given group
function positionToIntensity(position: PositionType): 'somewhat' | 'default' | 'strongly' {
  if (position.startsWith('somewhat_')) return 'somewhat';
  if (position.startsWith('strongly_')) return 'strongly';
  return 'default';
}

// Tooltip text - shows "You [position]" if selected, or default action
function getTooltipText(group: PositionButtonGroup, userPosition: Position): string {
  if (userPosition && getPositionGroup(userPosition) === group) {
    const youLabels: Record<PositionType, string> = {
      strongly_disagree: 'You strongly disagree',
      disagree: 'You disagree',
      somewhat_disagree: 'You somewhat disagree',
      unsure: "You're unsure",
      somewhat_agree: 'You somewhat agree',
      agree: 'You agree',
      strongly_agree: 'You strongly agree',
    };
    return youLabels[userPosition];
  }
  const defaults: Record<PositionButtonGroup, string> = {
    disagree: 'Disagree',
    unsure: 'Unsure',
    agree: 'Agree',
  };
  return defaults[group];
}

// Get display label for a group button
function getButtonLabel(group: PositionButtonGroup, userPosition: Position): string {
  if (userPosition && getPositionGroup(userPosition) === group) {
    return POSITION_SHORT_LABELS[userPosition];
  }
  return BUTTON_GROUPS[group].label;
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

// 3-button + explicit-clear menu (P847 Model C′)
interface PositionButtonsProps {
  userPosition: Position;
  counts: SevenPointCounts;
  onPositionClick: (position: PositionType) => void;
  /** Compact mode for embedded use (e.g., QuotedPoint) */
  compact?: boolean;
  /** Narrow mode: omits sm:min-w-[90px] so buttons fit in tight containers */
  narrow?: boolean;
  /** When true, buttons are visually muted and non-interactive (e.g., letter reveal phase) */
  disabled?: boolean;
  /** Explicit-clear handler. When provided, an explicit "Clear position" row renders inside the open menu.
   *  When omitted, the Clear row is hidden — preserving consumer compatibility (Decision A). */
  onClear?: () => void;
}

// Width threshold for icon-only mode
const ICON_ONLY_THRESHOLD = 270;

export function PositionButtons({ userPosition, counts, onPositionClick, compact = false, narrow = false, disabled = false, onClear }: PositionButtonsProps) {
  const [openDropdown, setOpenDropdown] = useState<PositionButtonGroup | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const segmentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const portalDropdownRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(9999);

  const iconOnly = containerWidth < ICON_ONLY_THRESHOLD;

  // ResizeObserver to measure container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Close dropdown on click outside (check both the button row AND the portal dropdown)
  useEffect(() => {
    if (!openDropdown) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const inButtonRow = dropdownRef.current?.contains(target);
      const inPortalDropdown = portalDropdownRef.current?.contains(target);
      if (!inButtonRow && !inPortalDropdown) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openDropdown]);

  // Close on Escape — restore focus to the segment button that opened the menu
  useEffect(() => {
    if (!openDropdown) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenDropdown(prev => {
          if (prev) segmentRefs.current[prev]?.querySelector('button')?.focus();
          return null;
        });
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [openDropdown]);

  // Auto-focus first menu option when menu opens — portal escapes natural tab order,
  // so we move focus into the menu explicitly for keyboard users.
  useEffect(() => {
    if (!openDropdown) return;
    const id = requestAnimationFrame(() => {
      const firstOption = portalDropdownRef.current?.querySelector('button[role="option"]') as HTMLElement | null;
      firstOption?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [openDropdown]);

  const handleGroupClick = useCallback((group: PositionButtonGroup) => {
    const config = BUTTON_GROUPS[group];
    const isSelectedGroup = !!userPosition && getPositionGroup(userPosition) === group;

    // P847 Model C′:
    // - Click unselected group → select default intensity, no menu opens.
    // - Click already-selected group → open menu (no mutation).
    // The destructive branch "open menu + same-group click → onPositionClick(userPosition)"
    // is deleted; clearing is now exclusively via the in-menu "Clear position" row.
    if (!isSelectedGroup) {
      onPositionClick(config.defaultPosition);
      setOpenDropdown(null);
      return;
    }

    // Already-selected: toggle menu open/closed. No position mutation.
    setOpenDropdown(prev => {
      if (prev === group) return null;
      const segEl = segmentRefs.current[group];
      if (segEl) {
        const rect = segEl.getBoundingClientRect();
        setDropdownPos({
          top: rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX + rect.width / 2,
          width: rect.width,
        });
      }
      return group;
    });
  }, [userPosition, onPositionClick]);

  const handleIntensityClick = useCallback((group: PositionButtonGroup, intensity: 'somewhat' | 'default' | 'strongly') => {
    const position = intensityToPosition(group, intensity);
    onPositionClick(position);
    setOpenDropdown(null);
  }, [onPositionClick]);

  return (
    <div className={`relative w-full sm:w-auto${disabled ? ' opacity-50 pointer-events-none' : ''}`} ref={containerRef}>
      <div
        ref={dropdownRef}
        className="relative inline-flex w-full sm:w-auto max-w-full rounded-lg border border-gray-200 bg-white"
      >
        {BUTTON_ORDER.map((group, index) => {
          const config = BUTTON_GROUPS[group];
          const Icon = config.icon;
          const isActive = userPosition ? getPositionGroup(userPosition) === group : false;
          const count = getGroupCount(counts, group);
          const isOpen = openDropdown === group;
          const buttonLabel = getButtonLabel(group, userPosition);
          const tooltipText = getTooltipText(group, userPosition);

          const segmentClass = [
            'relative flex-1 sm:flex-initial min-w-0',
            narrow ? '' : 'sm:min-w-[90px]',
          ].filter(Boolean).join(' ');

          const buttonClass = [
            'w-full h-full flex items-center justify-center gap-1 px-1.5 sm:px-3 py-2',
            'min-h-[40px] sm:min-h-[44px]',
            'text-[11px] sm:text-xs font-medium transition-colors leading-none whitespace-nowrap',
            index === 0 ? 'rounded-l-lg' : '',
            index === BUTTON_ORDER.length - 1 ? 'rounded-r-lg' : '',
            index > 0 ? 'border-l border-gray-200' : '',
            isActive ? config.activeClass : config.inactiveClass,
          ].filter(Boolean).join(' ');

          return (
            <div key={group} className={segmentClass} ref={el => { segmentRefs.current[group] = el; }}>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => handleGroupClick(group)}
                      aria-pressed={isActive}
                      aria-expanded={isActive ? isOpen : undefined}
                      className={buttonClass}
                      data-testid={`${group}-group`}
                    >
                      <Icon
                        className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? '' : 'opacity-50'}`}
                        strokeWidth={2.5}
                      />
                      {!iconOnly && <span>{buttonLabel}</span>}
                      {count > 0 && !compact && !iconOnly && (
                        <span
                          className={[
                            'flex-shrink-0 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-medium leading-none',
                            isActive ? 'bg-white/30' : 'bg-gray-100 text-gray-500',
                          ].join(' ')}
                          data-testid={`${group}-count-badge`}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{tooltipText}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

            </div>
          );
        })}
      </div>

      {/* Menu — rendered via portal to escape overflow:hidden containers.
         P847 Model C′: opens when openDropdown !== null. For Unsure (1-intensity),
         the menu shows only the Clear row (Decision C). For Agree/Disagree, the menu
         shows intensity rows + separator + Clear row. Clear row only renders when
         onClear is provided (Decision A — preserves consumer compatibility). */}
      {openDropdown && dropdownPos && createPortal(
        <div
          ref={portalDropdownRef}
          className="fixed z-[9999] bg-white rounded-lg border border-gray-200 shadow-lg py-1 min-w-[170px]"
          style={{
            top: dropdownPos.top,
            left: dropdownPos.left,
            transform: 'translateX(-50%)',
            position: 'absolute',
          }}
          role="listbox"
          aria-label={`${BUTTON_GROUPS[openDropdown].label} options`}
        >
          {BUTTON_GROUPS[openDropdown].positions.length > 1 && BUTTON_GROUPS[openDropdown].positions.map((pos) => {
            const isSelected = userPosition === pos;
            return (
              <button
                key={pos}
                onClick={() => handleIntensityClick(openDropdown, positionToIntensity(pos))}
                role="option"
                aria-selected={isSelected}
                className={[
                  'w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors',
                  isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50',
                ].join(' ')}
                style={{ minHeight: 40 }}
              >
                {isSelected && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
                <span className={isSelected ? '' : 'pl-[22px]'}>{POSITION_LABELS[pos]}</span>
              </button>
            );
          })}
          {onClear && BUTTON_GROUPS[openDropdown].positions.length > 1 && (
            <div className="border-t border-gray-100 my-1" role="separator" />
          )}
          {onClear && (
            <button
              onClick={() => { onClear(); setOpenDropdown(null); }}
              role="option"
              aria-selected={false}
              className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-red-600 hover:bg-red-50 transition-colors"
              style={{ minHeight: 40 }}
            >
              <Trash2 className="h-3.5 w-3.5 flex-shrink-0" />
              <span>Clear position</span>
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
