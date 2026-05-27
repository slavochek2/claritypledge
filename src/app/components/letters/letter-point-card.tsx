/**
 * @file letter-point-card.tsx
 * @description P852 — anti-point engagement card.
 * Renders the belief statement big/central with an optional framing question above
 * and slots the position selector (PositionButtons) as children below.
 *
 * Visual Spec:
 * - No border-l accent (priming risk avoidance per Locked Decision 1)
 * - No shadow (full-page, not overlay)
 * - No color fill on statement (avoid green/amber/red priming)
 * - rounded-xl, bg-white
 * - Statement: text-xl font-semibold text-[#1A1A1A] text-center px-6 py-8
 * - Framing question: text-sm text-[#1A1A1A]/50 text-center uppercase tracking-wide
 */

import type { ReactNode } from 'react';

interface LetterPointCardProps {
  /** The belief statement — rendered prominently as the primary focal element */
  statement: string;
  /** Optional framing question displayed above the statement in muted uppercase */
  framingQuestion?: string;
  /** Position selector — typically <PositionButtons> from PositionButton.tsx */
  children?: ReactNode;
}

export function LetterPointCard({ statement, framingQuestion, children }: LetterPointCardProps) {
  return (
    <div className="bg-white rounded-xl w-full max-w-lg mx-auto">
      {framingQuestion && (
        <p className="text-sm text-[#1A1A1A]/50 text-center uppercase tracking-wide mb-3">
          {framingQuestion}
        </p>
      )}

      {/* Primary focal element: the belief statement */}
      <p className="text-xl font-semibold text-[#1A1A1A] text-center leading-snug px-6 py-8">
        {statement}
      </p>

      {/* Position selector slot — centered horizontally */}
      {children && (
        <div className="mt-6 pb-4 flex justify-center">
          {children}
        </div>
      )}
    </div>
  );
}
