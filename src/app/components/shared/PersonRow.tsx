/**
 * @file PersonRow.tsx
 * @description Shared component for displaying a person row with avatar, name, and optional action.
 * Used in Dashboard (people from events) and EventDetail (participants list).
 */
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";
import { EarBadge } from "@/components/ui/ear-badge";

export interface PersonRowProps {
  profileId: string;
  slug: string;
  name: string;
  avatarColor: string;
  avatarUrl?: string | null;
  /** Whether this person has signed the pledge (shows blue ring around avatar) */
  isPledger?: boolean;
  /** Number of confirmed understanding events */
  earCount?: number;
  /** Show status label or nothing */
  action?: "going" | "attended" | "none";
  /**
   * Whether the avatar and name link to /p/:slug. Defaults to true.
   * P1114 sets this false for event-room walk-ins, who have no profile — without it
   * every guest row on the projected roster renders `<Link to="/p/">`, a dead end.
   */
  linkToProfile?: boolean;
  /**
   * "lg" enlarges the avatar, name, and ear badge — for a projected/wall view where
   * the row needs to read from across a room. Defaults to "sm", unchanged from every
   * pre-existing caller. P1114's room Present mode is the first "lg" consumer.
   */
  size?: "sm" | "lg";
}

export function PersonRow({
  profileId: _profileId, // Used by parent as React key
  slug,
  name,
  avatarColor,
  avatarUrl,
  isPledger,
  earCount = 0,
  action = "none",
  // P1114: room walk-ins have no profile, so there is nothing to link to. Defaults to
  // true so every pre-existing caller keeps its current behaviour unchanged.
  linkToProfile = true,
  size = "sm",
}: PersonRowProps) {
  const wrapLink = (children: React.ReactNode) =>
    linkToProfile ? <Link to={`/p/${slug}`}>{children}</Link> : <>{children}</>;
  return (
    <div className={`flex items-center gap-3 bg-card border border-border rounded-xl hover:border-blue-200 transition-colors ${size === "lg" ? "p-5" : "p-4"}`}>
      {wrapLink(
        <GravatarAvatar
          name={name}
          avatarColor={avatarColor}
          photoUrl={avatarUrl ?? undefined}
          size={size === "lg" ? "lg" : "sm"}
          isPledger={isPledger ?? false}
        />
      )}
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        {linkToProfile ? (
          <Link
            to={`/p/${slug}`}
            className={`font-medium truncate hover:text-blue-500 transition-colors ${size === "lg" ? "text-lg" : ""}`}
          >
            {name}
          </Link>
        ) : (
          <span className={`font-medium truncate ${size === "lg" ? "text-lg" : ""}`}>{name}</span>
        )}
        <EarBadge count={earCount} name={name} size={size === "lg" ? 16 : 12} className="flex-shrink-0" />
      </div>
      {action === "going" && (
        <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-50 text-green-700 border border-green-200">
          <CheckCircle2 className="w-3 h-3" />
          Going
        </span>
      )}
      {action === "attended" && (
        <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-50 text-green-700 border border-green-200">
          <CheckCircle2 className="w-3 h-3" />
          Attended
        </span>
      )}
    </div>
  );
}
