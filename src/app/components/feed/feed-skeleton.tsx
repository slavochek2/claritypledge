/**
 * @file feed-skeleton.tsx
 * @description P491: Skeleton loading component for the feed page.
 * Shows 3-4 pulsing placeholder cards matching card layout shape.
 */

export function FeedSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-card rounded-lg shadow-sm border-l-4 border-l-muted border border-border p-4 animate-pulse"
        >
          <div className="flex items-start gap-3">
            {/* Avatar skeleton */}
            <div className="w-8 h-8 rounded-full bg-muted flex-shrink-0" />

            <div className="flex-1 space-y-2">
              {/* Name + date */}
              <div className="flex items-center gap-2">
                <div className="h-4 w-24 bg-muted rounded" />
                <div className="h-3 w-16 bg-muted rounded" />
              </div>
              {/* Content lines */}
              <div className="h-4 w-full bg-muted rounded" />
              <div className="h-4 w-3/4 bg-muted rounded" />
              {/* Tag pills */}
              <div className="flex gap-1.5">
                <div className="h-6 w-16 bg-muted rounded-full" />
                <div className="h-6 w-20 bg-muted rounded-full" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
