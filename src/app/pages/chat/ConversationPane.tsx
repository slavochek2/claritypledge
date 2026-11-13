/**
 * @file ConversationPane.tsx
 * @description P1512: one open conversation — header, messages, composer.
 *
 * The URL owns which conversation (and thread) is open, so Back works. Opening a conversation marks
 * it read (while the tab is visible) and keeps marking it read as messages arrive.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { type ChatMessage, type ChatSummary } from '@/app/data/chat-service';
import type { Shareable } from '@/app/data/chat-ui-helpers';
import { ConversationDialogs } from './ConversationDialogs';
import { useConversationDialogs } from './use-conversation-dialogs';
import { ComposerBlocked } from './ComposerBlocked';
import { useConversationRead } from './use-conversation-read';
import { Composer, type MentionEntry } from './Composer';
import { MessageList } from './MessageList';
import { ConversationTop } from './MyRounds';
import { PendingQuote } from './PendingQuote';
import { InlineError, MessagesSkeleton, MirrorMark } from './chat-kit';
import { useMirror, useRestoreMirrorStatuses } from './mirror-state';
import { useMirrorAsks } from './use-mirror-asks';
import { conversationCopy } from './conversation-derived';
import { useOpenHitThread } from './use-open-hit-thread';
import { CanvasPlusMenu } from './CanvasPlusMenu';
import { NewPointMenu } from './NewPointMenu';
import { useClarifyAvailable } from './use-clarify-availability';
import { takeComposerFocus, useBack, useChatNavigate, useLeaveChat } from './chat-hooks';
import { useChat } from './chat-state';
import { chatErrorText, chatPath, hasWayBackElsewhere, isChannel, mirrorRole } from './chat-view-model';
import { useConversationMessages } from './use-conversation';
import { useMessageActions } from './use-message-actions';
import { ClarifyCountsScope } from './ClarifyCountsScope';
import { useVoiceSender } from './use-voice-sender';

interface Props {
  conversationId: string;
  /** From a search hit (?m=): scroll to and flash this message. */
  highlightId: string | null;
  /** False while CSS hides this pane (a phone showing a thread): nothing here may count as seen. */
  paneVisible: boolean;
  /** A thread is open beside (or over) this chat: this pane offers no filled primary, so a canvas thread's action is the only one (P955). */
  threadOpen?: boolean;
}

/** 3c X3: the + of the composer: the mirror's canvas menu, or New point elsewhere. A private @mirror ask hides the paperclip, so it hides this too. */
function composerPlus(summary: ChatSummary, privateTo: MentionEntry | null, newPoint: boolean) {
  if (privateTo) return undefined;
  if (summary.kind === 'mirror') return <CanvasPlusMenu />;
  // P1631: "New point" in an ordinary chat, once there is a message to clarify and Clarify drafting is on
  return newPoint ? <NewPointMenu conversationId={summary.conversationId} /> : undefined;
}

/** A message clarify_start_chat can anchor on: a live top-level typed message, not a system post or a transcribed line (20261112240000). */
const canAnchorPoint = (m: ChatMessage) =>
  m.kind === 'message' && !m.isDeleted && !m.systemKind && !m.isTranscription && !m.threadRootId && !m.contextConversationId;

/** P1520: a private question to the viewer's own mirror. Nothing is written to this channel. */
function askMirror(mirror: NonNullable<ReturnType<typeof useMirror>>, conversationId: string, body: string) {
  return mirror.ask(conversationId, body).then(
    () => true,
    (e) => {
      toast.error(chatErrorText(e, 'Could not ask your mirror agent. Try again.'));
      return false;
    },
  );
}

/** The @ picker's one entry: the viewer's own mirror (P1520). */
function useMirrorMention(on: boolean, title: string | null | undefined) {
  return useMemo<MentionEntry[] | undefined>(
    () =>
      on
        ? [{
            id: 'mirror',
            label: title ?? mirrorRole(),
            detail: title ? `${mirrorRole()} (private)` : 'private',
            mark: <MirrorMark size="sm" />,
            keywords: ['mirror', 'mirror agent', 'your mirror agent'],
          }]
        : undefined,
    [on, title],
  );
}

/** The list says who may send: canSend is false once either side blocked the other (never which), blockedByMe says it was this person (offer Unblock), and an erased account has no id. */
function sendRestriction(summary: ChatSummary) {
  const blocked = summary.kind === 'dm' && summary.blockedByMe;
  const unavailable = summary.kind === 'dm' && !summary.other?.id;
  const cannotSend = summary.kind === 'dm' && !summary.canSend && !blocked && !unavailable;
  return { blocked, unavailable, cannotSend };
}

/** The mirror gets its face the first time its owner opens it; its statuses are restored from the rows shown. */
function useMirrorOnOpen(summary: ChatSummary, mirror: ReturnType<typeof useMirror>, rows: Parameters<typeof useRestoreMirrorStatuses>[0], userId: string) {
  const ensurePortrait = mirror?.ensurePortrait;
  useEffect(() => {
    if (summary.kind === 'mirror') ensurePortrait?.();
  }, [summary.kind, ensurePortrait]);
  useRestoreMirrorStatuses(rows, userId);
}

function unblockPerson(unblock: (id: string) => Promise<unknown>, other: ChatSummary['other']) {
  if (!other?.id) return;
  unblock(other.id).then(
    () => toast(`Unblocked ${other.name}`),
    (e) => toast.error(chatErrorText(e)),
  );
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

export function ConversationPane({ conversationId, highlightId, paneVisible, threadOpen = false }: Props) {
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
  return (
    <ClarifyCountsScope key={conversationId} conversationId={conversationId} enabled={summary.kind === 'mirror'}>
      <ConversationBody key={conversationId} summary={summary} highlightId={highlightId} paneVisible={paneVisible} threadOpen={threadOpen} />
    </ClarifyCountsScope>
  );
}

interface BodyProps { summary: ChatSummary; highlightId: string | null; paneVisible: boolean; threadOpen: boolean }

function ConversationBody({ summary, highlightId, paneVisible, threadOpen }: BodyProps) {
  const chat = useChat();
  const go = useChatNavigate();
  const conversationId = summary.conversationId;
  const channel = isChannel(summary);
  const conv = useConversationMessages({ conversationId, withThreads: true });
  const clarifyOn = useClarifyAvailable(summary);
  const mirror = useMirror();
  const mirrorOn = mirror?.enabled === true;
  // P1520: the viewer's own private asks in this channel (rows of their mirror), and the @ picker's one entry.
  const privateRows = useMirrorAsks(conversationId, channel && mirrorOn);
  const mirrorChat = chat.chats.find((c) => c.kind === 'mirror');
  const [privateTo, setPrivateTo] = useState<MentionEntry | null>(null);
  const mentions = useMirrorMention(channel && mirrorOn, mirrorChat?.title);

  useMirrorOnOpen(summary, mirror, summary.kind === 'mirror' ? conv.server : channel ? privateRows : null, chat.userId);

  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  // Opened by Clarify or the New message picker: the cursor goes straight into the composer (asked for once, see chat-hooks).
  useEffect(() => {
    if (takeComposerFocus(conversationId)) setFocusToken((t) => t + 1);
  }, [conversationId]);
  const d = useConversationDialogs();
  const [staged, setStaged] = useState<Shareable | null>(null);
  const [target, setTarget] = useState<string | null>(highlightId);

  const other = summary.other;
  const { blocked, unavailable, cannotSend } = sendRestriction(summary);

  useOpenHitThread(highlightId, conversationId, go);
  useEffect(() => setTarget(highlightId), [highlightId]);

  const onReply = useCallback((m: ChatMessage) => {
    setReplyTo(m);
    setFocusToken((t) => t + 1);
  }, []);
  // The thread opens on top of this chat; with one already open (desktop, side by side) the same one is left alone
  // and another replaces it (chatNav), so closing never reopens the first.
  const onThread = useCallback((m: ChatMessage) => go(chatPath(conversationId, { rootId: m.id })), [go, conversationId]);
  const { actions, dialogs } = useMessageActions({ summary, conv, onReply, onThread });

  useConversationRead(summary, conv, paneVisible);

  const { placeholder, empty } = conversationCopy(summary);

  // P1576: voice notes go to this conversation, as a reply when one is pending. The mirror takes them too: it answers once the transcript exists.
  const sendVoice = useVoiceSender(conversationId, true, undefined, replyTo?.id, () => setReplyTo(null));
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
    onBlock: () => d.setBlocking(true),
    onUnblock: () => unblockPerson(chat.unblock, other),
    onRename: () => d.setRenaming(true),
    onMirrorInfo: summary.kind === 'mirror' ? () => d.setInfoOpen(true) : undefined,
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col" data-testid="conversation" data-chat-open={conversationId}>
      <ConversationTop summary={summary} blocked={blocked} actions={headerActions} cameFromElsewhere={cameFromElsewhere} />
      <MessageList
        conv={conv}
        actions={actions}
        viewerId={chat.userId}
        authors={chat.authors}
        label="Messages"
        targetId={target}
        empty={empty}
        lead={summary.kind === 'mirror' ? <MirrorGreeting title={summary.title} onName={() => d.setRenaming(true)} secondary={threadOpen} /> : undefined}
        privateRows={channel && mirrorOn ? privateRows : undefined}
      />
      {blocked || unavailable || cannotSend ? (
        <ComposerBlocked unavailable={unavailable} cannotSend={cannotSend} blocked={blocked} otherName={other?.name} onUnblock={headerActions.onUnblock} />
      ) : (
        <Composer
          // A private ask has its own draft: text typed for the mirror can never reappear in the channel's composer.
          draftKey={`${chat.userId}:${conversationId}${privateTo ? ':private' : ''}`}
          placeholder={placeholder}
          focusToken={focusToken}
          autoFocus
          onAttach={privateTo ? undefined : () => d.setAttaching(true)}
          // 3c X3: the owner's mirror chat's main composer only, hidden where the paperclip is hidden
          leading={composerPlus(summary, privateTo, clarifyOn && conv.server.some(canAnchorPoint))}
          staged={staged}
          onUnstage={() => setStaged(null)}
          quote={<PendingQuote replyTo={replyTo} authors={chat.authors} onClearReply={() => setReplyTo(null)} />}
          mentions={mentions}
          onVoiceNote={sendVoice}
          privateTo={privateTo}
          onPrivateChange={(entry) => {
            setPrivateTo(entry);
            if (entry) {
              setReplyTo(null); // a private ask is never a reply in the channel
              setStaged(null);
            }
          }}
          onSend={(body, attachment) => {
            if (privateTo && mirror && body) return askMirror(mirror, conversationId, body);
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
      <ConversationDialogs
        summary={summary}
        d={d}
        onPick={(s) => {
          setStaged(s);
          setFocusToken((t) => t + 1);
        }}
      />
    </div>
  );
}

/**
 * P1554: the mirror speaks first. Its greeting is always the first message in its chat (drawn here, never stored, so the
 * mirror never reads it back), and while it has no name the greeting keeps the one "Give me a name" button. With a thread
 * open beside the chat the thread's action leads, so the button is an outline (`secondary`, P955).
 */
function MirrorGreeting({ title, onName, secondary }: { title: string | null | undefined; onName: () => void; secondary: boolean }) {
  const painting = useMirror()?.portraitStatus === 'painting';
  return (
    <div className="mx-2 flex gap-2.5 px-2 pb-1.5 pt-2.5" data-testid="mirror-welcome">
      <div className="w-9 shrink-0">
        <MirrorMark size="md" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline text-[15px] leading-6">
          <span className="min-w-0 truncate font-semibold text-foreground">{title ?? mirrorRole()}</span>
          {title && <span className="shrink-0 whitespace-pre text-xs text-muted-foreground"> · {mirrorRole()}</span>}
        </div>
        <p className="whitespace-pre-wrap break-words text-[15px] leading-[22px] text-foreground">
          {title ? `Hi, I'm ${title}, your mirror agent. Tell me what's on your mind.` : "Hi, I'm your mirror agent. Want to give me a name? Or just tell me what's on your mind."}
        </p>
        {painting && (
          <p role="status" className="mt-1 text-xs text-muted-foreground" data-testid="mirror-painting">
            Painting my portrait…
          </p>
        )}
        {!title && (
          <Button variant={secondary ? 'outline' : 'default'} className="mt-2 min-h-10" data-testid="mirror-give-name" onClick={onName}>
            Give me a name
          </Button>
        )}
      </div>
    </div>
  );
}
