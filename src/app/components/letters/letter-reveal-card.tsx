/**
 * @file letter-reveal-card.tsx
 * @description P852 — reveal shell: a thin presentational container.
 *
 * Round-5 refactor: the shell no longer hardcodes a "Listening calibration" header or
 * an avatar pair. Each renderer (LetterRevealOrdinal / LetterRevealNumeric) now owns its
 * own header + attribution, because the two reveals have different semantics:
 * - Ordinal (points): "Where you each stand" — plain position reveal, no ear marker.
 * - Numeric (story): "Listening calibration" + ear marker — the actual calibration moment.
 *
 * This container only provides card chrome: white surface, rounded-xl, shadow-sm,
 * max-w, padding, and the animate-fade-in entrance (the reveal is the emotional peak).
 */

import type { ReactNode } from 'react';

interface LetterRevealCardProps {
  /** Value renderer — LetterRevealOrdinal or LetterRevealNumeric (owns its own header). */
  children: ReactNode;
}

export function LetterRevealCard({ children }: LetterRevealCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm w-full max-w-lg mx-auto px-4 py-8 animate-fade-in">
      {children}
    </div>
  );
}
