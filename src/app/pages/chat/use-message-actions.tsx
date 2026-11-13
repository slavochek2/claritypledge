/**
 * P1512: what pressing Forward, Clarify, Delete or the chat's Mark as unread does — shared by the
 * conversation and its thread panel so the two can never disagree.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { type ChatMessage, type ChatSummary } from '@/app/data/chat-service';
import { ConfirmDialog, ForwardDialog } from './ChatDialogs';
import type { ListActions } from './MessageList';
import { useChat } from './chat-state';
import { startClarify } from '@/app/data/clarify-service';
import { pressClarify } from './clarify-press';
import { useClarifyAvailable } from './use-clarify-availability';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLeaveChat } from './chat-hooks';
import { chatPath, isChatVisibleInList } from './chat-view-model';
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
  const [forwardSource, setForwardSource] = useState<ChatMessage | null>(null);
  const [deleteSource, setDeleteSource] = useState<ChatMessage | null>(null);
  const { chats, authors, setManualUnread, refresh, goToChat } = chat;
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;
  const locationRef = useRef(location);
  locationRef.current = location;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const { remove } = conv;
  const conversationId = summary.conversationId;
  const clarifyOn = useClarifyAvailable(summary);

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
      onClarify: clarifyOn
        ? (m: ChatMessage) => {
            // P1631: a new Mirror thread opens beside this chat and the first draft starts at once. A press while a draft is being made is answered `busy` and does nothing further.
            pressClarify({
              start: async () => {
                const r = await startClarify(m.id);
                return r.status === 'started' ? { status: 'started', draftId: r.draftId, threadRootId: r.threadRootId, mirrorConversationId: r.mirrorConversationId } : { status: 'busy' };
              },
              navigate, here: () => locationRef.current, alive: () => mounted.current, startedAt: pathname, openOn: pathname, run: true,
            });
          }
        : undefined,
    }),
    [onReply, onThread, leave, navigate, pathname, setManualUnread, conversationId, clarifyOn],
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
