import { useState, useCallback, useRef } from 'react';
import { HelpCircle, Ear, Mic, Lock } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { UserCalibration, RoleCalibration } from '../../../shared/types';

/**
 * Tooltip that works on both desktop (hover) and mobile (tap/click).
 * Similar to MobileTooltip but with customizable side and content.
 */
function CalibrationTooltip({
  children,
  content,
  side = 'top',
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [clickLocked, setClickLocked] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    // On click: always show for 3s (don't toggle - more predictable UX)
    setOpen(true);
    setClickLocked(true);
    timeoutRef.current = setTimeout(() => {
      setOpen(false);
      setClickLocked(false);
    }, 3000);
  }, []);

  // Handle hover changes, but don't let hover close a click-opened tooltip
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (clickLocked && !newOpen) {
      return;
    }
    setOpen(newOpen);
  }, [clickLocked]);

  return (
    <Tooltip open={open} onOpenChange={handleOpenChange}>
      <TooltipTrigger asChild>
        <span
          onClick={handleClick}
          className="cursor-pointer"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleClick(e as unknown as React.MouseEvent);
            }
          }}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-[240px]">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Get calibration state label from gap value (7 levels).
 * gap = actual - self: negative = overconfident, positive = underconfident
 *
 * Brackets (based on 1-10 rating scale, ±2 points = significant):
 *   < -2     Very overconfident
 *   -2 to -1 Overconfident
 *   -1 to -0.5 Somewhat overconfident
 *   -0.5 to +0.5 Well calibrated
 *   +0.5 to +1 Somewhat underconfident
 *   +1 to +2 Underconfident
 *   > +2     Very underconfident
 */
function getCalibrationLabel(gap: number): string {
  if (gap < -2) return 'Very overconfident';
  if (gap < -1) return 'Overconfident';
  if (gap < -0.5) return 'Somewhat overconfident';
  if (gap <= 0.5) return 'Well calibrated';
  if (gap <= 1) return 'Somewhat underconfident';
  if (gap <= 2) return 'Underconfident';
  return 'Very underconfident';
}

/**
 * Inline calibration display for embedding in profile cards.
 * Single bar with ear (listener) and mic (speaker) icons.
 */
export function InlineCalibration({
  calibration,
}: {
  calibration: UserCalibration;
}) {
  // Map gap to position: left = underconfident (+), right = overconfident (-)
  // Flipped so "over" is visually on the right (intuitive)
  const gapToPosition = (g: number) => {
    const clamped = Math.max(-3, Math.min(3, g));
    return ((3 - clamped) / 6) * 100;  // -3 → 100% (right), +3 → 0% (left)
  };

  const listenerPos = gapToPosition(calibration.listener.avgGap);
  const speakerPos = gapToPosition(calibration.speaker.avgGap);
  const listenerLabel = getCalibrationLabel(calibration.listener.avgGap);
  const speakerLabel = getCalibrationLabel(calibration.speaker.avgGap);

  return (
    <TooltipProvider delayDuration={100}>
      <div className="mt-4 pt-4 border-t border-gray-100">
        {/* Label and bar on same row */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 shrink-0">
            <Lock size={12} className="text-gray-400" />
            <span className="text-xs font-medium text-gray-600">Calibration</span>
          </div>

          {/* Bar with icons */}
          <div className="relative h-10 flex-1 max-w-[160px]">
            {/* Bar - increased contrast with border */}
            <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-2.5 rounded-full bg-gray-300 border border-gray-400" />
            {/* Center tick mark */}
            <div className="absolute left-1/2 top-1/2 -translate-y-1/2 w-0.5 h-3 bg-gray-500 -translate-x-px rounded-full" />

            {/* Listener icon (ear) - above the bar, 44px touch target */}
          <CalibrationTooltip
            side="top"
            content={
              <>
                <p className="text-xs font-medium">{listenerLabel} as Listener</p>
                <p className="text-xs text-gray-500">{TOOLTIP_TEXT.listener}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Avg (their rating − your confidence) over {calibration.listener.sessionCount} session{calibration.listener.sessionCount !== 1 ? 's' : ''}
                </p>
              </>
            }
          >
            <span
              className="absolute -top-1 min-w-[44px] min-h-[44px] flex items-center justify-center -translate-x-1/2"
              style={{ left: `${listenerPos}%` }}
            >
              <span className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                <Ear size={16} className="text-blue-600" />
              </span>
            </span>
          </CalibrationTooltip>

          {/* Speaker icon (mic) - below the bar, 44px touch target */}
          <CalibrationTooltip
            side="bottom"
            content={
              <>
                <p className="text-xs font-medium">{speakerLabel} as Speaker</p>
                <p className="text-xs text-gray-500">{TOOLTIP_TEXT.speaker}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Avg (their understanding − your estimate) over {calibration.speaker.sessionCount} session{calibration.speaker.sessionCount !== 1 ? 's' : ''}
                </p>
              </>
            }
          >
            <span
              className="absolute -bottom-1 min-w-[44px] min-h-[44px] flex items-center justify-center -translate-x-1/2"
              style={{ left: `${speakerPos}%` }}
            >
              <span className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                <Mic size={16} className="text-blue-600" />
              </span>
            </span>
          </CalibrationTooltip>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

/**
 * Tooltip text for each calibration role.
 */
const TOOLTIP_TEXT = {
  listener: 'How well you predict you understand others',
  speaker: 'How well you predict others understand you',
};

interface CalibrationDisplayProps {
  calibration: UserCalibration;
  /** Optional comparison calibration (e.g., "you" when viewing someone else's profile) */
  comparisonCalibration?: UserCalibration | null;
  /** Label for primary user (e.g., "Alice") */
  userLabel?: string;
}

/**
 * Combined calibration display card with header.
 * Contains both Listener and Speaker mini-displays, each with their own help tooltip.
 */
export function CalibrationDisplay({
  calibration,
  comparisonCalibration,
  userLabel,
}: CalibrationDisplayProps) {
  const hasComparison = !!comparisonCalibration;

  return (
    <TooltipProvider delayDuration={100}>
      <div className="bg-white rounded-lg border-2 border-blue-200 p-5 shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-800">
            {userLabel ? `${userLabel}'s` : 'Your'} Calibration
          </h3>
        </div>

        {/* Legend - only when comparing */}
        {hasComparison && (
          <div className="flex items-center gap-3 mb-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-gray-700" />
              <span className="text-gray-500">{userLabel || 'Them'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
              <span className="text-gray-500">You</span>
            </div>
          </div>
        )}

        {/* Calibration rows with spectrum - each has own help */}
        <div className="space-y-4">
          <CalibrationRow
            role="listener"
            gap={calibration.listener.avgGap}
            comparisonGap={comparisonCalibration?.listener.avgGap}
            hasComparison={hasComparison}
          />
          <CalibrationRow
            role="speaker"
            gap={calibration.speaker.avgGap}
            comparisonGap={comparisonCalibration?.speaker.avgGap}
            hasComparison={hasComparison}
          />
        </div>

      </div>
    </TooltipProvider>
  );
}

/**
 * Standalone mini calibration display for a single role (Listener or Speaker).
 * Designed to be placed inline near content.
 */
export function MiniCalibrationDisplay({
  role,
  roleCalibration,
  comparisonCalibration,
  userLabel,
}: {
  role: 'listener' | 'speaker';
  roleCalibration: RoleCalibration;
  comparisonCalibration?: RoleCalibration | null;
  userLabel?: string;
}) {
  const label = role === 'listener' ? 'Listener' : 'Speaker';
  const tooltip = TOOLTIP_TEXT[role];
  const hasComparison = !!comparisonCalibration;

  return (
    <TooltipProvider delayDuration={100}>
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        {/* Header with help icon */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center">
            <span className="text-xs font-medium text-gray-600">{label}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="ml-1 text-gray-400 hover:text-gray-600"
                  aria-label={`What is ${label.toLowerCase()} calibration?`}
                >
                  <HelpCircle size={12} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[200px]">
                <p className="text-xs">{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          {hasComparison && (
            <span className="text-[10px] text-gray-400">
              vs {userLabel || 'you'}
            </span>
          )}
        </div>

        {/* Spectrum bar */}
        <CalibrationBar
          gap={roleCalibration.avgGap}
          comparisonGap={comparisonCalibration?.avgGap}
        />
      </div>
    </TooltipProvider>
  );
}

/**
 * Calibration row with colored spectrum, help icon, and dots.
 * Spectrum: Gray (overconfident) → Blue (calibrated) → Gray (underconfident)
 *
 * Color rationale:
 * - Gray (both ends) = miscalibrated = not yet calibrated
 * - Blue (middle) = calibrated = on-target (per design system: blue = "your" ideal state)
 */
function CalibrationRow({
  role,
  gap,
  comparisonGap,
  hasComparison,
}: {
  role: 'listener' | 'speaker';
  gap: number;
  comparisonGap?: number;
  hasComparison?: boolean;
}) {
  const label = role === 'listener' ? 'Listener' : 'Speaker';
  const tooltip = TOOLTIP_TEXT[role];

  return (
    <div>
      {/* Label with help icon next to it */}
      <div className="flex items-center mb-2">
        <span className="text-sm text-gray-600 font-medium">{label}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="ml-1.5 text-gray-400 hover:text-gray-600"
              aria-label={`What is ${label.toLowerCase()} calibration?`}
            >
              <HelpCircle size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-[200px]">
            <p className="text-xs">{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <CalibrationBar
        gap={gap}
        comparisonGap={hasComparison ? comparisonGap : undefined}
      />
    </div>
  );
}

/**
 * Shared spectrum bar component.
 * Spectrum: Gray (overconfident) → Blue (calibrated) → Gray (underconfident)
 *
 * Gray edges = not yet calibrated (neutral, not alarming).
 * Blue center = calibrated = on-target.
 */
function CalibrationBar({
  gap,
  comparisonGap,
}: {
  gap: number;
  comparisonGap?: number;
}) {
  // Map gap to position: -3 (overconfident) to +3 (underconfident)
  const gapToPosition = (g: number) => {
    const clamped = Math.max(-3, Math.min(3, g));
    return ((clamped + 3) / 6) * 100;
  };

  const position = gapToPosition(gap);
  const comparisonPosition = comparisonGap !== undefined ? gapToPosition(comparisonGap) : null;

  return (
    <div className="relative h-3 rounded-full overflow-hidden bg-gray-300">
      {/* Center tick mark */}
      <div className="absolute left-1/2 top-0 w-0.5 h-full bg-blue-500 -translate-x-px" />

      {/* Comparison dot (you) - smaller, lighter */}
      {comparisonPosition !== null && (
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-gray-400 border-2 border-white shadow-sm"
          style={{ left: `calc(${comparisonPosition}% - 6px)` }}
        />
      )}

      {/* Primary dot - larger, darker */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-white shadow-sm"
        style={{ left: `calc(${position}% - 7px)` }}
      />
    </div>
  );
}
