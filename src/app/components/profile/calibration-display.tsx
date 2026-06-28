/**
 * @file calibration-display.tsx
 * @description Calibration display components for profile pages.
 * P113 v2: Copied from prototype, adapted for production.
 *
 * Shows understanding calibration (how well user knows their own understanding accuracy).
 * - InlineCalibration: Compact bar for embedding in profile cards
 * - CalibrationDisplay: Full card with both listener and speaker calibration
 */
import React, { useState, useCallback, useRef } from 'react';
import { HelpCircle, Ear } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Type definitions (adapted from prototype)
export interface RoleCalibration {
  avgGap: number;
  state: 'calibrated' | 'overconfident' | 'underconfident';
  sessionCount: number;
}

export interface UserCalibration {
  listener: RoleCalibration;
  speaker: RoleCalibration;
}

/**
 * Tooltip that works on both desktop (hover) and mobile (tap/click).
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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleActivate = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setOpen(true);
    setClickLocked(true);
    timeoutRef.current = setTimeout(() => {
      setOpen(false);
      setClickLocked(false);
    }, 3000);
  }, []);

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
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleActivate();
          }}
          className="cursor-pointer"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleActivate();
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

// gap = actual - self: positive = underconfident (estimated too low), negative = overconfident
// Axis: left = underconfident, center = calibrated, right = overconfident
const gapToPosition = (g: number) => {
  const clamped = Math.max(-3, Math.min(3, g));
  return ((3 - clamped) / 6) * 100;
};

/**
 * Get calibration state label from gap value (7 levels).
 * gap = actual - self: negative = overconfident, positive = underconfident
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

// Used by CalibrationDisplay (full card view on /live results)
const TOOLTIP_TEXT = {
  listener: 'How closely their listening confidence matches the speaker\'s feeling after the paraphrase',
  speaker: 'How closely their speaking confidence matches the listener\'s verified understanding',
};

/** Tooltip description for each calibration label — states the measurement, no judgment. */
function getCalibrationTooltip(gap: number): string {
  if (gap < -2) return 'Confidence much higher than verified understanding.';
  if (gap < -1) return 'Confidence higher than verified understanding.';
  if (gap < -0.5) return 'Confidence slightly higher than verified understanding.';
  if (gap <= 0.5) return 'Confidence matches verified understanding.';
  if (gap <= 1) return 'Confidence slightly lower than verified understanding.';
  if (gap <= 2) return 'Confidence lower than verified understanding.';
  return 'Confidence much lower than verified understanding.';
}

/**
 * Inline calibration display as a metadata section on profile pages.
 * Consistent structure for both states — always shows "Calibration" header.
 *
 * P539: Two states, same visual structure:
 * - Estimation available (≥5 sessions): "Calibration" header + full bar + label
 * - Not enough data (<5 sessions): "Calibration" header + segmented bar + "N more clarity sessions needed"
 * Shown on ALL profiles (own + guest) — enables social pressure.
 */
export function InlineCalibration({
  calibration,
  sessionsCompleted,
  action,
}: {
  calibration: UserCalibration | null;
  sessionsCompleted?: number;
  action?: React.ReactNode;
}) {
  const sessions = sessionsCompleted ?? 0;
  const listenerLabel = calibration ? getCalibrationLabel(calibration.listener.avgGap) : null;

  const filled = Math.min(sessions, 5);
  const remaining = 5 - filled;
  const progressText = remaining > 0
    ? (sessions === 0 ? 'Complete 5 sessions in a listener role to unlock your calibration score' : `${remaining} more session${remaining === 1 ? '' : 's'} in a listener role to unlock your calibration score`)
    : null;

  // Common header for both states
  const header = (
    <div className="flex items-center gap-1.5">
      <Ear size={12} className="text-muted-foreground" />
      <span className="text-xs font-medium text-muted-foreground">Listening calibration</span>
      {action}
    </div>
  );

  if (calibration) {
    const listenerPos = gapToPosition(calibration.listener.avgGap);
    return (
      <TooltipProvider delayDuration={100}>
        <div className="mt-3 flex flex-col gap-1">
          {header}
          <CalibrationTooltip
            side="top"
            content={
              <>
                <p className="text-xs font-medium">{listenerLabel}</p>
                <p className="text-xs text-muted-foreground">{getCalibrationTooltip(calibration.listener.avgGap)}</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Based on {calibration.listener.sessionCount} session{calibration.listener.sessionCount !== 1 ? 's' : ''} with you as a listener.
                </p>
              </>
            }
          >
            <div className="relative h-6 w-full">
              <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-2.5 rounded-full bg-muted border border-border" />
              <div className="absolute left-1/2 top-1/2 -translate-y-1/2 w-0.5 h-3.5 bg-muted-foreground -translate-x-px rounded-full" />
              <span
                className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-blue-500 border-2 border-white shadow-sm -translate-x-1/2 cursor-pointer"
                style={{ left: `${listenerPos}%` }}
              />
            </div>
          </CalibrationTooltip>
        </div>
      </TooltipProvider>
    );
  }

  // Not enough data: segmented bar + progress text
  return (
    <TooltipProvider delayDuration={100}>
      <div className="mt-3 flex flex-col gap-1">
        {header}
        <CalibrationTooltip
          side="top"
          content={<p className="text-xs">{remaining} more session{remaining === 1 ? '' : 's'} in a listener role to unlock your calibration score.</p>}
        >
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-px w-24"
              aria-label={`${filled} of 5 listener sessions completed`}
            >
              {Array.from({ length: 5 }, (_, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className={`h-1.5 flex-1 rounded-sm ${
                    i < filled ? 'bg-blue-400/70' : 'bg-muted'
                  }`}
                />
              ))}
            </div>
            {progressText && (
              <span className="text-xs text-muted-foreground/70">{progressText}</span>
            )}
          </div>
        </CalibrationTooltip>
      </div>
    </TooltipProvider>
  );
}

interface CalibrationDisplayProps {
  calibration: UserCalibration;
  comparisonCalibration?: UserCalibration | null;
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
  const hasComparison = !!comparisonCalibration;

  return (
    <TooltipProvider delayDuration={100}>
      <div className="bg-card rounded-lg border-2 border-blue-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground">
            {userLabel ? `${userLabel}'s` : 'Your'} Understanding Calibration
          </h3>
        </div>

        {hasComparison && (
          <div className="flex items-center gap-3 mb-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-foreground" />
              <span className="text-muted-foreground">{userLabel || 'Them'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground" />
              <span className="text-muted-foreground">You</span>
            </div>
          </div>
        )}

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
      <div className="flex items-center mb-2">
        <span className="text-sm text-muted-foreground font-medium">{label}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="ml-1.5 text-muted-foreground hover:text-foreground"
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

function CalibrationBar({
  gap,
  comparisonGap,
}: {
  gap: number;
  comparisonGap?: number;
}) {
  const position = gapToPosition(gap);
  const comparisonPosition = comparisonGap !== undefined ? gapToPosition(comparisonGap) : null;

  return (
    <div className="relative h-3 rounded-full overflow-hidden bg-muted">
      <div className="absolute left-1/2 top-0 w-0.5 h-full bg-blue-500 -translate-x-px" />

      {comparisonPosition !== null && (
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-muted-foreground border-2 border-card shadow-sm"
          style={{ left: `calc(${comparisonPosition}% - 6px)` }}
        />
      )}

      <div
        className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-card shadow-sm"
        style={{ left: `calc(${position}% - 7px)` }}
      />
    </div>
  );
}
