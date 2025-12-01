import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  CheckIcon,
  CopyIcon,
  LinkedinIcon,
} from "lucide-react";

interface ShareToolsProps {
  profileUrl: string;
  name: string;
}

export function ShareTools({ profileUrl, name }: ShareToolsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      toast.success("Link copied! Share it anywhere - LinkedIn, Slack, email, etc.");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
      toast.error("Failed to copy link. Please try again.");
    }
  };

  const shareOnLinkedIn = () => {
    const text = `I've taken the Clarity Pledge. I commit to explaining back what I think you've said, so you can confirm or correct my understanding.`;
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
      profileUrl
    )}`;
    window.open(url, "_blank");
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-bold text-foreground mb-2">
          Share Your Pledge
        </h3>
        <p className="text-sm text-muted-foreground">
          Copy your unique link and share it on LinkedIn, Slack, email, or anywhere you connect with your network
        </p>
      </div>

      {/* URL Input with Copy Button */}
      <div className="space-y-2">
        <label 
          htmlFor="pledge-url" 
          className="text-sm font-medium text-foreground"
        >
          Your pledge URL
        </label>
        <div className="relative">
          <Input
            id="pledge-url"
            type="text"
            value={profileUrl}
            readOnly
            aria-label="Your shareable pledge URL"
            className="pr-24 font-mono text-sm bg-muted/50 border-border focus-visible:ring-[#0044CC]"
          />
          <Button
            onClick={handleCopyLink}
            size="sm"
            aria-label="Copy pledge link to clipboard"
            className={`absolute right-1 top-1/2 -translate-y-1/2 h-8 ${
              copied
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-[#0044CC] hover:bg-[#0033AA] text-white"
            }`}
          >
            {copied ? (
              <>
                <CheckIcon className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Copied</span>
              </>
            ) : (
              <>
                <CopyIcon className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Copy</span>
              </>
            )}
          </Button>
        </div>
      </div>
      <Button
        onClick={shareOnLinkedIn}
        size="lg"
        className="w-full bg-[#0A66C2] hover:bg-[#004182] text-white"
        aria-label="Share on LinkedIn"
      >
        <LinkedinIcon className="w-5 h-5 mr-2" />
        Share on LinkedIn
      </Button>
    </div>
  );
}
