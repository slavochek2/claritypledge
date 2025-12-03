import { useState } from "react";
import { type Profile } from "@/app/data/api";
import { ProfileCertificate } from "@/app/components/profile/profile-certificate";
import { ShareDropdown } from "@/app/components/profile/share-dropdown";
import { WitnessCard } from "@/app/components/social/witness-card";
import { WitnessList } from "@/app/components/social/witness-list";

interface ProfileVisitorViewProps {
  profile: Profile;
  onWitness: (witnessName: string, linkedinUrl?: string) => void;
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

  const handleWitness = (witnessName: string, linkedinUrl?: string) => {
    setHasAccepted(true);
    onWitness(witnessName, linkedinUrl);
  };

  return (
    <div className="space-y-16">
      {/* Header - only for visitors */}
      {!isOwner && (
        <div className="text-center space-y-4">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
            {profile.name} signed the Clarity Pledge
          </h1>
          <p className="text-xl text-muted-foreground font-medium">
            A public promise to prevent dangerous misunderstandings
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
              isVerified={profile.isVerified}
              acceptanceCount={profile.witnesses.length}
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


      {/* Social Proof - Who else accepted */}
      {profile.witnesses.length > 0 && (
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">
              Who accepted {profile.name.split(" ")[0]}'s pledge
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
          <div className="border border-[#0044CC]/30 dark:border-blue-500/30 rounded-lg p-8 bg-gradient-to-br from-blue-50/50 to-transparent dark:from-blue-950/30 dark:to-transparent">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold mb-2">
                {hasAccepted
                  ? `You have accepted ${profile.name.split(" ")[0]}'s Pledge`
                  : `Accept ${profile.name.split(" ")[0]}'s Pledge`}
              </h2>
              <p className="text-muted-foreground">
                {hasAccepted
                  ? "Thank you for your commitment to clarity"
                  : profile.witnesses.length > 0
                    ? `Join ${profile.witnesses.length} ${profile.witnesses.length === 1 ? "other who" : "others who"} accepted`
                    : "Be the first to accept"}
              </p>
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
