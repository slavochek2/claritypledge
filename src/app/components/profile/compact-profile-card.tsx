/**
 * @file compact-profile-card.tsx
 * @description P75: Compact horizontal profile card with avatar on left, name/role on right
 * Features: 64px avatar, blue ring for pledgers, share button, pledge CTAs
 */

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Share2 } from "lucide-react";
import { getInitials, getAvatarColor } from "@/lib/utils";
import { toast } from "sonner";
import type { Profile } from "@/app/types";

interface CompactProfileCardProps {
  profile: Profile;
  isOwner: boolean;
}

export function CompactProfileCard({ profile, isOwner }: CompactProfileCardProps) {
  const hasPledged = profile.hasPledged;
  const avatarColor = getAvatarColor(profile.name, profile.avatarColor);

  const handleShare = async () => {
    const profileUrl = `${window.location.origin}/p/${profile.slug}`;
    try {
      await navigator.clipboard.writeText(profileUrl);
      toast.success("Profile URL copied to clipboard");
    } catch {
      toast.error("Failed to copy URL");
    }
  };

  return (
    <div
      data-testid="compact-profile-card"
      className="bg-card border rounded-lg shadow-sm p-6"
    >
      {/* Top row: Avatar + Name/Role + Share button */}
      <div className="flex items-center gap-4">
        {/* Avatar with optional blue ring for pledgers */}
        <div
          data-testid="avatar-container"
          className={`flex-shrink-0 rounded-full ${
            hasPledged ? "p-1 bg-blue-500" : ""
          }`}
        >
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.name}
              data-testid="profile-avatar"
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div
              data-testid="profile-avatar"
              className={`w-16 h-16 rounded-full ${avatarColor} flex items-center justify-center text-white text-xl font-bold`}
            >
              {getInitials(profile.name)}
            </div>
          )}
        </div>

        {/* Name and Role */}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground truncate">
            {profile.name}
          </h1>
          {profile.role && (
            <p className="text-sm text-muted-foreground truncate">
              {profile.role}
            </p>
          )}
        </div>

        {/* Share button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleShare}
          aria-label="Share profile"
          className="flex-shrink-0"
        >
          <Share2 className="w-5 h-5" />
        </Button>
      </div>

      {/* Pledge section */}
      <div className="mt-4 pt-4 border-t">
        {isOwner ? (
          // Owner viewing their own profile
          hasPledged ? (
            <Link to={`/p/${profile.slug}/pledge`}>
              <Button className="w-full bg-blue-500 hover:bg-blue-600 text-white">
                View My Pledge
              </Button>
            </Link>
          ) : (
            <Link to="/sign-pledge?prefill=true">
              <Button className="w-full bg-blue-500 hover:bg-blue-600 text-white">
                Take the Pledge
              </Button>
            </Link>
          )
        ) : (
          // Visitor viewing someone else's profile
          hasPledged && (
            <Link
              to={`/p/${profile.slug}/pledge`}
              className="text-blue-500 hover:text-blue-600 font-medium inline-flex items-center gap-1"
            >
              View their pledge →
            </Link>
          )
        )}
      </div>
    </div>
  );
}
