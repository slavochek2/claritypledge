/**
 * @file letter-reveal-numeric.tsx
 * @description P852 — numeric (story) understanding reveal: a single horizontal 0–10 scale.
 *
 * Replaces the earlier stacked layout (big gap figure + GapBanner + JourneyToUnderstanding
 * dot-scale, which showed the same gap three times) with ONE horizontal track:
 * - 0 → 10 track, gray-200.
 * - Two markers positioned by value: reader (You) and author.
 * - The segment between the two markers (the gap) is highlighted in brand blue (#0044CC).
 * - Each marker shows its value in a small name pill; markers sit on opposite sides of
 *   the track so they never overlap when values are close.
 * - One plain-language framing line above (reuses the existing over/under/calibrated logic).
 *
 * Presentational/pure — all values come from props. No new conceptual copy.
 */

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
  /** Author's display name */
  authorName: string;
  /** Reader's display name (unused in labels — "You" is shown — kept for API stability) */
  readerName: string;
}

export function LetterRevealNumeric({
  readerRating,
  authorRating,
  gap,
  authorName,
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
  const MARKER_INSET = 16; // px — keeps end pills clear of the card edge
  const readerStyle = { left: `${readerPct}%` };
  const authorStyle = { left: `${authorPct}%` };

  return (
    <div className="flex flex-col items-center gap-10 w-full">
      {/* Framing line — single muted sentence, plain language */}
      <p className="text-sm text-[#1A1A1A]/60 text-center leading-snug px-2">{framing}</p>

      {/* Horizontal 0–10 scale — my-2 reserves room for the pills that sit above/below the track */}
      <div
        className="relative w-full my-2"
        style={{ paddingLeft: MARKER_INSET, paddingRight: MARKER_INSET }}
        role="img"
        aria-label={`Understanding scale 0 to 10. You: ${readerRating}. ${authorName}: ${authorRating}. Gap of ${gap}.`}
      >
        {/* Reader pill ABOVE the track */}
        <div
          className="absolute -top-1 -translate-x-1/2 -translate-y-full z-10"
          style={readerStyle}
        >
          <div className="flex flex-col items-center">
            <span className="whitespace-nowrap rounded-full bg-[#0044CC] text-white text-xs font-semibold px-2 py-0.5 shadow-sm">
              You {readerRating}
            </span>
            <span className="block w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-[#0044CC]" />
          </div>
        </div>

        {/* Author pill BELOW the track */}
        <div
          className="absolute -bottom-1 -translate-x-1/2 translate-y-full z-10"
          style={authorStyle}
        >
          <div className="flex flex-col items-center">
            <span className="block w-0 h-0 border-x-4 border-x-transparent border-b-4 border-b-[#1A1A1A]/60" />
            <span className="whitespace-nowrap rounded-full bg-[#1A1A1A]/70 text-white text-xs font-semibold px-2 py-0.5 shadow-sm max-w-[120px] truncate">
              {authorName} {authorRating}
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

        {/* 0 / 10 end labels */}
        <div className="flex justify-between mt-2 text-[11px] text-[#1A1A1A]/40 tabular-nums">
          <span>0</span>
          <span>10</span>
        </div>
      </div>
    </div>
  );
}
