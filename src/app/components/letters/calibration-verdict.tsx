/**
 * @file calibration-verdict.tsx
 * @description P915: the letter calibration verdict — one colored box carrying the gap
 * badge + the pre-commitment statement. Green = perfectly calibrated (success), blue = gap.
 * Repurposes the live GapBanner's color treatment with letter-specific copy that names the
 * author's pre-committed estimate; the 0-10 scale below it shows direction (more/less).
 * gap-banner.tsx stays untouched for /live (story-walk). Extracted so both states are
 * unit-tested.
 */

interface CalibrationVerdictProps {
  /** Author's display (first) name. */
  authorName: string;
  /** Author's pre-committed estimate of the reader's understanding (0–10). */
  authorRating: number;
  /** Absolute gap between the author's estimate and the reader's self-rating. */
  gap: number;
  /**
   * P1030: this story's experience belongs to the reader — the author paraphrased
   * something the reader lived, and the reader rated how well it was captured.
   * The default copy describes the opposite measurement ("you understood THEIR
   * meaning"), so it has to change here too: this is the screen where the number
   * is interpreted, and a correct number under the wrong sentence is still a misread.
   */
  isReverseStory?: boolean;
  className?: string;
}

export function CalibrationVerdict({ authorName, authorRating, gap, isReverseStory = false, className = '' }: CalibrationVerdictProps) {
  const calibrated = gap === 0;
  return (
    <div
      className={`w-full max-w-sm rounded-lg border px-4 py-3 text-center ${calibrated ? 'border-green-200 bg-green-50' : 'border-blue-200 bg-blue-50'} ${className}`}
    >
      <div className="flex justify-center mb-1.5">
        <span className={`${calibrated ? 'bg-green-500' : 'bg-blue-500'} text-white text-xs font-semibold px-2.5 py-0.5 rounded-full`}>
          {calibrated ? 'Perfectly calibrated' : `${gap}-point gap`}
        </span>
      </div>
      <p className={`text-sm leading-snug ${calibrated ? 'text-green-800' : 'text-blue-700'}`}>
        {isReverseStory ? (
          <>
            Before you answered, <span className="font-semibold">{authorName}</span> estimated you would rate their capture of your meaning at a <span className="font-semibold">{authorRating}</span>.
          </>
        ) : (
          <>
            Before you answered, <span className="font-semibold">{authorName}</span> estimated you understood their intended meaning at a <span className="font-semibold">{authorRating}</span>.
          </>
        )}
      </p>
    </div>
  );
}
