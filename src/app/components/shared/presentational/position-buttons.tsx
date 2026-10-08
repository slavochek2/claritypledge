/**
 * P1445 D — CP's position control with no product dependencies: no analytics, no Supabase, no auth,
 * no per-reader storage. The markup and behaviour are CP's own (moved here unchanged from
 * PositionButton.tsx); what the product supplies — intensity learning, the tutorial, analytics — is
 * injected. `@/app/components/shared/PositionButton` is CP's wrapper that passes the real ones, so
 * every CP call site is unchanged. The Day board (tools/kanban) renders this file directly.
 * Never import product state here: the kanban boundary test follows imports transitively.
 */
import { useState, useEffect, useLayoutEffect, useRef, useCallback, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { clampMenuCenter } from '../menu-clamp';
import type { PositionType, PositionButtonGroup } from '@/app/types';
import type { Position } from '../prototype-types';
import { getPositionGroup } from '@/app/utils/position-helpers';
import { POSITION_SHORT_LABELS } from '@/app/utils/position-labels';
import { HelpCircle, Trash2, Check } from 'lucide-react';
import { BUTTON_GROUPS, POSITION_LABELS } from './position-groups';
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
  /** P1374: show the one-line "Tap again if you disagree only Somewhat, or Strongly" hint
   *  under the buttons right after a plain Agree/Disagree pick, until the reader has picked
   *  a level anywhere. Default on; letter engage phases pass false (they render their own
   *  tip row with the tutorial replay). */
  intensityHint?: boolean;
  /** P1445: per-reader intensity state (learned, preview seen, plain-pick count) and its page-wide
   *  events. CP's wrapper passes the real one (localStorage + window events); without it the
   *  reader counts as having learned the gesture, so no hint or tutorial ever shows. */
  intensity?: IntensityAdapter;
  /** P1445: analytics, injected — the core never imports a tracker. */
  onEvent?: (name: string, props: Record<string, unknown>) => void;
  /** P1445: the intensity tutorial, injected (CP renders its lazy modal). Without it the hint has no "?" button. */
  renderTutorial?: (p: { trigger: 'hint-help' | 'plain-picks'; onClose: () => void }) => ReactNode;
  /** P1445: where the level menu portals (default document.body) — a scoped stylesheet needs its own root. */
  portalContainer?: Element | null;
  /** P1445: the viewport y the open menu must stay above (the Day page's sticky bottom bar). When the
   *  menu would cross it, it opens above its segment. Omitted (every CP call site): always below. */
  menuLimit?: () => number;
}

/** P1445: everything per-reader the buttons read and write, with the events that keep instances in step. */
export interface IntensityAdapter {
  readLearned: () => boolean;
  writeLearned: () => void;
  /** bumps and returns the plain-pick count */
  bumpPlainPicks: () => number;
  plainPicksBeforeTutorial: number;
  readPreviewSeen: () => boolean;
  writePreviewSeen: () => void;
  learnedEvent: string;
  hintShownEvent: string;
}

/** No per-reader state: the gesture counts as learned, so no hint and no tutorial. */
const LEARNED: IntensityAdapter = {
  readLearned: () => true,
  writeLearned: () => {},
  bumpPlainPicks: () => 0,
  plainPicksBeforeTutorial: Number.POSITIVE_INFINITY,
  readPreviewSeen: () => true,
  writePreviewSeen: () => {},
  learnedEvent: 'p1445:intensity-learned',
  hintShownEvent: 'p1445:intensity-hint-shown',
};

// Width threshold for icon-only mode
const ICON_ONLY_THRESHOLD = 270;

export function PositionButtons({ userPosition, counts, onPositionClick, compact = false, narrow = false, disabled = false, onClear, size = 'default', controlledOpenGroup, intensityHint = true, intensity = LEARNED, onEvent, renderTutorial, portalContainer, menuLimit }: PositionButtonsProps) {
  const {
    readLearned: readIntensityLearned,
    writeLearned: writeIntensityLearned,
    bumpPlainPicks: bumpIntensityPlainPicks,
    plainPicksBeforeTutorial: PLAIN_PICKS_BEFORE_TUTORIAL,
    readPreviewSeen: readIntensityPreviewSeen,
    writePreviewSeen: writeIntensityPreviewSeen,
    learnedEvent: INTENSITY_LEARNED_EVENT,
    hintShownEvent: INTENSITY_HINT_SHOWN_EVENT,
  } = intensity;
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
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number; above?: boolean } | null>(null);
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
    // Clamp the menu's horizontal center so it stays inside the viewport (8px margin).
    // Menu width isn't known until it mounts; estimate with its min-w (170) here and
    // refine from the real width in the layout effect below.
    setDropdownPos({
      top: rect.bottom + window.scrollY + 4,
      left: clampMenuCenter(rect.left + rect.width / 2, 170) + window.scrollX,
      width: rect.width,
    });
  }, [openDropdown]);

  // Refine the clamp once the portal menu is mounted and its real width is measurable.
  useLayoutEffect(() => {
    const menu = portalDropdownRef.current;
    const segEl = openDropdown ? segmentRefs.current[openDropdown] : null;
    if (!menu || !segEl || !dropdownPos) return;
    const rect = segEl.getBoundingClientRect();
    const left = clampMenuCenter(rect.left + rect.width / 2, menu.offsetWidth) + window.scrollX;
    // P1445: only with menuLimit — open above the segment when below would cross the limit
    const above = !!menuLimit && rect.bottom + 4 + menu.offsetHeight > menuLimit() - 8;
    const top = above ? rect.top + window.scrollY - 4 - menu.offsetHeight : rect.bottom + window.scrollY + 4;
    if (Math.abs(left - dropdownPos.left) > 0.5 || above !== !!dropdownPos.above || Math.abs(top - dropdownPos.top) > 0.5) {
      setDropdownPos({ ...dropdownPos, left, top, above });
    }
  }, [openDropdown, dropdownPos, menuLimit]);

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

  // P1374: the group whose "tap again" hint is showing — only on the instance just tapped,
  // so a feed of already-positioned cards never lights up all at once.
  const [hintGroup, setHintGroup] = useState<PositionButtonGroup | null>(null);
  // P1374: the tutorial pop-up, opened from the hint's "?" or once after
  // PLAIN_PICKS_BEFORE_TUTORIAL plain picks with no level ever chosen.
  const [tutorialOpen, setTutorialOpen] = useState<null | 'hint-help' | 'plain-picks'>(null);
  const closeTutorial = useCallback(() => {
    writeIntensityPreviewSeen();
    setTutorialOpen(null);
  }, [writeIntensityPreviewSeen]);

  // One hint on the page at a time, and none once the reader has learned — whichever
  // instance saw the pick.
  const instanceId = useId();
  useEffect(() => {
    const onShown = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== instanceId) setHintGroup(null);
    };
    const onLearned = () => setHintGroup(null);
    window.addEventListener(INTENSITY_HINT_SHOWN_EVENT, onShown);
    window.addEventListener(INTENSITY_LEARNED_EVENT, onLearned);
    return () => {
      window.removeEventListener(INTENSITY_HINT_SHOWN_EVENT, onShown);
      window.removeEventListener(INTENSITY_LEARNED_EVENT, onLearned);
    };
  }, [instanceId, INTENSITY_HINT_SHOWN_EVENT, INTENSITY_LEARNED_EVENT]);

  // Drop the hint if the position moves away underneath it (cleared, reverted by a guard).
  useEffect(() => {
    if (hintGroup && (!userPosition || getPositionGroup(userPosition) !== hintGroup)) setHintGroup(null);
  }, [userPosition, hintGroup]);

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
      const hasLevels = config.positions.length > 1;
      const teach = intensityHint && !isControlled && hasLevels && !readIntensityLearned();
      setHintGroup(teach ? group : null);
      if (teach) {
        window.dispatchEvent(new CustomEvent(INTENSITY_HINT_SHOWN_EVENT, { detail: instanceId }));
        if (renderTutorial && !readIntensityPreviewSeen() && bumpIntensityPlainPicks() >= PLAIN_PICKS_BEFORE_TUTORIAL) {
          setTutorialOpen('plain-picks');
        }
      }
      return;
    }
    setHintGroup(null);

    // Already-selected: only open the menu when it would have content to show.
    // Without intensity options (Unsure) AND without onClear, the menu would be empty.
    const hasIntensityRows = config.positions.length > 1;
    const hasMenuContent = hasIntensityRows || !!onClear;
    if (!hasMenuContent) return;

    // P852 Round-F: position is set by the [openDropdown] effect above.
    setOpenDropdown(prev => (prev === group ? null : group));
  }, [userPosition, onPositionClick, onClear, setOpenDropdown, intensityHint, isControlled, instanceId, renderTutorial, readIntensityLearned, INTENSITY_HINT_SHOWN_EVENT, readIntensityPreviewSeen, bumpIntensityPlainPicks, PLAIN_PICKS_BEFORE_TUTORIAL]);

  const handleIntensityClick = useCallback((group: PositionButtonGroup, level: 'somewhat' | 'default' | 'strongly') => {
    const position = intensityToPosition(group, level);
    // P1372: picking the level already held only closes the menu. Consumers toggle a
    // repeated value to null, and P847 Model C′ makes the Clear row the only removal path.
    if (position !== userPosition) onPositionClick(position);
    setOpenDropdown(null);
    setHintGroup(null);
    // P1374: picking any row from the menu — the default included — proves the reader found
    // the gesture, so every hint on every page stops. Never from the controlled demo.
    if (!isControlled) {
      if (!readIntensityLearned()) onEvent?.('intensity_level_picked_first', { group, intensity: level });
      writeIntensityLearned();
    }
  }, [userPosition, onPositionClick, setOpenDropdown, isControlled, readIntensityLearned, writeIntensityLearned, onEvent]);

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
      {/* Shown in icon-only mode too (phones): "tap again" points at the segment just
         tapped, which is highlighted — no label needed. Left-aligned to sit with the card's
         other helper lines ("Sign up or log in…"). "?" replays the tutorial, as in letters. */}
      {hintGroup && (
        <div className="mt-1 flex items-center gap-1 text-xs text-[#1A1A1A]/60">
          {renderTutorial && <button
            type="button"
            onClick={() => setTutorialOpen('hint-help')}
            className="-ml-2 min-w-8 min-h-8 flex items-center justify-center rounded-full text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Show the intensity tutorial"
          >
            <HelpCircle className="w-4 h-4" aria-hidden="true" />
          </button>}
          <span role="status">Tap again if you {hintGroup} only Somewhat, or Strongly</span>
        </div>
      )}
      {tutorialOpen && renderTutorial?.({ trigger: tutorialOpen, onClose: closeTutorial })}

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
        portalContainer ?? document.body
      )}
    </div>
  );
}
