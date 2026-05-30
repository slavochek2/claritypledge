/**
 * @file letter-progress-bar.tsx
 * @description P581 Task 9 + P852: Segmented progress bar for letter reading flow.
 * Shows completed chapters as filled segments, current chapter with step-tick sub-fill.
 */

import { cn } from '@/lib/utils';

interface LetterProgressBarProps {
  currentChapter: number;
  totalChapters: number;
  /** P852: Total steps in the current chapter (each engage→reveal pair = 1 step). */
  stepCount?: number;
  /** P852: Steps committed so far in the current chapter (filled ticks). */
  committedSteps?: number;
  /** P852: True when the reader is on an engage screen (shows active outline on current tick). */
  isEngagePhase?: boolean;
  /** @deprecated Use stepCount/committedSteps. Kept for backward-compat; unused when stepCount provided. */
  storyProgress?: number;
}

export function LetterProgressBar({
  currentChapter,
  totalChapters,
  stepCount,
  committedSteps = 0,
  isEngagePhase = false,
}: LetterProgressBarProps) {
  return (
    <div
      className="flex flex-col gap-1 w-full"
      role="progressbar"
      aria-label={
        totalChapters === 1
          ? `Chapter ${currentChapter + 1}`
          : `Chapter ${currentChapter + 1} of ${totalChapters}`
      }
      aria-valuenow={currentChapter + 1}
      aria-valuemin={1}
      aria-valuemax={totalChapters}
    >
      {/* P852: Single-chapter letters drop "of 1" — reads like a bug otherwise. */}
      <p className="text-xs text-[#1A1A1A]/50 tabular-nums">
        {totalChapters === 1
          ? `Chapter ${currentChapter + 1}`
          : `Chapter ${currentChapter + 1} of ${totalChapters}`}
      </p>

      {/* Segments — one per chapter */}
      <div className="flex gap-1 w-full">
        {Array.from({ length: totalChapters }, (_, i) => {
          if (i < currentChapter) {
            // Completed chapter — fully filled
            return <div key={i} className="h-2.5 flex-1 rounded-full bg-[#0044CC]" />;
          }
          if (i === currentChapter) {
            // Current chapter — step-tick sub-segments when stepCount provided
            if (stepCount && stepCount > 1) {
              return (
                <div key={i} className="flex-1 flex gap-0.5" role="presentation">
                  {Array.from({ length: stepCount }, (_, t) => {
                    const isFilled = t < committedSteps;
                    const isActive = isEngagePhase && t === committedSteps;
                    return (
                      <div
                        key={t}
                        className={cn(
                          'flex-1 h-2.5 rounded-full transition-colors duration-300',
                          isFilled
                            ? 'bg-[#0044CC]'
                            : isActive
                              ? 'bg-gray-300 ring-1 ring-inset ring-[#0044CC]/60'
                              : 'bg-gray-300'
                        )}
                      />
                    );
                  })}
                </div>
              );
            }
            // Single-step chapter or legacy mode — continuous fill
            return (
              <div key={i} className="h-2.5 flex-1 rounded-full bg-gray-300 relative overflow-hidden">
                <div
                  className={cn(
                    'absolute inset-y-0 left-0 bg-[#0044CC] rounded-full transition-[width] duration-300',
                    isEngagePhase ? 'ring-1 ring-inset ring-[#0044CC]/60' : ''
                  )}
                  style={{ width: committedSteps > 0 ? '100%' : '5%' }}
                />
              </div>
            );
          }
          // Future chapter — empty
          return <div key={i} className="h-2.5 flex-1 rounded-full bg-gray-300" />;
        })}
      </div>
    </div>
  );
}
