/**
 * @file story-detail-skeleton.tsx
 * @description P1586: the story page's loading placeholder, split out of story-detail-page.tsx.
 */

import { Skeleton } from '@/components/ui/skeleton';

/** The card placeholder only: the page keeps its own Back (the P1364 drift guard allowlists it there).
 *  The blocks are aria-hidden, so the card itself announces that the story is loading. */
export function StoryDetailSkeleton() {
  return (
    <div role="status" aria-label="Loading story" className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-4 w-32 mb-2" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Skeleton className="h-6 w-3/4 mb-3" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}
