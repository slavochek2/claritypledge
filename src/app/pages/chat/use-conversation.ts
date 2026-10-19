/**
 * P1512: the messages of one conversation (or of one thread) — loading, paging back, live merge
 * with Realtime, optimistic sends with a failed state, edit and delete.
 *
 * Server rows and local (unconfirmed) rows are kept apart: server rows are always in the server's
 * order, local rows always trail them, so a skewed client clock can never put a pending message
 * in the middle of the history. A Realtime INSERT and the RPC's reply can arrive in either order;
 * both end at one row because everything is keyed by the server id.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteMessage,
  editMessage,
  getMessage,
  listMessages,
  listThread,
  messageCursor,
  sendMessage,
  type ChatMessage,
  type SendMessageInput,
} from '@/app/data/chat-service';
import { getThreadStats, type ThreadStat } from '@/app/data/chat-ui-helpers';
import { useChat } from './chat-state';
import { chatErrorText, upsertMessage } from './chat-view-model';

export const PAGE_SIZE = 50;
const MAX_JUMP_PAGES = 20;

/** An unconfirmed message of mine: sending, or failed with a Retry. */
export interface LocalMessage extends ChatMessage {
  localId: string;
  pending: boolean;
  failed: boolean;
  error?: string;
  input: Omit<SendMessageInput, 'conversationId'>;
}

export type Row = ChatMessage | LocalMessage;
export const isLocal = (m: Row): m is LocalMessage => 'localId' in m;

export type SendInput = Pick<SendMessageInput, 'body' | 'replyToId' | 'attachment'>;

interface Options {
  conversationId: string;
  /** Set for a thread panel: the root first, then its replies. */
  threadRootId?: string;
  /** Channels have threads: count replies under each root. */
  withThreads?: boolean;
}

let localCounter = 0;

export function useConversationMessages({ conversationId, threadRootId, withThreads = false }: Options) {
  const chat = useChat();
  const { userId, subscribe, ensureAuthors } = chat;
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [server, setServer] = useState<ChatMessage[]>([]);
  const [locals, setLocals] = useState<LocalMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [stats, setStats] = useState<Map<string, ThreadStat>>(new Map());
  const serverRef = useRef(server);
  serverRef.current = server;
  const loadedOnce = useRef(false);

  const fetchStats = useCallback(
    async (rows: ChatMessage[]) => {
      if (!withThreads || threadRootId) return;
      const roots = rows.map((m) => m.id);
      if (roots.length === 0) return;
      try {
        const next = await getThreadStats(conversationId, roots);
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

  const fetchLatest = useCallback(async () => {
    const rows = threadRootId
      ? await listThread(conversationId, threadRootId)
      : await listMessages(conversationId, { limit: PAGE_SIZE });
    setServer((prev) => rows.reduce<ChatMessage[]>((acc, m) => upsertMessage(acc, m), prev));
    if (!loadedOnce.current) setHasMore(!threadRootId && rows.length >= PAGE_SIZE);
    loadedOnce.current = true;
    setStatus('ready');
    void fetchStats(rows);
    return rows;
  }, [conversationId, threadRootId, fetchStats]);

  // Initial load, and a fresh start when the conversation or thread changes.
  const load = useCallback(async () => {
    setStatus('loading');
    try {
      await fetchLatest();
    } catch {
      setStatus('error');
    }
  }, [fetchLatest]);

  useEffect(() => {
    loadedOnce.current = false;
    setServer([]);
    setLocals([]);
    setStats(new Map());
    setHasMore(false);
    void load();
  }, [conversationId, threadRootId, load]);

  // Live merge. A resync (reconnect, focus) refetches the latest page quietly.
  useEffect(
    () =>
      subscribe((e) => {
        if (e.type === 'resync') {
          fetchLatest().catch(() => {
            /* keep what is shown; the next event or focus retries */
          });
          return;
        }
        const m = e.event.message;
        if (m.conversationId !== conversationId) return;
        if (threadRootId) {
          if (m.id !== threadRootId && m.threadRootId !== threadRootId) return;
        } else if (m.threadRootId) {
          const rootId = m.threadRootId;
          if (e.event.type === 'INSERT') {
            setStats((prev) => {
              const next = new Map(prev);
              const cur = next.get(rootId) ?? { count: 0, authorIds: [] };
              next.set(rootId, {
                count: cur.count + 1,
                authorIds: m.authorId && !cur.authorIds.includes(m.authorId) ? [...cur.authorIds, m.authorId] : cur.authorIds,
              });
              return next;
            });
          }
          return;
        }
        if (e.event.type === 'INSERT' && m.authorId === userId) {
          // My own send, delivered by Realtime before the RPC replied: drop its pending twin.
          setLocals((prev) => {
            const i = prev.findIndex((l) => l.pending && (l.body ?? null) === (m.body ?? null) && l.attachmentId === m.attachmentId);
            return i < 0 ? prev : prev.filter((_, j) => j !== i);
          });
        }
        setServer((prev) => upsertMessage(prev, m));
      }),
    [subscribe, fetchLatest, conversationId, threadRootId, userId],
  );

  // Names and faces for everyone who wrote something shown.
  useEffect(() => {
    const ids = new Set<string>();
    server.forEach((m) => m.authorId && ids.add(m.authorId));
    stats.forEach((s) => s.authorIds.forEach((id) => ids.add(id)));
    ensureAuthors([...ids]);
  }, [server, stats, ensureAuthors]);

  const loadEarlier = useCallback(async () => {
    const oldest = serverRef.current[0];
    if (!oldest || loadingEarlier || threadRootId) return 0;
    setLoadingEarlier(true);
    try {
      const rows = await listMessages(conversationId, { limit: PAGE_SIZE, before: messageCursor(oldest) });
      setServer((prev) => rows.reduce<ChatMessage[]>((acc, m) => upsertMessage(acc, m), prev));
      setHasMore(rows.length >= PAGE_SIZE);
      void fetchStats(rows);
      return rows.length;
    } catch {
      return 0;
    } finally {
      setLoadingEarlier(false);
    }
  }, [conversationId, threadRootId, loadingEarlier, fetchStats]);

  /** Pages back until `messageId` is loaded (search results open on the hit). */
  const ensureLoaded = useCallback(
    async (messageId: string): Promise<boolean> => {
      for (let i = 0; i < MAX_JUMP_PAGES; i++) {
        if (serverRef.current.some((m) => m.id === messageId)) return true;
        const oldest = serverRef.current[0];
        if (!oldest) return false;
        const rows = await listMessages(conversationId, { limit: PAGE_SIZE, before: messageCursor(oldest) });
        if (rows.length === 0) return false;
        setServer((prev) => rows.reduce<ChatMessage[]>((acc, m) => upsertMessage(acc, m), prev));
        serverRef.current = rows.reduce<ChatMessage[]>((acc, m) => upsertMessage(acc, m), serverRef.current);
        setHasMore(rows.length >= PAGE_SIZE);
      }
      return serverRef.current.some((m) => m.id === messageId);
    },
    [conversationId],
  );

  const deliver = useCallback(
    async (local: LocalMessage) => {
      try {
        const row = await sendMessage({ conversationId, threadRootId, ...local.input });
        setLocals((prev) => prev.filter((l) => l.localId !== local.localId));
        setServer((prev) => upsertMessage(prev, row));
      } catch (e) {
        setLocals((prev) =>
          prev.map((l) => (l.localId === local.localId ? { ...l, pending: false, failed: true, error: chatErrorText(e, 'Not sent.') } : l)),
        );
      }
    },
    [conversationId, threadRootId],
  );

  const send = useCallback(
    (input: SendInput) => {
      const localId = `local-${++localCounter}`;
      const local: LocalMessage = {
        id: localId,
        localId,
        pending: true,
        failed: false,
        conversationId,
        authorId: userId,
        body: input.body,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        isDeleted: false,
        replyToId: input.replyToId ?? null,
        threadRootId: threadRootId ?? null,
        forwardedFromMessageId: null,
        forwardSnapshot: null,
        kind: 'message',
        attachmentKind: input.attachment?.kind ?? null,
        attachmentId: input.attachment?.id ?? null,
        input: { body: input.body, replyToId: input.replyToId, attachment: input.attachment },
      };
      setLocals((prev) => [...prev, local]);
      return deliver(local);
    },
    [conversationId, threadRootId, userId, deliver],
  );

  const retrySend = useCallback(
    (localId: string) => {
      const failed = locals.find((l) => l.localId === localId);
      if (!failed) return Promise.resolve();
      const again: LocalMessage = { ...failed, pending: true, failed: false, error: undefined };
      setLocals((prev) => prev.map((l) => (l.localId === localId ? again : l)));
      return deliver(again);
    },
    [locals, deliver],
  );

  const discard = useCallback((localId: string) => setLocals((prev) => prev.filter((l) => l.localId !== localId)), []);

  const edit = useCallback(async (messageId: string, body: string) => {
    const row = await editMessage(messageId, body);
    setServer((prev) => upsertMessage(prev, row));
  }, []);

  const remove = useCallback(async (messageId: string) => {
    const row = await deleteMessage(messageId);
    setServer((prev) => upsertMessage(prev, row));
  }, []);

  const messages = useMemo<Row[]>(() => [...server, ...locals], [server, locals]);

  /** A message by id: loaded rows first, else one read through the reader's own access. */
  const lookup = useCallback(
    async (id: string): Promise<ChatMessage | null> => serverRef.current.find((m) => m.id === id) ?? (await getMessage(id)),
    [],
  );

  return {
    status,
    messages,
    server,
    hasMore,
    loadingEarlier,
    stats,
    reload: load,
    loadEarlier,
    ensureLoaded,
    send,
    retrySend,
    discard,
    edit,
    remove,
    lookup,
  };
}
