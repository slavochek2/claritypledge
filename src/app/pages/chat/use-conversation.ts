/**
 * P1512: the messages of one conversation (or of one thread) — loading, paging back, live merge
 * with Realtime, edit and delete, and the person's unconfirmed sends (which live in the provider's
 * outbox, so they survive switching chats).
 *
 * Rules that keep the window honest:
 *  - Every async read carries a generation: a result for another conversation or thread, or older
 *    than a newer read of the same one, is discarded.
 *  - A copy of a message never overwrites a newer one: a delete wins, then the later edit.
 *  - A Realtime UPDATE only touches a message that is loaded; a Realtime INSERT only joins the window
 *    if it is newer than the oldest loaded message. Anything else would punch a hole that "Load
 *    earlier" then skips over.
 *  - A resync re-reads from now back until it overlaps what was already loaded (however long the gap),
 *    replaces that range with what the server returned, and drops what it no longer returns.
 *  - A Realtime event never removes an unconfirmed send; only that send's own result does. An own
 *    server row that carries a send's clientId merely hides it from view meanwhile.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteMessage,
  editMessage,
  getMessage,
  getThreadStats,
  listMessages,
  listThread,
  messageCursor,
  type ChatCursor,
  type ChatMessage,
  type ThreadStats,
} from '@/app/data/chat-service';
import { useChat, type LocalMessage, type SendInput } from './chat-state';
import { appendIfNewer, compareMessages, newerVersion, reconcileWindow, replaceLoaded, replaceWindow, upsertMessage } from './chat-view-model';

export const PAGE_SIZE = 50;
/** listThread's first read: the root and up to this many of the newest replies. */
export const THREAD_FIRST_PAGE = 200;
const MAX_JUMP_PAGES = 20;
/** Tests lower `maxPages` to reach the "gap too long to cross" path without thousands of rows. */
export const SYNC_LIMITS = { maxPages: 20 };

export type { LocalMessage, SendInput };
export type Row = ChatMessage | LocalMessage;
export const isLocal = (m: Row): m is LocalMessage => 'localId' in m;

interface Options {
  conversationId: string;
  /** Set for a thread panel: the root first, then its replies. */
  threadRootId?: string;
  /** Channels have threads: count replies under each root. */
  withThreads?: boolean;
}

type Status = 'loading' | 'ready' | 'error' | 'unavailable';

export function useConversationMessages({ conversationId, threadRootId, withThreads = false }: Options) {
  const chat = useChat();
  const { subscribe, ensureAuthors, outbox } = chat;
  const [status, setStatus] = useState<Status>('loading');
  const [server, setServer] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [stats, setStats] = useState<Map<string, ThreadStats>>(new Map());
  const [syncVersion, setSyncVersion] = useState(0);
  const serverRef = useRef(server);
  serverRef.current = server;
  const generation = useRef(0);
  const latestRead = useRef(0);
  const loadedOnce = useRef(false);
  /** Thread replies already counted (by the send's confirmation or by Realtime), so the second sighting adds nothing. */
  const counted = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** True while the conversation / thread this call started for is still the one on screen. */
  const current = (g: number) => mounted.current && g === generation.current;

  const loadedReplies = () => serverRef.current.filter((m) => m.id !== threadRootId);

  const fetchStats = useCallback(
    async (rows: ChatMessage[], g: number) => {
      if (!withThreads || threadRootId) return;
      const roots = rows.map((m) => m.id);
      if (roots.length === 0) return;
      try {
        const next = await getThreadStats(conversationId, roots);
        if (!current(g)) return;
        setStats((prev) => {
          const merged = new Map(prev);
          roots.forEach((id) => merged.delete(id));
          next.forEach((v, k) => merged.set(k, v));
          return merged;
        });
      } catch {
        /* reply counts are decoration: the thread itself still opens */
      }
    },
     
    [conversationId, threadRootId, withThreads],
  );

  const refreshStat = useCallback(
    async (rootId: string) => {
      const g = generation.current;
      try {
        const next = await getThreadStats(conversationId, [rootId]);
        if (!current(g)) return;
        setStats((prev) => {
          const merged = new Map(prev);
          const v = next.get(rootId);
          if (v) merged.set(rootId, v);
          else merged.delete(rootId);
          return merged;
        });
      } catch {
        /* decoration */
      }
    },
     
    [conversationId],
  );

  /**
   * Reads the newest page and keeps paging back until it overlaps `anchor` (the newest message
   * already loaded), so a long gap leaves no hole. With no anchor it is one page.
   */
  const readPages = useCallback(
    async (anchor: ChatCursor | null): Promise<{ rows: ChatMessage[]; more: boolean; overlapped: boolean } | 'unavailable'> => {
      let before: ChatCursor | undefined;
      let collected: ChatMessage[] = [];
      let root: ChatMessage | null = null;
      let more = false;
      let overlapped = !anchor;
      for (let i = 0; i < SYNC_LIMITS.maxPages; i++) {
        let page: ChatMessage[];
        let limit = PAGE_SIZE;
        if (threadRootId && i === 0) {
          const t = await listThread(conversationId, threadRootId);
          if (!t) return 'unavailable';
          root = t[0] ?? null;
          page = t.slice(1);
          limit = THREAD_FIRST_PAGE;
        } else {
          page = await listMessages(conversationId, { limit: PAGE_SIZE, before, threadRootId });
        }
        collected = [...page, ...collected];
        more = page.length >= limit;
        const oldest = page[0];
        if (!more || !oldest) break;
        if (!anchor || compareMessages(oldest, anchor) <= 0) {
          overlapped = true; // what was loaded is covered: nothing is missing in between
          break;
        }
        before = messageCursor(oldest);
      }
      return { rows: root ? [root, ...collected] : collected, more, overlapped };
    },
    [conversationId, threadRootId],
  );

  const sync = useCallback(
    async (mode: 'initial' | 'resync') => {
      const g = generation.current;
      const read = ++latestRead.current;
      const loaded = mode === 'resync' ? loadedReplies() : [];
      // What was loaded when this read began: anything NOT in here arrived while it ran and must survive it.
      const startIds = new Set(loaded.map((m) => m.id));
      const newest = loaded[loaded.length - 1];
      const result = await readPages(newest ? messageCursor(newest) : null);
      if (!current(g) || read !== latestRead.current) return;
      if (result === 'unavailable') {
        setStatus('unavailable');
        return;
      }
      const { rows, more, overlapped } = result;
      // A page that came back short means the read reached the start of the conversation.
      const reachedStart = !more;
      // Paging gave up before it met what was loaded: gluing the two would hide a gap.
      const gap = mode === 'resync' && !overlapped && !reachedStart;
      const root = threadRootId ? rows.find((m) => m.id === threadRootId) : undefined;
      const replies = rows.filter((m) => m.id !== threadRootId);
      setServer((prev) => {
        const priorRoot = prev.find((m) => m.id === threadRootId);
        const others = prev.filter((m) => m.id !== threadRootId);
        const base = gap ? replaceWindow(others, replies, startIds) : reconcileWindow(others, replies, startIds, reachedStart && mode === 'resync');
        if (!root) return priorRoot ? upsertMessage(base, priorRoot) : base;
        return upsertMessage(base, priorRoot ? newerVersion(priorRoot, root) : root);
      });
      // The first read says whether older messages exist; a resync corrects it when it learned more.
      if (!loadedOnce.current || gap || reachedStart) setHasMore(more);
      loadedOnce.current = true;
      setStatus('ready');
      setSyncVersion((v) => v + 1);
      void fetchStats(replies, g);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `current` and `loadedReplies` only read refs
    [readPages, threadRootId, fetchStats],
  );

  // Initial load, and a fresh start when the conversation or thread changes.
  const load = useCallback(async () => {
    setStatus('loading');
    try {
      await sync('initial');
    } catch {
      if (mounted.current) setStatus('error');
    }
  }, [sync]);

  useEffect(() => {
    generation.current++;
    latestRead.current++;
    loadedOnce.current = false;
    counted.current = new Set();
    setServer([]);
    setStats(new Map());
    setHasMore(false);
    void load();
  }, [conversationId, threadRootId, load]);

  // Live merge. A resync (reconnect, focus, the slow timer) re-reads quietly.
  useEffect(
    () =>
      subscribe((e) => {
        if (e.type === 'resync') {
          sync('resync').catch(() => {
            /* keep what is shown; the next event or focus retries */
          });
          return;
        }
        const m = e.type === 'sent' ? e.message : e.event.message;
        const isInsert = e.type === 'sent' || e.event.type === 'INSERT';
        if (m.conversationId !== conversationId) return;
        if (threadRootId) {
          if (m.id !== threadRootId && m.threadRootId !== threadRootId) return;
        } else if (m.threadRootId) {
          const rootId = m.threadRootId;
          if (isInsert) {
            if (counted.current.has(m.id)) return;
            counted.current.add(m.id);
            setStats((prev) => {
              const next = new Map(prev);
              const cur = next.get(rootId) ?? { count: 0, authorIds: [] };
              next.set(rootId, {
                count: cur.count + 1,
                authorIds: m.authorId && !cur.authorIds.includes(m.authorId) ? [...cur.authorIds, m.authorId] : cur.authorIds,
              });
              return next;
            });
          } else if (m.isDeleted) {
            void refreshStat(rootId); // the count drops by one (deleted replies are not counted)
          }
          return;
        }
        if (isInsert) setServer((prev) => appendIfNewer(prev, m));
        else {
          setServer((prev) => replaceLoaded(prev, m));
          setSyncVersion((v) => v + 1);
        }
      }),
     
    [subscribe, sync, conversationId, threadRootId, refreshStat],
  );

  // Names and faces for everyone who wrote something shown.
  useEffect(() => {
    const ids = new Set<string>();
    server.forEach((m) => m.authorId && ids.add(m.authorId));
    stats.forEach((s) => s.authorIds.forEach((id) => ids.add(id)));
    ensureAuthors([...ids]);
  }, [server, stats, ensureAuthors]);

  const loadEarlier = useCallback(async () => {
    const oldest = loadedReplies()[0];
    if (!oldest || loadingEarlier) return 0;
    const g = generation.current;
    setLoadingEarlier(true);
    try {
      const rows = await listMessages(conversationId, { limit: PAGE_SIZE, before: messageCursor(oldest), threadRootId });
      if (!current(g)) return 0;
      setServer((prev) => rows.reduce<ChatMessage[]>((acc, m) => upsertMessage(acc, m), prev));
      setHasMore(rows.length >= PAGE_SIZE);
      void fetchStats(rows, g);
      return rows.length;
    } catch {
      return 0;
    } finally {
      if (mounted.current) setLoadingEarlier(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `current` and `loadedReplies` only read refs
  }, [conversationId, threadRootId, loadingEarlier, fetchStats]);

  /** Pages back until `messageId` is loaded (a search hit or a quote opens on it). Stops when the view has moved on. */
  const ensureLoaded = useCallback(
    async (messageId: string): Promise<boolean> => {
      const g = generation.current;
      for (let i = 0; i < MAX_JUMP_PAGES; i++) {
        if (!current(g)) return false;
        if (serverRef.current.some((m) => m.id === messageId)) return true;
        const oldest = loadedReplies()[0];
        if (!oldest) return false;
        const rows = await listMessages(conversationId, { limit: PAGE_SIZE, before: messageCursor(oldest), threadRootId });
        if (!current(g) || rows.length === 0) return false;
        serverRef.current = rows.reduce<ChatMessage[]>((acc, m) => upsertMessage(acc, m), serverRef.current);
        setServer(serverRef.current);
        setHasMore(rows.length >= PAGE_SIZE);
      }
      return current(g) && serverRef.current.some((m) => m.id === messageId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `current` and `loadedReplies` only read refs
    [conversationId, threadRootId],
  );

  // This destination's unconfirmed sends, from the provider's outbox.
  const locals = useMemo(
    () => outbox.filter((l) => l.conversationId === conversationId && (l.threadRootId ?? null) === (threadRootId ?? null)),
    [outbox, conversationId, threadRootId],
  );

  const send = useCallback(
    (input: SendInput) => chat.sendMessage(conversationId, threadRootId, input),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chat.sendMessage is stable per user
    [chat.sendMessage, conversationId, threadRootId],
  );
  const retrySend = chat.retrySend;
  const discard = chat.discardSend;

  const edit = useCallback(async (messageId: string, body: string) => {
    const row = await editMessage(messageId, body);
    setServer((prev) => upsertMessage(prev, row));
  }, []);

  const remove = useCallback(async (messageId: string) => {
    const row = await deleteMessage(messageId);
    setServer((prev) => upsertMessage(prev, row));
    if (row.threadRootId && !threadRootId) void refreshStat(row.threadRootId);
  }, [threadRootId, refreshStat]);

  const messages = useMemo<Row[]>(() => {
    // A pending send is hidden while its own confirmed row is already on the server (the Realtime copy
    // beat the RPC reply): matched by the send's clientId, never by its words, so the same words from
    // another device stay a different message. The send stays in the outbox until its own result.
    const confirmed = new Set(server.map((m) => m.clientId).filter(Boolean));
    const shown = locals.filter((l) => !(l.clientId && confirmed.has(l.clientId)));
    return [...server, ...shown];
  }, [server, locals]);

  /** A message by id: loaded rows first, else one read through the reader's own access. */
  const lookup = useCallback(
    async (id: string): Promise<ChatMessage | null> => serverRef.current.find((m) => m.id === id) ?? (await getMessage(id)),
    [],
  );
  const getLoaded = useCallback((id: string): ChatMessage | undefined => serverRef.current.find((m) => m.id === id), []);

  return {
    status,
    messages,
    server,
    hasMore,
    loadingEarlier,
    stats,
    syncVersion,
    reload: load,
    loadEarlier,
    ensureLoaded,
    send,
    retrySend,
    discard,
    edit,
    remove,
    lookup,
    getLoaded,
  };
}
