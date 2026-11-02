/**
 * @file use-canvas-root-slot.ts
 * @description P1536 3c X10/X11: a card or an "N replies" link's view of ITS canvas thread root, from the chat's one batched read (canvas-root-store). Mounting is asking: the root
 * joins the next batch; unmounting lets it go. `retry` is the person's Retry, `readNow` the tap's own current-state read (it follows the newest answer).
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { CanvasDraft } from '@/app/data/canvas-draft-service';
import { acquireRoot, readRootNow, retryRoot, rootSnapshot, setRootSlug, subscribeRoot, touchRootCount, TAP_READ_MAX_MS, type RootSnap } from './canvas-root-store';

export function useCanvasRootSlot(args: { rootId: string; viewerId: string; slug: string | null | undefined; count: number | undefined }): { snap: RootSnap; retry: () => void; readNow: () => Promise<CanvasDraft | null> } {
  const { rootId, viewerId, slug, count } = args;
  const first = useRef({ slug, count });
  const subscribe = useCallback(
    (onChange: () => void) => {
      const release = acquireRoot({ rootId, viewerId, slug: first.current.slug, count: first.current.count ?? 0 });
      const off = subscribeRoot(rootId, onChange);
      return () => {
        off();
        release();
      };
    },
    [rootId, viewerId],
  );
  const snap = useSyncExternalStore(subscribe, () => rootSnapshot(rootId));
  useEffect(() => setRootSlug(rootId, slug), [rootId, slug]);
  useEffect(() => touchRootCount(rootId, count ?? 0), [rootId, count]); // a new reply (the Publish reply is one) is a signal; the first value is not
  const retry = useCallback(() => retryRoot(rootId), [rootId]);
  const readNow = useCallback(() => readRootNow(rootId, TAP_READ_MAX_MS), [rootId]);
  return { snap, retry, readNow };
}
