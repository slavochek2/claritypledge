import { Skeleton } from '@/components/ui/skeleton';

/**
 * P1586: a chat attachment (point, story, canvas, letter) while its card is read: the card's own
 * footprint as one grey block, so the message does not jump when the card arrives. The kind is
 * for screen readers only; the sighted view shows no text.
 */
export function AttachmentSkeleton({ kind }: { kind: string }) {
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
