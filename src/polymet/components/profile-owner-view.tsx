import { Link } from "react-router-dom";
import { type Profile } from "@/polymet/data/api";
import { ProfileCertificate } from "@/polymet/components/profile-certificate";
import { WitnessList } from "@/polymet/components/witness-list";
import { ShareTools } from "@/polymet/components/share-tools";
import { InviteEndorsers } from "@/polymet/components/invite-endorsers";
import { UsersIcon, RepeatIcon, MailIcon, StampIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProfileOwnerViewProps {
  profile: Profile;
  profileUrl: string;
}

export function ProfileOwnerView({
  profile,
  profileUrl,
}: ProfileOwnerViewProps) {
  return (
    <div className="space-y-12">
      {/* Seal Your Pledge Action Card */}
      {!profile.isVerified && (
        <div className="relative overflow-hidden rounded-xl border-2 border-[#0044CC]/20 bg-[#0044CC]/5 dark:bg-[#0044CC]/10 p-6 md:p-8">
          <div className="flex flex-col md:flex-row items-start gap-6">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[#0044CC]/10 flex items-center justify-center text-[#0044CC] dark:text-blue-400">
              <StampIcon className="w-6 h-6" />
            </div>
            
            <div className="flex-1 space-y-4">
              <div>
                <h3 className="text-xl font-serif font-bold text-[#1A1A1A] dark:text-foreground mb-2" style={{ fontFamily: '"Playfair Display", Georgia, serif' }}>
                  Seal Your Pledge to Make it Official
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  We've sent a secure link to <strong>{profile.email}</strong>. 
                  Click it to affix your official seal to your pledge and unlock your public profile.
                </p>
              </div>

              <div className="flex flex-wrap gap-4 items-center">
                <Link to={`/verify/${profile.id}`}>
                  <Button 
                    className="bg-[#0044CC] hover:bg-[#003399] text-white shadow-md transition-all hover:shadow-lg hover:-translate-y-0.5"
                  >
                    <MailIcon className="w-4 h-4 mr-2" />
                    Simulate Email Verification
                  </Button>
                </Link>
                <p className="text-sm text-muted-foreground">
                  (Demo Mode)
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl md:text-4xl font-bold text-foreground">
          {profile.isVerified
            ? "Your Clarity Pledge is Live"
            : "Almost There! One Last Step"}
        </h1>
        {profile.role && (
          <p className="text-xl text-muted-foreground font-medium">
            {profile.role}
          </p>
        )}
        {profile.linkedinUrl && (
          <a
            href={profile.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline text-sm"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
            View LinkedIn Profile
          </a>
        )}
        <p className="text-lg text-muted-foreground">
          {profile.isVerified
            ? "Share it with your network to build mutual understanding"
            : "Verify your email to make your Clarity Pledge public and start building mutual understanding"}
        </p>
      </div>

      {/* Why I Took This Pledge */}
      {profile.reason && (
        <div className="border-l-4 border-[#0044CC] dark:border-blue-500 bg-muted/50 rounded-r-lg p-6">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Why I Took This Pledge
          </h3>
          <p className="text-lg leading-relaxed text-foreground italic">
            "{profile.reason}"
          </p>
        </div>
      )}

      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border-2 border-[#0044CC] dark:border-blue-500 rounded-lg p-6 bg-card">
          <div className="text-center space-y-3">
            <p className="text-4xl md:text-5xl font-bold text-[#0044CC] dark:text-blue-400">
              {profile.witnesses.length}
            </p>
            <div>
              <p className="text-lg font-semibold text-foreground">
                {profile.witnesses.length === 1
                  ? "Endorsement"
                  : "Endorsements"}
              </p>
              <p className="text-sm text-muted-foreground">
                People who acknowledged your pledge
              </p>
            </div>
          </div>
        </div>

        <div className="border-2 border-amber-500 dark:border-amber-400 rounded-lg p-6 bg-card">
          <div className="text-center space-y-3">
            <p className="text-4xl md:text-5xl font-bold text-amber-600 dark:text-amber-400">
              {profile.reciprocations}
            </p>
            <div>
              <p className="text-lg font-semibold text-foreground">Impact</p>
              <p className="text-sm text-muted-foreground">
                People who took the pledge after seeing yours
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Share Tools - Only show when verified */}
      {profile.isVerified && (
        <div className="space-y-6">
          <div className="border border-border rounded-lg p-6 bg-card">
            <ShareTools profileUrl={profileUrl} name={profile.name} />
          </div>

          {/* Invite Endorsers */}
          <div className="border border-border rounded-lg p-6 bg-card">
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">
                  Get Personal Endorsements
                </h3>
                <p className="text-sm text-muted-foreground">
                  Invite people who know you to endorse your commitment. Personal invitations get 5x more responses!
                </p>
              </div>
              <InviteEndorsers
                profileName={profile.name}
                profileUrl={profileUrl}
              />
            </div>
          </div>
        </div>
      )}

      {/* Unverified Share Disabled Message */}
      {!profile.isVerified && (
        <div className="border border-dashed border-border rounded-lg p-8 bg-muted/30">
          <div className="text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground opacity-50">
              <StampIcon className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-muted-foreground">
              Tools Locked Until Sealed
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Once you confirm your email and seal your pledge, you'll unlock tools to share your commitment and invite others.
            </p>
          </div>
        </div>
      )}

      {/* Certificate */}
      <div>
        <ProfileCertificate
          name={profile.name}
          signedAt={profile.signedAt}
          isVerified={profile.isVerified}
          role={profile.role}
          linkedinUrl={profile.linkedinUrl}
        />
      </div>

      {/* Endorsements List */}
      <div>
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-foreground">Accepted By</h2>
          <p className="text-muted-foreground">
            People who have accepted your commitment to clarity
          </p>
        </div>
        <div className="mt-6">
          <WitnessList witnesses={profile.witnesses} />
        </div>
      </div>
    </div>
  );
}
