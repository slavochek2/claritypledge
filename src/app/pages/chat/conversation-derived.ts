/**
 * P1512: values the conversation pane derives from its summary and its messages (moved out of ConversationPane unchanged):
 * the composer's hint and empty-state line for each kind of conversation, and the message "read through".
 */
import type { ChatMessage, ChatSummary } from '@/app/data/chat-service';
import { compareMessages } from './chat-view-model';

/**
 * "Through" is a message id, never a time: created_at has microseconds a JS Date cannot say, and a time just short of the
 * newest message would leave it unread and ask again, forever.
 */
export function readThroughId(server: ChatMessage[], listed: ChatSummary['lastMessage']): string | undefined {
  const shownNewest = [...server].reverse().find((m) => !m.threadRootId);
  return listed && (!shownNewest || compareMessages(listed, shownNewest) >= 0) ? listed.id : shownNewest?.id;
}

export function conversationCopy(summary: ChatSummary): { placeholder: string; empty: string | null } {
  const other = summary.other;
  const first = (other?.name ?? '').split(' ')[0] ?? '';
  const placeholder =
    summary.kind === 'dm' ? `Message ${first || 'them'}` : summary.kind === 'group' ? `Message ${summary.org?.name ?? 'the group'}` : summary.kind === 'event' ? `Message ${summary.event?.title ?? 'the event'}` : 'Write to your mirror agent';
  const empty =
    summary.kind === 'dm'
      ? `No messages yet. Say hello${first ? ` to ${first}` : ''}.`
      : summary.kind === 'mirror'
        ? null
        : 'No messages yet.';
  return { placeholder, empty };
}
