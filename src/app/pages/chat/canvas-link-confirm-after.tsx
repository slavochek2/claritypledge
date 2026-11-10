/**
 * P1653 F3: the link-confirm buttons as nodes a message list draws right under a reply (by message id), for an open draft only. Split from
 * use-canvas-parts so that file stays a list of pieces. Where Undo or the offer rows already sit under the same reply, the buttons come first.
 */
import type { ReactNode } from 'react';
import type { ChatMessage } from '@/app/data/chat-service';
import { CanvasLinkConfirm } from './CanvasLinkConfirm';
import { linkConfirmTargets } from './canvas-link-confirm';
import type { CanvasThread } from './use-canvas-thread';

export function withLinkConfirm(after: Record<string, ReactNode>, args: { live: CanvasThread | null; messages: ChatMessage[]; userId: string; rootId: string; send: ((body: string) => Promise<boolean>) | null }): Record<string, ReactNode> {
  if (!args.live || args.live.draft.state !== 'open') return after;
  const out = { ...after };
  for (const t of linkConfirmTargets(args.messages, args.userId, args.rootId)) {
    const there = out[t.afterId];
    const node = <CanvasLinkConfirm key={`link-confirm-${t.afterId}`} live={t.live && !args.live.running} send={args.send} />;
    out[t.afterId] = there ? <>{node}{there}</> : node;
  }
  return out;
}
