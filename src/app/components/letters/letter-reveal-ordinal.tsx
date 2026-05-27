/**
 * @file letter-reveal-ordinal.tsx
 * @description P852 — ordinal stance renderer for LetterRevealCard.
 * Used for anti-point and post-story point reveals.
 *
 * Shows the two positions side by side as prominent full-word stance badges
 * (the payload of the reveal) — NO numeric scale, NO gap number.
 *
 * The badges align under the avatar pair (reader left, author right), so the
 * per-stance name headers are intentionally omitted — the avatar labels in
 * LetterRevealCard already identify each side (avoids the duplicate-name issue).
 *
 * P2b: optionally renders the belief statement above the stances. This is post-commit,
 * so there is no priming risk — it gives context ("here's the statement → here's how you
 * both landed") and gives the reveal card more substance/presence on screen.
 *
 * Badges wrap rather than overflow at 320px (Challenge Note 2).
 */

import type { PositionType } from '@/app/types';

// Full readable labels. Canonical copies live in PositionBadge; duplicated here so the
// reveal can show the prominent full-word form ("Somewhat agrees") rather than the tiny
// inline badge's intensity notation ("Agrees−"), which read as cryptic at small size.
const POSITION_FULL_LABELS: Record<PositionType, string> = {
  strongly_agree: 'Strongly agrees',
  agree: 'Agrees',
  somewhat_agree: 'Somewhat agrees',
  unsure: 'Unsure',
  somewhat_disagree: 'Somewhat disagrees',
  disagree: 'Disagrees',
  strongly_disagree: 'Strongly disagrees',
};

interface LetterRevealOrdinalProps {
  readerPosition: PositionType;
  authorPosition: PositionType;
  /** Belief statement — rendered above the stances for post-commit context (P2b). */
  statement?: string;
  /** Kept for API compatibility; names are carried by the avatar labels above, not repeated here. */
  authorName?: string;
}

export function LetterRevealOrdinal({
  readerPosition,
  authorPosition,
  statement,
}: LetterRevealOrdinalProps) {
  return (
    <div className="flex flex-col items-center gap-6">
      {/* P2b: belief statement for post-commit context — smaller, muted, centered */}
      {statement && (
        <p className="text-base text-center text-[#1A1A1A]/70 leading-snug px-2">
          {statement}
        </p>
      )}

      {/* Side-by-side stances — the payload. Prominent full-word badges, aligned under
          the avatar pair (reader left, author right). Wrap instead of overflow at 320px. */}
      <div className="flex gap-6 justify-center items-stretch w-full">
        <div className="flex-1 flex justify-center min-w-0">
          <span className="inline-block text-base font-semibold text-blue-700 bg-blue-100 rounded-full px-4 py-2 text-center leading-snug">
            {POSITION_FULL_LABELS[readerPosition]}
          </span>
        </div>

        <div className="w-px self-stretch bg-gray-200" />

        <div className="flex-1 flex justify-center min-w-0">
          <span className="inline-block text-base font-semibold text-blue-700 bg-blue-100 rounded-full px-4 py-2 text-center leading-snug">
            {POSITION_FULL_LABELS[authorPosition]}
          </span>
        </div>
      </div>
    </div>
  );
}
