import { Skeleton } from '@/components/ui/skeleton';

const ROWS = 4;

/**
 * P1586: the section look for the topic list while it loads: rows shaped like `TopicRow` (a title
 * line at the left, five stars at the right on wide screens) in the list's own bordered, divided
 * `ul`. The page header / list settings above stay drawn, so this is never the page loader.
 */
export function TopicListSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading topics"
      data-testid="topic-list-skeleton"
      className="mt-3 flex flex-col divide-y divide-border border-t border-border"
    >
      {Array.from({ length: ROWS }, (_, i) => (
        <div
          key={i}
          className="grid grid-cols-1 gap-y-2 px-1 py-3 sm:grid-cols-[minmax(0,1fr)_30rem] sm:items-center sm:gap-x-6 sm:px-4"
        >
          <Skeleton className="h-5 w-2/3" />
          <div className="flex gap-2">
            {[0, 1, 2, 3, 4].map((s) => (
              <Skeleton key={s} className="h-6 w-6 rounded-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
