import { useState } from 'react';
import { Share2, Copy, Check } from 'lucide-react';
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
 * Design: YouTube-inspired KISS approach
 * - URL field with inline copy button
 * - Native share on mobile
 * - No embed (YAGNI)
 */
export function ShareDialog({
  open,
  onOpenChange,
  type,
  url,
  title,
  description,
}: ShareDialogProps) {
  const [copied, setCopied] = useState(false);
  const hasNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
      if (!isOpen) setCopied(false);
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
            onClick={handleCopy}
            variant="ghost"
            size="sm"
            className={`shrink-0 ${copied ? 'text-green-600 hover:text-green-600' : ''}`}
          >
            {copied ? (
              <Check size={16} />
            ) : (
              <Copy size={16} />
            )}
          </Button>
        </div>

        {/* Feedback text */}
        <div className="h-5 text-center">
          {copied && (
            <span className="text-sm text-green-600">Copied to clipboard!</span>
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
