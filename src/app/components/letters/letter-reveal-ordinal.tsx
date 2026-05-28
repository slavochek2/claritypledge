/**
 * @file letter-reveal-ordinal.tsx
 * @description P852 — ordinal stance reveal (anti-point / post-story points).
 *
 * Round-5: this is NOT "listening calibration" — it just reveals positions. So:
 * - Header: "Where you each stand" (plain, uppercase tracking, muted — NO ear marker).
 * - The POSITIONS are the hero: big full-word stance badges, placed ABOVE the statement.
 * - Avatars are small attribution only (size sm) next to each side's name.
 * - The belief statement renders BELOW, in the same contained PointRow-style card as the
 *   engage screen (StatementPointCard).
 *
 * Vertical order: [header] → [two big positions, each with small avatar + name] → [statement].
 * Badges wrap rather than overflow at 320px.
 */

import type { PositionType } from '@/app/types';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { StatementPointCard } from './letter-point-card';

// Full readable labels. Canonical copies live in PositionBadge; duplicated here so the
// reveal can show the prominent full-word form ("Somewhat agrees") rather than the tiny
// inline badge's intensity notation ("Agrees−"), which reads as cryptic at small size.
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
  /** Belief statement — rendered below the positions in the contained statement card. */
  statement?: string;
  /** Author display name + avatar attribution. */
  authorName: string;
  authorPhotoUrl?: string;
  authorAvatarColor?: string;
  authorHasPledged?: boolean;
  /** Reader avatar attribution (name is shown as "You"). */
  readerPhotoUrl?: string;
  readerAvatarColor?: string;
  readerHasPledged?: boolean;
}

/** One side of the stance pair: small avatar + name above, big stance badge below. */
function StanceColumn({
  name,
  photoUrl,
  avatarColor,
  hasPledged,
  position,
}: {
  name: string;
  photoUrl?: string;
  avatarColor: string;
  hasPledged: boolean;
  position: PositionType;
}) {
  return (
    <div className="flex-1 min-w-0 flex flex-col items-center gap-3">
      {/* Small attribution: avatar + name */}
      <div className="flex items-center gap-1.5 min-w-0 max-w-full">
        <GravatarAvatar
          name={name}
          photoUrl={photoUrl}
          avatarColor={avatarColor}
          isPledger={hasPledged}
          size="sm"
          className="!w-6 !h-6 !text-[10px]"
        />
        <span className="text-xs text-[#1A1A1A]/50 truncate">{name}</span>
      </div>
      {/* The HERO: big full-word stance badge */}
      <span className="inline-block text-base font-semibold text-blue-700 bg-blue-100 rounded-full px-4 py-2 text-center leading-snug">
        {POSITION_FULL_LABELS[position]}
      </span>
    </div>
  );
}

export function LetterRevealOrdinal({
  readerPosition,
  authorPosition,
  statement,
  authorName,
  authorPhotoUrl,
  authorAvatarColor = '#0D9488',
  authorHasPledged = false,
  readerPhotoUrl,
  readerAvatarColor = '#0044CC',
  readerHasPledged = false,
}: LetterRevealOrdinalProps) {
  return (
    <div className="flex flex-col items-center gap-6">
      {/* Header — plain position reveal, NO ear marker */}
      <p className="text-xs uppercase tracking-widest text-[#1A1A1A]/40 text-center">
        Where you each stand
      </p>

      {/* Positions are the hero — side by side, each with small avatar + name above */}
      <div className="flex gap-4 sm:gap-6 justify-center items-start w-full">
        <StanceColumn
          name="You"
          photoUrl={readerPhotoUrl}
          avatarColor={readerAvatarColor}
          hasPledged={readerHasPledged}
          position={readerPosition}
        />
        <div className="w-px self-stretch bg-gray-200" />
        <StanceColumn
          name={authorName}
          photoUrl={authorPhotoUrl}
          avatarColor={authorAvatarColor}
          hasPledged={authorHasPledged}
          position={authorPosition}
        />
      </div>

      {/* Statement below, in the same contained card as the engage screen */}
      {statement && <StatementPointCard statement={statement} className="w-full" />}
    </div>
  );
}
