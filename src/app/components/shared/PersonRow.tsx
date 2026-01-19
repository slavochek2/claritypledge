/**
 * @file PersonRow.tsx
 * @description Shared component for displaying a person row with avatar, name, and optional action.
 * Used in Dashboard (people from events) and EventDetail (participants list).
 */
import { Link } from "react-router-dom";
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";
import { ClarityLogo } from "@/components/ui/clarity-logo";
import { analytics } from "@/lib/mixpanel";

export interface PersonRowProps {
  profileId: string;
  slug: string;
  name: string;
  avatarColor: string;
  avatarUrl?: string | null;
  /** Show invite button, status label, or nothing */
  action?: "invite" | "going" | "attended" | "none";
  /** Analytics source for invite clicks */
  inviteSource?: string;
}

export function PersonRow({
  slug,
  name,
  avatarColor,
  avatarUrl,
  action = "none",
  inviteSource = "person_row",
}: PersonRowProps) {
  return (
    <div className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl hover:border-blue-200 transition-colors">
      <Link to={`/p/${slug}`}>
        <GravatarAvatar
          name={name}
          avatarColor={avatarColor}
          photoUrl={avatarUrl}
          size="md"
        />
      </Link>
      <Link
        to={`/p/${slug}`}
        className="flex-1 min-w-0 font-medium truncate hover:text-blue-500 transition-colors"
      >
        {name}
      </Link>
      {action === "invite" && (
        <Link
          to="/live"
          onClick={() =>
            analytics.track("meeting_invite_clicked", { source: inviteSource })
          }
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors"
        >
          <ClarityLogo size="xs" iconOnly className="[&_svg]:w-4 [&_svg]:h-4" />
          <span className="hidden sm:inline">Start Meeting</span>
        </Link>
      )}
      {action === "going" && (
        <span className="text-xs text-muted-foreground font-medium">Going</span>
      )}
      {action === "attended" && (
        <span className="text-xs text-muted-foreground font-medium">
          Attended
        </span>
      )}
    </div>
  );
}
