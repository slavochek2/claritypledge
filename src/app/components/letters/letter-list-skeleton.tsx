import { Skeleton } from '@/components/ui/skeleton';

/**
 * P1586: the section look for the three letters tabs (inbox, sent, drafts) while their list is
 * read: bordered rows shaped like a letter row (state dot, icon, title and meta lines, a badge).
 * The tab strip above stays drawn; this fills only the list.
 */
export function LetterListSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading letters"
      data-testid="letter-list-skeleton"
      className="flex flex-col gap-3"
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border p-4">
          <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
          <Skeleton className="h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}
