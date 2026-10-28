/**
 * @file feed-skeleton.tsx
 * @description P491: Skeleton loading component for the feed page.
 * Shows 3-4 pulsing placeholder cards matching card layout shape.
 */

import { Skeleton } from '@/components/ui/skeleton';

export function FeedSkeleton() {
  return (
    <div className="space-y-4" data-testid="feed-skeleton">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-card rounded-lg shadow-sm border-l-4 border-l-slate-300 border border-border p-4"
        >
          <div className="flex items-start gap-3">
            {/* Avatar skeleton */}
            <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />

            <div className="flex-1 space-y-2">
              {/* Name + date */}
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
              {/* Content lines */}
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              {/* Tag pills */}
              <div className="flex gap-1.5">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
