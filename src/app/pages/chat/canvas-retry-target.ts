/**
 * P1536: the owner message a failed run's "Try again" sits under. The run's trigger message is not readable by the client, but every
 * send makes its message and its run in one transaction and a retry only exists for the draft's NEWEST run, so the newest message of
 * the owner's own in the draft's thread (not the root, not a deleted one) is the one that run belongs to. Pure.
 */
import type { ChatMessage } from '@/app/data/chat-service';

export function retryTargetId(messages: ChatMessage[], userId: string, rootId: string): string | null {
  let best: ChatMessage | null = null;
  for (const m of messages) {
    if (m.id === rootId || m.authorId !== userId || m.isDeleted || m.kind !== 'message') continue;
    if (!best || m.createdAt >= best.createdAt) best = m;
  }
  return best?.id ?? null;
}
