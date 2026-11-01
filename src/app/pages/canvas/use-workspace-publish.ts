/**
 * @file use-workspace-publish.ts
 * @description P1536 W1: Publish from the workspace's bar. After it the page REPLACEs to the new version (the draft's own version row is the one
 * published) with no marker, so the panel closes, and a toast says it. `closedDraftId` is the draft just published: until the page has read
 * again, the read on screen still shows it open and must not bring the marker back.
 */
import { useCallback, useState } from 'react';
import type { Location } from 'react-router-dom';
import { toast } from 'sonner';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { useCanvasPublish } from '@/app/components/canvas/use-canvas-publish';
import { CANVAS_WORKSPACE_PARAM } from '@/app/components/layout/bottom-nav-routes';

export function useWorkspacePublish(args: {
  ready: CanvasReady | null;
  runActive: boolean;
  pendingClone: boolean;
  setParams: (next: (prev: URLSearchParams) => URLSearchParams, options: { replace: boolean; state: Location['state'] }) => void;
  state: Location['state'];
}) {
  const { ready, runActive, pendingClone, setParams, state } = args;
  const [closedDraftId, setClosedDraftId] = useState<string | null>(null);
  const published = useCallback(({ seq, versionName }: { seq: number; versionName: string }) => {
    setClosedDraftId(ready?.draft?.id ?? null);
    setParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('v', versionName);
      next.delete(CANVAS_WORKSPACE_PARAM);
      next.delete('thread');
      return next;
    }, { replace: true, state });
    toast.success(`Published v${seq}.`);
  }, [ready, setParams, state]);
  const { state: spot, publishing, publish } = useCanvasPublish(ready, runActive, published, pendingClone);
  return { closedDraftId, spot, publishing, publish };
}
