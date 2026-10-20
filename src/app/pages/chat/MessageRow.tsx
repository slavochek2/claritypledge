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
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Forward, Lock, MessageSquareText, MessagesSquare, MoreHorizontal, Pencil, Reply, Trash2 } from 'lucide-react';
import { useAuth } from '@/auth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getMessage, type ChatMessage } from '@/app/data/chat-service';
import type { ThreadStats } from '@/app/data/chat-service';
import type { ChatAuthor } from '@/app/data/chat-ui-helpers';
import { AttachmentCard } from './AttachmentCard';
import { Quote } from './Quote';
import { FOCUS_RING, HOVER, MirrorMark, PRIMARY_CLASS, PersonMark, PopMenu, type MenuItem } from './chat-kit';
import { DESKTOP_HOVER_QUERY, hasFinePointer, useChatNavigate, useDismiss, useMediaQuery } from './chat-hooks';
import { useChat } from './chat-state';
import { isLocal, type Row } from './use-conversation';
import { chatPath, chatTitle, messageSummary, messageTime, mirrorName, mirrorRole, sourceLabel } from './chat-view-model';
import { useMirror } from './mirror-state';

/** A finger resting this long on a message opens its menu; drifting further than LONG_PRESS_DRIFT_PX is a scroll. */
export const LONG_PRESS_MS = 500;
const LONG_PRESS_DRIFT_PX = 10;
const INTERACTIVE = 'button,a,input,textarea,label,[role="menu"],[role="toolbar"]';

export interface MessageActions {
  onReply: (m: ChatMessage) => void;
  /** Absent where threads do not exist (1:1s, the mirror) or inside the thread panel itself. */
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

function AuthorName({ author, authorId, pending, className }: { author: ChatAuthor | undefined; authorId: string | null; pending: boolean; className?: string }) {
  if (!authorId) return <span className={cn('font-semibold text-muted-foreground', className)}>Deleted user</span>;
  // The profile is still on its way: a quiet bar, never a flash of "Unknown".
  if (pending) return <span role="status" aria-label="Loading name" className="inline-block h-3.5 w-24 animate-pulse rounded bg-muted align-middle" />;
  const name = author?.name ?? 'Unknown member';
  if (!author?.slug) return <span className={cn('font-semibold', className)}>{name}</span>;
  return (
    <Link to={`/p/${author.slug}`} className={cn('font-semibold hover:underline hover:underline-offset-2', FOCUS_RING, className)}>
      {name}
    </Link>
  );
}

/**
 * The message a reply points at: its author and words, "Original message deleted", or not available.
 * A loaded source is read from the live message list, so an edit, a delete or an erasure shows at
 * once; a source that is not loaded is read once and again whenever the conversation re-syncs.
 */
function QuoteBlock({ replyToId, actions, authors }: { replyToId: string; actions: MessageActions; authors: Record<string, ChatAuthor> }) {
  const [fetched, setFetched] = useState<ChatMessage | null | undefined>(undefined);
  const { lookup, getLoaded, version } = actions;
  const { missingAuthors } = useChat();
  const loaded = getLoaded(replyToId);
  useEffect(() => {
    if (loaded) return;
    let live = true;
    lookup(replyToId).then(
      (m) => live && setFetched(m),
      () => live && setFetched(null),
    );
    return () => {
      live = false;
    };
  }, [replyToId, lookup, loaded, version]);
  const quoted = loaded ?? fetched;
  if (quoted === undefined) return <div className="my-1 h-9 max-w-md animate-pulse rounded-lg bg-muted/50" aria-hidden="true" />;
  const name = quoted?.authorId ? authors[quoted.authorId]?.name ?? (missingAuthors.has(quoted.authorId) ? 'Unknown member' : '') : 'Deleted user';
  const text = quoted === null ? 'Original message not available' : quoted.isDeleted ? 'Original message deleted' : messageSummary(quoted);
  const jumpable = !!quoted && !quoted.isDeleted;
  const unavailable = quoted === null || quoted.isDeleted;
  return (
    <Quote
      testId="reply-quote"
      label={unavailable ? 'Reply' : `Reply to ${name}`}
      summary={unavailable ? text : `Reply to ${name}: ${text}`}
      body={<span className={cn('mt-0.5 block line-clamp-2 break-words text-sm text-muted-foreground', unavailable && 'italic')}>{text}</span>}
      onJump={jumpable ? () => actions.onJumpTo(quoted.id) : undefined}
      className="my-1"
    />
  );
}

/** Tap-to-jump: the source is read when pressed (through the reader's own access), not on every render. */
function useJumpToOriginal(sourceId: string | null) {
  const go = useChatNavigate();
  const [busy, setBusy] = useState(false);
  return async () => {
    if (!sourceId || busy) return;
    setBusy(true);
    try {
      const target = await getMessage(sourceId);
      if (target && !target.isDeleted) {
        // On top of where they are, so Back returns here.
        go(chatPath(target.conversationId, { rootId: target.threadRootId ?? undefined, messageId: target.id }), 'follow');
      } else {
        toast("The original isn't available to you any more.");
      }
    } catch {
      toast.error('Could not open the original. Try again.');
    } finally {
      setBusy(false);
    }
  };
}

function ForwardedBody({ msg, viewerId }: { msg: ChatMessage; viewerId: string }) {
  const { chats } = useChat();
  const { user } = useAuth();
  const snap = msg.forwardSnapshot;
  // Hooks run before the early return: the jump target is null whenever there is no original to reach.
  const removed = !!snap && snap.body === null && !msg.attachmentKind;
  const hasOriginal = !!snap && !!msg.forwardedFromMessageId && !removed && snap.authorName !== 'Deleted user';
  const jump = useJumpToOriginal(hasOriginal ? msg.forwardedFromMessageId : null);
  if (!snap) return null;
  const clarify = msg.kind === 'clarify';
  const mirror = mirrorName(chats.find((c) => c.kind === 'mirror'));
  // The clarifier owns the mirror: their own words read "You". Decided by the original author's id, never by a name
  // (two people can share one). No id (erased account, or a row without it) means the snapshot's name, which erasure
  // sets to "Deleted user".
  const clarifiedAuthor = user?.id && msg.forwardAuthorId === user.id ? 'You' : snap.authorName;
  // An erased author's text is gone from the copy too (removed, above): say so instead of showing an empty card;
  // and there is nowhere to go from a copy whose author was erased or whose text was removed (hasOriginal).
  const label = clarify ? (
    <>
      <MirrorMark size="xs" className="mr-1 align-text-bottom" />Sent to {mirror} to clarify · from {sourceLabel(snap.conversationKind, snap.conversationTitle)}
    </>
  ) : (
    <>
      Forwarded from <span className="font-semibold text-foreground">{snap.authorName}</span>
    </>
  );
  return (
    <Quote
      testId={clarify ? 'clarified-card' : 'forwarded-card'}
      summary={`${clarify ? `Clarify, ${clarifiedAuthor}` : `Forwarded from ${snap.authorName}`}: ${snap.body ?? 'message removed'}`}
      label={
        <>
          {label}
          {removed && <span data-testid="snapshot-removed"> · Message removed</span>}
        </>
      }
      onJump={hasOriginal ? () => void jump() : undefined}
      body={
        <>
          {clarify && (
            <span className="mt-1 block text-sm font-semibold text-foreground" data-testid="clarified-author">
              {clarifiedAuthor}
            </span>
          )}
          {snap.body && <span className="mt-1 block whitespace-pre-wrap break-words text-[15px] leading-[22px] text-foreground">{snap.body}</span>}
        </>
      }
    >
      {msg.attachmentKind && msg.attachmentId && <AttachmentCard kind={msg.attachmentKind} id={msg.attachmentId} viewerId={viewerId} compact />}
      {snap.thread.length > 0 && (
        <span className="mt-2 block space-y-1.5 border-t pt-2" data-testid="forwarded-thread">
          {snap.thread.map((t, i) => (
            <span key={`${t.createdAt}-${i}`} className="block text-sm">
              <span className="font-semibold text-foreground">{t.authorName}</span>
              {t.body === null ? (
                <span className="text-muted-foreground"> · Message removed</span>
              ) : (
                <>
                  <span className="text-muted-foreground">: </span>
                  <span className="whitespace-pre-wrap break-words text-foreground">{t.body}</span>
                </>
              )}
            </span>
          ))}
        </span>
      )}
    </Quote>
  );
}

function ToolButton({ label, onClick, children }: { label: string; onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void; children: React.ReactNode }) {
  // Icons only, on purpose: five labelled buttons cannot share one row at 320, and an action bar that wraps
  // looks broken. The name is on the button for assistive tech and the hover tip; the long-press menu has the words.
  // Clarify is the one labelled button (ClarifyButton): it wears the mirror's face and the word.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground lg:h-9 lg:w-9', FOCUS_RING)}
    >
      {children}
    </button>
  );
}

/**
 * Clarify: the mirror's face and the word. The name and tip say whose mirror ("Clarify with Ada's mirror").
 * Below 360px the word drops out (face only, still 40px) so the five buttons keep one row at 320.
 */
function ClarifyButton({ mirror, onClick }: { mirror: string; onClick: () => void }) {
  const label = `Clarify with ${mirror}`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid="clarify-button"
      className={cn('flex h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-muted-foreground hover:bg-accent hover:text-foreground min-[360px]:px-2.5 lg:h-9 lg:px-2', FOCUS_RING)}
    >
      <MirrorMark size="xs" />
      <span className="hidden text-sm font-medium min-[360px]:inline">Clarify</span>
    </button>
  );
}

/**
 * P1520: what the mirror is doing about this message of its owner: thinking, could not answer (Try again), or out of
 * today's allowance. Nothing once it has answered.
 */
function MirrorReplyState({ messageId, name }: { messageId: string; name: string }) {
  const mirror = useMirror();
  const status = mirror?.statusFor(messageId);
  if (!mirror || !status) return null;
  if (status === 'thinking') {
    return (
      <p role="status" data-testid="mirror-thinking" className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
        <MirrorMark size="xs" />
        <span className="animate-pulse">{name} is thinking…</span>
      </p>
    );
  }
  if (status === 'capped') {
    return (
      <p role="status" data-testid="mirror-capped" className="mt-1 text-sm text-muted-foreground">
        {name} has answered as much as it can today. Try again tomorrow.
      </p>
    );
  }
  return (
    <div role="alert" data-testid="mirror-failed" className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
      <span>{name} could not answer.</span>
      <Button variant="ghost" className="min-h-10 text-blue-700 hover:bg-blue-50 hover:text-blue-700" onClick={() => mirror.requestReply(messageId)}>
        Try again
      </Button>
    </div>
  );
}

export function MessageRow({ msg, mine, viewerId, author, authors, compact, highlight, stat, actions, inThread = false, privateHere = false }: Props) {
  const local = isLocal(msg) ? msg : null;
  const server: ChatMessage | null = local ? null : msg;
  const live = !!server && !server.isDeleted;
  const agent = server?.kind === 'agent';
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
    if (actions.onThread && !server.threadRootId) {
      const open = actions.onThread;
      items.push({ key: 'thread', label: 'Reply in thread', Icon: MessageSquareText, onSelect: () => open(server) });
    }
    items.push({ key: 'forward', label: 'Forward', Icon: Forward, onSelect: () => actions.onForward(server) });
    if (actions.onClarify) {
      const clarify = actions.onClarify;
      items.push({ key: 'clarify', label: 'Clarify', Icon: MessagesSquare, onSelect: () => clarify(server) });
    }
    if (mine) {
      moreItems.push({ key: 'edit', label: 'Edit', Icon: Pencil, onSelect: () => { setEditError(null); setDraft(server.body ?? ''); } });
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

  const showHeader = !compact;
  const toolbar =
    server && live && draft === null && !privateHere ? (
      <div
        role="toolbar"
        aria-label="Message actions"
        className={cn(
          'flex items-center gap-0.5 rounded-2xl border bg-background p-0.5 shadow',
          selected
            ? 'mt-1.5 inline-flex max-w-full flex-nowrap'
            : 'pointer-events-none absolute -top-5 right-3 z-10 opacity-0 transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 lg:[@media(hover:hover)]:group-hover:pointer-events-auto lg:[@media(hover:hover)]:group-hover:opacity-100',
        )}
      >
        <ToolButton label="Reply" onClick={() => { setSelected(false); actions.onReply(server); }}>
          <Reply className="h-[18px] w-[18px]" aria-hidden="true" />
        </ToolButton>
        {!agent && (
          <ToolButton label="Forward" onClick={() => { setSelected(false); actions.onForward(server); }}>
            <Forward className="h-[18px] w-[18px]" aria-hidden="true" />
          </ToolButton>
        )}
        {!agent && actions.onThread && !server.threadRootId && (
          <ToolButton label="Thread" onClick={() => { setSelected(false); actions.onThread?.(server); }}>
            <MessageSquareText className="h-[18px] w-[18px]" aria-hidden="true" />
          </ToolButton>
        )}
        {!agent && actions.onClarify && <ClarifyButton mirror={mirror} onClick={() => { setSelected(false); actions.onClarify?.(server); }} />}
        {moreItems.length > 0 && (
          <ToolButton
            label="More actions"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setSelected(false);
              setMenuAt({ x: r.right - 208, y: r.bottom + 4, more: true });
            }}
          >
            <MoreHorizontal className="h-[18px] w-[18px]" aria-hidden="true" />
          </ToolButton>
        )}
      </div>
    ) : null;

  const authorId = msg.authorId;
  const { missingAuthors } = useChat();
  const authorPending = !!authorId && !author && !missingAuthors.has(authorId);
  const time = local ? (local.failed ? '' : 'Sending…') : messageTime(msg.createdAt);

  const noteEl = msg.body && (
    <p className="whitespace-pre-wrap break-words text-[15px] leading-[22px] text-foreground">
      {msg.body}
      {server?.editedAt && <span className="ml-1.5 text-xs text-muted-foreground" data-testid="edited-mark">(edited)</span>}
    </p>
  );
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
        <div className="w-9 shrink-0">
          {showHeader && agent && <MirrorMark size="md" />}
          {showHeader && !agent &&
            (authorId && author?.slug ? (
              <Link to={`/p/${author.slug}`} aria-label={`Open ${author.name}'s profile`} className={cn('relative block rounded-full after:absolute after:-inset-1 after:content-[""]', FOCUS_RING)}>
                <PersonMark person={author} size="md" />
              </Link>
            ) : (
              authorPending ? (
                <span aria-hidden="true" className="block h-9 w-9 animate-pulse rounded-full bg-muted" />
              ) : (
                <PersonMark
                  person={author ? { name: author.name, avatarColor: author.avatarColor, avatarUrl: author.avatarUrl } : authorId ? { name: 'Unknown member', unknown: true } : { name: 'Deleted user', deleted: true }}
                  size="md"
                />
              )
            ))}
        </div>
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
            </div>
          )}
          {(privateHere || askedIn) && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="mirror-private">
              <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
              {privateHere ? 'Private: only you see this' : `Asked privately in ${chatTitle(askedIn as NonNullable<typeof askedIn>)}`}
            </p>
          )}
          {compact && local && !local.failed && <span className="sr-only">Sending</span>}

          {server?.isDeleted ? (
            <p className="text-[15px] italic leading-[22px] text-muted-foreground">Message deleted</p>
          ) : (
            <>
              {server?.replyToId && <QuoteBlock replyToId={server.replyToId} actions={actions} authors={authors} />}
              {local?.replyToId && <QuoteBlock replyToId={local.replyToId} actions={actions} authors={authors} />}
              {draft !== null ? (
                <div className="mt-1" data-testid="edit-message">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    aria-label="Edit message"
                    rows={2}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setDraft(null);
                      }
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && hasFinePointer()) {
                        e.preventDefault();
                        void save();
                      }
                    }}
                    className="block w-full resize-none rounded-lg border bg-background px-3 py-2 text-base outline-none focus:border-gray-500 md:text-[15px]"
                  />
                  {editError && <p role="alert" className="mt-1 text-xs text-red-700">{editError}</p>}
                  <div className="mt-1 flex gap-2">
                    <Button variant="outline" className="min-h-10" onClick={() => setDraft(null)}>
                      Cancel
                    </Button>
                    <Button className={PRIMARY_CLASS} disabled={saving} onClick={() => void save()}>
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                server?.kind !== 'clarify' && noteEl
              )}
              {server && (server.kind === 'forward' || server.kind === 'clarify') && <ForwardedBody msg={server} viewerId={viewerId} />}
              {/* A Clarify's own note sits under its quote; a forward's note sits above it. */}
              {draft === null && server?.kind === 'clarify' && noteEl}
              {msg.attachmentKind && msg.attachmentId && !(server && server.kind !== 'message') && <AttachmentCard kind={msg.attachmentKind} id={msg.attachmentId} viewerId={viewerId} />}
              {/* The mirror's answer is a reading of other people, never a fact about them (P1520 risk table). */}
              {agent && <p className="mt-0.5 text-xs text-muted-foreground" data-testid="mirror-reading">{mirrorDisplay}&apos;s reading. You decide what fits.</p>}
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

          {!inThread && actions.onThread && server && stat && stat.count > 0 && (
            <button
              type="button"
              data-testid="replies-link"
              onClick={() => actions.onThread?.(server)}
              className={cn('-ml-1 mt-0.5 flex min-h-10 items-center gap-2 rounded-lg px-1 text-sm font-semibold text-blue-700', HOVER, FOCUS_RING)}
            >
              <span className="flex -space-x-1.5">
                {stat.authorIds
                  .filter((id) => authors[id])
                  .slice(0, 3)
                  .map((id) => (
                    <PersonMark key={id} person={authors[id] as ChatAuthor} size="xs" />
                  ))}
              </span>
              {stat.count === 1 ? '1 reply' : `${stat.count} replies`}
            </button>
          )}
          {selected && toolbar}
        </div>
        {!selected && toolbar}
      </div>
      {menuAt && <PopMenu at={menuAt} items={menuAt.more ? moreItems : items} label="Message menu" onClose={() => setMenuAt(null)} />}
    </li>
  );
}
