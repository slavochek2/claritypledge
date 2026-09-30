/**
 * @file letter-reveal-reader-only.tsx
 * @description P1379 — story reveal for a one-to-many (public) letter.
 *
 * A public letter carries no author prediction, so this reveal shows ONLY the
 * reader's own rating: one line ("You said {n} out of 10.") and a single marker
 * on the 0–10 scale. No author avatar, no second marker, no gap segment, no
 * "{Author} thinks…" sentence. The same string is used for reverse stories.
 *
 * Visual language matches LetterRevealNumeric (track, 0/10 anchors, end labels)
 * so the two reveals read as one system; that component is left untouched so
 * one-to-one letters are unchanged.
 */

import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { publicRatingLine } from '@/app/utils/letter-prediction-policy';

const MARKER_INSET = 32; // px — same inset as LetterRevealNumeric

function valueToPct(value: number): number {
  const clamped = Math.max(0, Math.min(10, value));
  return (clamped / 10) * 100;
}

interface LetterRevealReaderOnlyProps {
  readerRating: number;
  readerPhotoUrl?: string;
  readerAvatarColor?: string;
  readerHasPledged?: boolean;
}

export function LetterRevealReaderOnly({
  readerRating,
  readerPhotoUrl,
  readerAvatarColor = '#0044CC',
  readerHasPledged = false,
}: LetterRevealReaderOnlyProps) {
  const readerPct = valueToPct(readerRating);

  return (
    <div className="flex flex-col items-center gap-5 w-full" data-testid="letter-reveal-reader-only">
      <p className="text-lg font-semibold text-[#1A1A1A] text-center">{publicRatingLine(readerRating)}</p>

      <div
        className="relative w-full pt-10 pb-3"
        style={{ paddingLeft: MARKER_INSET, paddingRight: MARKER_INSET }}
        role="img"
        aria-label={`Understanding scale 0 to 10. You: ${readerRating}.`}
      >
        <div className="relative h-2 rounded-full bg-gray-200">
          <span
            className="absolute top-1/2 -translate-y-1/2 text-xs font-semibold text-[#1A1A1A]/50 tabular-nums leading-none"
            style={{ right: 'calc(100% + 6px)' }}
            aria-hidden="true"
          >
            0
          </span>
          <span
            className="absolute top-1/2 -translate-y-1/2 text-xs font-semibold text-[#1A1A1A]/50 tabular-nums leading-none"
            style={{ left: 'calc(100% + 6px)' }}
            aria-hidden="true"
          >
            10
          </span>

          <div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-3 h-3 rounded-full bg-[#0044CC] ring-2 ring-white"
            style={{ left: `${readerPct}%` }}
            data-testid="reader-marker"
          />

          <div
            className="absolute bottom-full mb-2 -translate-x-1/2 z-30 flex items-center gap-1 whitespace-nowrap"
            style={{ left: `${readerPct}%` }}
          >
            <GravatarAvatar
              name="You"
              photoUrl={readerPhotoUrl}
              avatarColor={readerAvatarColor}
              isPledger={readerHasPledged}
              size="sm"
              className="!w-6 !h-6 !text-[10px]"
            />
            <span className="text-sm font-bold text-[#0044CC] tabular-nums leading-none">
              You {readerRating}
            </span>
          </div>
        </div>

        <div className="flex justify-between items-start mt-6 gap-2 text-[11px] text-[#1A1A1A]/40 leading-tight">
          <span>Not at all</span>
          <span className="text-right">Complete understanding</span>
        </div>
      </div>
    </div>
  );
}
