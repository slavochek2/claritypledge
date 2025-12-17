import { useState, useRef } from "react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  LinkedinIcon,
  LoaderIcon,
  MailIcon,
  ShareIcon,
  XIcon,
} from "lucide-react";
import { ExportCertificate } from "./export-certificate";
import { PLEDGE_TEXT } from "@/app/content/pledge-text";
import { copyToClipboard } from "@/lib/utils";
import { analytics } from "@/lib/mixpanel";

interface ShareHubProps {
  profileUrl: string;
  profileName: string;
  /** Profile slug for filename and QR code */
  slug: string;
  /** User's role/title */
  role?: string;
  /** Date signed */
  signedAt: string;
  /** Number of people who accepted the pledge (witnesses) */
  acceptanceCount: number;
  /** Whether this is the profile owner viewing (show download button) */
  isOwner?: boolean;
  /** User's avatar color */
  avatarColor?: string;
}

export function ShareHub({
  profileUrl,
  profileName,
  slug,
  role,
  signedAt,
  acceptanceCount,
  isOwner = false,
  avatarColor,
}: ShareHubProps) {
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showLinkedInGuide, setShowLinkedInGuide] = useState(false);
  const [linkedInTextCopied, setLinkedInTextCopied] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const handleDownloadCertificate = async () => {
    if (!exportRef.current) return;

    setIsExporting(true);
    try {
      const dataUrl = await toPng(exportRef.current, {
        pixelRatio: 2,
        cacheBust: true,
      });

      // Create download link
      const link = document.createElement("a");
      link.download = `clarity-pledge-${slug}.png`;
      link.href = dataUrl;
      link.click();

      analytics.track('certificate_downloaded', { profile_slug: slug });
      toast.success("Certificate downloaded!");
    } catch (error) {
      console.error("Failed to export certificate:", error);
      analytics.track('certificate_download_failed', { profile_slug: slug });
      toast.error("Failed to download certificate. Try taking a screenshot instead.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyLink = async () => {
    const success = await copyToClipboard(profileUrl);
    if (success) {
      analytics.track('share_link_copied', { profile_slug: slug });
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Failed to copy link. Please try again.");
    }
  };

  const linkedInPostText = `I signed the Clarity Pledge - a public commitment to clear communication.

YOUR RIGHT: ${PLEDGE_TEXT.yourRight.text}

MY PROMISE: ${PLEDGE_TEXT.myPromise.text}

See my pledge: ${profileUrl}

#ClarityPledge #Communication #Leadership`;

  const shareOnLinkedIn = () => {
    analytics.track('share_linkedin_clicked', { profile_slug: slug, is_owner: isOwner });
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
      profileUrl
    )}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCopyLinkedInText = async () => {
    const success = await copyToClipboard(linkedInPostText);
    if (success) {
      analytics.track('linkedin_text_copied', { profile_slug: slug });
      setLinkedInTextCopied(true);
      toast.success("Text copied!");
      setTimeout(() => setLinkedInTextCopied(false), 2000);
    } else {
      toast.error("Failed to copy text");
    }
  };

  const handleEmailInvite = () => {
    analytics.track('share_email_clicked', { profile_slug: slug });
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
              Invite others to accept your commitment to understanding
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

          {/* LinkedIn */}
          <button
            onClick={() => {
              if (isOwner) {
                analytics.track('linkedin_guide_opened', { profile_slug: slug });
                setShowLinkedInGuide(!showLinkedInGuide);
              } else {
                shareOnLinkedIn();
              }
            }}
            className="flex items-center gap-4 p-4 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors text-left"
          >
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-[#0A66C2]/10 flex items-center justify-center">
              <LinkedinIcon className="w-6 h-6 text-[#0A66C2]" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Share on LinkedIn</p>
              <p className="text-sm text-muted-foreground">
                {isOwner ? "Share with your certificate" : "Post to your network"}
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

          {/* Download Certificate - Owner only */}
          {isOwner && (
            <button
              onClick={handleDownloadCertificate}
              disabled={isExporting}
              className="flex items-center gap-4 p-4 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed sm:col-span-2"
            >
              <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                {isExporting ? (
                  <LoaderIcon className="w-6 h-6 text-purple-600 dark:text-purple-400 animate-spin" />
                ) : (
                  <DownloadIcon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                )}
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  {isExporting ? "Generating..." : "Download Certificate"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Share on social media
                </p>
              </div>
            </button>
          )}
        </div>

      </div>

      {/* LinkedIn Share Guide Modal - Owner only */}
      {showLinkedInGuide && isOwner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowLinkedInGuide(false)}
          />

          {/* Modal */}
          <div className="relative bg-card border border-border rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <LinkedinIcon className="w-5 h-5 text-[#0A66C2]" />
                Share on LinkedIn
              </h3>
              <button
                onClick={() => setShowLinkedInGuide(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted/50 transition-colors"
                aria-label="Close dialog"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-5">
              {/* Step 1: Download Certificate */}
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#0A66C2] text-white text-sm font-medium flex items-center justify-center">
                  1
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground mb-2">Download your certificate</p>
                  <button
                    onClick={handleDownloadCertificate}
                    disabled={isExporting}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-background border border-border rounded-md hover:bg-muted/50 transition-colors disabled:opacity-50"
                  >
                    {isExporting ? (
                      <LoaderIcon className="w-4 h-4 animate-spin" />
                    ) : (
                      <DownloadIcon className="w-4 h-4" />
                    )}
                    {isExporting ? "Generating..." : "Download Certificate"}
                  </button>
                </div>
              </div>

              {/* Step 2: Copy Text */}
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#0A66C2] text-white text-sm font-medium flex items-center justify-center">
                  2
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground mb-2">Copy the suggested text</p>
                  <div className="bg-muted/50 border border-border rounded-md p-3 text-sm text-muted-foreground whitespace-pre-line mb-3 max-h-40 overflow-y-auto">
                    {linkedInPostText}
                  </div>
                  <button
                    onClick={handleCopyLinkedInText}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-background border border-border rounded-md hover:bg-muted/50 transition-colors"
                  >
                    {linkedInTextCopied ? (
                      <CheckIcon className="w-4 h-4 text-green-600" />
                    ) : (
                      <CopyIcon className="w-4 h-4" />
                    )}
                    {linkedInTextCopied ? "Copied!" : "Copy Text"}
                  </button>
                </div>
              </div>

              {/* Step 3: Open LinkedIn */}
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#0A66C2] text-white text-sm font-medium flex items-center justify-center">
                  3
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground mb-2">Open LinkedIn and create a post</p>
                  <button
                    onClick={shareOnLinkedIn}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-[#0A66C2] text-white rounded-md hover:bg-[#0A66C2]/90 transition-colors"
                  >
                    <LinkedinIcon className="w-4 h-4" />
                    Open LinkedIn
                  </button>
                  <p className="text-xs text-muted-foreground mt-2">
                    Paste the text and attach your certificate image
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden certificate for export - rendered off-screen */}
      {isOwner && (
        <div
          style={{
            position: "absolute",
            left: "-9999px",
            top: "-9999px",
          }}
          aria-hidden="true"
        >
          <ExportCertificate
            ref={exportRef}
            name={profileName}
            role={role}
            signedAt={signedAt}
            slug={slug}
            acceptanceCount={acceptanceCount}
            avatarColor={avatarColor}
          />
        </div>
      )}
    </div>
  );
}
