/**
 * @file letter-participant-row.tsx
 * @description P725: Shared identity row used on letter-reading and letter-results pages
 * to surface the other participant's avatar + name. Links to /p/:slug when the profile
 * has a public handle; falls back to plain text when slug is null/missing.
 * Null guard kept defensively: RPC type is string|null even though DB enforces NOT NULL (P736).
 *
 * Consistency rule (AD5): one component owns the fallback chain, truncation, and
 * stopPropagation discipline — no per-surface copies.
 */

import { Link } from 'react-router-dom';
import { PersonAvatar } from '@/components/ui/person-avatar';
import type { PersonRef } from '@/app/types';

interface LetterParticipantRowProps {
  name: string | null | undefined;
  slug?: string | null;
  avatarUrl?: string | null;
  avatarColor?: string;
  hasPledged?: boolean;
  /** "Letter from" (recipient view), "Letter to" (author view), or "From" (reading cover). */
  roleLabel: string;
  className?: string;
}

export function LetterParticipantRow({
  name,
  slug,
  avatarUrl,
  avatarColor,
  hasPledged = false,
  roleLabel,
  className,
}: LetterParticipantRowProps) {
  // Fallback chain: full_name → slug → "Someone" (never email prefix).
  const displayName = (name && name.trim()) || slug || 'Someone';

  const person: PersonRef = {
    name: displayName,
    slug: slug ?? undefined,
    avatarColor,
    avatarUrl: avatarUrl ?? null,
    hasPledged,
  };

  const nameClass = 'font-medium text-foreground max-w-[24ch] sm:max-w-[40ch] truncate';

  return (
    <div
      className={`flex items-center gap-2 ${className ?? ''}`}
      aria-label={`${roleLabel} ${displayName}`}
    >
      <PersonAvatar person={person} size="sm" />
      <span className="text-sm text-muted-foreground">{roleLabel}</span>
      {slug ? (
        <Link
          to={`/p/${slug}`}
          onClick={(e) => e.stopPropagation()}
          className={`${nameClass} min-h-[40px] inline-flex items-center hover:underline`}
          title={displayName}
        >
          {displayName}
        </Link>
      ) : (
        <span className={nameClass} title={displayName}>
          {displayName}
        </span>
      )}
    </div>
  );
}
