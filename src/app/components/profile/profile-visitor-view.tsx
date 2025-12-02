import { useState } from "react";
import { type Profile } from "@/app/data/api";
import { ProfileCertificate } from "@/app/components/profile/profile-certificate";
import { WitnessCard } from "@/app/components/social/witness-card";
import { WitnessList } from "@/app/components/social/witness-list";
import { ShieldCheckIcon, AlertCircleIcon, HandshakeIcon } from "lucide-react";

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

  const handleWitness = (witnessName: string, linkedinUrl?: string) => {
    setHasAccepted(true);
    onWitness(witnessName, linkedinUrl);
  };

  return (
    <div className="space-y-16">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
          {profile.name} signed the Clarity Pledge
        </h1>
        <p className="text-xl text-muted-foreground font-medium">
          A public promise to prevent dangerous missunderstandings
        </p>
      </div>

      {/* Certificate - FIRST to show what they committed to */}
      <div className="max-w-3xl mx-auto">
        <ProfileCertificate
          name={profile.name}
          signedAt={profile.signedAt}
          isVerified={profile.isVerified}
          role={profile.role}
          linkedinUrl={profile.linkedinUrl}
        />
      </div>

      {/* What [Name] Is Offering You - Only show to visitors */}
      {!isOwner && (
        <div className="max-w-3xl mx-auto">
          <div className="bg-card border border-border rounded-xl p-10 md:p-12 shadow-sm">
            <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">
              Your benefits
            </h2>
            <div className="text-center mb-12 leading-relaxed space-y-3">
              <p className="text-lg md:text-xl text-muted-foreground">
                Asking to repeat back what you understood
                <br className="hidden md:block" /> feels rude and awkward.
              </p>
              <p className="text-base md:text-lg font-medium text-foreground">
                Clarity Pledge is the fix.
              </p>
            </div>

            <div className="space-y-8">
              <div className="flex items-center gap-6 group">
                <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-[#0044CC]/10 dark:bg-blue-500/10 flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:bg-[#0044CC]/20 dark:group-hover:bg-blue-500/20">
                  <ShieldCheckIcon className="w-8 h-8 text-[#0044CC] dark:text-blue-400" />
                </div>
                <h3 className="text-xl md:text-2xl font-semibold">
                  Prevent Conflicts
                </h3>
              </div>

              <div className="flex items-center gap-6 group">
                <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-[#0044CC]/10 dark:bg-blue-500/10 flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:bg-[#0044CC]/20 dark:group-hover:bg-blue-500/20">
                  <AlertCircleIcon className="w-8 h-8 text-[#0044CC] dark:text-blue-400" />
                </div>
                <h3 className="text-xl md:text-2xl font-semibold">
                  Eliminate Errors
                </h3>
              </div>

              <div className="flex items-center gap-6 group">
                <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-[#0044CC]/10 dark:bg-blue-500/10 flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:bg-[#0044CC]/20 dark:group-hover:bg-blue-500/20">
                  <HandshakeIcon className="w-8 h-8 text-[#0044CC] dark:text-blue-400" />
                </div>
                <h3 className="text-xl md:text-2xl font-semibold">Build Trust</h3>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Why They Took This Pledge - Personal story for emotional connection */}
      {profile.reason && (
        <div className="max-w-3xl mx-auto">
          <div className="relative border-l-4 border-[#0044CC] dark:border-blue-500 bg-gradient-to-r from-[#0044CC]/5 to-transparent rounded-r-lg p-8 md:p-10">
            <div className="absolute top-6 left-6 text-6xl text-[#0044CC]/20 dark:text-blue-500/20 leading-none">
              &ldquo;
            </div>
            <div className="relative z-10">
              <h3 className="text-sm font-semibold text-[#0044CC] dark:text-blue-400 uppercase tracking-wider mb-4">
                Why {profile.name.split(" ")[0]} Took This Pledge
              </h3>
              <p className="text-lg md:text-xl leading-relaxed text-foreground font-medium">
                {profile.reason}
              </p>
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
          <div className="border-2 border-[#0044CC] dark:border-blue-500 rounded-lg p-8 bg-gradient-to-br from-[#0044CC]/5 to-transparent">
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
