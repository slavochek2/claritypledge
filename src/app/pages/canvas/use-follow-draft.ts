/**
 * @file use-follow-draft.ts
 * @description P1536 J4/§2: the chat edits the OPEN draft. When the owner is looking at another version and a run starts (a Send in
 * that chat, an upload), the page moves to the draft, so the canvas shows what is changing and Publish follows it (a published view
 * ignores a draft's events). Only on the START of a run: choosing another version afterwards is not undone.
 */
import { useEffect, useRef } from 'react';
import { isViewingDraft, type CanvasReady } from '@/app/components/canvas/canvas-page-data';

export function useFollowDraft(runActive: boolean, ready: CanvasReady | null, show: (versionName: string) => void): void {
  const before = useRef(false);
  const latest = useRef({ ready, show });
  latest.current = { ready, show };
  useEffect(() => {
    const started = runActive && !before.current;
    before.current = runActive;
    const { ready: r, show: go } = latest.current;
    if (started && r?.draft && !isViewingDraft(r)) go(r.draft.version);
  }, [runActive]);
}
