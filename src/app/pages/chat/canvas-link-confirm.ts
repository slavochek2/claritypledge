/**
 * P1653 F3: the two buttons under the mirror's reply to a link that only gave a thin page ("Is this your business?"). Labels, tokens and the
 * marker are the server's (canvas-reply-table.ts), imported and never copied. A tap sends ONLY the fixed token as the owner's message: nothing the
 * agent wrote ever travels back, so a tap cannot add evidence. Pure: the node that draws them is CanvasLinkConfirm.
 */
import type { ChatMessage } from '@/app/data/chat-service';
import { PAGE_BUTTONS, pageButtonsFor } from '../../../../supabase/functions/_shared/canvas-reply-table.ts';

export const LINK_YES_LABEL = PAGE_BUTTONS.yes.label;
export const LINK_NO_LABEL = PAGE_BUTTONS.no.label;
export const LINK_CONFIRM_QUESTION = PAGE_BUTTONS.question;
export const LINK_YES_TOKEN = PAGE_BUTTONS.yes.token;
export const LINK_NO_TOKEN = PAGE_BUTTONS.no.token;

/** The reply carries the buttons: the mirror's own message (not the owner's, not deleted) whose last line is the fixed question. */
export function carriesLinkConfirm(m: ChatMessage, userId: string): boolean {
  return !m.isDeleted && m.authorId !== userId && pageButtonsFor(m.body) !== null;
}

/**
 * Every message the buttons sit under, and whether each is still live. Live means the reply is the newest message of the thread (the root is
 * hidden and never counts): once anything came after it (an answer, a typed message, another reply) the canvas has moved on and the buttons
 * are gone. A stale tap that still arrives (a second tab) is answered by the server and changes nothing. Empty when no reply carries them.
 */
export function linkConfirmTargets(messages: ChatMessage[], userId: string, rootId: string): { afterId: string; live: boolean }[] {
  let newest: ChatMessage | null = null;
  const carriers: ChatMessage[] = [];
  for (const m of messages) {
    if (m.id === rootId || m.isDeleted) continue;
    if (!newest || m.createdAt >= newest.createdAt) newest = m;
    if (carriesLinkConfirm(m, userId)) carriers.push(m);
  }
  return carriers.map((m) => ({ afterId: m.id, live: m.id === newest?.id }));
}
