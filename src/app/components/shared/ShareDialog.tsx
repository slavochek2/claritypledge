import { useState, useMemo } from 'react';
import { copyToClipboard } from '@/lib/utils';
import { Share2, Copy, Check, Link2, Code } from 'lucide-react';
import { MobileTooltip } from './mobile-tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type EmbedPreset = 'collapsed' | 'expanded';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Type of content being shared */
  type: 'story' | 'point' | 'profile' | 'org';
  /** The URL to share */
  url: string;
  /** Optional title for native share */
  title?: string;
  /** Optional description for native share */
  description?: string;
  /** Optional user ID to include in embed URL (?from=userId) — shows their position on the point */
  fromUserId?: string;
}

/**
 * ShareDialog - Unified share dialog for Stories, Points, and Profiles
 *
 * Design: Stacked layout — Link + Embed sections always visible (no tabs)
 * - Link section: URL with copy button
 * - Embed section: iframe code with copy button + Collapsed/Expanded preset (story/point only)
 * - Native share on mobile
 */
export function ShareDialog({
  open,
  onOpenChange,
  type,
  url,
  title,
  description,
  fromUserId,
}: ShareDialogProps) {
  const [linkCopied, setLinkCopied] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);
  const [embedPreset, setEmbedPreset] = useState<EmbedPreset>('collapsed');
  const hasNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const isEmbed = new URLSearchParams(window.location.search).get('embed') === 'true';
  const showEmbedOption = !isEmbed && (type === 'story' || type === 'point');

  const embedCode = useMemo(() => {
    const parts = ['embed=true'];
    if (fromUserId) parts.push(`from=${fromUserId}`);
    if (embedPreset === 'expanded') parts.push('expanded=true');
    const params = parts.join('&');
    return `<iframe src="${url}?${params}" width="100%" height="200" frameborder="0" style="border: none; overflow: hidden;" scrolling="no"></iframe>
<script>window.addEventListener("message",function(e){if(e.data&&e.data.type==="claritypledge-embed-resize"){var frames=document.querySelectorAll('iframe[src*="claritypledge.com"]');frames.forEach(function(f){try{if(f.contentWindow===e.source){f.style.height=e.data.height+"px"}}catch(err){}})}});</script>`;
  }, [url, fromUserId, embedPreset]);

  const handleCopyLink = async () => {
    const ok = await copyToClipboard(url);
    if (ok) {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } else {
      console.error('[ShareDialog] Failed to copy link');
    }
  };

  const handleCopyEmbed = async () => {
    const ok = await copyToClipboard(embedCode);
    if (ok) {
      setEmbedCopied(true);
      setTimeout(() => setEmbedCopied(false), 2000);
    } else {
      console.error('[ShareDialog] Failed to copy embed code');
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
      : type === 'org'
        ? 'Invite new members'
        : 'Share point';

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      onOpenChange(isOpen);
      if (!isOpen) {
        setLinkCopied(false);
        setEmbedCopied(false);
        setEmbedPreset('collapsed');
      }
    }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md mx-auto">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription className="sr-only">
            Copy a link or embed code to share this {type}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Link section */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5 text-sm font-medium text-gray-700">
              <Link2 size={14} />
              Link
            </div>
            <div className="flex items-stretch bg-gray-100 rounded-lg overflow-hidden">
              {/* max-h-40 (not max-h-24, matching the embed box below): an org invite
                  link is /org/{slug}?from={uuid} — long enough to clip mid-line
                  at 320-375px under the shorter cap (DOM-measured: scrollHeight 144px
                  vs a 96px clientHeight at 320px). Widened here rather than adding a
                  scrollbar, since the point of showing the link is for the member to
                  visually confirm it before sharing. */}
              <div className="flex-1 p-3 text-sm text-gray-600 font-mono overflow-x-auto max-h-40">
                <pre className="whitespace-pre-wrap break-all">{url}</pre>
              </div>
              <button
                onClick={handleCopyLink}
                className={`flex-shrink-0 px-3 flex items-center justify-center border-l border-gray-200 transition-colors ${
                  linkCopied
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                }`}
                aria-label={linkCopied ? 'Copied' : 'Copy link'}
              >
                {linkCopied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>

            {/* Native share button (mobile) */}
            {hasNativeShare && (
              <Button
                onClick={handleNativeShare}
                className="w-full mt-2 bg-blue-500 hover:bg-blue-600"
              >
                <Share2 size={16} className="mr-2" />
                Share...
              </Button>
            )}
          </div>

          {/* Embed section */}
          {showEmbedOption && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5 text-sm font-medium text-gray-700">
                <Code size={14} />
                {'</>'} Embed
              </div>
              <div className="flex items-stretch bg-gray-100 rounded-lg overflow-hidden">
                <div className="flex-1 p-3 text-sm text-gray-600 font-mono overflow-x-auto max-h-24">
                  <pre className="whitespace-pre-wrap break-all">{embedCode}</pre>
                </div>
                <button
                  onClick={handleCopyEmbed}
                  className={`flex-shrink-0 px-3 flex items-center justify-center border-l border-gray-200 transition-colors ${
                    embedCopied
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-50 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                  }`}
                  aria-label={embedCopied ? 'Copied' : 'Copy embed code'}
                >
                  {embedCopied ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>

              {/* Preset row: Collapsed / Expanded */}
              <div className="mt-2">
                <span className="text-xs text-gray-500">Linked content:</span>
                <div className="flex gap-1 mt-1 p-1 bg-gray-100 rounded-lg">
                  <button
                    onClick={() => { setEmbedPreset('collapsed'); setEmbedCopied(false); }}
                    className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      embedPreset === 'collapsed'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Collapsed
                  </button>
                  <button
                    onClick={() => { setEmbedPreset('expanded'); setEmbedCopied(false); }}
                    className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      embedPreset === 'expanded'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Expanded
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ShareButtonProps {
  /**
   * Type of content being shared. Deliberately excludes 'org' — getShareUrl()
   * below has no org case (org invites are always opened with an explicit url,
   * from org-header.tsx), so widening this union without one would let
   * `<ShareButton type="org">` compile and silently emit a profile URL.
   */
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
  /** Optional user ID — embed will show this user's position on the point */
  fromUserId?: string;
}

/**
 * ShareButton - Button that opens ShareDialog
 * Drop-in replacement for ShareDropdown
 */
export function ShareButton({ type, id, url, className, title, description, fromUserId }: ShareButtonProps) {
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
        fromUserId={fromUserId}
      />
    </>
  );
}
