import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import type { UserCalibration, CalibrationState } from '../../../shared/types';

interface CalibrationDisplayProps {
  calibration: UserCalibration;
  /** Optional comparison calibration (e.g., "you" when viewing someone else's profile) */
  comparisonCalibration?: UserCalibration | null;
  /** Label for primary user (e.g., "Alice") */
  userLabel?: string;
}

/**
 * KISS calibration display with grayscale spectrum.
 * Shows comparison dots when viewing someone else's profile.
 */
export function CalibrationDisplay({
  calibration,
  comparisonCalibration,
  userLabel,
}: CalibrationDisplayProps) {
  const [showHelp, setShowHelp] = useState(false);
  const hasComparison = !!comparisonCalibration;
  const totalSessions = calibration.listener.sessionCount + calibration.speaker.sessionCount;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-gray-500">
          {userLabel ? `${userLabel}'s` : 'Your'} Self-Awareness
        </h3>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="text-gray-300 hover:text-gray-500"
          aria-label="What is this?"
        >
          <HelpCircle size={14} />
        </button>
      </div>

      {/* Help panel */}
      {showHelp && (
        <div className="mb-2 p-2 bg-gray-50 rounded text-[11px] text-gray-500">
          <p>Based on {totalSessions} clarity sessions.</p>
          <p className="mt-1">Compares self-estimated understanding vs actual ratings.</p>
        </div>
      )}

      {/* Legend - only when comparing */}
      {hasComparison && (
        <div className="flex items-center gap-3 mb-2 text-[10px]">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-gray-700" />
            <span className="text-gray-400">{userLabel || 'Them'}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-gray-400" />
            <span className="text-gray-400">You</span>
          </div>
        </div>
      )}

      {/* Calibration rows with spectrum */}
      <div className="space-y-2.5">
        <CalibrationRow
          label="Listener"
          gap={calibration.listener.avgGap}
          state={calibration.listener.state}
          comparisonGap={comparisonCalibration?.listener.avgGap}
          hasComparison={hasComparison}
        />
        <CalibrationRow
          label="Speaker"
          gap={calibration.speaker.avgGap}
          state={calibration.speaker.state}
          comparisonGap={comparisonCalibration?.speaker.avgGap}
          hasComparison={hasComparison}
        />
      </div>
    </div>
  );
}

/**
 * Calibration row with grayscale spectrum and dots.
 */
function CalibrationRow({
  label,
  gap,
  state,
  comparisonGap,
  hasComparison,
}: {
  label: string;
  gap: number;
  state: CalibrationState;
  comparisonGap?: number;
  hasComparison?: boolean;
}) {
  // Map gap to position: -3 (overconfident) to +3 (underconfident)
  const gapToPosition = (g: number) => {
    const clamped = Math.max(-3, Math.min(3, g));
    return ((clamped + 3) / 6) * 100;
  };

  const position = gapToPosition(gap);
  const comparisonPosition = comparisonGap !== undefined ? gapToPosition(comparisonGap) : null;

  return (
    <div>
      {/* Label + State */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-gray-400">{label}</span>
        <span className="text-[10px] text-gray-500">{getStateLabel(state)}</span>
      </div>

      {/* Grayscale spectrum bar */}
      <div className="relative h-1.5 rounded-full bg-gray-200">
        {/* Center calibrated zone */}
        <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-3 bg-gray-300 rounded-full" />

        {/* Comparison dot (you) - smaller, lighter */}
        {comparisonPosition !== null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-gray-400 border border-white"
            style={{ left: `calc(${comparisonPosition}% - 4px)` }}
          />
        )}

        {/* Primary dot (them) - larger, darker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-gray-700 border border-white"
          style={{ left: `calc(${position}% - 5px)` }}
        />
      </div>
    </div>
  );
}

function getStateLabel(state: CalibrationState): string {
  switch (state) {
    case 'calibrated': return 'Calibrated';
    case 'overconfident': return 'Overconfident';
    case 'underconfident': return 'Underconfident';
  }
}
