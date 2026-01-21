import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import type { UserCalibration, RoleCalibration } from '../../../shared/types';

/**
 * Help text for each calibration role.
 */
const HELP_TEXT = {
  listener: {
    title: 'Listener Calibration',
    description: 'How well you predict your own understanding when listening. Blue center = accurate. Gray edges = over or underestimating.',
  },
  speaker: {
    title: 'Speaker Calibration',
    description: 'How well you predict if others understood you when speaking. Blue center = accurate. Gray edges = over or underestimating.',
  },
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
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700">
          {userLabel ? `${userLabel}'s` : 'Your'} Self-Awareness
        </h3>
      </div>

      {/* Legend - only when comparing */}
      {hasComparison && (
        <div className="flex items-center gap-3 mb-3 text-xs">
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
      <div className="space-y-3">
        <CalibrationRow
          role="listener"
          gap={calibration.listener.avgGap}
          sessionCount={calibration.listener.sessionCount}
          comparisonGap={comparisonCalibration?.listener.avgGap}
          hasComparison={hasComparison}
        />
        <CalibrationRow
          role="speaker"
          gap={calibration.speaker.avgGap}
          sessionCount={calibration.speaker.sessionCount}
          comparisonGap={comparisonCalibration?.speaker.avgGap}
          hasComparison={hasComparison}
        />
      </div>

    </div>
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
  const [showHelp, setShowHelp] = useState(false);
  const label = role === 'listener' ? 'Listener' : 'Speaker';
  const help = HELP_TEXT[role];
  const hasComparison = !!comparisonCalibration;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      {/* Header with help icon */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <div className="flex items-center gap-2">
          {hasComparison && (
            <span className="text-[10px] text-gray-400">
              vs {userLabel || 'you'}
            </span>
          )}
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="text-gray-300 hover:text-gray-500"
            aria-label={`What is ${label.toLowerCase()} calibration?`}
          >
            <HelpCircle size={12} />
          </button>
        </div>
      </div>

      {/* Help tooltip */}
      {showHelp && (
        <div className="mb-2 p-2 bg-gray-50 rounded text-xs text-gray-500">
          <p>{help.description}</p>
        </div>
      )}

      {/* Spectrum bar */}
      <CalibrationBar
        gap={roleCalibration.avgGap}
        comparisonGap={comparisonCalibration?.avgGap}
      />
    </div>
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
  sessionCount,
  comparisonGap,
  hasComparison,
}: {
  role: 'listener' | 'speaker';
  gap: number;
  sessionCount: number;
  comparisonGap?: number;
  hasComparison?: boolean;
}) {
  const [showHelp, setShowHelp] = useState(false);
  const label = role === 'listener' ? 'Listener' : 'Speaker';
  const help = HELP_TEXT[role];

  return (
    <div>
      {/* Label with help icon next to it */}
      <div className="flex items-center mb-1.5">
        <span className="text-xs text-gray-500">{label}</span>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="ml-1 text-gray-300 hover:text-gray-500"
          aria-label={`What is ${label.toLowerCase()} calibration?`}
        >
          <HelpCircle size={12} />
        </button>
      </div>

      {/* Help tooltip */}
      {showHelp && (
        <div className="mb-2 p-2 bg-gray-50 rounded text-xs text-gray-500">
          <p className="font-medium text-gray-600">{help.title}</p>
          <p className="mt-0.5">{help.description}</p>
          <p className="mt-1 text-gray-400">Based on {sessionCount} sessions.</p>
        </div>
      )}

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
    <div className="relative h-2.5 rounded-full overflow-hidden bg-gray-300">
      {/* Center tick mark */}
      <div className="absolute left-1/2 top-0 w-px h-full bg-gray-500 -translate-x-px" />

      {/* Comparison dot (you) - smaller, lighter */}
      {comparisonPosition !== null && (
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-gray-400 border-2 border-white shadow-sm"
          style={{ left: `calc(${comparisonPosition}% - 5px)` }}
        />
      )}

      {/* Primary dot - larger, darker */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow-sm"
        style={{ left: `calc(${position}% - 6px)` }}
      />
    </div>
  );
}
