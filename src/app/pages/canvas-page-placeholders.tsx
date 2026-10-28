/**
 * @file canvas-page-placeholders.tsx
 * @description P1586: the placeholders of the canvas page (the owner line while the canvas loads, a
 * box's body while its points load, the load-failure message), split out of canvas-page.tsx.
 */
import { Skeleton } from '@/components/ui/skeleton';

export function CanvasOwnerSkeleton() {
  return <Skeleton as="span" className="h-8 w-48" />;
}

/** A box body that has nothing to list yet: still loading (`points === null`) or loaded and empty. */
export function CanvasBoxPlaceholder({ empty }: { empty: boolean }) {
  if (!empty) return <Skeleton className="h-24 rounded-md bg-background" />;
  return <p className="text-sm text-foreground/60">Empty</p>;
}

/** The stake page's error pattern (message + Retry), one for the whole page. */
export function CanvasLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="py-12 text-center">
      <p className="mb-4 text-muted-foreground">Could not load this canvas.</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 font-medium text-blue-600 transition-colors hover:text-blue-700"
      >
        Retry
      </button>
    </div>
  );
}
