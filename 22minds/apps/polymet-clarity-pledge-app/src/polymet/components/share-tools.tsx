import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CheckIcon,
  CopyIcon,
  LinkedinIcon,
  MessageSquareIcon,
} from "lucide-react";

interface ShareToolsProps {
  profileUrl: string;
  name: string;
}

export function ShareTools({ profileUrl, name }: ShareToolsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(profileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLinkedInShare = () => {
    const text = `I've taken the Clarity Pledge - a public commitment to verify understanding before acting on assumptions. Check out my pledge!`;
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(profileUrl)}&summary=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "width=600,height=600");
  };

  const handleSlackShare = () => {
    // In a real app, this would use Slack's share API
    const text = `I've taken the Clarity Pledge! ${profileUrl}`;
    navigator.clipboard.writeText(text);
    alert("Slack message copied to clipboard! Paste it in your workspace.");
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-bold text-foreground mb-2">
          Share Your Pledge
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Share your commitment with your network
        </p>
      </div>

      {/* Copy Link Button */}
      <Button
        onClick={handleCopyLink}
        className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white"
        size="lg"
      >
        {copied ? (
          <>
            <CheckIcon className="w-4 h-4 mr-2" />
            Link Copied!
          </>
        ) : (
          <>
            <CopyIcon className="w-4 h-4 mr-2" />
            Copy Link
          </>
        )}
      </Button>

      {/* Social Share Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          onClick={handleLinkedInShare}
          variant="outline"
          className="w-full"
        >
          <LinkedinIcon className="w-4 h-4 mr-2" />
          Share on LinkedIn
        </Button>
        <Button onClick={handleSlackShare} variant="outline" className="w-full">
          <MessageSquareIcon className="w-4 h-4 mr-2" />
          Share on Slack
        </Button>
      </div>

      {/* Preview URL */}
      <div className="mt-4 p-3 bg-muted rounded-md">
        <p className="text-xs text-muted-foreground mb-1">Your pledge URL:</p>
        <p className="text-sm font-mono text-foreground break-all">
          {profileUrl}
        </p>
      </div>
    </div>
  );
}
