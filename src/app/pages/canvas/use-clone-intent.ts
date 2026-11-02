/**
 * @file use-clone-intent.ts
 * @description P1536 3c X3: "Clone a version" (the mirror chat's +) navigates to a published version with the Clone intent in the navigation state; this
 * consumes it ONCE, when the version has loaded, by running the same `clone()` decision as the Clone button (none: pending; same base: open that draft;
 * another base touched: the J4 sheet; untouched: pending, replaced in the first Send). It is consumed whatever happens: a page that is not the viewer's own, drafting
 * off, or an owner read that says otherwise drops it, so it can never fire later (a reload, the browser's Back) on a page the owner did not mean it for.
 * It waits only for what is still unknown: whether the viewer has the workspace here (`resolved`) and the page's read of THIS version (`ready`).
 */
import { useEffect, useRef } from 'react';
import type { useSearchParams } from 'react-router-dom';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { hasCloneIntent, withoutCloneIntent } from '@/lib/canvas-hrefs';

export function useCloneIntent(args: {
  state: unknown;
  /** Whether the viewer's access here is known (auth and the chat list have answered). */
  resolved: boolean;
  /** The page's read, only when it was made for the `?v=` now in the address. */
  ready: CanvasReady | null;
  /** The Clone decision; null when the viewer cannot clone here (not the owner's address, drafting off). */
  clone: (() => void) | null;
  setParams: ReturnType<typeof useSearchParams>[1];
}): void {
  const { state, resolved, ready, clone, setParams } = args;
  const intent = hasCloneIntent(state);
  const consumed = useRef(false);
  useEffect(() => {
    if (!intent) {
      consumed.current = false;
      return;
    }
    if (consumed.current || !resolved) return;
    if (clone && !ready) return; // the version is still loading
    consumed.current = true;
    setParams(prev => prev, { replace: true, state: withoutCloneIntent(state) });
    if (clone && ready?.isOwner) clone();
  }, [intent, resolved, ready, clone, setParams, state]);
}
