import { useState } from 'react';
import { Share2, Link2, Code, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ShareDropdownProps {
  /** Type of content being shared */
  type: 'story' | 'point';
  /** ID of the content */
  id: string;
  /** Button className override */
  className?: string;
}

/**
 * ShareDropdown - Simple share menu with copy link and embed options
 */
export function ShareDropdown({ type, id, className }: ShareDropdownProps) {
  const [copied, setCopied] = useState<'link' | 'embed' | null>(null);

  // Build the full URL for this content
  const getShareUrl = () => {
    const base = window.location.origin;
    const path = type === 'story' ? `/prototype/story/${id}` : `/prototype/point/${id}`;
    return `${base}${path}`;
  };

  // Build embed code
  const getEmbedCode = () => {
    const url = getShareUrl();
    return `<iframe src="${url}?embed=true" width="100%" height="400" frameborder="0" style="border-radius: 8px; border: 1px solid #e5e7eb;"></iframe>`;
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(getShareUrl());
      setCopied('link');
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const handleCopyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(getEmbedCode());
      setCopied('embed');
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy embed code:', err);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={className || "p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"}
          aria-label={`Share ${type}`}
        >
          <Share2 size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer">
          {copied === 'link' ? (
            <Check size={16} className="mr-2 text-green-600" />
          ) : (
            <Link2 size={16} className="mr-2" />
          )}
          {copied === 'link' ? 'Copied!' : 'Copy link'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopyEmbed} className="cursor-pointer">
          {copied === 'embed' ? (
            <Check size={16} className="mr-2 text-green-600" />
          ) : (
            <Code size={16} className="mr-2" />
          )}
          {copied === 'embed' ? 'Copied!' : 'Copy embed code'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
