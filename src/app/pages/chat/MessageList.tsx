/**
 * @file MessageList.tsx
 * @description P1512: the scrolling message stream shared by a conversation and a thread panel.
 *
 * Scroll rules: open at the bottom; follow new messages while the reader is at the bottom or the
 * message is their own; otherwise leave the scroll alone and offer a "New messages" pill; when an
 * earlier page loads, keep the same message under the reader's eye; a hit from search scrolls to
 * its message and flashes it.
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { ChatAuthor } from '@/app/data/chat-ui-helpers';
import { Divider, InlineError, MessagesSkeleton } from './chat-kit';
import { MessageRow, type MessageActions } from './MessageRow';
import { describeGrouping, dayLabel } from './chat-view-model';
import { isLocal, type useConversationMessages } from './use-conversation';

export type ConversationApi = ReturnType<typeof useConversationMessages>;
export type ListActions = Omit<MessageActions, 'onJumpTo' | 'lookup' | 'getLoaded' | 'version' | 'onRetry' | 'onDiscard' | 'onEdit'>;

/** Closer to the bottom than this counts as "at the bottom". */
const BOTTOM_SLOP_PX = 80;
const TOP_LOAD_PX = 60;
const FLASH_MS = 2500;

interface Props {
  conv: ConversationApi;
  actions: ListActions;
  viewerId: string;
  authors: Record<string, ChatAuthor>;
  label: string;
  /** From a search hit: scroll here once loaded. */
  targetId?: string | null;
  empty: ReactNode;
  inThread?: boolean;
  /** "Load earlier messages" in a conversation, "Load earlier replies" in a thread. */
  earlierLabel?: string;
}

export function MessageList({ conv, actions, viewerId, authors, label, targetId = null, empty, inThread = false, earlierLabel = 'Load earlier messages' }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const prev = useRef<{ first: string | null; last: string | null; height: number; ready: boolean }>({ first: null, last: null, height: 0, ready: false });
  const [newCount, setNewCount] = useState(0);
  const [flashId, setFlashId] = useState<string | null>(null);
  const jumpedTo = useRef<string | null>(null);
  /** The message under the reader's eye and where it sits, noted when an earlier page is requested. */
  const keepPlace = useRef<{ id: string; offset: number } | null>(null);
  const { status, messages, stats, hasMore, loadingEarlier, loadEarlier, ensureLoaded, lookup, getLoaded, syncVersion, retrySend, discard, edit, reload } = conv;

  const pageBack = useCallback(() => {
    const el = scroller.current;
    if (el) {
      const top = el.getBoundingClientRect().top;
      const node = [...el.querySelectorAll<HTMLElement>('[data-msg]')].find((n) => n.getBoundingClientRect().bottom > top);
      if (node?.dataset.msg) keepPlace.current = { id: node.dataset.msg, offset: node.getBoundingClientRect().top - top };
    }
    return loadEarlier();
  }, [loadEarlier]);

  const toBottom = useCallback(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    stick.current = true;
    setNewCount(0);
  }, []);

  /** Scrolls to a message and flashes it; one that is not loaded yet is paged in first, or reported. */
  const jumpTo = useCallback(
    async (id: string) => {
      const find = () => scroller.current?.querySelector<HTMLElement>(`[data-msg="${id}"]`) ?? null;
      let node = find();
      if (!node) {
        const found = await ensureLoaded(id).catch(() => false);
        if (!found) {
          toast("That message isn't loaded, and could not be found further back.");
          return;
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        node = find();
      }
      if (!node) return;
      node.scrollIntoView?.({ block: 'center' });
      stick.current = false;
      setFlashId(id);
    },
    [ensureLoaded],
  );

  useEffect(() => {
    if (!flashId) return;
    const t = setTimeout(() => setFlashId(null), FLASH_MS);
    return () => clearTimeout(t);
  }, [flashId]);

  // Scroll behaviour after every change to the list.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || status !== 'ready') return;
    const first = messages[0]?.id ?? null;
    const last = messages[messages.length - 1]?.id ?? null;
    const p = prev.current;
    if (!p.ready) {
      if (!targetId) el.scrollTop = el.scrollHeight;
    } else if (first !== p.first && last === p.last) {
      // An earlier page went in above: put the same message back where the reader had it. Anything
      // else that changed height above it meanwhile (a name arriving, a quote filling in) is covered too.
      const place = keepPlace.current;
      keepPlace.current = null;
      const node = place ? el.querySelector<HTMLElement>(`[data-msg="${place.id}"]`) : null;
      if (place && node) el.scrollTop += node.getBoundingClientRect().top - el.getBoundingClientRect().top - place.offset;
      else el.scrollTop += el.scrollHeight - p.height;
    } else if (last !== p.last) {
      const tail = messages[messages.length - 1];
      const own = !!tail && tail.authorId === viewerId;
      if (own || stick.current) {
        el.scrollTop = el.scrollHeight;
        stick.current = true;
      } else if (tail && !isLocal(tail)) {
        setNewCount((n) => n + 1);
      }
    }
    prev.current = { first, last, height: el.scrollHeight, ready: true };
  }, [messages, status, viewerId, targetId]);

  // Late-loading content (attachment cards, avatars) must not leave the reader short of the bottom.
  useEffect(() => {
    const box = content.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (stick.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [status]);

  // A search hit: page back until it is loaded, scroll to it, flash it.
  useEffect(() => {
    if (!targetId || status !== 'ready' || jumpedTo.current === targetId) return;
    jumpedTo.current = targetId;
    void jumpTo(targetId);
  }, [targetId, status, jumpTo]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    stick.current = gap < BOTTOM_SLOP_PX;
    if (stick.current && newCount) setNewCount(0);
    if (el.scrollTop < TOP_LOAD_PX && hasMore && !loadingEarlier) void pageBack();
  };

  const grouping = useMemo(() => describeGrouping(messages), [messages]);

  const fullActions: MessageActions = useMemo(
    () => ({ ...actions, onEdit: edit, onRetry: (id) => void retrySend(id), onDiscard: discard, onJumpTo: (id) => void jumpTo(id), lookup, getLoaded, version: syncVersion }),
    [actions, edit, retrySend, discard, jumpTo, lookup, getLoaded, syncVersion],
  );

  if (status === 'loading') return <div className="min-h-0 flex-1 overflow-hidden"><MessagesSkeleton /></div>;
  if (status === 'error') return <div className="min-h-0 flex-1"><InlineError what="messages" onRetry={() => void reload()} /></div>;

  return (
    <div className="relative min-h-0 flex-1">
      {/* overflow-anchor is off: the browser's own scroll anchoring would double-correct the keep-my-place adjustment above. */}
      <div
        ref={scroller}
        onScroll={onScroll}
        className="h-full overflow-y-auto overscroll-contain bg-background py-2 [overflow-anchor:none]"
        data-testid="message-scroller"
      >
        <div ref={content}>
          {hasMore && (
            <div className="flex justify-center py-1">
              <Button variant="ghost" className="min-h-10 text-muted-foreground" disabled={loadingEarlier} onClick={() => void pageBack()}>
                {loadingEarlier ? 'Loading…' : earlierLabel}
              </Button>
            </div>
          )}
          {messages.length === 0 && <div className="px-6 py-12 text-center text-sm text-muted-foreground">{empty}</div>}
          <ul role="log" aria-live="polite" aria-relevant="additions" aria-label={label} className="flex flex-col gap-0.5">
            {messages.map((m, i) => {
              const g = grouping[i] ?? { dayBreak: false, compact: false };
              return (
                <Fragment key={m.id}>
                  {g.dayBreak && (
                    <li role="presentation">
                      <Divider>{dayLabel(m.createdAt)}</Divider>
                    </li>
                  )}
                  <MessageRow
                    msg={m}
                    mine={m.authorId === viewerId}
                    viewerId={viewerId}
                    author={m.authorId ? authors[m.authorId] : undefined}
                    authors={authors}
                    compact={g.compact}
                    highlight={flashId === m.id}
                    stat={stats.get(m.id)}
                    actions={fullActions}
                    inThread={inThread}
                  />
                </Fragment>
              );
            })}
          </ul>
        </div>
      </div>
      {newCount > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <Button variant="outline" className="pointer-events-auto min-h-10 rounded-full border-blue-200 bg-background text-blue-700 shadow-md hover:bg-blue-50" onClick={toBottom}>
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
            New messages
          </Button>
        </div>
      )}
    </div>
  );
}
