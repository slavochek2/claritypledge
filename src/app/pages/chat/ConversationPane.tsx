/**
 * @file ConversationPane.tsx
 * @description P1512: one open conversation — header, messages, composer.
 *
 * The URL owns which conversation (and thread) is open, so Back works. Opening a conversation marks
 * it read (while the tab is visible) and keeps marking it read as messages arrive.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { clarifyMessage, getMessage, type ChatMessage, type ChatSummary } from '@/app/data/chat-service';
import type { Shareable } from '@/app/data/chat-ui-helpers';
import { AttachDialog, ConfirmDialog, RenameMirrorDialog } from './ChatDialogs';
import { Composer, type MentionEntry } from './Composer';
import { ConversationHeader } from './ConversationHeader';
import { MessageList } from './MessageList';
import { Quote } from './Quote';
import { InlineError, MessagesSkeleton, MirrorMark } from './chat-kit';
import { MirrorInfoDialog } from './MirrorInfoDialog';
import { useMirror } from './mirror-state';
import { useMirrorAsks } from './use-mirror-asks';
import { isLeavingChat, takeStagedClarify, onClarifyStaged, takeComposerFocus, type StagedClarify, useBack, useChatNavigate, useLeaveChat, usePageVisible } from './chat-hooks';
import { useChat } from './chat-state';
import { chatErrorText, chatPath, compareMessages, hasWayBackElsewhere, isChannel, messageSummary, mirrorRole } from './chat-view-model';
import { useConversationMessages } from './use-conversation';
import { useMessageActions } from './use-message-actions';

interface Props {
  conversationId: string;
  /** From a search hit (?m=): scroll to and flash this message. */
  highlightId: string | null;
  /** False while CSS hides this pane (a phone showing a thread): nothing here may count as seen. */
  paneVisible: boolean;
}

/** A link to a chat the person cannot open (never existed, or access ended). */
function Unavailable() {
  const back = useBack();
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center" data-testid="chat-unavailable">
      <p className="text-sm text-muted-foreground">This chat isn&apos;t available. It may not exist, or you may no longer have access to it.</p>
      <Button variant="outline" className="min-h-10" onClick={back}>
        Back to chats
      </Button>
    </div>
  );
}

export function ConversationPane({ conversationId, highlightId, paneVisible }: Props) {
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
  return <ConversationBody key={conversationId} summary={summary} highlightId={highlightId} paneVisible={paneVisible} />;
}

function ConversationBody({ summary, highlightId, paneVisible }: { summary: ChatSummary; highlightId: string | null; paneVisible: boolean }) {
  const chat = useChat();
  const go = useChatNavigate();
  const conversationId = summary.conversationId;
  const channel = isChannel(summary);
  const conv = useConversationMessages({ conversationId, withThreads: true });
  const visible = usePageVisible();
  const mirror = useMirror();
  const mirrorOn = mirror?.enabled === true;
  // P1520: the viewer's own private asks in this channel (rows of their mirror), and the @ picker's one entry.
  const privateRows = useMirrorAsks(conversationId, channel && mirrorOn);
  const mirrorChat = chat.chats.find((c) => c.kind === 'mirror');
  const [privateTo, setPrivateTo] = useState<MentionEntry | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const mentions = useMemo<MentionEntry[] | undefined>(
    () =>
      channel && mirrorOn
        ? [{
            id: 'mirror',
            label: mirrorChat?.title ?? mirrorRole(),
            detail: mirrorChat?.title ? `${mirrorRole()} (private)` : 'private',
            mark: <MirrorMark size="sm" />,
            keywords: ['mirror', 'your mirror'],
          }]
        : undefined,
    [channel, mirrorOn, mirrorChat?.title],
  );

  // The mirror gets its face the first time its owner opens it.
  const ensurePortrait = mirror?.ensurePortrait;
  useEffect(() => {
    if (summary.kind === 'mirror') ensurePortrait?.();
  }, [summary.kind, ensurePortrait]);

  // After a reload, the owner's latest unanswered messages say whether the mirror is still on them, or failed.
  const loadStatuses = mirror?.loadStatuses;
  const ownRows = summary.kind === 'mirror' ? conv.server : channel ? privateRows : null;
  useEffect(() => {
    if (!ownRows || !loadStatuses) return;
    const answered = new Set(ownRows.filter((m) => m.kind === 'agent' && m.replyToId).map((m) => m.replyToId));
    const waiting = ownRows
      .filter((m) => m.authorId === chat.userId && (m.kind === 'message' || m.kind === 'clarify') && !m.isDeleted && !answered.has(m.id))
      .slice(-20)
      .map((m) => m.id);
    loadStatuses(waiting);
  }, [ownRows, loadStatuses, chat.userId]);

  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  // Opened by Clarify or the New message picker: the cursor goes straight into the composer (asked for once, see chat-hooks).
  useEffect(() => {
    if (takeComposerFocus(conversationId)) setFocusToken((t) => t + 1);
  }, [conversationId]);
  const [attaching, setAttaching] = useState(false);
  const [staged, setStaged] = useState<Shareable | null>(null);
  // A Clarify waiting for its note (the mirror only): nothing has been sent until Send.
  const [clarify, setClarify] = useState<StagedClarify | null>(null);
  const [clarifyBusy, setClarifyBusy] = useState(false);
  const clarifying = useRef(false);
  const location = useLocation();
  // Take a staged Clarify when it is there: on arrival, when the address changes, and when one is staged for a mirror pane
  // that is already open. Only ever sets (never clears) so a StrictMode replay, which finds nothing left, cannot wipe it.
  const readStaged = useCallback(() => {
    if (summary.kind !== 'mirror') return;
    const waiting = takeStagedClarify(summary.conversationId);
    if (!waiting) return;
    setClarify(waiting);
    setReplyTo(null); // a reply and a Clarify are never pending together
  }, [summary.kind, summary.conversationId]);
  const shownFor = useRef(summary.conversationId);
  useEffect(() => {
    if (shownFor.current !== summary.conversationId) {
      shownFor.current = summary.conversationId;
      setClarify(null); // the pane was reused for another conversation
    }
    readStaged();
  }, [summary.conversationId, location.key, readStaged]);
  useEffect(() => onClarifyStaged(readStaged), [readStaged]);
  const [renaming, setRenaming] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [target, setTarget] = useState<string | null>(highlightId);

  const other = summary.other;
  // The list says who may send: canSend is false once either side blocked the other (never which),
  // blockedByMe says it was this person (offer Unblock), and an erased account has no id.
  const blocked = summary.kind === 'dm' && summary.blockedByMe;
  const unavailable = summary.kind === 'dm' && !other?.id;
  const cannotSend = summary.kind === 'dm' && !summary.canSend && !blocked && !unavailable;
  const blockId = other?.id ?? null;

  // A search hit that is a thread reply opens its thread instead, in the chat's place.
  useEffect(() => {
    if (!highlightId) return;
    let live = true;
    getMessage(highlightId).then(
      (m) => {
        if (live && m?.threadRootId) go(chatPath(conversationId, { rootId: m.threadRootId, messageId: m.id }), 'redirect');
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [highlightId, conversationId, go]);
  useEffect(() => setTarget(highlightId), [highlightId]);

  const onReply = useCallback((m: ChatMessage) => {
    setClarify(null); // a reply and a Clarify are never pending together
    setReplyTo(m);
    setFocusToken((t) => t + 1);
  }, []);
  // The thread opens on top of this chat; with one already open (desktop, side by side) the same one is left alone
  // and another replaces it (chatNav), so closing never reopens the first.
  const onThread = useCallback((m: ChatMessage) => go(chatPath(conversationId, { rootId: m.id })), [go, conversationId]);
  const { actions, dialogs } = useMessageActions({ summary, conv, onReply, onThread });

  // Read state: while this chat is open, in front AND on screen, everything up to the newest message is
  // read. "Through" is a message id, never a time: created_at has microseconds a JS Date cannot say,
  // and a time just short of the newest message would leave it unread and ask again, forever.
  const shownNewest = [...conv.server].reverse().find((m) => !m.threadRootId);
  const listed = summary.lastMessage;
  const through =
    listed && (!shownNewest || compareMessages(listed, shownNewest) >= 0) ? listed.id : shownNewest?.id;
  const { markRead, setViewing } = chat;
  const unread = summary.unreadCount > 0 || summary.manualUnread;
  const seen = visible && paneVisible;
  useEffect(() => {
    if (!seen || isLeavingChat()) return;
    setViewing(conversationId);
    return () => setViewing(null);
  }, [seen, conversationId, setViewing]);
  useEffect(() => {
    // Not while it is being left for good: that is exactly when it was just marked unread.
    if (conv.status !== 'ready' || !seen || !unread || isLeavingChat()) return;
    void markRead(conversationId, through);
  }, [conv.status, seen, unread, markRead, conversationId, through]);

  const first = (other?.name ?? '').split(' ')[0] ?? '';
  const placeholder =
    summary.kind === 'dm' ? `Message ${first || 'them'}` : summary.kind === 'group' ? `Message ${summary.org?.name ?? 'the group'}` : summary.kind === 'event' ? `Message ${summary.event?.title ?? 'the event'}` : 'Write to your mirror';
  const empty =
    summary.kind === 'dm'
      ? `No messages yet. Say hello${first ? ` to ${first}` : ''}.`
      : summary.kind === 'mirror'
        ? 'Use Clarify on any message to send it here, or write a note to yourself.'
        : 'No messages yet.';

  const quoteName = replyTo ? (replyTo.authorId ? chat.authors[replyTo.authorId]?.name ?? 'Unknown member' : 'Deleted user') : '';

  const back = useBack();
  const cameFromElsewhere = hasWayBackElsewhere(useLocation().state);
  const leave = useLeaveChat();
  const headerActions = {
    onBack: back,
    onArchive: () => {
      const next = !summary.archived;
      // The chat leaves the list: step back to the list (or replace with it), so Back never returns to it.
      if (next) leave();
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
    onMirrorInfo: summary.kind === 'mirror' ? () => setInfoOpen(true) : undefined,
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col" data-testid="conversation" data-chat-open={conversationId}>
      <ConversationHeader chat={summary} blocked={blocked} actions={headerActions} cameFromElsewhere={cameFromElsewhere} />
      <MessageList
        conv={conv}
        actions={actions}
        viewerId={chat.userId}
        authors={chat.authors}
        label="Messages"
        targetId={target}
        empty={empty}
        privateRows={channel && mirrorOn ? privateRows : undefined}
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
          // A private ask has its own draft: text typed for the mirror can never reappear in the channel's composer.
          draftKey={`${chat.userId}:${conversationId}${privateTo ? ':private' : ''}`}
          placeholder={placeholder}
          focusToken={focusToken}
          autoFocus
          onAttach={privateTo ? undefined : () => setAttaching(true)}
          staged={staged}
          onUnstage={() => setStaged(null)}
          quote={
            clarify ? (
              <div className="px-2 pb-1 pt-1" data-testid="clarify-bar">
                <Quote
                  testId="clarify-pending"
                  label="Clarify"
                  body={
                    <>
                      <span className="mt-0.5 block text-sm font-semibold text-foreground">{clarify.authorName}</span>
                      <span className="block line-clamp-2 break-words text-sm text-muted-foreground">{messageSummary(clarify.message)}</span>
                    </>
                  }
                  onRemove={() => setClarify(null)}
                  removeLabel="Cancel clarify"
                />
              </div>
            ) : replyTo && (
              <div className="px-2 pb-1 pt-1" data-testid="reply-bar">
                <Quote
                  testId="reply-pending"
                  label={`Reply to ${quoteName}`}
                  body={<span className="mt-0.5 block line-clamp-2 break-words text-sm text-muted-foreground">{messageSummary(replyTo)}</span>}
                  onRemove={() => setReplyTo(null)}
                  removeLabel="Cancel reply"
                />
              </div>
            )
          }
          quoteSendable={!!clarify}
          sendDisabled={clarifyBusy}
          mentions={mentions}
          privateTo={privateTo}
          onPrivateChange={(entry) => {
            setPrivateTo(entry);
            if (entry) {
              setReplyTo(null); // a private ask is never a reply in the channel
              setStaged(null);
            }
          }}
          onSend={(body, attachment) => {
            if (clarify) {
              // ONE message in the mirror: the copy with the note as its body. Nothing is cleared until it landed,
              // so a failure leaves the quote staged and (through the Composer) the typed note back in the field.
              if (clarifying.current) return false;
              clarifying.current = true;
              setClarifyBusy(true);
              const submitted = attachment;
              return clarifyMessage(clarify.message.id, body).then(
                async (row) => {
                  mirror?.requestReply(row.id); // the mirror answers a Clarify (P1520)
                  setClarify(null);
                  await conv.reload();
                  // An attached point or story cannot ride on the copy: it follows as its own message.
                  if (attachment) {
                    void conv.send({ body: null, attachment: { kind: attachment.kind, id: attachment.id } });
                    // Only the attachment that was submitted: one picked while the send was out stays.
                    setStaged((now) => (now === submitted ? null : now));
                  }
                  return true;
                },
                (e) => {
                  toast.error(chatErrorText(e, 'Could not send this to your mirror.'));
                  return false;
                },
              ).finally(() => {
                clarifying.current = false;
                setClarifyBusy(false);
              });
            }
            if (privateTo && mirror && body) {
              // P1520: a private question to the viewer's own mirror. Nothing is written to this channel.
              return mirror.ask(conversationId, body).then(
                () => true,
                (e) => {
                  toast.error(chatErrorText(e, 'Could not ask your mirror. Try again.'));
                  return false;
                },
              );
            }
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
      {infoOpen && <MirrorInfoDialog chat={summary} onRename={() => setRenaming(true)} onClose={() => setInfoOpen(false)} />}
      {renaming && (
        <RenameMirrorDialog
          initial={summary.title ?? 'Mirror'}
          role={mirrorRole(summary)}
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
