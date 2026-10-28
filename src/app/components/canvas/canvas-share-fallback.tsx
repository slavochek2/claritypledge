/**
 * @file canvas-share-fallback.tsx
 * @description P1586: what the share panel shows in place of "People with access" until it can: the
 * load-failure message with Retry, or a placeholder while the audience loads. Split out of
 * canvas-share-control.tsx.
 */
import { Skeleton } from '@/components/ui/skeleton';

export function CanvasShareFallback({ loadError, onRetry }: { loadError: boolean; onRetry: () => void }) {
  if (!loadError) return <Skeleton className="h-24 rounded-md" />;
  return (
    <div role="alert" className="py-2 text-center text-sm">
      <p className="mb-2 text-muted-foreground">Could not load who this canvas is shared with.</p>
      <button type="button" onClick={onRetry} className="min-h-10 font-medium text-blue-600 hover:text-blue-700">Retry</button>
    </div>
  );
}
