import { useState } from 'react';
import { Share2, Copy, Check, Link2, Code } from 'lucide-react';
import { MobileTooltip } from './MobileTooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type ShareTab = 'link' | 'embed';

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
 * Design: Tabs approach (YouTube-inspired)
 * - Link tab: URL with copy button
 * - Embed tab: iframe code with copy button (story/point only)
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
  const [activeTab, setActiveTab] = useState<ShareTab>('link');
  const [copied, setCopied] = useState(false);
  const hasNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const isEmbed = new URLSearchParams(window.location.search).get('embed') === 'true';
  const showEmbedOption = !isEmbed && (type === 'story' || type === 'point');

  const embedCode = `<iframe src="${url}?embed=true" width="100%" height="200" frameborder="0" style="border: none; overflow: hidden;" scrolling="no"></iframe>
<script>window.addEventListener("message",function(e){if(e.data&&e.data.type==="claritypledge-embed-resize"){var frames=document.querySelectorAll('iframe[src*="claritypledge.com"]');frames.forEach(function(f){try{if(f.contentWindow===e.source){f.style.height=e.data.height+"px"}}catch(err){}})}});</script>`;

  const handleCopy = async () => {
    try {
      const textToCopy = activeTab === 'link' ? url : embedCode;
      await navigator.clipboard.writeText(textToCopy);
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
      if (!isOpen) {
        setCopied(false);
        setActiveTab('link');
      }
    }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md mx-auto">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription className="sr-only">
            Copy a link or embed code to share this {type}
          </DialogDescription>
        </DialogHeader>

        {/* Tabs - only show if embed option available */}
        {showEmbedOption && (
          <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
            <button
              onClick={() => { setActiveTab('link'); setCopied(false); }}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'link'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Link2 size={14} />
              Link
            </button>
            <button
              onClick={() => { setActiveTab('embed'); setCopied(false); }}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'embed'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Code size={14} />
              Embed
            </button>
          </div>
        )}

        {/* Content area */}
        <div className="space-y-3">
          {/* URL/Code display with inline copy button */}
          <div className="flex items-stretch bg-gray-100 rounded-lg overflow-hidden">
            <div className="flex-1 p-3 text-sm text-gray-600 font-mono overflow-x-auto max-h-24">
              <pre className="whitespace-pre-wrap break-all">
                {activeTab === 'link' ? url : embedCode}
              </pre>
            </div>
            <button
              onClick={handleCopy}
              className={`flex-shrink-0 px-3 flex items-center justify-center border-l border-gray-200 transition-colors ${
                copied
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
              }`}
              aria-label={copied ? 'Copied' : (activeTab === 'link' ? 'Copy link' : 'Copy embed code')}
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>

          {/* Native share button (mobile) - only for link tab */}
          {hasNativeShare && activeTab === 'link' && (
            <Button
              onClick={handleNativeShare}
              className="w-full bg-blue-500 hover:bg-blue-600"
            >
              <Share2 size={16} className="mr-2" />
              Share...
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ShareButtonProps {
  /** Type of content being shared */
  type: 'story' | 'point' | 'profile';
  /** ID used to build the URL (ignored when url is provided) */
  id: string;
  /** Override the computed URL (use when default routes don't apply, e.g. prototype pages) */
  url?: string;
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
export function ShareButton({ type, id, url, className, title, description }: ShareButtonProps) {
  const [open, setOpen] = useState(false);

  const getShareUrl = () => {
    if (url) return url;
    const base = window.location.origin;
    const path = type === 'story'
      ? `/story/${id}`
      : type === 'point'
        ? `/point/${id}`
        : `/p/${id}`;
    return `${base}${path}`;
  };

  return (
    <>
      <MobileTooltip content={`Share ${type}`}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          className={className || "p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"}
          aria-label={`Share ${type}`}
        >
          <Share2 size={16} />
        </button>
      </MobileTooltip>
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
