import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RecipocationCard } from "@/app/components/social/reciprocation-card";
import { type Profile } from "@/app/data/api";
import { triggerConfetti } from "@/lib/confetti";

interface WitnessCardProps {
  profileName: string;
  profileId: string;
  onWitness: (witnessName: string, linkedinUrl?: string) => void;
  currentUser: Profile | null;
}

export function WitnessCard({
  profileName,
  profileId,
  onWitness,
  currentUser,
}: WitnessCardProps) {
  const [name, setName] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [linkedinError, setLinkedinError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || "");
      setLinkedinUrl(currentUser.linkedinUrl || "");
    }
  }, [currentUser]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // Clear previous error
    setLinkedinError("");

    // Normalize and validate LinkedIn URL
    let normalizedLinkedInUrl = linkedinUrl.trim();
    if (normalizedLinkedInUrl) {
      // Add https:// if missing
      if (!normalizedLinkedInUrl.match(/^https?:\/\//i)) {
        normalizedLinkedInUrl = `https://${normalizedLinkedInUrl}`;
      }
      // Only accept linkedin.com URLs - show error for other domains
      if (!normalizedLinkedInUrl.match(/^https?:\/\/(www\.)?linkedin\.com\//i)) {
        setLinkedinError("Please enter a valid LinkedIn URL (e.g., linkedin.com/in/yourprofile)");
        return;
      }
    }

    setIsSubmitting(true);

    // Instant witnessing - no email verification needed
    setTimeout(() => {
      setIsSubmitting(false);
      setIsComplete(true);
      triggerConfetti();
      onWitness(name, normalizedLinkedInUrl || undefined);
    }, 500);
  };

  if (isComplete) {
    return <RecipocationCard referrerId={profileId} />;
  }

  return (
    <div className="border border-[#0044CC]/20 dark:border-blue-500/20 rounded-lg p-8 bg-blue-50/30 dark:bg-blue-950/20">
      <div className="space-y-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="witness-name" className="text-sm font-medium">
              Your Full Name
            </Label>
            <Input
              id="witness-name"
              type="text"
              placeholder="Enter your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isSubmitting}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="witness-linkedin" className="text-sm font-medium">
              LinkedIn URL (Optional)
            </Label>
            <Input
              id="witness-linkedin"
              type="text"
              placeholder="linkedin.com/in/yourprofile"
              value={linkedinUrl}
              onChange={(e) => {
                setLinkedinUrl(e.target.value);
                if (linkedinError) setLinkedinError("");
              }}
              disabled={isSubmitting}
              className={`w-full ${linkedinError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
              aria-invalid={!!linkedinError}
              aria-describedby={linkedinError ? "linkedin-error" : undefined}
            />
            {linkedinError && (
              <p id="linkedin-error" className="text-sm text-red-500">
                {linkedinError}
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white"
            size="lg"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="animate-pulse">Accepting...</span>
              </span>
            ) : (
              "I Accept"
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center mt-3 leading-relaxed">
            No cost or obligation. You are simply acknowledging{" "}
            {profileName.split(" ")[0]}'s promise.
          </p>
        </form>
      </div>
    </div>
  );
}
