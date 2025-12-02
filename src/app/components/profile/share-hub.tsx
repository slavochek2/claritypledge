import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import {
  CheckIcon,
  CopyIcon,
  LinkedinIcon,
  MailIcon,
  QrCodeIcon,
  ShareIcon,
} from "lucide-react";

interface ShareHubProps {
  profileUrl: string;
  profileName: string;
}

export function ShareHub({ profileUrl, profileName }: ShareHubProps) {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(profileUrl);
      } else {
        // Fallback for older browsers or non-secure contexts
        const textArea = document.createElement("textarea");
        textArea.value = profileUrl;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
      toast.error("Failed to copy link. Please try again.");
    }
  };

  const shareOnLinkedIn = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
      profileUrl
    )}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleEmailInvite = () => {
    const firstName = profileName.split(" ")[0];
    const subject = encodeURIComponent(
      `${profileName} invited you to accept their Clarity Pledge`
    );
    const body = encodeURIComponent(
      `Hi,

I signed the Clarity Pledge - a public commitment to prevent dangerous misunderstandings through clear communication.

I'd be honored if you'd accept my pledge:
${profileUrl}

The Clarity Pledge means I commit to:
• Asking "What did you understand?" instead of "Do you understand?"
• Welcoming requests for clarification without judgment
• Taking responsibility for being understood, not just speaking

Learn more at claritypledge.com

Best,
${firstName}`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-[#0044CC]/10 dark:bg-blue-500/10 flex items-center justify-center">
            <ShareIcon className="w-5 h-5 text-[#0044CC] dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Share Your Pledge</h2>
            <p className="text-sm text-muted-foreground">
              Invite others to accept your commitment to clarity
            </p>
          </div>
        </div>

        {/* 2x2 Grid on desktop, stacked on mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Copy Link */}
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-4 p-4 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors text-left"
          >
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              {copied ? (
                <CheckIcon className="w-6 h-6 text-green-600" />
              ) : (
                <CopyIcon className="w-6 h-6 text-gray-600 dark:text-gray-400" />
              )}
            </div>
            <div>
              <p className="font-semibold text-foreground">
                {copied ? "Copied!" : "Copy Link"}
              </p>
              <p className="text-sm text-muted-foreground">
                Share anywhere
              </p>
            </div>
          </button>

          {/* QR Code */}
          <button
            onClick={() => setShowQR(!showQR)}
            className="flex items-center gap-4 p-4 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors text-left"
          >
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <QrCodeIcon className="w-6 h-6 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <p className="font-semibold text-foreground">
                {showQR ? "Hide QR Code" : "Show QR Code"}
              </p>
              <p className="text-sm text-muted-foreground">
                For in-person sharing
              </p>
            </div>
          </button>

          {/* LinkedIn */}
          <button
            onClick={shareOnLinkedIn}
            className="flex items-center gap-4 p-4 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors text-left"
          >
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-[#0A66C2]/10 flex items-center justify-center">
              <LinkedinIcon className="w-6 h-6 text-[#0A66C2]" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Share on LinkedIn</p>
              <p className="text-sm text-muted-foreground">
                Post to your network
              </p>
            </div>
          </button>

          {/* Email Invite */}
          <button
            onClick={handleEmailInvite}
            className="flex items-center gap-4 p-4 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors text-left"
          >
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <MailIcon className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Invite by Email</p>
              <p className="text-sm text-muted-foreground">
                Send a personal invite
              </p>
            </div>
          </button>
        </div>

        {/* QR Code Display */}
        {showQR && (
          <div className="mt-6 flex flex-col items-center gap-4 p-6 bg-white rounded-lg border border-border">
            <QRCodeSVG
              value={profileUrl}
              size={150}
              level="M"
              includeMargin={true}
            />
            <p className="text-sm text-muted-foreground text-center">
              Scan to view pledge
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
