/**
 * @file doc-privacy-banner.tsx
 * @description P551: Privacy/visibility banner for Clarity Doc detail page.
 * Shows amber for private docs, blue for public docs.
 */

import { Lock, Globe } from 'lucide-react';
import type { ContentVisibility } from '@/app/types';

interface DocPrivacyBannerProps {
  visibility: ContentVisibility;
}

export function DocPrivacyBanner({ visibility }: DocPrivacyBannerProps) {
  const isPrivate = visibility === 'private';

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        isPrivate
          ? 'bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2 text-sm'
          : 'bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2 text-sm'
      }
    >
      {isPrivate ? (
        <>
          <Lock size={16} className="text-amber-600 flex-shrink-0" />
          <span className="text-amber-800">
            <span className="font-semibold">PRIVATE</span> &middot; Only you can see this Clarity Doc
          </span>
        </>
      ) : (
        <>
          <Globe size={16} className="text-blue-600 flex-shrink-0" />
          <span className="text-blue-800">
            <span className="font-semibold">PUBLIC</span> &middot; Visible on your profile
          </span>
        </>
      )}
    </div>
  );
}
