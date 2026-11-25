/**
 * P1722: whether a message row offers Clarify. In the Mirror chat it is decided per message (the owner's own typed words, recordings and transcribed lines,
 * mirror-clarify.ts); in every other chat it is what it was: any row that may be copied.
 * A thread that holds Clarify or canvas-draft work is recognised by the DATA the row can see (its root message: a Clarify root, or a canvas version), so the answer
 * is right after a reload, before any client registry has been filled. The registries only ever add a refusal.
 */
import type { ChatMessage } from '@/app/data/chat-service';
import { isCanvasThread } from './canvas-thread-registry';
import { isClarifyThread } from './clarify-run';
import { isDraftThreadRoot, mirrorMessageClarifiable } from './mirror-clarify';

export function rowClarifiable(
  server: ChatMessage | null,
  mirrorConversationId: string | undefined,
  mine: boolean,
  noCopy: boolean,
  getLoaded?: (id: string) => ChatMessage | undefined,
): boolean {
  if (!server || !mirrorConversationId || server.conversationId !== mirrorConversationId) return !noCopy;
  // a thread whose root is not loaded cannot be told apart from a draft thread: not offered (the server would refuse it)
  const inDraftThread = (id: string | null) =>
    !!id && (isClarifyThread(id) || isCanvasThread(id) || isDraftThreadRoot(getLoaded?.(id)) || (id !== server.id && !getLoaded?.(id)));
  // `mine`: the viewer wrote it, so the author is the viewer
  return mirrorMessageClarifiable(server, { viewerId: mine ? server.authorId ?? '' : '', inDraftThread });
}
