import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RecipocationCard } from "@/app/components/reciprocation-card";
import { type Profile } from "@/app/data/api";
import { useNavigate } from "react-router-dom";

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || "");
      setLinkedinUrl(currentUser.linkedinUrl || "");
    }
  }, [currentUser]);

  const triggerConfetti = () => {
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const colors = ["#0044CC", "#FFD700", "#FF6B6B", "#4ECDC4", "#95E1D3"];

    const randomInRange = (min: number, max: number) => {
      return Math.random() * (max - min) + min;
    };

    const createConfetti = () => {
      const confettiCount = 5;
      for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement("div");
        confetti.style.position = "fixed";
        confetti.style.width = "10px";
        confetti.style.height = "10px";
        confetti.style.backgroundColor =
          colors[Math.floor(Math.random() * colors.length)];
        confetti.style.left = randomInRange(0, window.innerWidth) + "px";
        confetti.style.top = "-10px";
        confetti.style.opacity = "1";
        confetti.style.transform = `rotate(${randomInRange(0, 360)}deg)`;
        confetti.style.pointerEvents = "none";
        confetti.style.zIndex = "9999";
        confetti.style.borderRadius = "2px";

        document.body.appendChild(confetti);

        const angle = randomInRange(-30, 30);
        const velocity = randomInRange(2, 4);
        const rotationSpeed = randomInRange(-5, 5);
        let posY = -10;
        let posX = parseFloat(confetti.style.left);
        let rotation = 0;
        let opacity = 1;

        const animate = () => {
          posY += velocity;
          posX += Math.sin(angle) * 0.5;
          rotation += rotationSpeed;
          opacity -= 0.005;

          confetti.style.top = posY + "px";
          confetti.style.left = posX + "px";
          confetti.style.transform = `rotate(${rotation}deg)`;
          confetti.style.opacity = opacity.toString();

          if (posY < window.innerHeight && opacity > 0) {
            requestAnimationFrame(animate);
          } else {
            confetti.remove();
          }
        };

        animate();
      }
    };

    const interval = setInterval(() => {
      if (Date.now() > animationEnd) {
        clearInterval(interval);
        return;
      }
      createConfetti();
    }, 50);
  };

  const handleLogin = () => {
    navigate("/signup");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);

    // Normalize LinkedIn URL - add https:// if missing
    let normalizedLinkedInUrl = linkedinUrl.trim();
    if (normalizedLinkedInUrl && !normalizedLinkedInUrl.match(/^https?:\/\//i)) {
      normalizedLinkedInUrl = `https://${normalizedLinkedInUrl}`;
    }

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
    <div className="border-2 border-[#1A1A1A] dark:border-border rounded-lg p-8 bg-[#FDFBF7] dark:bg-card">
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
              onChange={(e) => setLinkedinUrl(e.target.value)}
              disabled={isSubmitting}
              className="w-full"
            />
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
