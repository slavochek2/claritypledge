import { Skeleton } from '@/components/ui/skeleton';

/**
 * P1586: the section look for the compare page's statement rows, under its header and chips:
 * a statement line pair and the two positions side by side.
 */
export function CompareRowsSkeleton() {
  return (
    <ul role="status" aria-label="Loading comparison" data-testid="compare-rows-skeleton" className="space-y-3">
      {[0, 1, 2].map((i) => (
        <li key={i} className="space-y-3 rounded-lg border border-border bg-card p-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <div className="flex gap-3">
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}
