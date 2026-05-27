/**
 * @file letter-reveal-card.tsx
 * @description P852 — central reveal shell component (shared by ordinal + numeric modes).
 *
 * Fixes critiques #1 (reveal invisibility) and #2 (inverted reveal/story hierarchy):
 * - Fills the full content column, no competing sidebar
 * - Value display is primary — largest type weight, center stage
 * - shadow-sm, rounded-xl, animate-fade-in on mount
 * - Avatar columns: min-w-0 overflow-hidden, pointer-events-none
 *
 * Visual Spec:
 * - "Calibration" label: text-xs uppercase tracking-widest text-[#1A1A1A]/40 text-center
 * - Avatar pair: size="lg" (w-16 h-16), gap-8 justify-center py-4
 * - Value renderer (children): primary — center stage, most visual weight
 * - Advance CTA: rendered by parent in FixedBottomBar, NOT inside this card
 */

import type { ReactNode } from 'react';
import { Ear } from 'lucide-react';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';

interface LetterRevealCardProps {
  /** 'ordinal' = side-by-side position stances; 'numeric' = 0–10 understanding gap */
  revealMode: 'ordinal' | 'numeric';
  readerName: string;
  readerPhotoUrl?: string;
  readerAvatarColor?: string;
  readerHasPledged?: boolean;
  authorName: string;
  authorPhotoUrl?: string;
  authorAvatarColor?: string;
  authorHasPledged?: boolean;
  /** Value renderer — LetterRevealOrdinal or LetterRevealNumeric */
  children: ReactNode;
}

export function LetterRevealCard({
  readerName,
  readerPhotoUrl,
  readerAvatarColor,
  readerHasPledged = false,
  authorName,
  authorPhotoUrl,
  authorAvatarColor,
  authorHasPledged = false,
  children,
}: LetterRevealCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm w-full max-w-lg mx-auto px-4 py-8 animate-fade-in">
      {/* Orientation label — tertiary, not primary. Blue ear marker ties to the
          product's "listening" language. */}
      <p className="flex items-center justify-center gap-1.5 text-xs uppercase tracking-widest text-[#1A1A1A]/40 text-center mb-4">
        <Ear className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
        Listening calibration
      </p>

      {/* Avatar pair — YOU vs author */}
      <div className="flex gap-8 justify-center py-4">
        {/* Reader column */}
        <div className="flex flex-col items-center gap-2 min-w-0 overflow-hidden pointer-events-none">
          <GravatarAvatar
            name={readerName}
            photoUrl={readerPhotoUrl}
            avatarColor={readerAvatarColor ?? '#0044CC'}
            isPledger={readerHasPledged}
            size="lg"
          />
          <span className="text-xs text-[#1A1A1A]/50 truncate max-w-[80px] text-center">You</span>
        </div>

        {/* Author column */}
        <div className="flex flex-col items-center gap-2 min-w-0 overflow-hidden pointer-events-none">
          <GravatarAvatar
            name={authorName}
            photoUrl={authorPhotoUrl}
            avatarColor={authorAvatarColor ?? '#0044CC'}
            isPledger={authorHasPledged}
            size="lg"
          />
          <span className="text-xs text-[#1A1A1A]/50 truncate max-w-[80px] text-center">
            {authorName}
          </span>
        </div>
      </div>

      {/* Value renderer — PRIMARY visual element, center stage */}
      <div className="mt-6">
        {children}
      </div>
    </div>
  );
}
