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
}: GravatarAvatarProps) {
  const [imageError, setImageError] = useState(false);

  // Show photo if we have a URL and it hasn't errored
  const showImage = photoUrl && !imageError;

  const ringVisible = showRing ?? isPledger;
  const pledgerRingClass = ringVisible ? ringClasses[size] : "";

  return (
    <div className="relative inline-block" data-testid="gravatar-avatar-wrapper">
      <div
        data-testid="gravatar-avatar"
        className={`rounded-full flex-shrink-0 overflow-hidden ${sizeClasses[size]} ${pledgerRingClass} ${className} ${!showImage ? "flex items-center justify-center text-white font-bold" : ""}`}
        style={{ backgroundColor: showImage ? "transparent" : (avatarColor || "#0044CC") }}
      >
        {showImage ? (
          <img
            src={photoUrl}
            alt={`${name}'s avatar`}
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
