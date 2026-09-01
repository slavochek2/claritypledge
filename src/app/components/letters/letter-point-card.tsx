/**
 * @file letter-point-card.tsx
 * @description P852 — anti-point engagement card.
 * Renders the belief statement in a contained card (matching the PointRow look in
 * live-story-card-expanded.tsx: rounded card, gray-50 fill, blue pin icon) with an
 * optional framing question above, and slots the position selector as children below.
 *
 * Exports `StatementPointCard` (the contained statement block) so the reveal screens
 * can show the SAME statement styling without re-implementing it (DRY).
 *
 * Visual Spec:
 * - Statement block: rounded-lg border border-border bg-gray-50 p-4, blue pin icon
 * - Statement text prominent (text-lg) — the focal element of the engage screen
 * - Framing question: text-sm text-[#1A1A1A]/50 text-center uppercase tracking-wide
 * - No shadow, no border-l accent, no color fill on the statement text (priming-safe)
 */

import type { ReactNode } from 'react';
import { Pin } from 'lucide-react';

/**
 * Contained statement card — matches the PointRow visual (blue pin in a circle +
 * statement on a gray-50 rounded card). Shared by the engage screen and the ordinal
 * reveal so both render the belief statement identically.
 */
export function StatementPointCard({
  statement,
  className = '',
}: {
  statement: string;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-border bg-gray-50 p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600 mt-0.5">
          <Pin size={12} className="rotate-45" />
        </div>
        <p className="text-lg font-medium text-[#1A1A1A] flex-1 min-w-0 break-words leading-snug">
          {statement}
        </p>
      </div>
    </div>
  );
}

interface LetterPointCardProps {
  /** The belief statement — rendered in the contained statement card */
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

      {/* Primary focal element: the belief statement, in the contained PointRow-style card */}
      <StatementPointCard statement={statement} />

      {/* Position selector slot — full-width, centered, bigger (no compact/narrow) */}
      {children && (
        <div className="mt-6 pb-2 flex justify-center w-full">
          <div className="w-full">{children}</div>
        </div>
      )}
    </div>
  );
}
