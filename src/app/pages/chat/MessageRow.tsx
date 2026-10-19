/**
 * @file MessageRow.tsx
 * @description P1512: one message — avatar, name, time, body — with its actions.
 *
 * Actions are reachable four ways, all offering the same list: a hover toolbar (desktop pointers),
 * a tap that shows the toolbar under the message (touch), the ⋯ button on that toolbar, and a
 * right-click or long press that opens the full menu at the pointer.
 */
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CornerUpRight, Forward, MessageSquareText, MessagesSquare, MoreHorizontal, Pencil, Reply, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getMessage, type ChatMessage } from '@/app/data/chat-service';
import type { ChatAuthor, ThreadStat } from '@/app/data/chat-ui-helpers';
import { AttachmentCard } from './AttachmentCard';
import { FOCUS_RING, HOVER, PRIMARY_CLASS, PersonMark, PopMenu, type MenuItem } from './chat-kit';
import { DESKTOP_HOVER_QUERY, hasFinePointer, useDismiss, useMediaQuery } from './chat-hooks';
import { useChat } from './chat-state';
import { isLocal, type Row } from './use-conversation';
import { chatPath, messageSummary, messageTime, sourceLabel } from './chat-view-model';

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
  stat?: ThreadStat;
  actions: MessageActions;
  /** The mirror shows clarified copies without a Clarify action of their own. */
  inThread?: boolean;
}

function AuthorName({ author, authorId, pending, className }: { author: ChatAuthor | undefined; authorId: string | null; pending: boolean; className?: string }) {
  if (!authorId) return <span className={cn('font-semibold text-muted-foreground', className)}>Deleted user</span>;
  // The profile is still on its way: a quiet bar, never a flash of "Unknown".
  if (pending) return <span role="status" aria-label="Loading name" className="inline-block h-3.5 w-24 animate-pulse rounded bg-muted align-middle" />;
  const name = author?.name ?? 'Unknown';
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
  const name = quoted?.authorId ? authors[quoted.authorId]?.name ?? (missingAuthors.has(quoted.authorId) ? 'Unknown' : '') : 'Deleted user';
  const text = quoted === null ? 'Original message not available' : quoted.isDeleted ? 'Original message deleted' : messageSummary(quoted);
  const jumpable = !!quoted && !quoted.isDeleted;
  const inner = (
    <>
      {quoted && !quoted.isDeleted && <span className="block text-xs font-semibold text-foreground">{name}</span>}
      <span className={cn('block truncate text-sm text-muted-foreground', (quoted === null || quoted.isDeleted) && 'italic')}>{text}</span>
    </>
  );
  const shell = 'my-1 block w-full max-w-md rounded-lg border-l-2 border-blue-600 bg-muted/50 py-1 pl-2 pr-2 text-left';
  return jumpable ? (
    <button type="button" data-testid="reply-quote" onClick={() => actions.onJumpTo(quoted.id)} className={cn(shell, 'min-h-10', HOVER, FOCUS_RING)} aria-label={`Go to the quoted message: ${text}`}>
      {inner}
    </button>
  ) : (
    <div data-testid="reply-quote" className={shell}>
      {inner}
    </div>
  );
}

/** "Open original": the source is read when pressed (through the reader's own access), not on every render. */
function OpenOriginal({ sourceId }: { sourceId: string }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const target = await getMessage(sourceId);
      if (target && !target.isDeleted) {
        navigate(chatPath(target.conversationId, { rootId: target.threadRootId ?? undefined, messageId: target.id }));
      } else {
        toast("The original isn't available to you any more.");
      }
    } catch {
      toast.error('Could not open the original. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void open()}
      className={cn('mt-1 inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-blue-700 hover:underline', FOCUS_RING)}
    >
      <CornerUpRight className="h-3.5 w-3.5" aria-hidden="true" />
      Open original
    </button>
  );
}

function ForwardedBody({ msg }: { msg: ChatMessage }) {
  const snap = msg.forwardSnapshot;
  if (!snap) return null;
  const clarify = msg.kind === 'clarify';
  // An erased author's text is gone from the copy too: say so instead of showing an empty card.
  const removed = snap.body === null && !msg.attachmentKind;
  return (
    <div className="mt-1 max-w-md rounded-xl border bg-muted/40 p-3" data-testid={clarify ? 'clarified-card' : 'forwarded-card'}>
      <p className="text-xs font-medium text-muted-foreground" data-testid="forwarded-label">
        {clarify ? (
          <>
            Clarified from <span className="font-semibold text-foreground">{snap.authorName}</span> in {sourceLabel(snap.conversationKind, snap.conversationTitle)}
          </>
        ) : (
          <>
            Forwarded from <span className="font-semibold text-foreground">{snap.authorName}</span>
          </>
        )}
        {removed && <span data-testid="snapshot-removed"> · Message removed</span>}
      </p>
      {snap.body && <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-[22px] text-foreground">{snap.body}</p>}
      {snap.thread.length > 0 && (
        <ul aria-label="Thread" className="mt-2 space-y-1.5 border-t pt-2">
          {snap.thread.map((t, i) => (
            <li key={`${t.createdAt}-${i}`} className="text-sm">
              <span className="font-semibold text-foreground">{t.authorName}</span>
              {t.body === null ? (
                <span className="text-muted-foreground"> · Message removed</span>
              ) : (
                <>
                  <span className="text-muted-foreground">: </span>
                  <span className="whitespace-pre-wrap break-words text-foreground">{t.body}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {msg.forwardedFromMessageId && <OpenOriginal sourceId={msg.forwardedFromMessageId} />}
    </div>
  );
}

function ToolButton({ label, text, showText, onClick, children }: { label: string; /** The short word beside the icon when shown (touch has no hover tip). */ text: string; showText: boolean; onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn('flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground lg:h-9 lg:min-w-9', showText ? 'px-2.5' : 'px-0', FOCUS_RING)}
    >
      {children}
      {showText && (
        <span aria-hidden="true" className="text-sm font-medium">
          {text}
        </span>
      )}
    </button>
  );
}

export function MessageRow({ msg, mine, viewerId, author, authors, compact, highlight, stat, actions, inThread = false }: Props) {
  const local = isLocal(msg) ? msg : null;
  const server: ChatMessage | null = local ? null : msg;
  const live = !!server && !server.isDeleted;
  const [selected, setSelected] = useState(false);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const row = useRef<HTMLLIElement>(null);
  const press = useRef<{ x: number; y: number; timer: number } | null>(null);
  const pressed = useRef(false);

  const desktopHover = useMediaQuery(DESKTOP_HOVER_QUERY);

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

  const items: MenuItem[] = [];
  if (server && live) {
    items.push({ key: 'reply', label: 'Reply', Icon: Reply, onSelect: () => actions.onReply(server) });
    if (actions.onThread && !server.threadRootId) {
      const open = actions.onThread;
      items.push({ key: 'thread', label: 'Reply in thread', Icon: MessageSquareText, onSelect: () => open(server) });
    }
    items.push({ key: 'forward', label: 'Forward', Icon: Forward, onSelect: () => actions.onForward(server) });
    if (actions.onClarify) {
      const clarify = actions.onClarify;
      items.push({ key: 'clarify', label: 'Clarify', Icon: MessagesSquare, onSelect: () => clarify(server) });
    }
    items.push({ key: 'unread', label: 'Mark as unread', Icon: MessagesSquare, onSelect: actions.onMarkUnread });
    if (mine) {
      items.push({ key: 'edit', label: 'Edit', Icon: Pencil, onSelect: () => { setEditError(null); setDraft(server.body ?? ''); } });
      items.push({ key: 'delete', label: 'Delete', Icon: Trash2, onSelect: () => actions.onDelete(server), danger: true });
    }
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
    server && live && draft === null ? (
      <div
        role="toolbar"
        aria-label="Message actions"
        className={cn(
          'flex items-center gap-0.5 rounded-2xl border bg-background p-0.5 shadow',
          selected
            ? 'mt-1.5 inline-flex max-w-full flex-wrap'
            : 'pointer-events-none absolute -top-5 right-3 z-10 opacity-0 transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 lg:[@media(hover:hover)]:group-hover:pointer-events-auto lg:[@media(hover:hover)]:group-hover:opacity-100',
        )}
      >
        <ToolButton label="Reply" text="Reply" showText={selected} onClick={() => { setSelected(false); actions.onReply(server); }}>
          <Reply className="h-[18px] w-[18px]" aria-hidden="true" />
        </ToolButton>
        {actions.onThread && !server.threadRootId && (
          <ToolButton label="Reply in thread" text="Thread" showText={selected} onClick={() => { setSelected(false); actions.onThread?.(server); }}>
            <MessageSquareText className="h-[18px] w-[18px]" aria-hidden="true" />
          </ToolButton>
        )}
        <ToolButton label="Forward" text="Forward" showText={selected} onClick={() => { setSelected(false); actions.onForward(server); }}>
          <Forward className="h-[18px] w-[18px]" aria-hidden="true" />
        </ToolButton>
        {actions.onClarify && (
          <ToolButton label="Clarify" text="Clarify" showText={selected} onClick={() => { setSelected(false); actions.onClarify?.(server); }}>
            <MessagesSquare className="h-[18px] w-[18px]" aria-hidden="true" />
          </ToolButton>
        )}
        <ToolButton
          label="More actions"
          text="More"
          showText={selected}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setSelected(false);
            setMenuAt({ x: r.right - 208, y: r.bottom + 4 });
          }}
        >
          <MoreHorizontal className="h-[18px] w-[18px]" aria-hidden="true" />
        </ToolButton>
      </div>
    ) : null;

  const authorId = msg.authorId;
  const { missingAuthors } = useChat();
  const authorPending = !!authorId && !author && !missingAuthors.has(authorId);
  const time = local ? (local.failed ? '' : 'Sending…') : messageTime(msg.createdAt);

  return (
    <li ref={row} data-msg={msg.id} data-testid="message">
      {/* Right-click and long press are pointer shortcuts only: every item they offer is also on the keyboard-reachable toolbar. */}
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
          {showHeader &&
            (authorId && author?.slug ? (
              <Link to={`/p/${author.slug}`} aria-label={`Open ${author.name}'s profile`} className={cn('relative block rounded-full after:absolute after:-inset-1 after:content-[""]', FOCUS_RING)}>
                <PersonMark person={author} size="md" />
              </Link>
            ) : (
              authorPending ? (
                <span aria-hidden="true" className="block h-9 w-9 animate-pulse rounded-full bg-muted" />
              ) : (
                <PersonMark person={{ name: author?.name ?? (authorId ? 'Unknown' : 'Deleted user'), avatarColor: author?.avatarColor, avatarUrl: author?.avatarUrl }} size="md" />
              )
            ))}
        </div>
        <div className="min-w-0 flex-1">
          {showHeader && (
            <div className="flex flex-wrap items-baseline gap-x-1.5 leading-6">
              <AuthorName author={author} authorId={authorId} pending={authorPending} className="min-w-0 max-w-full truncate text-[15px] text-foreground" />
              {time && <span className="text-xs text-muted-foreground">{time}</span>}
            </div>
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
                msg.body && (
                  <p className="whitespace-pre-wrap break-words text-[15px] leading-[22px] text-foreground">
                    {msg.body}
                    {server?.editedAt && <span className="ml-1.5 text-xs text-muted-foreground" data-testid="edited-mark">(edited)</span>}
                  </p>
                )
              )}
              {server && server.kind !== 'message' && <ForwardedBody msg={server} />}
              {msg.attachmentKind && msg.attachmentId && <AttachmentCard kind={msg.attachmentKind} id={msg.attachmentId} viewerId={viewerId} />}
            </>
          )}

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
      {menuAt && <PopMenu at={menuAt} items={items} label="Message menu" onClose={() => setMenuAt(null)} />}
    </li>
  );
}
