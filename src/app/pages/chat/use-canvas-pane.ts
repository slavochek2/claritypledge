/**
 * P1536: the state a thread panel needs to host a canvas draft, in one hook: the thread is made known to the mirror, the
 * draft is read, files are uploaded, and the draft's actions are wired (use-canvas-actions). What to draw from it is
 * use-canvas-parts.
 */
import { useCallback, useEffect } from 'react';
import type { CanvasMaterialItem } from '@/app/data/canvas-draft-service';
import type { ChatMessage } from '@/app/data/chat-service';
import { registerCanvasThread } from './canvas-thread-registry';
import { useCanvasDraftAvailability } from './use-canvas-availability';
import { useCanvasActions } from './use-canvas-actions';
import { useCanvasThread } from './use-canvas-thread';
import { useCanvasUploads } from './use-canvas-uploads';

const NO_MATERIAL: CanvasMaterialItem[] = [];

export function useCanvasPane({ canvasRoot, rootId, messages, userId }: { canvasRoot: boolean; rootId: string; messages: ChatMessage[]; userId: string }) {
  useEffect(() => {
    if (canvasRoot) registerCanvasThread(rootId);
  }, [canvasRoot, rootId]);
  const read = useCanvasThread(canvasRoot ? rootId : null, messages.length, userId);
  const canvas = read.thread;
  const canvasOn = useCanvasDraftAvailability(canvasRoot);
  const reloadCanvas = canvas?.reload;
  const uploader = useCanvasUploads(canvas?.draft ?? null, useCallback(() => reloadCanvas?.() ?? Promise.resolve(), [reloadCanvas]), canvas?.material ?? NO_MATERIAL);
  const actions = useCanvasActions({ thread: canvas, available: canvasOn, messages, ownerId: userId, rootId, uploads: uploader.uploads });
  return { read, canvas, canvasOn, uploader, ...actions };
}
