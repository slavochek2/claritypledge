/**
 * @file MessageRow.tsx
 * @description P1512: one message — avatar, name, time, body — with its actions.
 *
 * Actions are reachable four ways: a hover toolbar (desktop pointers), a tap that shows the toolbar
 * under the message (touch), the ⋯ button on that toolbar, and a right-click or long press that opens
 * the full list at the pointer. The toolbar carries Reply, Forward, Thread and Clarify; ⋯ holds only
 * what the toolbar does not (Edit, Delete: your own messages), so nothing is offered twice. Mark as
 * unread is not here: it marks the whole chat, so it lives on the chat (list row, header menu).
 */
import { UnlinkedAuthorMark } from './MessageRowPlaceholders';
import { AuthorName, ForwardedBody, MessageNote, QuoteBlock, TranscriptionMark } from './MessageParts';
import { MessageToolbar } from './MessageToolbar';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Forward, Lock, MessageSquareText, MessagesSquare, Pencil, Reply, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ChatMessage, ThreadStats } from '@/app/data/chat-service';
import type { ChatAuthor } from '@/app/data/chat-ui-helpers';
import { EditBox } from './EditBox';
import { RepliesLink } from './RepliesLink';
import { VoiceBubble } from './VoiceBubble';
import { FOCUS_RING, PersonMark, PopMenu, MirrorMark, type MenuItem } from './chat-kit';
import { DESKTOP_HOVER_QUERY, useDismiss, useMediaQuery } from './chat-hooks';
import { useChat } from './chat-state';
import { isLocal, type Row } from './use-conversation';
import { chatTitle, messageTime, mirrorName, mirrorRole } from './chat-view-model';
import { MirrorReplyState } from './MirrorReplyState';
import { MessageAttachment } from './MessageAttachment';

/** A finger resting this long on a message opens its menu; drifting further than LONG_PRESS_DRIFT_PX is a scroll. */
export const LONG_PRESS_MS = 500;
const LONG_PRESS_DRIFT_PX = 10;
const INTERACTIVE = 'button,a,input,textarea,label,[role="menu"],[role="toolbar"]';

export interface MessageActions {
  onReply: (m: ChatMessage) => void;
  /** Absent inside the thread panel itself (every chat has threads, P1546). */
  onThread?: (m: ChatMessage) => void;
  onForward: (m: ChatMessage) => void;
  /** Absent inside the mirror itself. */
  onClarify?: (m: ChatMessage) => void;
  onMarkUnread: () => void;
  onEdit: (id: string, body: string) => Promise<void>;
  onDelete: (m: ChatMessage) => void;
  onRetry: (localId: string) => void;
  onDiscard: (localId: string) => void;
  onJumpTo: (messageId: string) => void;
  lookup: (id: string) => Promise<ChatMessage | null>;
  /** A message that is loaded right now (always current), if it is. */
  getLoaded: (id: string) => ChatMessage | undefined;
  /** Bumps on every edit, delete and resync, so things read once (a quote's source) read again. */
  version: number;
}

interface Props {
  msg: Row;
  mine: boolean;
  viewerId: string;
  author: ChatAuthor | undefined;
  authors: Record<string, ChatAuthor>;
  compact: boolean;
  /** The id of the message rendered directly above this one: the mirror's answer to it needs no quote. */
  prevMessageId?: string;
  /** The message before is a transcription by the same author: the run already carries its "Transcribed" pill. */
  continuesTranscription?: boolean;
  highlight: boolean;
  stat?: ThreadStats;
  actions: MessageActions;
  /** The mirror shows clarified copies without a Clarify action of their own. */
  inThread?: boolean;
  /**
   * P1520: a row of the viewer's own mirror shown inside a channel (a private @mirror ask, or the answer
   * to it). Only the viewer can see it; it takes no actions there, since it is not a message of the channel.
   */
  privateHere?: boolean;
}

export function MessageRow({ msg, mine, viewerId, author, authors, compact, prevMessageId, continuesTranscription, highlight, stat, actions, inThread = false, privateHere = false }: Props) {
  const local = isLocal(msg) ? msg : null;
  const server: ChatMessage | null = local ? null : msg;
  const live = !!server && !server.isDeleted;
  const agent = server?.kind === 'agent';
  /** A reply, or a private @mirror ask: never copied anywhere (the server refuses it too). */
  const ownerOnly = agent || !!server?.contextConversationId;
  // P1576: a voice note has no words to edit, forward or clarify (each would make an empty message).
  const voiceNote = server?.audio ? server : null;
  const noCopy = ownerOnly || !!voiceNote;
  const [selected, setSelected] = useState(false);
  // `more` is the ⋯ menu (what the toolbar lacks); otherwise the full list at the pointer.
  const [menuAt, setMenuAt] = useState<{ x: number; y: number; more?: boolean } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const row = useRef<HTMLLIElement>(null);
  const press = useRef<{ x: number; y: number; timer: number } | null>(null);
  const pressed = useRef(false);

  const desktopHover = useMediaQuery(DESKTOP_HOVER_QUERY);
  const { chats } = useChat();
  const mirrorChat = chats.find((c) => c.kind === 'mirror');
  const mirror = mirrorName(mirrorChat);
  /** The mirror as the author of its own replies: its name, else "Your mirror". */
  const mirrorDisplay = mirrorChat?.title ?? mirrorRole();
  // In the mirror itself, an ask made in a channel says where it was asked.
  const askedIn = !privateHere && server?.contextConversationId ? chats.find((c) => c.conversationId === server.contextConversationId) : undefined;

  useDismiss(() => setSelected(false), selected, [row]);
  // The inline toolbar goes away when the reader scrolls on (any scroll container, hence capture).
  useEffect(() => {
    if (!selected) return;
    const close = () => setSelected(false);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [selected]);
  useEffect(
    () => () => {
      if (press.current) window.clearTimeout(press.current.timer);
    },
    [],
  );

  const endPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };

  // Every action once. `items` is the full list (right-click, long press); `moreItems` is what the toolbar
  // does not carry, so the ⋯ menu never repeats a toolbar button.
  const items: MenuItem[] = [];
  const moreItems: MenuItem[] = [];
  // A private row shown in a channel takes no actions there; a mirror reply can only be quoted (never forwarded,
  // clarified, edited or deleted: it is its owner's alone, and the server refuses any copy of it).
  if (server && live && !privateHere) {
    items.push({ key: 'reply', label: 'Reply', Icon: Reply, onSelect: () => actions.onReply(server) });
  }
  if (server && live && !privateHere && !agent) {
    if (actions.onThread && !server.threadRootId && !ownerOnly) {
      const open = actions.onThread;
      items.push({ key: 'thread', label: 'Reply in thread', Icon: MessageSquareText, onSelect: () => open(server) });
    }
    if (!noCopy) items.push({ key: 'forward', label: 'Forward', Icon: Forward, onSelect: () => actions.onForward(server) });
    if (actions.onClarify && !noCopy) {
      const clarify = actions.onClarify;
      items.push({ key: 'clarify', label: 'Clarify', Icon: MessagesSquare, onSelect: () => clarify(server) });
    }
    if (mine) {
      if (!voiceNote) moreItems.push({ key: 'edit', label: 'Edit', Icon: Pencil, onSelect: () => { setEditError(null); setDraft(server.body ?? ''); } });
      moreItems.push({ key: 'delete', label: 'Delete', Icon: Trash2, onSelect: () => actions.onDelete(server), danger: true });
    }
    items.push(...moreItems);
  }

  const save = async () => {
    if (!server || draft === null) return;
    const next = draft.trim();
    if (next === (server.body ?? '')) {
      setDraft(null);
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      await actions.onEdit(server.id, next);
      setDraft(null);
    } catch (e) {
      setEditError(e instanceof Error && /empty/.test(e.message) ? 'A message cannot be empty.' : 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  // P1592: a thread's root (a round's, or the event's "Outside rounds") is a system post: its body is a title, shown alone (no avatar, no author line).
  const system = !!server?.systemKind;
  const showHeader = !compact && !system;
  const toolbar =
    server && live && draft === null && !privateHere ? (
      <MessageToolbar
        message={server}
        selected={selected}
        noCopy={noCopy}
        ownerOnly={ownerOnly}
        mirror={mirror}
        actions={actions}
        hasMore={moreItems.length > 0}
        onDone={() => setSelected(false)}
        onMore={(at) => { setSelected(false); setMenuAt({ ...at, more: true }); }}
      />
    ) : null;

  const authorId = msg.authorId;
  const { missingAuthors } = useChat();
  const authorPending = !!authorId && !author && !missingAuthors.has(authorId);
  const time = local ? (local.failed ? '' : 'Sending…') : messageTime(msg.createdAt);

  const noteEl = msg.body && <MessageNote body={msg.body} editedAt={server?.editedAt ?? null} system={system} boxRefs={msg.boxRefs} agent={agent} />;
  return (
    <li ref={row} data-msg={msg.id} data-testid="message">
      {/* Right-click and long press are pointer shortcuts only: every item they offer is also reachable by keyboard, on the toolbar or in its ⋯ menu. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        data-selected={selected || undefined}
        onContextMenu={
          items.length
            ? (e) => {
                e.preventDefault();
                setSelected(false);
                setMenuAt({ x: e.clientX, y: e.clientY });
              }
            : undefined
        }
        className={cn(
          'group relative mx-2 flex gap-2.5 rounded-xl px-2 [@media(hover:hover)]:hover:bg-muted/60',
          compact ? 'py-0.5' : 'pb-1.5 pt-2.5',
          selected && 'bg-muted/60',
          highlight && 'bg-blue-50 [@media(hover:hover)]:hover:bg-blue-50',
        )}
        onTouchStart={
          items.length
            ? (e) => {
                const t = e.touches[0];
                if (!t || (e.target as HTMLElement).closest(INTERACTIVE)) return;
                endPress();
                const at = { x: t.clientX, y: t.clientY };
                press.current = {
                  ...at,
                  timer: window.setTimeout(() => {
                    pressed.current = true;
                    press.current = null;
                    setMenuAt(at);
                  }, LONG_PRESS_MS),
                };
              }
            : undefined
        }
        onTouchMove={(e) => {
          const t = e.touches[0];
          if (press.current && t && Math.hypot(t.clientX - press.current.x, t.clientY - press.current.y) > LONG_PRESS_DRIFT_PX) endPress();
        }}
        onTouchEnd={endPress}
        onTouchCancel={endPress}
        onPointerUp={(e) => {
          if (pressed.current) {
            pressed.current = false;
            return;
          }
          // A tap selects and shows the toolbar in line, under the message (touch has no hover, and a
          // narrow window has no room to float it); a wide mouse already has the hover toolbar.
          if ((e.pointerType !== 'mouse' || !desktopHover) && items.length && !(e.target as HTMLElement).closest(INTERACTIVE)) setSelected((s) => !s);
        }}
      >
        {!system && <div className="w-9 shrink-0">
          {showHeader && agent && <MirrorMark size="md" />}
          {showHeader && !agent &&
            (authorId && author?.slug ? (
              <Link to={`/p/${author.slug}`} aria-label={`Open ${author.name}'s profile`} className={cn('relative block rounded-full after:absolute after:-inset-1 after:content-[""]', FOCUS_RING)}>
                <PersonMark person={author} size="md" />
              </Link>
            ) : (
              <UnlinkedAuthorMark author={author} authorId={authorId} pending={authorPending} />
            ))}
        </div>}
        <div className="min-w-0 flex-1">
          {showHeader && (
            <div className="flex flex-wrap items-baseline gap-x-1.5 leading-6">
              {agent ? (
                <span className="flex min-w-0 max-w-full items-baseline text-[15px]" data-testid="mirror-author">
                  <span className="min-w-0 truncate font-semibold text-foreground">{mirrorDisplay}</span>
                  {mirrorChat?.title && <span className="shrink-0 whitespace-pre text-xs text-muted-foreground"> · {mirrorRole()}</span>}
                </span>
              ) : (
                <AuthorName author={author} authorId={authorId} pending={authorPending} className="min-w-0 max-w-full truncate text-[15px] text-foreground" />
              )}
              {time && <span className="text-xs text-muted-foreground">{time}</span>}
              <TranscriptionMark msg={server} continues={continuesTranscription} />
            </div>
          )}
          {(privateHere || askedIn) && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="mirror-private">
              <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
              {privateHere ? 'Private: only you see this' : `Asked privately in ${chatTitle(askedIn as NonNullable<typeof askedIn>)}`}
            </p>
          )}
          {/* No header line in a grouped message: the pill then sits on a line of its own above the words. */}
          {!showHeader && <TranscriptionMark msg={server} continues={continuesTranscription} grouped />}
          {compact && local && !local.failed && <span className="sr-only">Sending</span>}

          {server?.isDeleted ? (
            <p className="text-[15px] italic leading-[22px] text-muted-foreground">Message deleted</p>
          ) : (
            <>
              {server?.replyToId && !(agent && server.replyToId === prevMessageId) && <QuoteBlock replyToId={server.replyToId} actions={actions} authors={authors} />}
              {local?.replyToId && <QuoteBlock replyToId={local.replyToId} actions={actions} authors={authors} />}
              {draft !== null ? (
                <EditBox draft={draft} saving={saving} error={editError} onChange={setDraft} onSave={() => void save()} onCancel={() => setDraft(null)} />
              ) : (
                server?.kind !== 'clarify' && noteEl
              )}
              {voiceNote && <VoiceBubble msg={voiceNote} />}
              {server && (server.kind === 'forward' || server.kind === 'clarify') && <ForwardedBody msg={server} viewerId={viewerId} />}
              {/* A Clarify's own note sits under its quote; a forward's note sits above it. */}
              {draft === null && server?.kind === 'clarify' && noteEl}
              <MessageAttachment msg={msg} server={server} viewerId={viewerId} stat={stat} />
            </>
          )}
          {server && mine && !server.isDeleted && <MirrorReplyState messageId={server.id} name={mirrorDisplay} />}

          {local?.failed && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-red-700" data-testid="send-failed" role="alert">
              <span>{local.error ?? 'Not sent.'}</span>
              <Button variant="ghost" className="min-h-10 text-blue-700 hover:bg-blue-50 hover:text-blue-700" onClick={() => actions.onRetry(local.localId)}>
                Retry
              </Button>
              <Button variant="ghost" className="min-h-10 text-muted-foreground" onClick={() => actions.onDiscard(local.localId)}>
                Discard
              </Button>
            </div>
          )}

          <RepliesLink inThread={inThread} server={server} stat={stat} authors={authors} onThread={actions.onThread} viewerId={viewerId} />
          {selected && toolbar}
        </div>
        {!selected && toolbar}
      </div>
      {menuAt && <PopMenu at={menuAt} items={menuAt.more ? moreItems : items} label="Message menu" onClose={() => setMenuAt(null)} />}
    </li>
  );
}
