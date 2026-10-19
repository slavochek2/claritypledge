/**
 * P1512: what pressing Forward, Clarify, Delete or Mark as unread does — shared by the
 * conversation and its thread panel so the two can never disagree.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/auth';
import { clarifyMessage, type ChatMessage, type ChatSummary } from '@/app/data/chat-service';
import { ConfirmDialog, ForwardDialog } from './ChatDialogs';
import type { ListActions } from './MessageList';
import { useChat } from './chat-state';
import { chatErrorText, chatPath, HOME, isChatVisibleInList } from './chat-view-model';
import type { ConversationApi } from './MessageList';

interface Options {
  summary: ChatSummary;
  conv: ConversationApi;
  onReply: (m: ChatMessage) => void;
  /** Absent where there are no threads (1:1s, the mirror) or inside the thread panel. */
  onThread?: (m: ChatMessage) => void;
}

export function useMessageActions({ summary, conv, onReply, onThread }: Options): { actions: ListActions; dialogs: ReactNode } {
  const chat = useChat();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [forwardSource, setForwardSource] = useState<ChatMessage | null>(null);
  const [deleteSource, setDeleteSource] = useState<ChatMessage | null>(null);
  const { chats, authors, setManualUnread, refresh } = chat;
  const { remove } = conv;
  const conversationId = summary.conversationId;

  const actions = useMemo<ListActions>(
    () => ({
      onReply,
      onThread,
      onForward: setForwardSource,
      onDelete: setDeleteSource,
      onMarkUnread: () => {
        // Leave first: an open chat marks itself read again the moment it sees the flag.
        navigate(HOME);
        void setManualUnread(conversationId, true);
      },
      onClarify:
        summary.kind === 'mirror'
          ? undefined
          : async (m: ChatMessage) => {
              try {
                const row = await clarifyMessage(m.id);
                toast('Sent to your mirror', {
                  action: { label: 'Open', onClick: () => navigate(chatPath(row.conversationId)) },
                });
              } catch (e) {
                toast.error(chatErrorText(e, 'Could not send this to your mirror.'));
              }
            },
    }),
    [onReply, onThread, navigate, setManualUnread, conversationId, summary.kind],
  );

  const forwardTargets = useMemo(
    () => chats.filter((c) => isChatVisibleInList(c) && c.canSend && !(c.kind === 'dm' && !c.other?.id)),
    [chats],
  );

  const dialogs = (
    <>
      {forwardSource && (
        <ForwardDialog
          source={forwardSource}
          authorName={(forwardSource.authorId && authors[forwardSource.authorId]?.name) || 'Deleted user'}
          chats={forwardTargets}
          revalidate={refresh}
          owner={{ name: user?.name ?? 'You', avatarUrl: user?.avatarUrl, avatarColor: user?.avatarColor }}
          onClose={() => setForwardSource(null)}
          onForwarded={(target) =>
            toast('Forwarded', { action: { label: 'Open', onClick: () => navigate(chatPath(target.conversationId)) } })
          }
        />
      )}
      {deleteSource && (
        <ConfirmDialog
          title="Delete this message?"
          description="It is removed for everyone in this chat. Copies already forwarded keep their own text."
          confirmLabel="Delete"
          onConfirm={() => remove(deleteSource.id)}
          onClose={() => setDeleteSource(null)}
        />
      )}
    </>
  );

  return { actions, dialogs };
}
