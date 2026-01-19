/**
 * @file PersonRow.tsx
 * @description Shared component for displaying a person row with avatar, name, and optional action.
 * Used in Dashboard (people from events) and EventDetail (participants list).
 */
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";
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
  profileId: _profileId, // Used by parent as React key
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
          size="sm"
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
          className="px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors whitespace-nowrap flex-shrink-0"
        >
          Start Session
        </Link>
      )}
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
