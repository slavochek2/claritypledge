/**
 * @file ConversationPane.tsx
 * @description P1512: one open conversation — header, messages, composer.
 *
 * The URL owns which conversation (and thread) is open, so Back works. Opening a conversation marks
 * it read (while the tab is visible) and keeps marking it read as messages arrive.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/auth';
import { Button } from '@/components/ui/button';
import { getMessage, type ChatMessage, type ChatSummary } from '@/app/data/chat-service';
import type { Shareable } from '@/app/data/chat-ui-helpers';
import { AttachDialog, ConfirmDialog, RenameMirrorDialog } from './ChatDialogs';
import { Composer } from './Composer';
import { ConversationHeader } from './ConversationHeader';
import { MessageList } from './MessageList';
import { QuoteBar, InlineError, MessagesSkeleton } from './chat-kit';
import { usePageVisible } from './chat-hooks';
import { useChat } from './chat-state';
import { chatErrorText, chatPath, HOME, isChannel, messageSummary } from './chat-view-model';
import { useConversationMessages } from './use-conversation';
import { useMessageActions } from './use-message-actions';

interface Props {
  conversationId: string;
  /** From a search hit (?m=): scroll to and flash this message. */
  highlightId: string | null;
}

/** A link to a chat the person cannot open (never existed, or access ended). */
function Unavailable() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center" data-testid="chat-unavailable">
      <p className="text-sm text-muted-foreground">This chat isn&apos;t available. It may not exist, or you may no longer have access to it.</p>
      <Button variant="outline" className="min-h-10" onClick={() => navigate(HOME)}>
        Back to chats
      </Button>
    </div>
  );
}

export function ConversationPane({ conversationId, highlightId }: Props) {
  const chat = useChat();
  const summary = chat.chats.find((c) => c.conversationId === conversationId);
  if (!summary) {
    if (chat.status === 'loading') {
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <MessagesSkeleton />
        </div>
      );
    }
    if (chat.status === 'error') return <InlineError what="this chat" onRetry={() => void chat.refresh()} />;
    return <Unavailable />;
  }
  return <ConversationBody key={conversationId} summary={summary} highlightId={highlightId} />;
}

function ConversationBody({ summary, highlightId }: { summary: ChatSummary; highlightId: string | null }) {
  const chat = useChat();
  const navigate = useNavigate();
  const { user } = useAuth();
  const conversationId = summary.conversationId;
  const channel = isChannel(summary);
  const conv = useConversationMessages({ conversationId, withThreads: channel });
  const visible = usePageVisible();

  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [attaching, setAttaching] = useState(false);
  const [staged, setStaged] = useState<Shareable | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [target, setTarget] = useState<string | null>(highlightId);

  const owner = useMemo(
    () => ({ name: user?.name ?? 'You', avatarUrl: user?.avatarUrl, avatarColor: user?.avatarColor }),
    [user?.name, user?.avatarUrl, user?.avatarColor],
  );
  const other = summary.other;
  // The list says who may send: canSend is false once either side blocked the other (never which),
  // blockedByMe says it was this person (offer Unblock), and an erased account has no id.
  const blocked = summary.kind === 'dm' && summary.blockedByMe;
  const unavailable = summary.kind === 'dm' && !other?.id;
  const cannotSend = summary.kind === 'dm' && !summary.canSend && !blocked && !unavailable;
  const blockId = other?.id ?? null;

  // A search hit that is a thread reply opens its thread instead.
  useEffect(() => {
    if (!highlightId) return;
    let live = true;
    getMessage(highlightId).then(
      (m) => {
        if (live && m?.threadRootId) navigate(chatPath(conversationId, { rootId: m.threadRootId, messageId: m.id }), { replace: true });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [highlightId, conversationId, navigate]);
  useEffect(() => setTarget(highlightId), [highlightId]);

  const onReply = useCallback((m: ChatMessage) => {
    setReplyTo(m);
    setFocusToken((t) => t + 1);
  }, []);
  const onThread = useCallback((m: ChatMessage) => navigate(chatPath(conversationId, { rootId: m.id })), [navigate, conversationId]);
  const { actions, dialogs } = useMessageActions({ summary, conv, onReply, onThread: channel ? onThread : undefined });

  // Read state: while this chat is open and in front, everything up to the newest message is read.
  // "Up to here" is the newer of what is on screen and what the list says exists: if the list is
  // ahead of the screen, marking only the screen's last message would leave the chat unread, and
  // the next refetch would ask again, forever.
  const shownAt = conv.server[conv.server.length - 1]?.createdAt;
  const listedAt = summary.lastMessage?.createdAt;
  const readAt = shownAt && listedAt ? (Date.parse(shownAt) >= Date.parse(listedAt) ? shownAt : listedAt) : shownAt ?? listedAt;
  const { markRead } = chat;
  const unread = summary.unreadCount > 0 || summary.manualUnread;
  useEffect(() => {
    if (conv.status !== 'ready' || !visible || !unread) return;
    void markRead(conversationId, readAt);
  }, [conv.status, visible, unread, markRead, conversationId, readAt]);

  const first = (other?.name ?? '').split(' ')[0] ?? '';
  const placeholder =
    summary.kind === 'dm' ? `Message ${first || 'them'}` : summary.kind === 'group' ? `Message ${summary.org?.name ?? 'the group'}` : summary.kind === 'event' ? `Message ${summary.event?.title ?? 'the event'}` : 'Write to your mirror';
  const empty =
    summary.kind === 'dm'
      ? `No messages yet. Say hello${first ? ` to ${first}` : ''}.`
      : summary.kind === 'mirror'
        ? 'Use Clarify on any message to send it here, or write a note to yourself.'
        : 'No messages yet.';

  const quoteName = replyTo ? (replyTo.authorId ? chat.authors[replyTo.authorId]?.name ?? 'Unknown' : 'Deleted user') : '';

  const headerActions = {
    onBack: () => navigate(HOME),
    onArchive: () => {
      const next = !summary.archived;
      if (next) navigate(HOME);
      void chat.setArchived(conversationId, next);
    },
    onMarkUnread: actions.onMarkUnread,
    onBlock: () => setBlocking(true),
    onUnblock: () => {
      if (!other?.id) return;
      chat.unblock(other.id).then(
        () => toast(`Unblocked ${other.name}`),
        (e) => toast.error(chatErrorText(e)),
      );
    },
    onRename: () => setRenaming(true),
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col" data-testid="conversation" data-chat-open={conversationId}>
      <ConversationHeader chat={summary} owner={owner} blocked={blocked} actions={headerActions} />
      <MessageList
        conv={conv}
        actions={actions}
        viewerId={chat.userId}
        authors={chat.authors}
        label="Messages"
        targetId={target}
        empty={empty}
      />
      {blocked || unavailable || cannotSend ? (
        <div className="shrink-0 border-t px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" data-testid="composer-blocked">
          <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
              {unavailable
                ? 'This person is no longer available, so you cannot send new messages here.'
                : cannotSend
                  ? 'You cannot send messages in this chat.'
                  : `You blocked ${other?.name}. Unblock to send messages.`}
            </p>
            {blocked && (
              <Button variant="outline" className="min-h-10" onClick={headerActions.onUnblock}>
                Unblock
              </Button>
            )}
          </div>
        </div>
      ) : (
        <Composer
          draftKey={conversationId}
          placeholder={placeholder}
          focusToken={focusToken}
          autoFocus
          onAttach={() => setAttaching(true)}
          staged={staged}
          onUnstage={() => setStaged(null)}
          quote={replyTo && <QuoteBar author={quoteName} text={messageSummary(replyTo)} onRemove={() => setReplyTo(null)} />}
          onSend={(body, attachment) => {
            void conv.send({
              body,
              replyToId: replyTo?.id,
              attachment: attachment ? { kind: attachment.kind, id: attachment.id } : undefined,
            });
            setReplyTo(null);
            setStaged(null);
          }}
        />
      )}
      {dialogs}
      {attaching && (
        <AttachDialog
          viewerId={chat.userId}
          onClose={() => setAttaching(false)}
          onPick={(s) => {
            setStaged(s);
            setAttaching(false);
            setFocusToken((t) => t + 1);
          }}
        />
      )}
      {renaming && (
        <RenameMirrorDialog
          initial={summary.title ?? 'Mirror'}
          onClose={() => setRenaming(false)}
          onSaved={() => void chat.refresh()}
        />
      )}
      {blocking && blockId && other && (
        <ConfirmDialog
          title={`Block ${other.name}?`}
          description="They will not be able to message you, start a new chat with you or find you in search. Your existing messages stay. You can unblock them any time."
          confirmLabel="Block"
          onConfirm={async () => {
            await chat.block(blockId);
            toast(`Blocked ${other.name}`);
          }}
          onClose={() => setBlocking(false)}
        />
      )}
    </div>
  );
}
