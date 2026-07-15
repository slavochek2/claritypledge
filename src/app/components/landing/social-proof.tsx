import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { CheckCircle } from "lucide-react";
import {
  getFeaturedProfiles,
  getVerifiedProfileCount,
  AVATAR_ROW_LIMIT_MOBILE,
  AVATAR_ROW_LIMIT_DESKTOP,
} from "@/app/data/api";
import type { ProfileSummary, PersonRef } from "@/app/types";
import { PersonAvatar } from "@/components/ui/person-avatar";

/**
 * Hero social-proof blocks extracted from clarity-tax-section so other
 * landing-style pages (e.g. /tree/coach) reuse them instead of copying.
 * Rendering is identical to the original inline markup.
 */

/** Avatar stack + "Join N who've taken the pledge" link. Loads its own data. */
export function PledgerAvatarStack({ className = "" }: { className?: string }) {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    async function loadSocialProof() {
      try {
        const [data, count] = await Promise.all([
          getFeaturedProfiles(),
          getVerifiedProfileCount()
        ]);
        setProfiles(data);
        setTotalCount(count);
      } catch (err) {
        console.error("Failed to load social proof:", err);
      }
    }
    loadSocialProof();
  }, []);

  // Reserve the loaded block's height while the count/avatars load. This block sits at
  // the bottom of the hero's vertically-centered (justify-center, min-h-screen) column,
  // so a 0→content height change here recenters the whole column and the headline visibly
  // jumps (~46px, measured). A fixed-height placeholder keeps the column height constant.
  if (totalCount === 0 || profiles.length === 0)
    return <div className={`min-h-[4.25rem] ${className}`} aria-hidden="true" />;

  // Derive the rows from what will actually be DRAWN, never from the limit. The badge
  // used to compute `totalCount - AVATAR_ROW_LIMIT_*`, but getFeaturedProfiles() slices
  // to MAX_FEATURED_PROFILES (6), so the desktop limit (8) is unreachable and the badge
  // was permanently short by 2 ("Join 691" · 6 avatars · "+683" = 689). Mobile was only
  // correct by luck — its limit (5) happens to sit under the cap. Slicing once and
  // measuring the result keeps the arithmetic true whichever constant moves.
  //
  // Must stay BELOW the early return: several suites mock @/app/data/api partially,
  // without these constants, and rely on the zero-state bailing out before anything
  // reads them. Hoisting these two lines above the guard crashes those renders.
  const shownMobile = profiles.slice(0, AVATAR_ROW_LIMIT_MOBILE);
  const shownDesktop = profiles.slice(0, AVATAR_ROW_LIMIT_DESKTOP);

  return (
    <Link
      to="/pledgers"
      className={`flex flex-col items-center gap-2 group ${className}`}
    >
      {/* Mobile: Show limited avatars. Fixed row height (h-8) reserves space before the
          avatar images paint, so the row never collapses 0→32px and shifts the hero. */}
      <div className="flex h-8 items-center -space-x-2 sm:hidden">
        {shownMobile.map((profile) => (
          <PersonAvatar
            key={profile.id}
            person={{
              name: profile.name,
              slug: profile.slug,
              avatarColor: profile.avatarColor,
              avatarUrl: profile.avatarUrl,
              hasPledged: true, // Featured profiles are verified pledgers
            } satisfies PersonRef}
            size="sm"
            className="w-8 h-8 border-2 border-white/80 transition-transform group-hover:scale-105"
          />
        ))}
        {totalCount > shownMobile.length && (
          <div className="w-8 h-8 rounded-full border-2 border-white/80 bg-slate-300 flex items-center justify-center text-xs font-medium text-slate-600">
            +{totalCount - shownMobile.length}
          </div>
        )}
      </div>
      {/* Desktop: Show more avatars (fixed row height — see mobile note above) */}
      <div className="hidden h-8 sm:flex items-center -space-x-2">
        {shownDesktop.map((profile) => (
          <PersonAvatar
            key={profile.id}
            person={{
              name: profile.name,
              slug: profile.slug,
              avatarColor: profile.avatarColor,
              avatarUrl: profile.avatarUrl,
              hasPledged: true, // Featured profiles are verified pledgers
            } satisfies PersonRef}
            size="sm"
            className="w-8 h-8 border-2 border-white/80 transition-transform group-hover:scale-105"
          />
        ))}
        {totalCount > shownDesktop.length && (
          <div className="w-8 h-8 rounded-full border-2 border-white/80 bg-slate-300 flex items-center justify-center text-xs font-medium text-slate-600">
            +{totalCount - shownDesktop.length}
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground group-hover:text-blue-600 transition-colors">
        Join {totalCount} who've taken the pledge
      </p>
    </Link>
  );
}

/** "Free & open source" trust line. ("Join the movement" removed — redundant
    with the avatar stack's pledge count. The FOSS idiom scopes "free" to the
    software: a bare "Free" contradicted the practitioner-cost FAQ, and
    "Free to try" read as a freemium trial — both founder-rejected.) */
export function TrustSignals() {
  return (
    <p className="text-sm text-muted-foreground flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
      <span className="inline-flex items-center gap-1">
        <CheckCircle className="w-4 h-4 text-blue-500" />
        Free &amp; open source
      </span>
    </p>
  );
}

/**
 * Scroll indicator. Two modes:
 *  - Default (no label/targetId): a bare bouncing down-arrow (unchanged — other callers
 *    rely on this exact output).
 *  - Labelled cue (label + targetId): a button that smooth-scrolls to the target section,
 *    with a slow drift bob (ladischenski.com treatment). Muted, hover → blue (action).
 */
export function ScrollIndicator({
  className = "pt-8",
  label,
  targetId,
}: {
  className?: string;
  label?: string;
  targetId?: string;
}) {
  if (label && targetId) {
    const onClick = () =>
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    return (
      <div className={className}>
        <button
          type="button"
          onClick={onClick}
          className="group mx-auto flex flex-col items-center gap-2 text-muted-foreground transition-colors hover:text-blue-600"
        >
          <span className="text-sm font-medium">{label}</span>
          <svg
            className="w-6 h-6 animate-gentle-drift motion-reduce:animate-none text-muted-foreground/60 transition-colors group-hover:text-blue-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <svg
        className="w-6 h-6 mx-auto text-muted-foreground/50 animate-bounce"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 14l-7 7m0 0l-7-7m7 7V3"
        />
      </svg>
    </div>
  );
}
