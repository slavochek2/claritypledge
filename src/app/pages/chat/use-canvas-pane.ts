/**
 * P1536: the state a thread panel needs to host a canvas draft, in one hook: the thread is made known to the mirror, the
 * draft is read, a file can be added, and Send is wired (use-canvas-actions). What to draw from it is use-canvas-parts.
 */
import { useCallback, useEffect } from 'react';
import type { ChatMessage } from '@/app/data/chat-service';
import { registerCanvasThread } from './canvas-thread-registry';
import { useCanvasDraftAvailability } from './use-canvas-availability';
import { useCanvasActions } from './use-canvas-actions';
import { useCanvasThread } from './use-canvas-thread';
import { useCanvasUploads } from './use-canvas-uploads';

export function useCanvasPane({ canvasRoot, rootId, messages }: { canvasRoot: boolean; rootId: string; messages: ChatMessage[] }) {
  useEffect(() => {
    if (canvasRoot) registerCanvasThread(rootId);
  }, [canvasRoot, rootId]);
  const read = useCanvasThread(canvasRoot ? rootId : null, messages.length);
  const canvas = read.thread;
  const canvasOn = useCanvasDraftAvailability(canvasRoot);
  const reloadCanvas = canvas?.reload;
  const uploader = useCanvasUploads(canvas?.draft ?? null, useCallback(() => reloadCanvas?.() ?? Promise.resolve(), [reloadCanvas]));
  const actions = useCanvasActions({ thread: canvas, available: canvasOn });
  return { read, canvas, canvasOn, uploader, ...actions };
}
