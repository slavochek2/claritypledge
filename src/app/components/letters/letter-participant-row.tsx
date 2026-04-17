/**
 * @file letter-participant-row.tsx
 * @description P725: Shared identity row used on letter-reading and letter-results pages
 * to surface the other participant's avatar + name. Links to /p/:slug when the profile
 * has a public handle; falls back to plain text when slug is null/missing.
 * Null guard kept defensively: RPC type is string|null even though DB enforces NOT NULL (P736).
 *
 * Visual order: role label → compact avatar → name. The avatar is rendered inline
 * at 24px (bypasses PersonAvatar since the 40px `size="sm"` reads as a standalone
 * profile avatar in this context). Pledge ring is intentionally omitted at this
 * size — it's a decorative indicator that clips/overwhelms at 24px.
 *
 * Consistency rule (AD5): one component owns the fallback chain, truncation, and
 * stopPropagation discipline — no per-surface copies.
 */

import { Link } from 'react-router-dom';

interface LetterParticipantRowProps {
  name: string | null | undefined;
  slug?: string | null;
  avatarUrl?: string | null;
  avatarColor?: string;
  /**
   * @deprecated P725 — compact 24px avatar drops the pledge ring (ring-offset clips at this size).
   * Kept in the prop list so call sites don't break; restore the ring visual by adding an `xs`
   * size to the shared PersonAvatar/GravatarAvatar system.
   */
  hasPledged?: boolean;
  /** "Letter from" (recipient view), "Letter to" (author view), or "From" (reading cover). */
  roleLabel: string;
  className?: string;
}

function CompactAvatar({
  name,
  avatarUrl,
  avatarColor,
}: {
  name: string;
  avatarUrl?: string | null;
  avatarColor?: string;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        aria-hidden="true"
        className="w-6 h-6 rounded-full object-cover flex-shrink-0"
      />
    );
  }
  // Spread-index the first word glyph so emoji and multi-codepoint scripts
  // (surrogate pairs) aren't split into broken half-characters.
  const initials = name
    .split(/\s+/)
    .map((w) => [...w][0])
    .filter((c): c is string => Boolean(c))
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div
      aria-hidden="true"
      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium text-white flex-shrink-0"
      style={{ backgroundColor: avatarColor ?? '#3B82F6' }}
    >
      {initials || '?'}
    </div>
  );
}

export function LetterParticipantRow({
  name,
  slug,
  avatarUrl,
  avatarColor,
  roleLabel,
  className,
}: LetterParticipantRowProps) {
  // Fallback chain: full_name → slug → "Someone" (never email prefix).
  const displayName = (name && name.trim()) || slug || 'Someone';

  const nameClass = 'font-medium text-foreground max-w-[24ch] sm:max-w-[40ch] truncate';

  return (
    <div
      className={`flex items-center gap-2 ${className ?? ''}`}
      aria-label={`${roleLabel} ${displayName}`}
    >
      <span className="text-sm text-muted-foreground">{roleLabel}</span>
      <CompactAvatar name={displayName} avatarUrl={avatarUrl} avatarColor={avatarColor} />
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
