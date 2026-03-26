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
      className={`-mx-4 px-4 py-2 flex items-center justify-center gap-2 text-sm border-b ${
        isPrivate
          ? 'bg-amber-50 border-amber-200'
          : 'bg-blue-50 border-blue-200'
      }`}
    >
      {isPrivate ? (
        <>
          <Lock size={14} className="text-amber-600 flex-shrink-0" />
          <span className="text-amber-800 font-medium">PRIVATE</span>
          <span className="text-amber-700">&middot; Only you can see this Clarity Doc</span>
        </>
      ) : (
        <>
          <Globe size={14} className="text-blue-600 flex-shrink-0" />
          <span className="text-blue-800 font-medium">PUBLIC</span>
          <span className="text-blue-700">&middot; Visible on your profile</span>
        </>
      )}
    </div>
  );
}
