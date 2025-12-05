import { useState } from "react";
import { type Profile } from "@/app/data/api";
import { ProfileCertificate } from "@/app/components/profile/profile-certificate";
import { ShareDropdown } from "@/app/components/profile/share-dropdown";
import { WitnessCard } from "@/app/components/social/witness-card";
import { WitnessList } from "@/app/components/social/witness-list";
import { getInitials } from "@/lib/utils";

// Helper function to generate consistent color from name
function getAvatarColor(name: string): string {
  const colors = [
    "bg-blue-500",
    "bg-purple-500",
    "bg-green-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-teal-500",
    "bg-indigo-500",
    "bg-red-500",
  ];

  const index = name
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[index % colors.length];
}

interface ProfileVisitorViewProps {
  profile: Profile;
  onWitness: (witnessName: string, linkedinUrl?: string) => Promise<void>;
  isOwner?: boolean;
  currentUser: Profile | null;
}

export function ProfileVisitorView({
  profile,
  onWitness,
  isOwner = false,
  currentUser,
}: ProfileVisitorViewProps) {
  const [hasAccepted, setHasAccepted] = useState(false);

  const profileUrl = `${window.location.origin}/p/${profile.slug}`;

  const handleWitness = async (witnessName: string, linkedinUrl?: string) => {
    await onWitness(witnessName, linkedinUrl);
    setHasAccepted(true);
  };

  return (
    <div className="space-y-16">
      {/* Header - only for visitors */}
      {!isOwner && (
        <div className="text-center space-y-4">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
            {profile.name} made you a promise
          </h1>
          <p className="text-xl text-muted-foreground font-medium">
            Read it and decide if you'll accept
          </p>
        </div>
      )}

      {/* Owner Banner - integrated with actions */}
      {isOwner && (
        <div className="max-w-3xl mx-auto mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100 text-center sm:text-left">
              Your Pledge
            </p>
            <ShareDropdown
              profileUrl={profileUrl}
              profileName={profile.name}
              slug={profile.slug}
              role={profile.role}
              signedAt={profile.signedAt}
              acceptanceCount={profile.witnesses.length}
              avatarColor={profile.avatarColor}
            />
          </div>
        </div>
      )}

      {/* Certificate */}
      <div className="max-w-3xl mx-auto">
        <ProfileCertificate
          name={profile.name}
          email={profile.email}
          signedAt={profile.signedAt}
          isVerified={profile.isVerified}
          role={profile.role}
          linkedinUrl={profile.linkedinUrl}
          avatarColor={profile.avatarColor}
          showQrCode={true}
          profileUrl={profileUrl}
        />
      </div>

      {/* Why They Took This Pledge - Personal story, right after certificate */}
      {profile.reason && (
        <div className="max-w-3xl mx-auto -mt-8">
          <div
            className="relative rounded-lg p-6 md:p-8 bg-[#FDFBF7] dark:bg-card shadow-md"
            style={{
              border: "3px solid #002B5C",
            }}
          >
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 text-4xl text-[#0044CC]/30 dark:text-blue-500/30 leading-none font-serif">
                &ldquo;
              </div>
              <div className="flex-1 min-w-0">
                <h3
                  className="text-sm font-medium text-[#0044CC] dark:text-blue-400 uppercase tracking-wider mb-3"
                  style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
                >
                  Why {profile.name.split(" ")[0]} Took This Pledge
                </h3>
                <p
                  className="text-base md:text-lg leading-relaxed text-[#1A1A1A] dark:text-foreground"
                  style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
                >
                  {profile.reason}
                </p>
              </div>
              <div className="flex-shrink-0 text-4xl text-[#0044CC]/30 dark:text-blue-500/30 leading-none font-serif self-end">
                &rdquo;
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Social Proof - Full list only for owner */}
      {isOwner && profile.witnesses.length > 0 && (
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">
              People who accepted
            </h2>
            <p className="text-lg text-muted-foreground">
              {profile.witnesses.length}{" "}
              {profile.witnesses.length === 1 ? "person" : "people"} accepted
            </p>
          </div>
          <WitnessList witnesses={profile.witnesses} />
        </div>
      )}

      {/* Call-to-Action - Accept form AFTER showing value */}
      {!isOwner && (
        <div className="max-w-2xl mx-auto">
          <div className={`border rounded-lg p-8 bg-gradient-to-br transition-all ${
            hasAccepted
              ? "border-green-500/50 from-green-50/50 to-transparent dark:from-green-950/30 dark:to-transparent animate-pulse-subtle-green"
              : "border-[#0044CC]/30 dark:border-blue-500/30 from-blue-50/50 to-transparent dark:from-blue-950/30 dark:to-transparent"
          }`}>
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold mb-2">
                {hasAccepted
                  ? `You accepted ${profile.name.split(" ")[0]}'s promise`
                  : `${profile.name.split(" ")[0]} made you a promise. Will you accept?`}
              </h2>
              {hasAccepted ? (
                <p className="text-muted-foreground">
                  You're now holding {profile.name.split(" ")[0]} accountable
                </p>
              ) : profile.witnesses.length > 0 ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="flex -space-x-2">
                    {profile.witnesses.slice(0, 4).map((witness, index) => (
                      <div
                        key={witness.id}
                        className={`w-8 h-8 rounded-full ${getAvatarColor(witness.name)} flex items-center justify-center text-white text-xs font-semibold border-2 border-white dark:border-gray-900`}
                        style={{ zIndex: 4 - index }}
                        title={witness.name}
                      >
                        {getInitials(witness.name)}
                      </div>
                    ))}
                  </div>
                  <span className="text-muted-foreground">
                    {profile.witnesses.length > 4
                      ? `+${profile.witnesses.length - 4} accepted`
                      : `${profile.witnesses.length} accepted`}
                  </span>
                </div>
              ) : (
                <p className="text-muted-foreground">Be the first to accept</p>
              )}
            </div>
            <WitnessCard
              profileName={profile.name}
              profileId={profile.id}
              onWitness={handleWitness}
              currentUser={currentUser}
            />
          </div>
        </div>
      )}

    </div>
  );
}
