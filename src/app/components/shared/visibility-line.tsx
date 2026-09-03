/**
 * @file visibility-line.tsx
 * @description P610: Reusable visibility indicator banner.
 * Matches the inline banner styling from story-detail-page AddPointForm.
 */

import { Lock, Globe } from 'lucide-react';
import type { ContentVisibility } from '@/app/types';

interface VisibilityLineProps {
  visibility: ContentVisibility;
  /** Contextual hint, e.g. "Matches point visibility" */
  source?: string;
}

export function VisibilityLine({ visibility, source }: VisibilityLineProps) {
  const isPrivate = visibility === 'private';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-lg p-2.5 text-sm flex items-center gap-2 border ${
        isPrivate
          ? 'bg-amber-50 border-amber-200'
          : 'bg-blue-50 border-blue-200'
      }`}
    >
      {isPrivate ? (
        <Lock className="w-4 h-4 text-amber-600 flex-shrink-0" />
      ) : (
        <Globe className="w-4 h-4 text-blue-600 flex-shrink-0" />
      )}
      <span className={isPrivate ? 'text-amber-800' : 'text-blue-800'}>
        {isPrivate
          ? 'Only people you share with can see this.'
          : 'This will be public — visible on your profile'}
        {source && (
          <span className={isPrivate ? 'text-amber-600' : 'text-blue-600'}>
            {' '}&middot; {source}
          </span>
        )}
      </span>
    </div>
  );
}
