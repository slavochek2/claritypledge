/**
 * @file use-workspace-marker.ts
 * @description P1536 D4: the `?ws=1` marker in the address, kept true to what is on screen. It is search-only (REPLACE, the path and the
 * entry's state are untouched).
 *  - ADDED when an owner looks at their own draft (and an old `thread=` address becomes `ws=1`). The draft counts as "on screen" only
 *    when the read was made for the `?v=` now in the address: a read made before we navigated off the draft is stale.
 *  - REMOVED when it cannot be a workspace: someone else's canvas, or an owner with no mirror chat. The marker hides BottomNav (the
 *    shared predicate), so left on a plain page it would strip the navigation from a page with no bar of its own. Only once
 *    eligibility is KNOWN (auth and chats loaded), never while it is still loading.
 */
import { useEffect } from 'react';
import type { Location } from 'react-router-dom';
import { CANVAS_WORKSPACE_PARAM } from '@/app/components/layout/bottom-nav-routes';
import { isViewingDraft, type CanvasReady } from '@/app/components/canvas/canvas-page-data';

export function useWorkspaceMarker(args: {
  eligible: boolean;
  /** Auth and the chat list have answered: `eligible` is a fact now, not a guess. */
  resolved: boolean;
  params: URLSearchParams;
  setParams: (next: (prev: URLSearchParams) => URLSearchParams, options: { replace: boolean; state: Location['state'] }) => void;
  state: Location['state'];
  reported: { ready: CanvasReady | null; forVersion: string | null };
}): void {
  const { eligible, resolved, params, setParams, state, reported } = args;
  const marked = params.get(CANVAS_WORKSPACE_PARAM) === '1';
  const draftOnScreen = !!reported.ready && isViewingDraft(reported.ready) && reported.forVersion === params.get('v');
  const add = eligible && !marked && (draftOnScreen || params.has('thread'));
  const remove = resolved && !eligible && marked;
  useEffect(() => {
    if (!add && !remove) return;
    setParams(prev => {
      const next = new URLSearchParams(prev);
      if (add) {
        next.delete('thread');
        next.set(CANVAS_WORKSPACE_PARAM, '1');
      } else {
        next.delete(CANVAS_WORKSPACE_PARAM);
      }
      return next;
    }, { replace: true, state });
  }, [add, remove, setParams, state]);
}
