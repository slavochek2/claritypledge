import {
  BookOpen,
  Facebook,
  Github,
  Globe,
  Instagram,
  Linkedin,
  Youtube,
  type LucideIcon,
} from "lucide-react";
import {
  normalizeProfileLinks,
  profileLinkDisplayLabel,
  profileLinkKind,
  type ProfileLink,
  type ProfileLinkKind,
} from "@/lib/profile-links";

/**
 * P1259 change 3 — the SUBJECT's own public profiles, below the description.
 *
 * Founder: "descirption for agnets misses clickable social profiel links (of the perosn
 * only)". The parenthesis is the whole specification: Wikipedia, a personal site, YouTube,
 * X, Instagram — never ClarityPledge's own channels, which on a page about someone else
 * would read as the operator's links rather than the subject's.
 *
 * PRESENTATION (founder, 2026-09-08): *"just say something like Twitter and the link, or
 * Instagram and link and so on. Maybe with icons."* Each entry renders as a chip carrying
 * the platform icon and the platform name. The URL itself is not shown — a row of five raw
 * URLs is unreadable at 320px, and the name plus icon is what a reader scans for.
 *
 * SECURITY. Every href goes through `normalizeProfileLinks`, which enforces the `https:`
 * allowlist the spec makes an invariant. The gate is here at render, not only at write:
 * the column is operator-written today, and the invariant is what keeps it safe when that
 * stops being true. See src/lib/profile-links.ts for why the schema cannot carry this.
 *
 * The ICON is chosen by exact host match, never a substring — a link that merely contains
 * "x.com" in a longer host does not get to borrow X's mark. An icon beside a name is a
 * trust claim, so an unrecognised host gets the neutral globe rather than a guess.
 *
 * `rel="noopener noreferrer"` on every anchor — `target="_blank"` without it hands the
 * opened page a live `window.opener` reference.
 *
 * Renders NOTHING when the list is empty or every entry was rejected: "Social links, none
 * set: the row is absent, not an empty placeholder" (spec, UX Notes).
 */

/** Platform → mark. `website` is the neutral fallback, never a guessed brand. */
const KIND_ICONS: Record<Exclude<ProfileLinkKind, "x">, LucideIcon> = {
  wikipedia: BookOpen,
  youtube: Youtube,
  instagram: Instagram,
  linkedin: Linkedin,
  facebook: Facebook,
  github: Github,
  website: Globe,
};

/**
 * lucide-react carries the legacy bird as `Twitter` and has no X mark, so this is inlined.
 * Path is the official wordmark glyph; `aria-hidden` because the visible label already
 * says "X" and a second announcement would double it for a screen reader.
 */
function XMark({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkIcon({ link }: { link: ProfileLink }) {
  const kind = profileLinkKind(link);
  if (kind === "x") return <XMark />;
  const Icon = KIND_ICONS[kind];
  return <Icon size={14} aria-hidden="true" />;
}

/**
 * Whether the icon already IS the platform's name, making the text label a duplicate.
 *
 * Only X qualifies, and it is why this exists: the row rendered the wordmark followed by the
 * word — founder, reading it back, *"we have two Xs, right? XX, that's weird."* Correct. It
 * is the general shape of a logo that SPELLS its name sitting beside that name, not a special
 * case: Wikipedia's book, YouTube's play button and Instagram's camera are pictograms, none
 * of them spell anything, so all of them keep their label.
 *
 * The label never leaves the ACCESSIBLE name — `aria-label` on the anchor still says "X", so
 * a screen reader hears the platform even though the eye reads only the mark. An
 * operator-supplied label always wins and is always shown: an X link deliberately labelled
 * "Connor's posts" is a decision, not a duplicate.
 */
function iconSpellsItsOwnName(link: ProfileLink): boolean {
  const hasOperatorLabel = typeof link.label === "string" && link.label.trim() !== "";
  return !hasOperatorLabel && profileLinkKind(link) === "x";
}

export function ProfileSubjectLinks({
  links,
  subjectName,
  className = "",
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
      className={`flex flex-wrap items-center gap-x-4 gap-y-0 ${className}`}
    >
      {safe.map((link) => {
        const label = profileLinkDisplayLabel(link);
        return (
          <li key={link.url}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="profile-subject-link"
              data-link-kind={profileLinkKind(link)}
              aria-label={`${label} — ${subjectName}'s own page, opens in a new tab`}
              className="inline-flex min-h-[40px] items-center gap-1.5 text-sm text-foreground/80 transition-colors hover:text-foreground hover:underline"
            >
              <LinkIcon link={link} />
              {iconSpellsItsOwnName(link) ? null : label}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export default ProfileSubjectLinks;
