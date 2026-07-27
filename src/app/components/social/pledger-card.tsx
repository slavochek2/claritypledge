import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";
import { analytics } from "@/lib/mixpanel";

export interface PledgerCardProps {
  /** Profile ID - kept for API compatibility with ProfileSummary type */
  id?: string;
  slug: string;
  name: string;
  role?: string;
  reason?: string;
  signedAt: string;
  avatarColor?: string;
  /** P63: Direct photo URL (e.g., from Google OAuth) */
  avatarUrl?: string;
  witnessCount?: number;
  reciprocations?: number;
  showStats?: boolean;
  showDate?: boolean;
  /** P1010: optional inline label beside the name (e.g. "Organizer"). */
  badge?: string;
  /**
   * P1010: who this card represents. `pledger` (default, /pledgers) — everyone in
   * the list has a pledge, so the card opens the pledge certificate and shows the
   * pledge ring. `member` (org rosters) — membership does NOT imply a pledge, so
   * it opens the person's PROFILE and takes the ring from `isPledger`.
   *
   * Not one generic `to` prop: the destination, the footer label, the ring, and
   * the click event all have to move together. Splitting them into four
   * independent props is how you end up with a card that links to a profile while
   * still saying "Open Pledge".
   */
  variant?: "pledger" | "member";
  /**
   * Only read when `variant="member"`. Whether this person has taken the pledge —
   * drives the avatar ring. Defaults FALSE so an unknown value under-claims.
   */
  isPledger?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function PledgerCard({
  slug,
  name,
  role,
  reason,
  signedAt,
  avatarColor = "#0044CC",
  avatarUrl,
  witnessCount = 0,
  reciprocations = 0,
  showStats = true,
  showDate = true,
  badge,
  variant = "pledger",
  isPledger = false,
  className = "",
  style,
}: PledgerCardProps) {
  const isMemberCard = variant === "member";
  // A member without a pledge has no pledge certificate: /p/:slug/pledge renders
  // "not found" for them (pledge-page.tsx guards on profile.hasPledged). Their
  // profile is the only page that always exists.
  const href = isMemberCard ? `/p/${slug}` : `/p/${slug}/pledge`;
  const showPledgeRing = isMemberCard ? isPledger : true;

  return (
    <Link
      to={href}
      className={`group border border-border rounded-lg p-6 bg-card hover:shadow-lg hover:border-blue-500/50 transition-all duration-200 flex flex-col h-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none ${className}`}
      style={style}
      // Only the pledger list fires this. An org roster click is not a pledger-card
      // click, and reporting it as one would inflate the existing Mixpanel series
      // with traffic that never touched /pledgers. A dedicated org-roster event is
      // a founder/analytics call, not something to invent here.
      onClick={isMemberCard ? undefined : () => analytics.track('pledger_card_clicked', { pledger_slug: slug })}
    >
      {/* Avatar and Info */}
      <div className="flex items-start gap-4 mb-4">
        {/* GravatarAvatar - will show initials fallback since no email in public lists */}
        {/* P63: Now also supports photoUrl from Google OAuth */}
        {/* P76: pledger cards show the pledger distinction. P1010: org member cards
            show it only when the member actually pledged — see `variant`. */}
        <GravatarAvatar
          name={name}
          size="lg"
          avatarColor={avatarColor}
          photoUrl={avatarUrl}
          isPledger={showPledgeRing}
        />
        <div className="flex-1 min-w-0">
          {/* Badge sits BELOW the name, not beside it: as a flex-shrink-0 sibling of a
              truncating <h3> it ate the name's width, so "Vyacheslav Ladischenski"
              rendered as "Vyaches…". Callers without a badge (/pledgers) are
              unaffected — the h3 is the only child and still spans the full width. */}
          <div className="flex flex-col items-start gap-1 mb-1">
            {/* line-clamp-2, NOT truncate: at 3 columns a card gives the name ~200px,
                and a full name like "Vyacheslav Ladischenski" needs ~215px — so
                truncate cut it on the FIRST line with empty space right below it.
                Moving the badge out of the name row (see below) was necessary but
                not sufficient; the remaining cause was plain column width. Two lines
                fit inside the fixed 340px card height with room to spare. */}
            <h3 className="w-full text-lg font-bold line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {name}
            </h3>
            {badge && (
              <span className="flex-shrink-0 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 rounded-full px-2 py-0.5">
                {badge}
              </span>
            )}
          </div>
          {role && (
            <p className="text-sm text-muted-foreground truncate">{role}</p>
          )}
        </div>
      </div>

      {/* Reason - if provided */}
      {reason && (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground italic">
            "{reason}"
          </p>
        </div>
      )}

      {/* Stats */}
      {showStats && (
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border mt-4">
          <TooltipProvider>
            <div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="cursor-help">
                    <p className="text-2xl font-bold text-foreground">
                      {witnessCount}
                    </p>
                    <p className="text-xs text-muted-foreground">Witnessed By</p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">People who witnessed their pledge</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="cursor-help">
                    <p className="text-2xl font-bold text-foreground">
                      {reciprocations}
                    </p>
                    <p className="text-xs text-muted-foreground">Pledged After</p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">People who pledged after them</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      )}

      {/* Signed Date */}
      {showDate && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Signed on{" "}
            {new Date(signedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
      )}

      {/* Spacer to push the open-link to bottom */}
      <div className="flex-grow" />

      {/* Open link - always visible on mobile, hover on desktop. Must name the same
          destination `href` points at. */}
      <div className="flex items-center justify-end mt-4 text-sm text-muted-foreground md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        <span>{isMemberCard ? "Open Profile" : "Open Pledge"}</span>
      </div>
    </Link>
  );
}
