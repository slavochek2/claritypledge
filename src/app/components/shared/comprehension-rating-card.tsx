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
  /**
   * Suppress the built-in submit button (P1024). The default submit renders DISABLED
   * until a rating is picked, which P955 forbids for a primary action; a surface that
   * owns its own action elsewhere on screen sets this and drives the transition itself.
   * Requires `onSelectionChange` to observe the value — `onSelect` never fires without
   * the submit button.
   */
  hideSubmit?: boolean;
  /** Fires on every selection change, before submit. Pairs with `hideSubmit`. */
  onSelectionChange?: (rating: number | null) => void;
}

export function ComprehensionRatingCard({ question, onSelect, className = '', onSkip, skipLabel = 'Speak freely', onBack, disabled = false, submitLabel = 'Submit', ctaClassName, questionClassName, hideSubmit = false, onSelectionChange }: ComprehensionRatingCardProps) {
  const [selectedRating, setSelectedRating] = useState<number | null>(null);

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
        {!hideSubmit && (
          <Button
            size="sm"
            className={ctaClassName ?? 'bg-blue-500 hover:bg-blue-600 w-full max-w-[200px] mt-2'}
            disabled={selectedRating === null || disabled}
            onClick={handleSubmit}
          >
            {submitLabel}
          </Button>
        )}
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
