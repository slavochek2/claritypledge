/**
 * P1536 D7: Undo's pieces as the nodes a message list draws right under a message (by message id): the button or its waiting status under the reply, the "Undone" mark under an
 * owner message whose run was undone. Split from use-canvas-parts so that file stays a list of pieces.
 */
import type { ReactNode } from 'react';
import type { ChatMessage } from '@/app/data/chat-service';
import { CanvasUndoButton, CanvasUndoneMark, CanvasUndoOff, CanvasUndoRetry, CanvasUndoWaits } from './CanvasUndo';
import type { CanvasUndoView } from './use-canvas-undo';

/** Where a failed read's Try again sits: under the newest message that is the mirror's (not the owner's, not the root). */
export function newestMirrorMessageId(messages: ChatMessage[], userId: string, rootId: string): string | null {
  let best: ChatMessage | null = null;
  for (const m of messages) {
    if (m.id === rootId || m.authorId === userId || m.isDeleted) continue;
    if (!best || m.createdAt >= best.createdAt) best = m;
  }
  return best?.id ?? null;
}

export function canvasUndoAfter(view: CanvasUndoView, failedAfterId: string | null): Record<string, ReactNode> {
  const out: Record<string, ReactNode> = {};
  for (const id of view.undoneIds) out[id] = <CanvasUndoneMark />;
  if (view.replyId) out[view.replyId] = view.waiting ? <CanvasUndoWaits /> : <CanvasUndoButton busy={view.busy} onUndo={view.undo} />;
  // Round 3: no run can be undone because a hand write closed Undo: under the newest mirror message, where the button would have been.
  if (view.handClosed && !view.replyId && failedAfterId && !out[failedAfterId]) out[failedAfterId] = <CanvasUndoOff />;
  if (view.failed && failedAfterId && !out[failedAfterId]) out[failedAfterId] = <CanvasUndoRetry onRetry={view.retry} />;
  return out;
}
