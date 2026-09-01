/**
 * @file letter-participant-row.tsx
 * @description P725: Shared identity row used on letter-reading and letter-results pages
 * to surface the other participant's avatar + name. Links to /p/:slug when the profile
 * has a public handle; falls back to plain text when slug is null/missing.
 * Null guard kept defensively: RPC type is string|null even though DB enforces NOT NULL (P736).
 *
 * Visual order: role label → compact avatar → name. The avatar uses the shared
 * GravatarAvatar primitive with a 24px size override + ring suppression — gives
 * the same Google-photo loading discipline (`referrerPolicy="no-referrer"` +
 * `onError → initials` fallback) as every other avatar surface in the app.
 *
 * Consistency rule (AD5): one component owns the fallback chain, truncation, and
 * stopPropagation discipline — no per-surface copies. P852 Phase-3 extended this
 * to the avatar primitive itself (was an inline CompactAvatar with no error
 * handling, which broke when Google's lh3.googleusercontent.com transient-failed).
 */

import { Link } from 'react-router-dom';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';

interface LetterParticipantRowProps {
  name: string | null | undefined;
  slug?: string | null;
  avatarUrl?: string | null;
  avatarColor?: string;
  /** P852 Round-E: pledger ring restored. Ring + ring-offset can extend ~4px beyond
   * the 24px avatar, which is acceptable — semantic correctness (showing pledger status)
   * outweighs minor visual clipping. If clipping is observed under tight parent overflow,
   * scope the override per-consumer rather than re-suppressing here. */
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
  hasPledged,
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
      <GravatarAvatar
        name={displayName}
        photoUrl={avatarUrl ?? undefined}
        avatarColor={avatarColor}
        isPledger={hasPledged ?? false}
        size="sm"
        className="!w-6 !h-6 !text-[10px]"
      />
      {slug ? (
        <Link
          to={`/p/${slug}`}
          onClick={(e) => e.stopPropagation()}
          className={`${nameClass} min-h-10 inline-flex items-center hover:underline`}
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
