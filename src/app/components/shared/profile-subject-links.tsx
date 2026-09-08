import { ExternalLink } from 'lucide-react';
import { normalizeProfileLinks, profileLinkLabel } from '@/lib/profile-links';

/**
 * P1259 change 3 — the SUBJECT's own public profiles, below the description.
 *
 * Founder: "descirption for agnets misses clickable social profiel links (of the perosn
 * only)". The parenthesis is the whole specification: Wikipedia, a personal site, YouTube,
 * X, Instagram — never ClarityPledge's own channels, which on a page about someone else
 * would read as the operator's links rather than the subject's.
 *
 * SECURITY. Every href goes through `normalizeProfileLinks`, which enforces the `https:`
 * allowlist the spec makes an invariant. The gate is here at render, not only at write:
 * the column is operator-written today, and the invariant is what keeps it safe when that
 * stops being true. See src/lib/profile-links.ts for why the schema cannot carry this.
 *
 * `rel="noopener noreferrer"` on every anchor — `target="_blank"` without it hands the
 * opened page a live `window.opener` reference.
 *
 * Renders NOTHING when the list is empty or every entry was rejected: "Social links, none
 * set: the row is absent, not an empty placeholder" (spec, UX Notes).
 */
export function ProfileSubjectLinks({
  links,
  subjectName,
  className = '',
}: {
  /** Raw `profiles.links` JSONB. Any shape — it is validated, not trusted. */
  links: unknown;
  /** Whose links these are. Used for the accessible name only. */
  subjectName: string;
  className?: string;
}) {
  const safe = normalizeProfileLinks(links);
  if (safe.length === 0) return null;

  return (
    <ul
      data-testid="profile-subject-links"
      className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}
    >
      {safe.map((link) => (
        <li key={link.url}>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="profile-subject-link"
            aria-label={`${profileLinkLabel(link)} — ${subjectName}'s own page, opens in a new tab`}
            className="inline-flex min-h-[40px] items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            {profileLinkLabel(link)}
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  );
}

export default ProfileSubjectLinks;
