/**
 * @file use-canvas-open-offers.tsx
 * @description P1536 S5 (J7, J8, J9): the offer rows of an OPEN draft's thread, as the node a message list draws under the thread's newest message. The offers are the server's, read
 * once per change of the draft (use-canvas-offers); they are one durable block, not a part of any reply, because an offer outlives the reply that made it (a later run that names the
 * same group adds no second row, Undo of the run that made it deletes it). Nothing is drawn for a draft with no live offer.
 */
import type { ReactNode } from 'react';
import type { ChatMessage } from '@/app/data/chat-service';
import { CanvasOffersPanel } from './CanvasOffersPanel';
import type { OfferRowsStatus } from './CanvasOfferRows';
import { liveOffers, openOffersKey, useCanvasOffers } from './use-canvas-offers';
import type { CanvasThread } from './use-canvas-thread';

/** The newest message of the thread that is not its hidden root: the block sits under it, wherever the conversation has got to. */
export function newestThreadMessageId(messages: ChatMessage[], rootId: string): string | null {
  let best: ChatMessage | null = null;
  for (const m of messages) {
    if (m.id === rootId || m.isDeleted) continue;
    if (!best || m.createdAt >= best.createdAt) best = m;
  }
  return best?.id ?? null;
}

/** The message list's "after" nodes with the offer block added under its message; when Undo (or its status) already sits there, the block follows it. */
export function withOfferRows(after: Record<string, ReactNode>, rows: { afterId: string; node: ReactNode } | null): Record<string, ReactNode> {
  if (!rows) return after;
  const there = after[rows.afterId];
  return { ...after, [rows.afterId]: there ? <>{there}{rows.node}</> : rows.node };
}

export function useOpenOfferRows(live: CanvasThread | null, messages: ChatMessage[], rootId: string): { afterId: string; node: ReactNode } | null {
  const open = !!live && live.draft.state === 'open';
  const view = useCanvasOffers({ canvasId: open ? live.draft.canvasId : null, draftId: open ? live.draft.id : null, key: openOffersKey(live) });
  const afterId = newestThreadMessageId(messages, rootId);
  if (!open || !afterId || (!liveOffers(view.read).length && !view.failed)) return null;
  const status: OfferRowsStatus = live.running ? 'updating' : view.read?.activeElsewhere ? 'elsewhere' : null;
  return { afterId, node: <CanvasOffersPanel view={view} status={status} reload={live.reload} placement="thread" /> };
}
