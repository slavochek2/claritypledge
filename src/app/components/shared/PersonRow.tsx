/**
 * @file PersonRow.tsx
 * @description Shared component for displaying a person row with avatar, name, and optional action.
 * Used in Dashboard (people from events) and EventDetail (participants list).
 */
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";

export interface PersonRowProps {
  profileId: string;
  slug: string;
  name: string;
  avatarColor: string;
  avatarUrl?: string | null;
  /** Whether this person has signed the pledge (shows blue ring around avatar) */
  isPledger?: boolean;
  /** Show status label or nothing */
  action?: "going" | "attended" | "none";
  /** If true, don't render as links (used when PersonRow is wrapped in button for P124) */
  disableLinks?: boolean;
}

export function PersonRow({
  profileId: _profileId, // Used by parent as React key
  slug,
  name,
  avatarColor,
  avatarUrl,
  isPledger,
  action = "none",
  disableLinks = false,
}: PersonRowProps) {
  const AvatarWrapper = disableLinks ? 'div' : Link;
  const NameWrapper = disableLinks ? 'div' : Link;

  return (
    <div className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl hover:border-blue-200 transition-colors">
      <AvatarWrapper {...(!disableLinks && { to: `/p/${slug}` })}>
        <GravatarAvatar
          name={name}
          avatarColor={avatarColor}
          photoUrl={avatarUrl}
          size="sm"
          isPledger={isPledger}
        />
      </AvatarWrapper>
      <NameWrapper
        {...(!disableLinks && {
          to: `/p/${slug}`,
          className: "flex-1 min-w-0 font-medium truncate hover:text-blue-500 transition-colors"
        })}
        {...(disableLinks && {
          className: "flex-1 min-w-0 font-medium truncate"
        })}
      >
        {name}
      </NameWrapper>
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
