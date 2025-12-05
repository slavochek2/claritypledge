import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Profile } from "@/app/data/api";
import { Link } from "react-router-dom";
import { CheckIcon, ArrowRightIcon } from "lucide-react";

interface WitnessCardProps {
  profileName: string;
  profileId: string;
  onWitness: (witnessName: string, linkedinUrl?: string) => Promise<void>;
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
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || "");
      setLinkedinUrl(currentUser.linkedinUrl || "");
    }
  }, [currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // Clear previous errors
    setLinkedinError("");
    setSubmitError("");

    // Normalize and validate LinkedIn URL
    let normalizedLinkedInUrl = linkedinUrl.trim();
    if (normalizedLinkedInUrl) {
      // Add https:// if missing
      if (!normalizedLinkedInUrl.match(/^https?:\/\//i)) {
        normalizedLinkedInUrl = `https://${normalizedLinkedInUrl}`;
      }
      // Accept any linkedin.com subdomain (www, de, fr, uk, etc.)
      if (!normalizedLinkedInUrl.match(/^https?:\/\/([a-z0-9-]+\.)*linkedin\.com\//i)) {
        setLinkedinError("Please enter a valid LinkedIn URL (e.g., linkedin.com/in/yourprofile)");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      await onWitness(name, normalizedLinkedInUrl || undefined);
      setIsComplete(true);
    } catch {
      setSubmitError("Failed to submit. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // After claiming: show the next step inline
  if (isComplete) {
    return (
      <div className="space-y-4">
        <Link to={`/?referrer=${profileId}`} className="block">
          <Button
            className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white transition-all"
            size="lg"
          >
            <span className="flex items-center justify-center gap-2">
              Take My Own Pledge
              <ArrowRightIcon className="w-4 h-4" />
            </span>
          </Button>
        </Link>
        <p className="text-xs text-center text-muted-foreground">
          Less than 30 seconds
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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

        {submitError && (
          <p className="text-sm text-red-500 text-center">
            {submitError}
          </p>
        )}

        <Button
          type="submit"
          className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white transition-all"
          size="lg"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <CheckIcon className="w-4 h-4 animate-pulse" />
              Accepting...
            </span>
          ) : (
            "Accept Their Promise"
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          No account needed. You're simply telling{" "}
          {profileName.split(" ")[0]}: "I expect you to keep your promise."
        </p>
      </form>
    </div>
  );
}
