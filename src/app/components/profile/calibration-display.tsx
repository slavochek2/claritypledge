/**
 * @file calibration-display.tsx
 * @description Calibration display components for profile pages.
 * P113 v2: Copied from prototype, adapted for production.
 *
 * Shows understanding calibration (how well user knows their own understanding accuracy).
 * - InlineCalibration: Compact bar for embedding in profile cards
 * - CalibrationDisplay: Full card with both listener and speaker calibration
 */
import { useState, useCallback, useRef } from 'react';
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

const TOOLTIP_TEXT = {
  listener: 'Knowing how well you understood — do you know when you "got it" vs. missed something? (your confidence vs. speaker\'s verification)',
  speaker: 'Knowing how well others understood you — do they know when they got it? (their confidence vs. your verification)',
};

/**
 * Inline calibration display for embedding in profile cards.
 * Shows only listener calibration (how well they understand others).
 * When calibration is null (< 5 sessions), shows an empty bar with a hint.
 */
export function InlineCalibration({
  calibration,
}: {
  calibration: UserCalibration | null;
}) {
  const gapToPosition = (g: number) => {
    const clamped = Math.max(-3, Math.min(3, g));
    return ((clamped + 3) / 6) * 100;
  };

  const listenerPos = calibration ? gapToPosition(calibration.listener.avgGap) : null;
  const listenerLabel = calibration ? getCalibrationLabel(calibration.listener.avgGap) : null;

  const barContent = (
    <div className="relative h-6 w-full">
      <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-2.5 rounded-full bg-muted border border-border" />
      <div className="absolute left-1/2 top-1/2 -translate-y-1/2 w-0.5 h-3.5 bg-muted-foreground -translate-x-px rounded-full" />
      {listenerPos !== null && (
        <span
          className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-blue-500 border-2 border-white shadow-sm -translate-x-1/2 cursor-pointer"
          style={{ left: `${listenerPos}%` }}
        />
      )}
    </div>
  );

  return (
    <TooltipProvider delayDuration={100}>
      <div className="mt-3 flex items-center gap-3">
        <div className="flex items-center gap-1.5 shrink-0">
          <Ear size={12} className="text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Understanding Calibration</span>
        </div>

        <div className="flex-1">
          {calibration ? (
            <CalibrationTooltip
              side="top"
              content={
                <>
                  <p className="text-xs font-medium">{listenerLabel}</p>
                  <p className="text-xs text-muted-foreground">{TOOLTIP_TEXT.listener}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Avg (their rating − your confidence) over {calibration.listener.sessionCount} session{calibration.listener.sessionCount !== 1 ? 's' : ''}
                  </p>
                </>
              }
            >
              {barContent}
            </CalibrationTooltip>
          ) : (
            <CalibrationTooltip
              side="top"
              content={<p className="text-xs">Complete 5 live sessions to unlock your calibration score</p>}
            >
              {barContent}
            </CalibrationTooltip>
          )}
        </div>
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
  const gapToPosition = (g: number) => {
    const clamped = Math.max(-3, Math.min(3, g));
    return ((clamped + 3) / 6) * 100;
  };

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
