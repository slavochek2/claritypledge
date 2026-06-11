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
  /** Reader's self-rating (0–10): "how well do I understand the author's intended meaning?" */
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
  /** Reader avatar attribution (the on-track label is hardcoded to "You"). */
  readerPhotoUrl?: string;
  readerAvatarColor?: string;
  readerHasPledged?: boolean;
  /**
   * When true, suppress the internal "Listening calibration" header and the
   * framing sentence. Use when this component is stacked under a separate
   * verdict surface (e.g. GapBanner) that already conveys both.
   */
  compact?: boolean;
}

export function LetterRevealNumeric({
  readerRating,
  authorRating,
  gap,
  authorName,
  authorPhotoUrl,
  authorAvatarColor = '#475569',
  authorHasPledged = false,
  readerPhotoUrl,
  readerAvatarColor = '#0044CC',
  readerHasPledged = false,
  compact = false,
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
  // Round-H rev4.11: bumped 20 → 32 to reserve room for the inline "0" / "10" anchors
  // rendered just outside the track endpoints (makes the 0–10 scale explicit).
  const MARKER_INSET = 32; // px
  const readerStyle = { left: `${readerPct}%` };
  const authorStyle = { left: `${authorPct}%` };

  // P852 Round-H rev4.9: vertical stagger replaces the prior horizontal-nudge
  // mechanism. Reader label sits ABOVE the track, author label sits BELOW —
  // collision is impossible at any gap because each label has its own baseline.
  // Reader always on top (visual primacy for "You" + matches the brand-blue dot
  // convention). The prior MIN_SEP / needsNudge / nudge math is no longer needed.

  return (
    <div className={`flex flex-col items-center w-full ${compact ? 'gap-5' : 'gap-8'}`}>
      {!compact && (
        <>
          {/* Header — this reveal IS the listening calibration. Blue ear marker. */}
          <p className="flex items-center justify-center gap-1.5 text-xs uppercase tracking-widest text-[#1A1A1A]/40 text-center">
            <Ear className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
            Listening calibration
          </p>

          {/* Framing line — single muted sentence, plain language */}
          <p className="text-sm text-[#1A1A1A]/60 text-center leading-snug px-2">{framing}</p>
        </>
      )}

      {/* Horizontal 0–10 scale.
          pt reserves vertical room for BOTH value labels, which sit above the track on a
          consistent baseline; pb leaves room for the 0/10 end labels. The TRACK is the
          positioning ancestor for markers + labels, so each dot seats EXACTLY on the
          track's center line (round-6 on-line fix preserved). */}
      <div
        className="relative w-full pt-10 pb-3"
        style={{ paddingLeft: MARKER_INSET, paddingRight: MARKER_INSET }}
        role="img"
        aria-label={`Understanding scale 0 to 10. You: ${readerRating}. ${authorName}: ${authorRating}. Gap of ${gap}.`}
      >
        {/* Track — markers + labels are absolutely positioned relative to THIS element,
            so top-1/2 lands on the track's center line. */}
        <div className="relative h-2 rounded-full bg-gray-200">
          {/* Round-H rev4.11: inline "0" / "10" anchors at the track endpoints.
             Make the 0–10 scale explicit so the calibration line stops reading
             as an unlabeled bar. Sits inside MARKER_INSET reserve, vertically
             centered on the track. */}
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
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-3 h-3 rounded-full bg-[#475569] ring-2 ring-white"
            style={authorStyle}
          />

          {/* Reader label — ABOVE the track at the exact marker position. */}
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

          {/* Author label — BELOW the track (rev4.9 stagger): own baseline below the
             track so it never collides with the reader label regardless of how close
             the two ratings are. The end-labels' mt-10 reserves vertical space below. */}
          <div
            className="absolute top-full mt-2 -translate-x-1/2 z-30 flex items-center gap-1 whitespace-nowrap"
            style={{ left: `${authorPct}%` }}
          >
            <GravatarAvatar
              name={authorName}
              photoUrl={authorPhotoUrl}
              avatarColor={authorAvatarColor}
              isPledger={authorHasPledged}
              size="sm"
              className="!w-6 !h-6 !text-[10px]"
            />
            <span className="text-sm font-bold text-[#475569] tabular-nums leading-none">
              {firstName(authorName)} {authorRating}
            </span>
          </div>
        </div>

        {/* Scale-end labels — third row, well below author label which sits at
            top-full mt-2 below the track. Round-H rev4.11: mt-10 → mt-16 for
            visible gap from the author label; right label shortened from
            "Complete cognitive understanding" → "Complete understanding" so it
            fits on a single line at iPhone-12-Pro width (390px viewport). The
            comprehension-rating-card keeps the longer form for the rating UI
            itself; the reveal context can lean on the shorter summary form. */}
        <div className="flex justify-between items-start mt-16 gap-2 text-[11px] text-[#1A1A1A]/40 leading-tight">
          <span>Not at all</span>
          <span className="text-right">Complete understanding</span>
        </div>
      </div>
    </div>
  );
}
