import { useState } from 'react';
import { HelpCircle, Ear, MessageCircle } from 'lucide-react';
import type { UserCalibration, CalibrationState, RoleCalibration } from '../../../shared/types';

interface CalibrationDisplayProps {
  calibration: UserCalibration;
  /** Optional comparison calibration (e.g., "you" when viewing someone else's profile) */
  comparisonCalibration?: UserCalibration | null;
  /** Label for primary user (e.g., "Alice") */
  userLabel?: string;
}

/**
 * Combined calibration display card with header.
 * Contains both Listener and Speaker mini-displays.
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
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700">
          {userLabel ? `${userLabel}'s` : 'Your'} Self-Awareness
        </h3>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="text-gray-300 hover:text-gray-500"
          aria-label="What is this?"
        >
          <HelpCircle size={16} />
        </button>
      </div>

      {/* Help panel */}
      {showHelp && (
        <div className="mb-3 p-2 bg-gray-50 rounded text-xs text-gray-500">
          <p>Based on {totalSessions} clarity sessions.</p>
          <p className="mt-1">Compares self-estimated understanding vs actual ratings.</p>
        </div>
      )}

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

      {/* Calibration rows with spectrum */}
      <div className="space-y-4">
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
  const Icon = role === 'listener' ? Ear : MessageCircle;
  const label = role === 'listener' ? 'Listener' : 'Speaker';
  const hasComparison = !!comparisonCalibration;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      {/* Header with icon */}
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className="text-gray-400" />
        <span className="text-xs font-medium text-gray-600">{label}</span>
        {hasComparison && (
          <span className="text-[10px] text-gray-400 ml-auto">
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
  );
}

/**
 * Calibration row with colored spectrum and dots.
 * Spectrum: Orange (overconfident) → Gray (calibrated) → Teal (underconfident)
 *
 * Color rationale:
 * - Orange (warm) = overconfident = "running hot"
 * - Gray (neutral) = calibrated = accurate self-assessment
 * - Teal (cool) = underconfident = "running cold"
 */
function CalibrationRow({
  label,
  gap,
  comparisonGap,
  hasComparison,
}: {
  label: string;
  gap: number;
  state: CalibrationState;
  comparisonGap?: number;
  hasComparison?: boolean;
}) {
  return (
    <div>
      {/* Label only - no state text */}
      <div className="mb-1.5">
        <span className="text-xs text-gray-500">{label}</span>
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
 * Spectrum: Orange (overconfident) → Gray (calibrated) → Teal (underconfident)
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
    <div className="relative h-2 rounded-full overflow-hidden" style={{
      // Orange → Gray → Teal gradient
      background: 'linear-gradient(to right, #f97316, #9ca3af 50%, #14b8a6)'
    }}>
      {/* Comparison dot (you) - smaller, lighter */}
      {comparisonPosition !== null && (
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-gray-400 border-2 border-white shadow-sm"
          style={{ left: `calc(${comparisonPosition}% - 5px)` }}
        />
      )}

      {/* Primary dot - larger, darker */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-gray-700 border-2 border-white shadow-sm"
        style={{ left: `calc(${position}% - 6px)` }}
      />
    </div>
  );
}
