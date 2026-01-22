import { HelpCircle, Ear, Mic, Lock } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { UserCalibration, RoleCalibration } from '../../../shared/types';

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
      <div className="mt-3 flex items-center gap-3">
        <div className="flex items-center gap-1 shrink-0">
          <Lock size={10} className="text-gray-400" />
          <span className="text-xs text-gray-500">Calibration</span>
        </div>
        <div className="relative h-6 w-32">
          {/* Bar */}
          <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-2 rounded-full bg-gray-200" />
          {/* Center tick mark - subtle */}
          <div className="absolute left-1/2 top-1/2 -translate-y-1/2 w-px h-2 bg-gray-400 -translate-x-px" />

          {/* Listener icon (ear) - above the bar */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="absolute top-0 w-4 h-4 flex items-center justify-center cursor-default -translate-x-1/2"
                style={{ left: `${listenerPos}%` }}
              >
                <Ear size={12} className="text-gray-500" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[240px]">
              <p className="text-xs font-medium">{listenerLabel} as Listener</p>
              <p className="text-xs text-gray-500">{TOOLTIP_TEXT.listener}</p>
              <p className="text-xs text-gray-400 mt-1">
                Avg (their rating − your confidence) over {calibration.listener.sessionCount} session{calibration.listener.sessionCount !== 1 ? 's' : ''}
              </p>
            </TooltipContent>
          </Tooltip>

          {/* Speaker icon (mic) - below the bar */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="absolute bottom-0 w-4 h-4 flex items-center justify-center cursor-default -translate-x-1/2"
                style={{ left: `${speakerPos}%` }}
              >
                <Mic size={12} className="text-gray-500" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[240px]">
              <p className="text-xs font-medium">{speakerLabel} as Speaker</p>
              <p className="text-xs text-gray-500">{TOOLTIP_TEXT.speaker}</p>
              <p className="text-xs text-gray-400 mt-1">
                Avg (their understanding − your estimate) over {calibration.speaker.sessionCount} session{calibration.speaker.sessionCount !== 1 ? 's' : ''}
              </p>
            </TooltipContent>
          </Tooltip>
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
      <div className="absolute left-1/2 top-0 w-0.5 h-full bg-green-500 -translate-x-px" />

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
