/**
 * @file MessageAttachment.tsx
 * @description The attachment card under a message's own text: drawn for a plain message only (a forward or a clarify draws its quote instead). P1536 3c X10: the card of
 * a canvas thread's ROOT is told which message it is the root of, so it reads its thread's draft rather than the version the root attaches.
 * `stat`: the root's thread stats; its reply count is the card's refresh key (a new reply tells it to read again).
 * `compact`: the card drawn inside a quote (a forward or a clarify): the compact standard card, read by the version it names, never a thread root.
 */
import type { ChatMessage, ThreadStats } from '@/app/data/chat-service';
import { AttachmentCard } from './AttachmentCard';
import { canvasRootId } from './canvas-root';

export function MessageAttachment({ msg, server, viewerId, compact = false, stat }: { msg: Pick<ChatMessage, 'attachmentKind' | 'attachmentId'>; server: ChatMessage | null; viewerId: string; compact?: boolean; stat?: ThreadStats }) {
  if (!msg.attachmentKind || !msg.attachmentId) return null;
  if (compact) return <AttachmentCard kind={msg.attachmentKind} id={msg.attachmentId} viewerId={viewerId} compact />;
  if (server && server.kind !== 'message') return null;
  return <AttachmentCard kind={msg.attachmentKind} id={msg.attachmentId} viewerId={viewerId} rootId={canvasRootId(server)} refreshKey={stat?.count} />;
}
