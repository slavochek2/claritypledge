/**
 * @file letter-reveal-numeric.tsx
 * @description P852 — numeric (story) understanding reveal: a single horizontal 0–10 scale.
 *
 * Round-5: this reveal IS the listening calibration moment, so it owns the
 * "Listening calibration" header + blue Ear marker (moved here from the shared shell).
 *
 * - Header: "Listening calibration" + blue Ear marker.
 * - NO big avatar pair above (removed) — attribution lives ON the markers instead.
 * - 0 → 10 track (gray-200); the segment between the two markers (the gap) is brand blue.
 * - Two markers positioned by value; each pill carries a SMALL avatar + the value.
 *   Reader pill sits above the track, author pill below — so they never overlap when close.
 * - Scale-end labels under 0 / 10 reuse the comprehension-rating-card wording.
 * - One plain-language framing line above.
 *
 * Presentational/pure — all values come from props. No new conceptual copy.
 */

import { Ear } from 'lucide-react';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';

const TRACK_MIN = 0;
const TRACK_MAX = 10;

/** Position (0–100%) of a 0–10 value along the track. */
function valueToPct(value: number): number {
  const clamped = Math.max(TRACK_MIN, Math.min(TRACK_MAX, value));
  return (clamped / TRACK_MAX) * 100;
}

interface LetterRevealNumericProps {
  /** Reader's self-rating (0–10): "how well do I understand the author's intention?" */
  readerRating: number;
  /** Author's prediction of reader's rating (0–10) */
  authorRating: number;
  /** Absolute gap between ratings */
  gap: number;
  /** Author's display name + avatar attribution. */
  authorName: string;
  authorPhotoUrl?: string;
  authorAvatarColor?: string;
  authorHasPledged?: boolean;
  /** Reader's display name (shown as "You") + avatar attribution. */
  readerName: string;
  readerPhotoUrl?: string;
  readerAvatarColor?: string;
  readerHasPledged?: boolean;
}

export function LetterRevealNumeric({
  readerRating,
  authorRating,
  gap,
  authorName,
  authorPhotoUrl,
  authorAvatarColor = '#0D9488',
  authorHasPledged = false,
  readerPhotoUrl,
  readerAvatarColor = '#0044CC',
  readerHasPledged = false,
}: LetterRevealNumericProps) {
  // Plain-language framing (reuses existing over/under/calibrated logic).
  let framing: string;
  if (gap === 0) {
    framing = `You and ${authorName} are calibrated.`;
  } else if (authorRating < readerRating) {
    framing = `${authorName} thinks you understand less than you think.`;
  } else {
    framing = `${authorName} thinks you understand more than you think.`;
  }

  const readerPct = valueToPct(readerRating);
  const authorPct = valueToPct(authorRating);
  const lowPct = Math.min(readerPct, authorPct);
  const highPct = Math.max(readerPct, authorPct);

  // Inset the track via container padding so end values (0 and 10) keep their pills
  // on-screen at 320px — the marker `left` percentages are relative to the padded box,
  // so 0% sits inside the inset and 100% sits inside the inset on the other side.
  const MARKER_INSET = 20; // px — keeps end pills (avatar + value) clear of the card edge
  const readerStyle = { left: `${readerPct}%` };
  const authorStyle = { left: `${authorPct}%` };

  return (
    <div className="flex flex-col items-center gap-8 w-full">
      {/* Header — this reveal IS the listening calibration. Blue ear marker. */}
      <p className="flex items-center justify-center gap-1.5 text-xs uppercase tracking-widest text-[#1A1A1A]/40 text-center">
        <Ear className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
        Listening calibration
      </p>

      {/* Framing line — single muted sentence, plain language */}
      <p className="text-sm text-[#1A1A1A]/60 text-center leading-snug px-2">{framing}</p>

      {/* Horizontal 0–10 scale — my-2 reserves room for the pills above/below the track */}
      <div
        className="relative w-full my-2"
        style={{ paddingLeft: MARKER_INSET, paddingRight: MARKER_INSET }}
        role="img"
        aria-label={`Understanding scale 0 to 10. You: ${readerRating}. ${authorName}: ${authorRating}. Gap of ${gap}.`}
      >
        {/* Reader pill ABOVE the track — small avatar + value */}
        <div className="absolute -top-1 -translate-x-1/2 -translate-y-full z-10" style={readerStyle}>
          <div className="flex flex-col items-center">
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#0044CC] text-white text-xs font-semibold pl-0.5 pr-2 py-0.5 shadow-sm">
              <GravatarAvatar
                name="You"
                photoUrl={readerPhotoUrl}
                avatarColor={readerAvatarColor}
                isPledger={readerHasPledged}
                size="sm"
                showRing={false}
                className="!w-5 !h-5 !text-[9px]"
              />
              You {readerRating}
            </span>
            <span className="block w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-[#0044CC]" />
          </div>
        </div>

        {/* Author pill BELOW the track — small avatar + value */}
        <div className="absolute -bottom-1 -translate-x-1/2 translate-y-full z-10" style={authorStyle}>
          <div className="flex flex-col items-center">
            <span className="block w-0 h-0 border-x-4 border-x-transparent border-b-4 border-b-[#1A1A1A]/60" />
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#1A1A1A]/70 text-white text-xs font-semibold pl-0.5 pr-2 py-0.5 shadow-sm max-w-[140px]">
              <GravatarAvatar
                name={authorName}
                photoUrl={authorPhotoUrl}
                avatarColor={authorAvatarColor}
                isPledger={authorHasPledged}
                size="sm"
                showRing={false}
                className="!w-5 !h-5 !text-[9px]"
              />
              <span className="truncate">{authorName} {authorRating}</span>
            </span>
          </div>
        </div>

        {/* Track */}
        <div className="relative h-2 rounded-full bg-gray-200 overflow-hidden">
          {/* Gap segment between the two markers, in brand blue */}
          <div
            className="absolute top-0 bottom-0 bg-[#0044CC] rounded-full"
            style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }}
          />
        </div>

        {/* Marker dots on the track */}
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#0044CC] ring-2 ring-white z-20"
          style={readerStyle}
        />
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#1A1A1A]/70 ring-2 ring-white z-20"
          style={authorStyle}
        />

        {/* Scale-end labels — reuse comprehension-rating-card wording. Constrained widths
            so they fit and wrap gracefully at 320px rather than overflowing. */}
        <div className="flex justify-between items-start mt-2 gap-2 text-[11px] text-[#1A1A1A]/40 leading-tight">
          <span className="max-w-[40%]">Not at all</span>
          <span className="max-w-[55%] text-right">Complete cognitive understanding</span>
        </div>
      </div>
    </div>
  );
}
