import { Skeleton } from '@/components/ui/skeleton';

/**
 * P1586: the section look for the events list: three cards shaped like `EventCard` (16:9 banner,
 * date line, title, host, location, attendee footer) in the list's own grid. The filter tabs and
 * header above stay drawn.
 */
export function EventListSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading events"
      data-testid="event-list-skeleton"
      className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-l-4 border-border border-l-slate-300 bg-card">
          <Skeleton className="aspect-video w-full rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/5" />
            <div className="border-t border-border pt-3">
              <Skeleton className="h-4 w-1/4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
