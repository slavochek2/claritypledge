/**
 * @file use-workspace-nav.ts
 * @description P1536 W1, 3c X13: the workspace route's address moves, as callbacks: show a draft (the workspace on it), show it on the Canvas tab, pick a version, go back.
 * 3c X13: anything that opens an EXISTING draft (Open draft, a Clone or Clone a version landing on one, Add to my draft, Go to draft) opens on Canvas, because the owner came to
 * look; a first Send that made the draft keeps the tab it was typed on, and a run that starts elsewhere moves the page without taking the tab (`openedDraft`).
 */
import { useCallback } from 'react';
import { useSearchParams, type Location, type NavigateFunction } from 'react-router-dom';
import { CANVAS_WORKSPACE_PARAM } from '@/app/components/layout/bottom-nav-routes';
import type { WorkspaceView } from '@/app/components/canvas/canvas-workspace-layout';
import { workspaceBackTarget } from './canvas-workspace-back';

export function useWorkspaceNav(args: {
  setParams: (next: (prev: URLSearchParams) => URLSearchParams, options: { replace?: boolean; state: Location['state'] }) => void;
  state: Location['state'];
  openPanel: () => void;
  setView: (v: WorkspaceView) => void;
  navigate: NavigateFunction;
  /** P1613: the version named is a draft. */
  isDraft?: (version: string) => boolean;
}) {
  const { setParams, state, openPanel, setView, navigate, isDraft } = args;
  // P1613: while the address holds a comparison (`with`), a move into a draft drops it in the same update, as a new history entry, so Back returns to the comparison.
  const comparing = useSearchParams()[0].has('with');
  const openedDraft = useCallback((versionName: string) => {
    openPanel();
    setParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('v', versionName);
      next.set(CANVAS_WORKSPACE_PARAM, '1');
      next.delete('with');
      return next;
    }, { replace: !comparing, state });
  }, [setParams, state, openPanel, comparing]);
  const openExistingDraft = useCallback((versionName: string) => { setView('canvas'); openedDraft(versionName); }, [setView, openedDraft]);
  const pickVersion = useCallback((version: string) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('v', version);
      next.delete('point');
      next.delete('box');
      if (isDraft?.(version)) next.delete('with'); // P1613: a comparison never goes into a draft (this move already pushes an entry, so Back restores it)
      return next;
    }, { state });
  }, [setParams, state, isDraft]);
  const goBack = useCallback(() => navigate(workspaceBackTarget({ state })), [navigate, state]);
  return { openedDraft, openExistingDraft, pickVersion, goBack };
}
