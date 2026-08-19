import { useState } from "react";
import { getInitials } from "@/lib/utils";
import { Check, Shield } from "lucide-react";

interface GravatarAvatarProps {
  /** @deprecated Unused - kept for API compatibility. TODO: Remove in future cleanup. */
  email?: string;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  avatarColor?: string;
  className?: string;
  /** Direct photo URL (e.g., from Google OAuth) */
  photoUrl?: string;
  /** Shows static blue ring around avatar (Instagram/Telegram-style with white gap).
   * REQUIRED — pass false explicitly for non-pledgers. Never omit. */
  isPledger: boolean;
  /** Override ring visibility. Defaults to isPledger value.
   * Use showRing={false} to suppress ring at small sizes where it clips. */
  showRing?: boolean;
  /** Shows checkmark badge at bottom-right */
  showPledgeBadge?: boolean;
  /** Shows Clarity Badge (Shield icon) at bottom-left — distinct from pledge badge */
  showBadge?: boolean;
  /** Number of verified badge points — used in aria-label when showBadge is true */
  badgeCount?: number;
  /** P1104: this profile is a machine's reading of a person, not the person.
   *
   * Renders a SQUARE silhouette where every person is a circle, and forces the pledger
   * ring off regardless of `isPledger`. The square is the channel that survives 20px:
   * measured 2026-08-19, a robotified portrait and the source photograph are
   * indistinguishable at the position row's `!w-5 !h-5`, because the panel seams and
   * sensor eyes fall below the pixel grid. The shape does not.
   *
   * The ring suppression is defensive — the creation RPC already sets has_pledged false —
   * because a ring on an agent row is the single strongest human-trust signal the
   * disclosure exists to withhold. */
  isAgent?: boolean;
  /** P1104: the agent registry has not resolved yet, so it is not yet known whether this
   * profile is a person or a machine's reading of one.
   *
   * While true the pledge ring is withheld. The shape stays circular — squaring
   * speculatively would mark real people as machines, which is the harm the
   * black-and-white-photo finding rules out — so during this window the disclosure rests
   * on the name channel ("Agent · {subject}"), which is present in profiles.name from the
   * moment the account exists and needs no lookup at all.
   *
   * Withholding rather than blanking the page is deliberate: it covers every surface
   * including those with no page-level loading state, and it does not make a shared card
   * component depend on where in a page's fetch order it happens to mount. */
  identityPending?: boolean;
}

const sizeClasses = {
  sm: "w-10 h-10 text-sm",
  md: "w-14 h-14 text-lg",
  lg: "w-16 h-16 text-xl",
  xl: "w-24 h-24 text-2xl",
};

// Static ring with white gap (Instagram/Telegram-style) - no animation
const ringClasses = {
  sm: "ring-2 ring-blue-500 ring-offset-2 ring-offset-background",
  md: "ring-2 ring-blue-500 ring-offset-2 ring-offset-background",
  lg: "ring-[3px] ring-blue-500 ring-offset-[3px] ring-offset-background",
  xl: "ring-[3px] ring-blue-500 ring-offset-[3px] ring-offset-background",
};

// Badge sizes relative to avatar
const badgeClasses = {
  sm: "w-4 h-4 -bottom-0.5 -right-0.5",
  md: "w-5 h-5 -bottom-0.5 -right-0.5",
  lg: "w-6 h-6 -bottom-1 -right-1",
  xl: "w-7 h-7 -bottom-1 -right-1",
};

// Clarity Badge (showBadge) — bottom-left, mirrors badgeClasses positioning
const clarityBadgeClasses = {
  sm: "w-4 h-4 -bottom-0.5 -left-0.5",
  md: "w-5 h-5 -bottom-0.5 -left-0.5",
  lg: "w-6 h-6 -bottom-1 -left-1",
  xl: "w-7 h-7 -bottom-1 -left-1",
};

const badgeIconClasses = {
  sm: "w-2.5 h-2.5",
  md: "w-3 h-3",
  lg: "w-3.5 h-3.5",
  xl: "w-4 h-4",
};

export function GravatarAvatar({
  name,
  size = "md",
  avatarColor = "#0044CC",
  className = "",
  photoUrl,
  isPledger,
  showRing,
  showPledgeBadge = false,
  showBadge = false,
  badgeCount,
  isAgent = false,
  identityPending = false,
}: GravatarAvatarProps) {
  const [imageError, setImageError] = useState(false);

  // Show photo if we have a URL and it hasn't errored
  const showImage = photoUrl && !imageError;

  // P1104: an agent account never carries the pledger ring, whatever the caller passed —
  // and neither does an account whose membership is not yet known.
  const ringVisible = (isAgent || identityPending) ? false : (showRing ?? isPledger);
  const pledgerRingClass = ringVisible ? ringClasses[size] : "";

  // Square at every size. `rounded-sm` (not `rounded-none`) keeps the corner treatment
  // consistent with the design system's other square surfaces while staying
  // unmistakably not-a-circle at 20px.
  const shapeClass = isAgent ? "rounded-sm" : "rounded-full";

  return (
    <div className="relative inline-block" data-testid="gravatar-avatar-wrapper">
      <div
        data-testid="gravatar-avatar"
        {...(ringVisible ? { "data-pledger": "true" } : {})}
        {...(isAgent ? { "data-agent": "true" } : {})}
        className={`${shapeClass} flex-shrink-0 overflow-hidden ${sizeClasses[size]} ${pledgerRingClass} ${className} ${!showImage ? "flex items-center justify-center text-white font-bold" : ""}`}
        style={{ backgroundColor: showImage ? "transparent" : (avatarColor || "#0044CC") }}
      >
        {showImage ? (
          <img
            src={photoUrl}
            alt={isAgent ? `Avatar for ${name}, a machine-generated reading` : `${name}'s avatar`}
            className="w-full h-full object-cover block"
            onError={() => setImageError(true)}
            referrerPolicy="no-referrer"
          />
        ) : (
          getInitials(name)
        )}
      </div>
      {showPledgeBadge && (
        <div
          role="img"
          className={`absolute ${badgeClasses[size]} bg-blue-500 rounded-full flex items-center justify-center border-2 border-white`}
          aria-label="Verified pledger"
        >
          <Check aria-hidden="true" className={`${badgeIconClasses[size]} text-white`} />
        </div>
      )}
      {showBadge && (
        <div
          role="img"
          className={`absolute ${clarityBadgeClasses[size]} bg-white rounded-full flex items-center justify-center border-2 border-white`}
          aria-label={`Has Clarity Badge — ${badgeCount ?? 0} of 9 points verified`}
        >
          <Shield aria-hidden="true" className={`${badgeIconClasses[size]} text-amber-500`} />
        </div>
      )}
    </div>
  );
}
