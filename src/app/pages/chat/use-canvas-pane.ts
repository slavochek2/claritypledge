/**
 * P1536: the state a thread panel needs to host a canvas draft, in one hook: the thread is made known to the mirror, the
 * draft is read, a file can be added, and Send is wired (use-canvas-actions). What to draw from it is use-canvas-parts.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ChatMessage } from '@/app/data/chat-service';
import { registerCanvasThread } from './canvas-thread-registry';
import { useCanvasDraftAvailability } from './use-canvas-availability';
import { useCanvasActions } from './use-canvas-actions';
import { useCanvasThread } from './use-canvas-thread';
import { useCanvasUploads } from './use-canvas-uploads';

/** How long "Another of your canvases is updating." stays in the send slot after the server said so (no read tells when the other run ends). */
export const BUSY_ELSEWHERE_MS = 10_000;

export function useCanvasPane({ canvasRoot, rootId, messages }: { canvasRoot: boolean; rootId: string; messages: ChatMessage[] }) {
  useEffect(() => {
    if (canvasRoot) registerCanvasThread(rootId);
  }, [canvasRoot, rootId]);
  const read = useCanvasThread(canvasRoot ? rootId : null, messages.length);
  const canvas = read.thread;
  const canvasOn = useCanvasDraftAvailability(canvasRoot);
  const reloadCanvas = canvas?.reload;
  const uploader = useCanvasUploads(canvas?.draft ?? null, useCallback(() => reloadCanvas?.() ?? Promise.resolve(), [reloadCanvas]));
  const [elsewhere, setElsewhere] = useState(false);
  useEffect(() => {
    if (!elsewhere) return;
    const t = setTimeout(() => setElsewhere(false), BUSY_ELSEWHERE_MS);
    return () => clearTimeout(t);
  }, [elsewhere]);
  const actions = useCanvasActions({ thread: canvas, available: canvasOn, onBusyElsewhere: useCallback(() => setElsewhere(true), []) });
  return { read, canvas, canvasOn, uploader, elsewhere, ...actions };
}
