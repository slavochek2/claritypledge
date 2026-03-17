/**
 * @file compact-profile-card.tsx
 * @description P75: Compact horizontal profile card with avatar on left, name/role on right
 * P76: Refactored to use GravatarAvatar for consistent pledger distinction
 * Features: 64px avatar, blue ring + badge for pledgers, share button, pledge CTAs
 */

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Share2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";
import { toast } from "sonner";
import type { Profile } from "@/app/types";
import { linkifyText } from "@/app/utils/linkify";

const LinkedInBrandIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

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
          <h1 className="text-xl font-bold text-foreground truncate">
            {profile.name}
          </h1>
          {(profile.role || profile.linkedinUrl) && (
            <div className="flex items-center gap-1.5">
              {profile.role && (
                <p className="text-sm text-muted-foreground break-words">{profile.role}</p>
              )}
              {profile.linkedinUrl && (
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={profile.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${profile.name}'s LinkedIn profile`}
                        className="flex-shrink-0 text-[#0A66C2] opacity-60 hover:opacity-100 transition-opacity"
                      >
                        <LinkedInBrandIcon className="w-3.5 h-3.5" />
                      </a>
                    </TooltipTrigger>
                    <TooltipContent>Open LinkedIn profile</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
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
