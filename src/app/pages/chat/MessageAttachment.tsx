/**
 * @file MessageAttachment.tsx
 * @description The attachment card under a message's own text: drawn for a plain message only (a forward or a clarify draws its quote instead). P1536 3c X10: the card of
 * a canvas thread's ROOT is told which message it is the root of, so it reads its thread's draft rather than the version the root attaches.
 * `stat`: the root's thread stats; its reply count tells the card a new reply arrived (the Publish reply is one), which is a signal to read again.
 * `compact`: the card drawn inside a quote (a forward or a clarify): the compact standard card, read by the version it names, never a thread root.
 * P1652: a plain message with NO attachment of its own may get the quiet card of the first own-app story, point or letter link in its words.
 */
import type { ChatMessage, ThreadStats } from '@/app/data/chat-service';
import { AttachmentCard } from './AttachmentCard';
import { ChatLinkCard } from './ChatLinkCard';
import { canvasRootId } from './canvas-root';

type Attached = Pick<ChatMessage, 'attachmentKind' | 'attachmentId'> & { body?: string | null };

export function MessageAttachment({ msg, server, viewerId, compact = false, stat }: { msg: Attached; server: ChatMessage | null; viewerId: string; compact?: boolean; stat?: ThreadStats }) {
  if (!msg.attachmentKind || !msg.attachmentId) {
    // No card inside a quote, on a copy, on a system post or a voice note's words; a transcription's words are spoken ones.
    const plain = !compact && (!server || (server.kind === 'message' && !server.systemKind && !server.audio && !server.isDeleted));
    return plain ? <ChatLinkCard body={msg.body} viewerId={viewerId} spoken={!!server?.isTranscription} /> : null;
  }
  if (compact) return <AttachmentCard kind={msg.attachmentKind} id={msg.attachmentId} viewerId={viewerId} compact />;
  if (server && server.kind !== 'message') return null;
  return <AttachmentCard kind={msg.attachmentKind} id={msg.attachmentId} viewerId={viewerId} rootId={canvasRootId(server)} count={stat?.count} />;
}
