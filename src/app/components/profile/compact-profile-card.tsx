/**
 * @file compact-profile-card.tsx
 * @description P75: Compact horizontal profile card with avatar on left, name/role on right
 * P76: Refactored to use GravatarAvatar for consistent pledger distinction
 * Features: 64px avatar, blue ring + badge for pledgers, share button, pledge CTAs
 */

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Share2, LinkedinIcon } from "lucide-react";
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";
import { toast } from "sonner";
import type { Profile } from "@/app/types";
import { linkifyText } from "@/app/utils/linkify";

interface CompactProfileCardProps {
  profile: Profile;
  isOwner: boolean;
}

export function CompactProfileCard({ profile, isOwner }: CompactProfileCardProps) {
  const hasPledged = profile.hasPledged;

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
      <div className="flex items-start gap-4">
        {/* P76: Use GravatarAvatar for consistent pledger distinction */}
        <div data-testid="avatar-container" className="flex-shrink-0">
          <GravatarAvatar
            name={profile.name}
            size="lg"
            avatarColor={profile.avatarColor}
            photoUrl={profile.avatarUrl}
            isPledger={hasPledged}
                      />
        </div>

        {/* Name and Role */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground truncate">
              {profile.name}
            </h1>
            {profile.linkedinUrl && (
              <a
                href={profile.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${profile.name}'s LinkedIn profile`}
                className="flex-shrink-0 text-[#0A66C2] opacity-70 hover:opacity-100 transition-opacity"
              >
                <LinkedinIcon className="w-4 h-4" aria-hidden="true" />
              </a>
            )}
          </div>
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
              See my Clarity Pledge →
            </Link>
          )
        )}
      </div>

      {/* Bio — below pledge, separated by divider */}
      {profile.bio && (
        <div className="mt-4 pt-4 border-t">
          <p
            data-testid="profile-bio"
            className="text-sm text-muted-foreground break-words"
          >
            {linkifyText(profile.bio)}
          </p>
        </div>
      )}
    </div>
  );
}
