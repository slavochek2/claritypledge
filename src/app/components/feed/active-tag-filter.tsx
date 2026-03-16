/**
 * @file active-tag-filter.tsx
 * @description P491: Active tag filter pill displayed at the top of the feed.
 * Shows the current tag filter with a dismiss (X) button.
 */

import { X } from 'lucide-react';
import { analytics } from '@/lib/mixpanel';

interface ActiveTagFilterProps {
  tag: string;
  onDismiss: () => void;
}

export function ActiveTagFilter({ tag, onDismiss }: ActiveTagFilterProps) {
  const handleDismiss = () => {
    analytics.track('feed_tag_cleared', { tag });
    onDismiss();
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Showing:</span>
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-800 px-3 py-1 text-sm font-medium">
        #{tag}
        <button
          onClick={handleDismiss}
          className="ml-1 rounded-full hover:bg-blue-200 p-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={`Remove tag filter for ${tag}`}
        >
          <X size={14} />
        </button>
      </span>
    </div>
  );
}
