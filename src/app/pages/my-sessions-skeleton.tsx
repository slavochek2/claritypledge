import { Skeleton } from '@/components/ui/skeleton';

/**
 * P1586: the section look for a session's transcript while it is read: a speaker label and a
 * couple of text lines per turn.
 */
export function TranscriptSkeleton() {
  return (
    <div role="status" aria-label="Loading transcript" data-testid="transcript-skeleton" className="space-y-5 py-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ))}
    </div>
  );
}
