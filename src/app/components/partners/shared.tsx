/**
 * @file shared.tsx
 * @description Shared components for Clarity Partners feature.
 * Note: Constants and utilities moved to separate files for Fast Refresh compatibility.
 */

import type { KeyboardEvent } from 'react';
import { RATING_OPTIONS } from './constants';

// Re-export for backward compatibility
// eslint-disable-next-line react-refresh/only-export-components
export { RATING_OPTIONS } from './constants';
// eslint-disable-next-line react-refresh/only-export-components
export { capitalizeName, getFirstName } from './utils';

/**
 * Rating buttons component - shared between rating-card and live-mode-view.
 */
interface RatingButtonsProps {
  selectedValue: number | null;
  onSelect: (value: number) => void;
  disabled?: boolean;
}

export function RatingButtons({ selectedValue, onSelect, disabled }: RatingButtonsProps) {
  return (
    <div className="flex gap-1 w-full max-w-sm">
      {RATING_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => onSelect(option.value)}
          disabled={disabled}
          className={`
            flex-1 min-w-0 py-2.5 rounded-md text-xs font-medium transition-all
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            ${
              selectedValue === option.value
                ? 'bg-blue-500 text-white ring-2 ring-blue-500 ring-offset-1'
                : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'
            }
          `}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Rating form content for the AI story guide chat drawer.
 * Extracted from StoryGuideChat so the pattern can be reused across surfaces.
 */
export interface ChatRatingContentProps {
  ratingValue: number | null;
  onRatingChange: (v: number) => void;
  comment: string;
  onCommentChange: (v: string) => void;
  onSubmit: () => void;
  onCommentKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  iterationCount: number;
  onEscapeHatchSave?: () => void;
  onKeepRefining?: () => void;
}

export function ChatRatingContent({
  ratingValue,
  onRatingChange,
  comment,
  onCommentChange,
  onSubmit,
  onCommentKeyDown,
  iterationCount,
  onEscapeHatchSave,
  onKeepRefining,
}: ChatRatingContentProps) {
  return (
    <div className="flex flex-col gap-4">
      <RatingButtons selectedValue={ratingValue} onSelect={onRatingChange} />
      <textarea
        value={comment}
        onChange={e => onCommentChange(e.target.value)}
        onKeyDown={onCommentKeyDown}
        placeholder={ratingValue !== null && ratingValue >= 7 ? 'Anything to change? (optional)' : "What's off? (optional)"}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/70 resize-none outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[60px]"
        rows={2}
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={ratingValue === null}
        className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
          ratingValue !== null
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-muted text-muted-foreground cursor-not-allowed'
        }`}
      >
        Submit
      </button>
      {iterationCount >= 1 && onEscapeHatchSave && onKeepRefining && (
        <div className="flex gap-2 flex-wrap justify-center pt-1">
          <button
            type="button"
            data-testid="escape-hatch-save"
            onClick={onEscapeHatchSave}
            className="px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            Save at this version
          </button>
          <button
            type="button"
            data-testid="escape-hatch-keep-refining"
            onClick={onKeepRefining}
            className="px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            Keep refining
          </button>
        </div>
      )}
    </div>
  );
}
