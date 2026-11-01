import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ARTIFACT_CARD } from './artifact-card-style';

/**
 * P1586: a chat attachment (point, story, canvas, letter) while its card is read: the card's own
 * footprint as one grey block, so the message does not jump when the card arrives. The kind is
 * for screen readers only; the sighted view shows no text.
 */
export function AttachmentSkeleton({ kind, card = false }: { kind: string; /** A canvas version's card: drawn in the loaded card's own shape (row, disc, two lines), not one slab. */ card?: boolean }) {
  if (card) {
    return (
      <div role="status" aria-label="Loading attachment" className={cn(ARTIFACT_CARD, 'min-h-14')} data-testid="attachment-card-loading">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <span className="min-w-0 flex-1 space-y-1.5">
          <Skeleton as="span" className="block h-3.5 w-1/3" />
          <Skeleton as="span" className="block h-3 w-2/3" />
        </span>
        <span className="sr-only">Loading {kind}</span>
      </div>
    );
  }
  return (
    <Skeleton
      role="status"
      aria-label="Loading attachment"
      className="mt-1 min-h-16 w-full max-w-md rounded-xl border"
    >
      <span className="sr-only">Loading {kind}</span>
    </Skeleton>
  );
}
