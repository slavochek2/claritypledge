import { Link } from "react-router-dom";
import { type Profile } from "@/polymet/data/mock-profiles";
import { ProfileCertificate } from "@/polymet/components/profile-certificate";
import { WitnessList } from "@/polymet/components/witness-list";
import { ShareTools } from "@/polymet/components/share-tools";
import { InviteEndorsers } from "@/polymet/components/invite-endorsers";
import { UsersIcon, RepeatIcon, MailIcon, AlertCircleIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
      {/* Verification Banner */}
      {!profile.isVerified && (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <AlertCircleIcon className="h-5 w-5 text-amber-600 dark:text-amber-500" />

          <AlertTitle className="text-lg font-semibold text-amber-900 dark:text-amber-100">
            Verify Your Email
          </AlertTitle>
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            <div className="flex items-start gap-2 mt-2">
              <MailIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />

              <div className="flex-1">
                <p className="mb-2">
                  We've sent a verification link to{" "}
                  <strong>{profile.email}</strong>. Please check your email to
                  verify your signature.
                </p>
                <p className="text-sm mb-3">
                  Your profile will appear on the public "Who Signed the Pledge"
                  page once verified.
                </p>
                <Link to={`/verify/${profile.id}`}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-amber-600 text-amber-900 dark:text-amber-100 hover:bg-amber-500/20"
                  >
                    Simulate Email Verification (Demo)
                  </Button>
                </Link>
              </div>
            </div>
          </AlertDescription>
        </Alert>
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
                  Invite People to Endorse
                </h3>
                <p className="text-sm text-muted-foreground">
                  Send personal invitations to colleagues, friends, or anyone
                  who knows your commitment to clarity
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
        <div className="border border-border rounded-lg p-6 bg-card opacity-60">
          <div className="text-center space-y-2">
            <p className="text-lg font-semibold text-muted-foreground">
              Share Tools Locked
            </p>
            <p className="text-sm text-muted-foreground">
              Verify your email to unlock sharing and appear on the public
              signatories page
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
