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
  /** P1336: replaces the "Chapter N of M" text (and the bar's accessible name) for hosts
   *  whose units are not chapters (e.g. "Step 2 of 5"). Default: the chapter label. */
  label?: string;
  /** P1336: 'subtle' draws the fill in a lighter blue (blue-400) on a lighter track, for a
   *  second bar on a screen that already shows the main one (the statements counter under
   *  the step header). Default 'default': the letter's own blue — unchanged. */
  tone?: 'default' | 'subtle';
  /** P1389: how much of the current segment is done (0-1), drawn as one proportional fill —
   *  no ticks, no ring. Overrides stepCount for the current segment when given. */
  fraction?: number;
}

export function LetterProgressBar({
  currentChapter,
  totalChapters,
  stepCount,
  committedSteps = 0,
  isEngagePhase = false,
  label,
  tone = 'default',
  fraction,
}: LetterProgressBarProps) {
  const fill = tone === 'subtle' ? 'bg-blue-400' : 'bg-blue-600';
  const track = tone === 'subtle' ? 'bg-gray-200' : 'bg-gray-300';
  const text =
    label ??
    (totalChapters === 1
      ? `Chapter ${currentChapter + 1}`
      : `Chapter ${currentChapter + 1} of ${totalChapters}`);
  return (
    <div
      className="flex flex-row items-center gap-3 w-full"
      role="progressbar"
      aria-label={text}
      aria-valuenow={currentChapter + 1}
      aria-valuemin={1}
      aria-valuemax={totalChapters}
    >
      {/* P852: Label inline with segments — single-chapter letters drop "of 1". */}
      <p className="text-sm text-[#1A1A1A]/60 tabular-nums whitespace-nowrap flex-shrink-0">
        {text}
      </p>

      {/* Segments — one per chapter */}
      <div className="flex gap-1 flex-1 min-w-0">
        {Array.from({ length: totalChapters }, (_, i) => {
          if (i < currentChapter) {
            // Completed chapter — fully filled
            return <div key={i} className={cn('h-2.5 flex-1 rounded-full', fill)} />;
          }
          if (i === currentChapter && fraction !== undefined) {
            return (
              <div key={i} className={cn('h-2.5 flex-1 rounded-full relative overflow-hidden', track)}>
                <div
                  className={cn('absolute inset-y-0 left-0 rounded-full transition-[width] duration-300', fill)}
                  style={{ width: `${Math.max(12, Math.min(100, fraction * 100))}%` }}
                />
              </div>
            );
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
                            ? fill
                            : isActive
                              ? cn(track, 'ring-1 ring-inset ring-blue-600/60')
                              : track
                        )}
                      />
                    );
                  })}
                </div>
              );
            }
            // Single-step chapter or legacy mode — continuous fill
            return (
              <div key={i} className={cn('h-2.5 flex-1 rounded-full relative overflow-hidden', track)}>
                <div
                  className={cn(
                    'absolute inset-y-0 left-0 rounded-full transition-[width] duration-300',
                    fill,
                    isEngagePhase ? 'ring-1 ring-inset ring-blue-600/60' : ''
                  )}
                  style={{ width: committedSteps > 0 ? '100%' : '5%' }}
                />
              </div>
            );
          }
          // Future chapter — empty
          return <div key={i} className={cn('h-2.5 flex-1 rounded-full', track)} />;
        })}
      </div>
    </div>
  );
}
