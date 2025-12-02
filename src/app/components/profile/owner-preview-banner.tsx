import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { InfoIcon, Link2Icon, CheckIcon } from "lucide-react";

interface OwnerPreviewBannerProps {
  profileUrl?: string;
}

export function OwnerPreviewBanner({ profileUrl }: OwnerPreviewBannerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    if (!profileUrl) return;
    
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  return (
    <div className="bg-blue-50 dark:bg-blue-950/30 border-b-2 border-blue-200 dark:border-blue-800 py-4">
      <div className="container mx-auto max-w-5xl px-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <InfoIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                You are viewing your pledge
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Share your link to invite others to accept your pledge
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {profileUrl && (
              <Button
                variant="outline"
                onClick={handleCopyLink}
                className="gap-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                {copied ? (
                  <>
                    <CheckIcon className="w-4 h-4 text-green-600" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Link2Icon className="w-4 h-4" />
                    <span>Copy Link</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

