/**
 * @file letter-reveal-numeric.tsx
 * @description P852 — numeric (story) understanding reveal: a single horizontal 0–10 scale.
 *
 * Round-7: both value labels sit ABOVE the track on a consistent baseline, each showing
 * [small avatar] + first name + value (e.g. "[avatar] You 7", "[avatar] Maya 4"). The
 * marker dot stays seated exactly ON the track line (round-6 on-line fix preserved).
 * When the two values are close, the labels are nudged apart so they never overlap/clip.
 *
 * - Header: "Listening calibration" + blue Ear marker.
 * - 0 → 10 track (gray-200); the segment between the two markers (the gap) is brand blue.
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

/** First name only — keeps both labels narrow enough to fit side by side at 320px. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
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

  // Inset the track via container padding so end values (0 and 10) keep their markers +
  // labels on-screen at 320px — marker `left` percentages are relative to the padded box,
  // so 0% sits inside the inset and 100% sits inside the inset on the other side.
  const MARKER_INSET = 20; // px — keeps end markers/labels clear of the card edge
  const readerStyle = { left: `${readerPct}%` };
  const authorStyle = { left: `${authorPct}%` };

  // Both labels sit ABOVE the track. They are centered on their marker by default, but when
  // the two values are close the labels would overlap — so we push them apart symmetrically.
  // MIN_SEP is an approximate % of track width one label occupies; below that gap we nudge.
  const MIN_SEP = 26; // ~ half a label's footprint, in track-% units
  const labelGap = Math.abs(readerPct - authorPct);
  const needsNudge = labelGap < MIN_SEP;
  const nudge = needsNudge ? (MIN_SEP - labelGap) / 2 : 0;
  // Lower-valued marker's label shifts left, higher-valued shifts right (clamped to track).
  const readerLabelPct = needsNudge
    ? Math.max(0, Math.min(100, readerPct + (readerPct <= authorPct ? -nudge : nudge)))
    : readerPct;
  const authorLabelPct = needsNudge
    ? Math.max(0, Math.min(100, authorPct + (authorPct < readerPct ? -nudge : nudge)))
    : authorPct;

  return (
    <div className="flex flex-col items-center gap-8 w-full">
      {/* Header — this reveal IS the listening calibration. Blue ear marker. */}
      <p className="flex items-center justify-center gap-1.5 text-xs uppercase tracking-widest text-[#1A1A1A]/40 text-center">
        <Ear className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
        Listening calibration
      </p>

      {/* Framing line — single muted sentence, plain language */}
      <p className="text-sm text-[#1A1A1A]/60 text-center leading-snug px-2">{framing}</p>

      {/* Horizontal 0–10 scale.
          pt reserves vertical room for BOTH value labels, which sit above the track on a
          consistent baseline; pb leaves room for the 0/10 end labels. The TRACK is the
          positioning ancestor for markers + labels, so each dot seats EXACTLY on the
          track's center line (round-6 on-line fix preserved). */}
      <div
        className="relative w-full pt-9 pb-3"
        style={{ paddingLeft: MARKER_INSET, paddingRight: MARKER_INSET }}
        role="img"
        aria-label={`Understanding scale 0 to 10. You: ${readerRating}. ${authorName}: ${authorRating}. Gap of ${gap}.`}
      >
        {/* Track — markers + labels are absolutely positioned relative to THIS element,
            so top-1/2 lands on the track's center line. */}
        <div className="relative h-2 rounded-full bg-gray-200">
          {/* Gap segment between the two markers, in brand blue */}
          <div
            className="absolute top-0 bottom-0 bg-[#0044CC] rounded-full"
            style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }}
          />

          {/* Reader marker dot — seated ON the line (round-6 fix preserved) */}
          <div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-3 h-3 rounded-full bg-[#0044CC] ring-2 ring-white"
            style={readerStyle}
          />
          {/* Author marker dot — seated ON the line */}
          <div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-3 h-3 rounded-full bg-[#0D9488] ring-2 ring-white"
            style={authorStyle}
          />

          {/* Reader label — ABOVE the track: avatar + first name + value */}
          <div
            className="absolute bottom-full mb-2 -translate-x-1/2 z-30 flex items-center gap-1 whitespace-nowrap"
            style={{ left: `${readerLabelPct}%` }}
          >
            <GravatarAvatar
              name="You"
              photoUrl={readerPhotoUrl}
              avatarColor={readerAvatarColor}
              isPledger={readerHasPledged}
              size="sm"
              showRing={false}
              className="!w-5 !h-5 !text-[9px] ring-2 ring-white"
            />
            <span className="text-xs font-bold text-[#0044CC] tabular-nums leading-none">
              You {readerRating}
            </span>
          </div>

          {/* Author label — ABOVE the track (same baseline): avatar + first name + value */}
          <div
            className="absolute bottom-full mb-2 -translate-x-1/2 z-30 flex items-center gap-1 whitespace-nowrap"
            style={{ left: `${authorLabelPct}%` }}
          >
            <GravatarAvatar
              name={authorName}
              photoUrl={authorPhotoUrl}
              avatarColor={authorAvatarColor}
              isPledger={authorHasPledged}
              size="sm"
              showRing={false}
              className="!w-5 !h-5 !text-[9px] ring-2 ring-white"
            />
            <span className="text-xs font-bold text-[#0D9488] tabular-nums leading-none">
              {firstName(authorName)} {authorRating}
            </span>
          </div>
        </div>

        {/* Scale-end labels — reuse comprehension-rating-card wording. Constrained widths
            so they fit and wrap gracefully at 320px rather than overflowing. */}
        <div className="flex justify-between items-start mt-3 gap-2 text-[11px] text-[#1A1A1A]/40 leading-tight">
          <span className="max-w-[40%]">Not at all</span>
          <span className="max-w-[55%] text-right">Complete cognitive understanding</span>
        </div>
      </div>
    </div>
  );
}
