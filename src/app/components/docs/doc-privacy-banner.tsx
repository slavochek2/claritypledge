/**
 * @file doc-privacy-banner.tsx
 * @description P551: Privacy/visibility banner for Clarity Doc detail page.
 * Shows gray for private docs, plain for public docs.
 */

import { Lock, Globe } from 'lucide-react';
import type { ContentVisibility } from '@/app/types';

interface DocPrivacyBannerProps {
  visibility: ContentVisibility;
  /** Optional second line, e.g. "Stories added here inherit this visibility" */
  subtitle?: string;
}

export function DocPrivacyBanner({ visibility, subtitle }: DocPrivacyBannerProps) {
  const isPrivate = visibility === 'private';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`w-full px-4 py-2 flex flex-col items-center gap-1 text-sm border-b ${
        isPrivate
          ? 'bg-muted border-border'
          : 'bg-background border-border'
      }`}
    >
      <div className="flex items-center justify-center gap-2">
        {isPrivate ? (
          <>
            <Lock size={14} className="text-muted-foreground flex-shrink-0" />
            <span className="text-foreground font-medium">PRIVATE</span>
            <span className="text-muted-foreground">
              <span className="hidden sm:inline">&middot; Only people you share with can see this</span>
              <span className="sm:hidden">&middot; Only people you share with can see this</span>
            </span>
          </>
        ) : (
          <>
            <Globe size={14} className="text-muted-foreground flex-shrink-0" />
            <span className="text-foreground font-medium">PUBLIC</span>
            <span className="text-muted-foreground">
              <span className="hidden sm:inline">&middot; Anyone with the link can see this Clarity Doc</span>
              <span className="sm:hidden">&middot; Visible to anyone</span>
            </span>
          </>
        )}
      </div>
      {subtitle && (
        <span className="text-xs text-muted-foreground">
          {subtitle}
        </span>
      )}
    </div>
  );
}
