/**
 * P1512: what pressing Forward, Clarify, Delete or the chat's Mark as unread does — shared by the
 * conversation and its thread panel so the two can never disagree.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { clarifyMessage, type ChatMessage, type ChatSummary } from '@/app/data/chat-service';
import { ConfirmDialog, ForwardDialog } from './ChatDialogs';
import type { ListActions } from './MessageList';
import { useChat } from './chat-state';
import { requestComposerFocus, useLeaveChat } from './chat-hooks';
import { chatErrorText, chatPath, isChatVisibleInList, mirrorName } from './chat-view-model';
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
  const leave = useLeaveChat();
  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;
  // Gone once the pane that pressed Clarify is (another chat was opened): then there is nothing to come back to.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [forwardSource, setForwardSource] = useState<ChatMessage | null>(null);
  const [deleteSource, setDeleteSource] = useState<ChatMessage | null>(null);
  const { chats, authors, setManualUnread, refresh, goToChat } = chat;
  const { remove } = conv;
  const conversationId = summary.conversationId;
  const mirror = mirrorName(chats.find((c) => c.kind === 'mirror'));

  const actions = useMemo<ListActions>(
    () => ({
      onReply,
      onThread,
      onForward: setForwardSource,
      onDelete: setDeleteSource,
      onMarkUnread: () => {
        // Leave first: an open chat marks itself read again the moment it sees the flag. Step back over the
        // chat's entries (replace when there is nothing to step back to), so Back does not return and read it.
        leave();
        void setManualUnread(conversationId, true);
      },
      onClarify:
        summary.kind === 'mirror'
          ? undefined
          : async (m: ChatMessage) => {
              const from = locationRef.current;
              try {
                const row = await clarifyMessage(m.id);
                if (!mounted.current || locationRef.current.key !== from.key) {
                  // They moved on while it sent: do not drag them away, just say it landed.
                  toast(`Sent to ${mirror} to clarify`, {
                    // goToChat reads where the person is when it is PRESSED: this screen may be long gone by then.
                    action: { label: 'Open', onClick: () => goToChat(chatPath(row.conversationId), 'follow') },
                  });
                  return;
                }
                // To the mirror, on top of where they were (its Back returns here), cursor in the composer for a note.
                requestComposerFocus(row.conversationId);
                goToChat(chatPath(row.conversationId), 'follow');
              } catch (e) {
                toast.error(chatErrorText(e, 'Could not send this to your mirror.'));
              }
            },
    }),
    [onReply, onThread, leave, goToChat, setManualUnread, conversationId, summary.kind, mirror],
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
          authorName={(forwardSource.authorId ? authors[forwardSource.authorId]?.name ?? 'Unknown member' : 'Deleted user')}
          chats={forwardTargets}
          revalidate={refresh}
          onClose={() => setForwardSource(null)}
          onForwarded={(target) =>
            toast('Forwarded', { action: { label: 'Open', onClick: () => goToChat(chatPath(target.conversationId), 'follow') } })
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
