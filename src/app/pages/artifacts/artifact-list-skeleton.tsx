import { Skeleton } from '@/components/ui/skeleton';

/**
 * P1586: the section look for the Artifacts list under its tabs: rows shaped like an artifact row
 * (a dot, a title line, a meta line). The tabs and search stay drawn above it.
 */
export function ArtifactListSkeleton() {
  return (
    <div role="status" aria-label="Loading" data-testid="artifact-list-skeleton" className="flex flex-col divide-y divide-border">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-2 px-2 py-2.5">
          <Skeleton className="h-2.5 w-2.5 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
