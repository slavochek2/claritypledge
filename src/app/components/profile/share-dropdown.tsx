import { useState, useRef } from "react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  DownloadIcon,
  LinkedinIcon,
  LinkIcon,
  LoaderIcon,
  MailIcon,
  XIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExportCertificate } from "./export-certificate";
import { PLEDGE_TEXT } from "@/app/content/pledge-text";

interface ShareDropdownProps {
  profileUrl: string;
  profileName: string;
  slug: string;
  role?: string;
  signedAt: string;
  isVerified: boolean;
  acceptanceCount: number;
}

export function ShareDropdown({
  profileUrl,
  profileName,
  slug,
  role,
  signedAt,
  isVerified,
  acceptanceCount,
}: ShareDropdownProps) {
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showLinkedInGuide, setShowLinkedInGuide] = useState(false);
  const [linkedInTextCopied, setLinkedInTextCopied] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Clipboard helper with fallback for older browsers
  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const success = document.execCommand("copy");
        document.body.removeChild(textArea);
        return success;
      }
    } catch {
      return false;
    }
  };

  const handleCopyLink = async () => {
    const success = await copyToClipboard(profileUrl);
    if (success) {
      setCopied(true);
      toast.success("Link copied!");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Failed to copy link");
    }
  };

  const linkedInPostText = `I signed the Clarity Pledge - a public commitment to clear communication.

YOUR RIGHT: ${PLEDGE_TEXT.yourRight.text}

MY PROMISE: ${PLEDGE_TEXT.myPromise.text}

See my pledge: ${profileUrl}

#ClarityPledge #Communication #Leadership`;

  const shareOnLinkedIn = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
      profileUrl
    )}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCopyLinkedInText = async () => {
    const success = await copyToClipboard(linkedInPostText);
    if (success) {
      setLinkedInTextCopied(true);
      toast.success("Text copied!");
      setTimeout(() => setLinkedInTextCopied(false), 2000);
    } else {
      toast.error("Failed to copy text");
    }
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

  const handleDownloadCertificate = async () => {
    if (!exportRef.current) return;

    setIsExporting(true);
    try {
      const dataUrl = await toPng(exportRef.current, {
        pixelRatio: 2,
        cacheBust: true,
      });

      const link = document.createElement("a");
      link.download = `clarity-pledge-${slug}.png`;
      link.href = dataUrl;
      link.click();

      toast.success("Certificate downloaded!");
    } catch (error) {
      console.error("Failed to export certificate:", error);
      toast.error("Failed to download. Try a screenshot instead.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
        {/* Download Image Button */}
        <button
          onClick={handleDownloadCertificate}
          disabled={isExporting}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors text-sm font-medium disabled:opacity-50 w-full sm:w-auto"
          title="Download certificate image"
        >
          {isExporting ? (
            <LoaderIcon className="w-4 h-4 animate-spin" />
          ) : (
            <DownloadIcon className="w-4 h-4" />
          )}
          {isExporting ? "Exporting..." : "Download Image"}
        </button>

        {/* Share Dropdown */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0044CC] hover:bg-[#0033AA] text-white transition-colors text-sm font-medium w-full sm:w-auto">
              <LinkIcon className="w-4 h-4" />
              Share
              <ChevronDownIcon className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {/* Copy Link */}
            <DropdownMenuItem
              onClick={handleCopyLink}
              className="cursor-pointer py-3"
            >
              <div className="flex items-start gap-3">
                {copied ? (
                  <CheckIcon className="w-4 h-4 text-green-600 mt-0.5" />
                ) : (
                  <CopyIcon className="w-4 h-4 text-muted-foreground mt-0.5" />
                )}
                <div>
                  <p className="font-medium">{copied ? "Copied!" : "Copy Link"}</p>
                  <p className="text-xs text-muted-foreground">Share anywhere</p>
                </div>
              </div>
            </DropdownMenuItem>

            {/* Share on LinkedIn */}
            <DropdownMenuItem
              onClick={() => setShowLinkedInGuide(true)}
              className="cursor-pointer py-3"
            >
              <div className="flex items-start gap-3">
                <LinkedinIcon className="w-4 h-4 text-[#0A66C2] mt-0.5" />
                <div>
                  <p className="font-medium">Share on LinkedIn</p>
                  <p className="text-xs text-muted-foreground">Post with certificate</p>
                </div>
              </div>
            </DropdownMenuItem>

            {/* Invite by Email */}
            <DropdownMenuItem
              onClick={handleEmailInvite}
              className="cursor-pointer py-3"
            >
              <div className="flex items-start gap-3">
                <MailIcon className="w-4 h-4 text-green-600 mt-0.5" />
                <div>
                  <p className="font-medium">Invite by Email</p>
                  <p className="text-xs text-muted-foreground">Send personal invite</p>
                </div>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* LinkedIn Share Guide Modal */}
      {showLinkedInGuide && (
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
          isVerified={isVerified}
          slug={slug}
          acceptanceCount={acceptanceCount}
        />
      </div>
    </>
  );
}
