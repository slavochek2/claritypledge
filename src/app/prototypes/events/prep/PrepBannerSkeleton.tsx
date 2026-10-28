import { Skeleton } from '@/components/ui/skeleton';

/**
 * P1586: the preparation banner while its status is read, so the line that appears does not push
 * the content below it. In the room it is the right-aligned status line on the Back row; on the
 * event page it is the bordered box. `applies` is already known when this shows (preparation on,
 * the viewer is not the host), so the common outcome is a banner of this footprint.
 */
export function PrepBannerSkeleton({ source }: { source: 'room' | 'event' }) {
  if (source === 'room') {
    return (
      <div
        role="status"
        aria-label="Loading preparation status"
        data-testid="prep-banner-skeleton"
        className="flex min-h-11 flex-wrap items-center justify-end gap-x-2"
      >
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-4 w-32" />
      </div>
    );
  }
  return (
    <div
      role="status"
      aria-label="Loading preparation status"
      data-testid="prep-banner-skeleton"
      className="flex min-h-12 items-center justify-between gap-x-3 rounded-lg border border-border px-3 py-1"
    >
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-28" />
    </div>
  );
}
