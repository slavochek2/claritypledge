import { useState } from 'react';
import { Share2, Copy, Check, ChevronDown, Code } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Type of content being shared */
  type: 'story' | 'point' | 'profile';
  /** The URL to share */
  url: string;
  /** Optional title for native share */
  title?: string;
  /** Optional description for native share */
  description?: string;
}

/**
 * ShareDialog - Unified share dialog for Stories, Points, and Profiles
 *
 * Design: YouTube-inspired
 * - URL field with inline copy button
 * - Embed code collapsed by default (for story/point only)
 * - Native share on mobile
 */
export function ShareDialog({
  open,
  onOpenChange,
  type,
  url,
  title,
  description,
}: ShareDialogProps) {
  const [copied, setCopied] = useState<'link' | 'embed' | null>(null);
  const [showEmbed, setShowEmbed] = useState(false);
  const hasNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const showEmbedOption = type === 'story' || type === 'point';

  const embedCode = `<iframe src="${url}?embed=true" width="100%" height="400" frameborder="0" style="border-radius: 8px; border: 1px solid #e5e7eb;"></iframe>`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied('link');
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleCopyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied('embed');
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleNativeShare = async () => {
    try {
      await navigator.share({
        title: title || `Share ${type}`,
        text: description,
        url,
      });
    } catch {
      // User cancelled or error - ignore
    }
  };

  const dialogTitle = type === 'profile'
    ? 'Share profile'
    : type === 'story'
      ? 'Share story'
      : 'Share point';

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      onOpenChange(isOpen);
      if (!isOpen) {
        setCopied(null);
        setShowEmbed(false);
      }
    }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        {/* URL field with inline copy */}
        <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
          <div className="flex-1 px-3 py-2 text-sm text-gray-600 font-mono overflow-x-auto">
            <span className="whitespace-nowrap">{url}</span>
          </div>
          <Button
            onClick={handleCopyLink}
            variant="ghost"
            size="sm"
            className={`shrink-0 ${copied === 'link' ? 'text-green-600 hover:text-green-600' : ''}`}
          >
            {copied === 'link' ? (
              <Check size={16} />
            ) : (
              <Copy size={16} />
            )}
          </Button>
        </div>

        {/* Feedback text */}
        <div className="h-5 text-center">
          {copied === 'link' && (
            <span className="text-sm text-green-600">Link copied!</span>
          )}
          {copied === 'embed' && (
            <span className="text-sm text-green-600">Embed code copied!</span>
          )}
        </div>

        {/* Native share button (mobile) */}
        {hasNativeShare && (
          <Button
            onClick={handleNativeShare}
            className="w-full bg-blue-500 hover:bg-blue-600"
          >
            <Share2 size={16} className="mr-2" />
            Share...
          </Button>
        )}

        {/* Embed section - collapsed by default, story/point only */}
        {showEmbedOption && (
          <div className="border-t pt-3 mt-1">
            <button
              onClick={() => setShowEmbed(!showEmbed)}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors w-full"
            >
              <Code size={14} />
              <span>Embed code</span>
              <ChevronDown
                size={14}
                className={`ml-auto transition-transform ${showEmbed ? 'rotate-180' : ''}`}
              />
            </button>
            {showEmbed && (
              <div className="mt-3 space-y-2">
                <div className="bg-gray-100 rounded-lg p-3 text-xs text-gray-600 font-mono overflow-x-auto max-h-24">
                  <pre className="whitespace-pre-wrap break-all">{embedCode}</pre>
                </div>
                <Button
                  onClick={handleCopyEmbed}
                  variant="outline"
                  size="sm"
                  className={`w-full ${copied === 'embed' ? 'bg-green-50 border-green-200 text-green-700' : ''}`}
                >
                  {copied === 'embed' ? (
                    <>
                      <Check size={14} className="mr-2" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={14} className="mr-2" />
                      Copy embed code
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ShareButtonProps {
  /** Type of content being shared */
  type: 'story' | 'point' | 'profile';
  /** ID used to build the URL */
  id: string;
  /** Button className override */
  className?: string;
  /** Optional title for native share */
  title?: string;
  /** Optional description for native share */
  description?: string;
}

/**
 * ShareButton - Button that opens ShareDialog
 * Drop-in replacement for ShareDropdown
 */
export function ShareButton({ type, id, className, title, description }: ShareButtonProps) {
  const [open, setOpen] = useState(false);

  const getShareUrl = () => {
    const base = window.location.origin;
    const path = type === 'story'
      ? `/prototype/story/${id}`
      : type === 'point'
        ? `/prototype/point/${id}`
        : `/prototype/linkedin-like/profile/${id}`;
    return `${base}${path}`;
  };

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={className || "p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"}
        aria-label={`Share ${type}`}
      >
        <Share2 size={14} />
      </button>
      <ShareDialog
        open={open}
        onOpenChange={setOpen}
        type={type}
        url={getShareUrl()}
        title={title}
        description={description}
      />
    </>
  );
}
