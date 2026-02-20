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
}: PersonRowProps) {
  return (
    <div className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl hover:border-blue-200 transition-colors">
      <Link to={`/p/${slug}`}>
        <GravatarAvatar
          name={name}
          avatarColor={avatarColor}
          photoUrl={avatarUrl ?? undefined}
          size="sm"
          isPledger={isPledger ?? false}
        />
      </Link>
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <Link
          to={`/p/${slug}`}
          className="font-medium truncate hover:text-blue-500 transition-colors"
        >
          {name}
        </Link>
        <EarBadge count={earCount} name={name} className="flex-shrink-0" />
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
