/**
 * @file CanvasReadState.tsx
 * @description P1536: what stands under a canvas thread's messages while the draft's first read is out, or failed. Nothing shows
 * while canvas drafting is off. The old tray (create action, progress, rows) is gone with W0: Send is the update, and status
 * lives in the workspace's Publish spot and send slot.
 */
import { Skeleton } from '@/components/ui/skeleton';
import { InlineError } from './chat-kit';
import type { CanvasThreadStatus } from './use-canvas-thread';

export function CanvasThreadReadState({ status, onRetry }: { status: CanvasThreadStatus; onRetry: () => void }) {
  if (status === 'loading') {
    return (
      // P1586: a section waits as a <Skeleton> in its own footprint; the words are for screen readers only.
      <div role="status" aria-busy="true" className="shrink-0 border-t px-3 py-3" data-testid="canvas-loading">
        <Skeleton className="h-5 w-2/3" />
        <span className="sr-only">Loading your draft</span>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="shrink-0 border-t">
        <InlineError what="this draft" onRetry={onRetry} compact />
      </div>
    );
  }
  return null;
}
