import { Skeleton } from '@/components/ui/skeleton';

/**
 * P1586: the section look for the pledgers grid, under the page's drawn title: avatar-and-name
 * cards. `data-testid="loader"` is kept for the page's existing loading test.
 */
export function PledgersSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading pledgers"
      data-testid="loader"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
          <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
