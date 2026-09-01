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
  /** Visual scale. 'default' keeps existing behavior; 'lg' makes the row full-width at all
   *  breakpoints with taller segments, larger labels, and larger icons (letter engage). */
  size?: 'default' | 'lg';
  /** P852 Round-F: when defined, external code drives the open-dropdown state.
   *  Internal state is bypassed; outside-click, escape, and autofocus handlers
   *  early-return so timer-driven demos cannot steal focus or trap input. The
   *  portal also renders with `inert + aria-hidden` in controlled mode so AT
   *  and tab order skip the demo. Existing call sites pass nothing → undefined
   *  → uncontrolled path is exercised exactly as before. */
  controlledOpenGroup?: PositionButtonGroup | null;
}

// Width threshold for icon-only mode
const ICON_ONLY_THRESHOLD = 270;

export function PositionButtons({ userPosition, counts, onPositionClick, compact = false, narrow = false, disabled = false, onClear, size = 'default', controlledOpenGroup }: PositionButtonsProps) {
  const isLg = size === 'lg';
  const isControlled = controlledOpenGroup !== undefined;
  const [internalOpen, setInternalOpen] = useState<PositionButtonGroup | null>(null);
  const openDropdown = isControlled ? controlledOpenGroup : internalOpen;
  // P852 Round-F: useCallback keeps identity stable across renders so deps arrays
  // below can include setOpenDropdown without triggering effect re-runs. Identity
  // only changes when isControlled flips, which doesn't happen mid-mount in practice.
  const setOpenDropdown = useCallback<typeof setInternalOpen>((value) => {
    if (isControlled) return;
    setInternalOpen(value);
  }, [isControlled]);
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

  // P852 Round-F: measure dropdown position whenever the open group changes,
  // regardless of trigger source. Previously this was inline in handleGroupClick,
  // so external (controlled) opens left dropdownPos null and the portal never rendered.
  useEffect(() => {
    if (!openDropdown) {
      setDropdownPos(null);
      return;
    }
    const segEl = segmentRefs.current[openDropdown];
    if (!segEl) return;
    const rect = segEl.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX + rect.width / 2,
      width: rect.width,
    });
  }, [openDropdown]);

  // Close dropdown on click outside (check both the button row AND the portal dropdown).
  // Skipped in controlled mode — external code owns the open state; user clicks must not close.
  useEffect(() => {
    if (!openDropdown || isControlled) return;
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
  }, [openDropdown, isControlled, setOpenDropdown]);

  // Close on Escape — restore focus to the segment button that opened the menu.
  // Skipped in controlled mode (no user-driven close path).
  useEffect(() => {
    if (!openDropdown || isControlled) return;
    const currentSegment = openDropdown;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        segmentRefs.current[currentSegment]?.querySelector('button')?.focus();
        setOpenDropdown(null);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [openDropdown, isControlled, setOpenDropdown]);

  // Auto-focus first menu option when menu opens — portal escapes natural tab order,
  // so we move focus into the menu explicitly for keyboard users.
  // Skipped in controlled mode — demo must not steal focus from the user.
  useEffect(() => {
    if (!openDropdown || isControlled) return;
    const id = requestAnimationFrame(() => {
      const firstOption = portalDropdownRef.current?.querySelector('button[role="option"]') as HTMLElement | null;
      firstOption?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [openDropdown, isControlled]);

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

    // Already-selected: only open the menu when it would have content to show.
    // Without intensity options (Unsure) AND without onClear, the menu would be empty.
    const hasIntensityRows = config.positions.length > 1;
    const hasMenuContent = hasIntensityRows || !!onClear;
    if (!hasMenuContent) return;

    // P852 Round-F: position is set by the [openDropdown] effect above.
    setOpenDropdown(prev => (prev === group ? null : group));
  }, [userPosition, onPositionClick, onClear, setOpenDropdown]);

  const handleIntensityClick = useCallback((group: PositionButtonGroup, intensity: 'somewhat' | 'default' | 'strongly') => {
    const position = intensityToPosition(group, intensity);
    onPositionClick(position);
    setOpenDropdown(null);
  }, [onPositionClick, setOpenDropdown]);

  return (
    <div className={`relative w-full ${isLg ? '' : 'sm:w-auto'}${disabled ? ' opacity-50 pointer-events-none' : ''}`} ref={containerRef}>
      <div
        ref={dropdownRef}
        className={`relative inline-flex w-full max-w-full rounded-lg border border-border bg-white ${isLg ? '' : 'sm:w-auto'}`}
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
            'relative min-w-0',
            // lg: each segment stays flex-1 at all breakpoints so the row spans the
            // full container width (no sm:flex-initial shrink/left-align on desktop).
            isLg ? 'flex-1' : 'flex-1 sm:flex-initial',
            isLg || narrow ? '' : 'sm:min-w-[90px]',
          ].filter(Boolean).join(' ');

          const buttonClass = [
            isLg
              ? 'w-full h-full flex items-center justify-center gap-1.5 px-3 py-2 min-h-14 text-sm sm:text-base font-medium transition-colors leading-none whitespace-nowrap'
              : 'w-full h-full flex items-center justify-center gap-1 px-1.5 sm:px-3 py-2 min-h-10 sm:min-h-11 text-[11px] sm:text-xs font-medium transition-colors leading-none whitespace-nowrap',
            index === 0 ? 'rounded-l-lg' : '',
            index === BUTTON_ORDER.length - 1 ? 'rounded-r-lg' : '',
            index > 0 ? 'border-l border-border' : '',
            isActive ? config.activeClass : config.inactiveClass,
          ].filter(Boolean).join(' ');

          const segmentButton = (
            <button
              onClick={() => handleGroupClick(group)}
              aria-pressed={isActive}
              aria-expanded={isActive ? isOpen : undefined}
              // P1227: below ICON_ONLY_THRESHOLD the label span is not rendered, so the
              // button had no accessible name (axe/Lighthouse button-name on /story).
              aria-label={iconOnly ? buttonLabel : undefined}
              className={buttonClass}
              data-testid={`${group}-group`}
            >
              <Icon
                className={`${isLg ? 'h-4 w-4' : 'h-3.5 w-3.5'} flex-shrink-0 ${isActive ? '' : 'opacity-50'}`}
                strokeWidth={2.5}
              />
              {!iconOnly && <span>{buttonLabel}</span>}
              {/* P852 Round-G: the Round-E inline chevron was removed — it leaked into
                 12 non-letter consumers (feed, social, partner, page surfaces) where intensity
                 refinement is not the mechanic. Discoverability in the letter engage flow is
                 now carried by the "Show me" demo overlay (first selection only) and the
                 post-selection hint reminder — both rendered by the engage phase, not the
                 shared button. */}
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
          );

          return (
            <div key={group} className={segmentClass} ref={el => { segmentRefs.current[group] = el; }}>
              {/* P852 Round-H rev4.1: suppress Radix Tooltip wrap in controlled mode.
                 The tutorial pictogram drives controlledOpenGroup; Radix tooltips
                 fire on hover/focus and portal to body — independent of the wrapper's
                 pointer-events-none — leaking a "Disagree"/"Unsure"/"Agree" pill when
                 the user's real cursor crosses the demo. The demo's lesson is the
                 controlled animation, not hover discovery; no tooltip is needed there. */}
              {isControlled ? segmentButton : (
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>{segmentButton}</TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p>{tooltipText}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

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
          {...(isControlled ? { inert: true, 'aria-hidden': 'true' as const } : {})}
          className="fixed z-[9999] bg-white rounded-lg border border-border shadow-lg py-1 min-w-[170px]"
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
