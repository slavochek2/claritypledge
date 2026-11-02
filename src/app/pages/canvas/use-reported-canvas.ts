/**
 * @file use-reported-canvas.ts
 * @description P1536 D4/W1/W8 pieces of the workspace route, split out of canvas-with-thread.
 *  - `useReportedCanvas`: the page's latest read, and `held`: the last read that had content, FOR the owner+canvas it was read at. The chat keeps its thread through the page's
 *    reloads (a version change, a re-read), so it is not remounted; but a read of another canvas never shows under this address.
 *  - `useThreadOnPending`: 3c X13, a pending Clone (the Clone tap, a reload of its address, Start over from the J4 sheet, Add to chat) opens on Thread, because typing is next.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';
import type { WorkspaceView } from '@/app/components/canvas/canvas-workspace-layout';

export interface ReportedCanvas { ready: CanvasReady | null; forVersion: string | null; held: { ready: CanvasReady; identity: string } | null }

export function useReportedCanvas(handle: string | undefined, projectTag: string | null) {
  const identity = `${(handle ?? '').toLowerCase()}/${projectTag ?? ''}`;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const [reported, setReported] = useState<ReportedCanvas>({ ready: null, forVersion: null, held: null });
  const held = reported.held && reported.held.identity === identity ? reported.held.ready : null;
  const reportReady = useCallback((ready: CanvasReady | null, forVersion: string | null) => {
    setReported(prev => ({ ready, forVersion, held: ready ? { ready, identity: identityRef.current } : prev.held }));
  }, []);
  return { reported, held, reportReady };
}

export function useThreadOnPending(pendingVersion: string | null, setView: (v: WorkspaceView) => void): void {
  useEffect(() => { if (pendingVersion) setView('chat'); }, [pendingVersion, setView]);
}
