/**
 * P1536 D7: Undo's pieces as the nodes a message list draws right under a message (by message id): the button or its waiting status under the reply, the "Undone" mark under an
 * owner message whose run was undone. Split from use-canvas-parts so that file stays a list of pieces.
 */
import type { ReactNode } from 'react';
import { CanvasUndoButton, CanvasUndoneMark, CanvasUndoWaits } from './CanvasUndo';
import type { CanvasUndoView } from './use-canvas-undo';

export function canvasUndoAfter(view: CanvasUndoView): Record<string, ReactNode> {
  const out: Record<string, ReactNode> = {};
  for (const id of view.undoneIds) out[id] = <CanvasUndoneMark />;
  if (view.replyId) out[view.replyId] = view.waiting ? <CanvasUndoWaits /> : <CanvasUndoButton busy={view.busy} onUndo={view.undo} />;
  return out;
}
