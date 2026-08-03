/**
 * @file comprehension-rating-card.tsx
 * @description 0-10 comprehension rating card used in /live and letter reading flows.
 * Extracted from live-mode-view.tsx to enable reuse across surfaces.
 *
 * NOT the same as rating-card.tsx (paraphrase-loop RatingCard for speaker/listener calibration).
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RatingButtons } from '@/app/components/partners/shared';

export interface ComprehensionRatingCardProps {
  question?: string;
  onSelect: (rating: number) => void;
  className?: string;
  /** Optional skip handler - when provided, shows Skip button inside the card */
  onSkip?: () => void;
  /** Label for the skip button (default: "Skip") */
  skipLabel?: string;
  /** Optional back handler - when provided, shows Back button inside the card */
  onBack?: () => void;
  /** Disable rating selection and submit (e.g., after submission or while submitting) */
  disabled?: boolean;
  /** Label for the submit button (default: "Submit") */
  submitLabel?: string;
  /** Optional className override for the submit button. Default matches /live style. */
  ctaClassName?: string;
  /** Optional className override for the question heading. Default matches /live style. */
  questionClassName?: string;
  /** Fires on every selection change, before submit. For surfaces that persist the value. */
  onSelectionChange?: (rating: number | null) => void;
  /**
   * Seeds the selection on mount (P1024). A surface that restores a rating across a
   * reload passes it here, so the row shows the number the surface already holds.
   * Without it the card mounts empty while its host's state says a number was given —
   * the submit reads disabled next to a row with nothing highlighted.
   *
   * Uncontrolled after mount: the card owns the value from the first tap onward, so a
   * later change to this prop is ignored. Remount (change `key`) to re-seed.
   */
  initialValue?: number | null;
}

export function ComprehensionRatingCard({ question, onSelect, className = '', onSkip, skipLabel = 'Speak freely', onBack, disabled = false, submitLabel = 'Submit', ctaClassName, questionClassName, onSelectionChange, initialValue = null }: ComprehensionRatingCardProps) {
  const [selectedRating, setSelectedRating] = useState<number | null>(initialValue);

  const handleSelect = (rating: number) => {
    setSelectedRating(rating);
    onSelectionChange?.(rating);
  };

  const handleSubmit = () => {
    if (selectedRating !== null) {
      onSelect(selectedRating);
    }
  };

  return (
    <div className={`bg-white rounded-lg p-5 space-y-4 shadow-sm border-l-4 border-l-blue-500 ${className}`}>
      {question && (
        <h2 className={questionClassName ?? 'text-lg font-semibold text-center'}>
          {question}
        </h2>
      )}

      <div className={`flex flex-col items-center space-y-3 ${question ? 'pt-3 border-t' : ''}`}>
        <div className="flex justify-between text-xs text-muted-foreground w-full max-w-sm">
          <span>Not at all</span>
          <span>Complete cognitive understanding</span>
        </div>
        <RatingButtons selectedValue={selectedRating} onSelect={handleSelect} disabled={disabled} />
        <Button
          size="sm"
          className={ctaClassName ?? 'bg-blue-500 hover:bg-blue-600 w-full max-w-[200px] mt-2'}
          disabled={selectedRating === null || disabled}
          onClick={handleSubmit}
        >
          {submitLabel}
        </Button>
        {onSkip && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSkip}
            className="text-muted-foreground min-h-[44px]"
          >
            {skipLabel}
          </Button>
        )}
        {onBack && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-muted-foreground"
          >
            Back
          </Button>
        )}
      </div>
    </div>
  );
}
