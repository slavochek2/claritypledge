/**
 * @file chat-provider.tsx
 * @description P1512: one chat subscription for the signed-in user.
 *
 * Owns the chat list, the single Realtime subscription (subscribeToChat), the Home unread count,
 * the author cache, the outbox of unconfirmed sends and the block actions. Realtime is a hint, never
 * the source of truth: the list and the open conversation refetch on every (re)subscribe, on window
 * focus and on tab-visible, and a visible open conversation refetches on a slow timer too.
 *
 * Cost shape: a Realtime message patches its list row locally (preview, time, unread + 1) and a full
 * list read follows only after a quiet two seconds, at once only for a conversation the list does not
 * know. A thread reply changes nothing in the list, so it triggers no read at all.
 *
 * Everything is keyed by user: the state lives in an inner component remounted when the signed-in
 * user changes, so one person's chats, badge, authors and unsent messages can never be seen by the next.
 *
 * Mounted once above the routes so the Home badge in the sidebar and the phone bottom bar works on
 * every page, not only on Home. It stays idle inside ?embed=true, /live* and /transcribe*.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/auth';
import { useHomeReadiness } from '@/app/routes/home-readiness';
import {
  blockUser,
  getMyChats,
  setChatState,
  markRead as markReadRpc,
  sendMessage as sendMessageRpc,
  subscribeToChat,
  unblockUser,
  type ChatMemberState,
  type ChatMessageEvent,
  type ChatSummary,
} from '@/app/data/chat-service';
import { getChatAuthors, type ChatAuthor } from '@/app/data/chat-ui-helpers';
import { clearDraftsExcept } from './chat-hooks';
import { ChatContext, type ChatContextValue, type ChatEvent, type LocalMessage, type SendInput } from './chat-state';
import { chatErrorText, compareMessages, unreadChatCount } from './chat-view-model';

/** After a Realtime event: a full list read waits for this much quiet. */
export const REFRESH_DEBOUNCE_MS = 2000;
/**
 * Safety net, not the delivery path: while a conversation is open and the tab is in front, refetch
 * this often even if Realtime said nothing. A socket that died without telling anyone (a VPN or Wi-Fi
 * change) is only noticed by the library's heartbeat after up to a minute; this bounds how long a
 * message can stay invisible.
 */
export const SAFETY_POLL_MS = 60_000;
/** A list read that has not answered by now is called failed: an error with Retry, never an endless skeleton. */
export const LIST_READ_TIMEOUT_MS = 25_000;
/** A failed author read is retried this many times, waiting a little longer each time. */
const AUTHOR_RETRIES = 4;
const AUTHOR_RETRY_MS = 2000;

interface Override {
  archived?: boolean;
  manualUnread?: boolean;
  read?: boolean;
}

/** Applies one message event to the list row it belongs to. `unknown` means the list has no such chat. */
function patchRow(
  chats: ChatSummary[],
  event: ChatMessageEvent,
  me: string,
  viewing: string | null,
  authorName: string | null,
): { chats: ChatSummary[]; unknown: boolean } {
  const m = event.message;
  const i = chats.findIndex((c) => c.conversationId === m.conversationId);
  if (i < 0) return { chats, unknown: true };
  const chat = chats[i] as ChatSummary;
  let next = chat;
  if (event.type === 'INSERT') {
    const isNewest = !chat.lastMessage || compareMessages(m, { id: chat.lastMessage.id, createdAt: chat.lastMessage.createdAt }) >= 0;
    if (isNewest) {
      next = {
        ...chat,
        lastMessage: {
          id: m.id,
          authorId: m.authorId,
          authorName,
          body: m.isDeleted ? 'Message deleted' : m.body,
          kind: m.kind,
          isDeleted: m.isDeleted,
          createdAt: m.createdAt,
        },
        unreadCount: m.authorId !== me && viewing !== m.conversationId ? chat.unreadCount + 1 : chat.unreadCount,
      };
    }
  } else if (chat.lastMessage?.id === m.id) {
    next = {
      ...chat,
      lastMessage: { ...chat.lastMessage, body: m.isDeleted ? 'Message deleted' : m.body, isDeleted: m.isDeleted },
    };
  }
  if (next === chat) return { chats, unknown: false };
  const copy = chats.slice();
  copy[i] = next;
  return { chats: copy, unknown: false };
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { state } = useHomeReadiness();
  const { pathname, search } = useLocation();
  const userId = state === 'signed-in' && user ? user.id : null;
  const embedded = new URLSearchParams(search).get('embed') === 'true' || /^\/(live|transcribe)(\/|$)/.test(pathname);

  useEffect(() => {
    clearDraftsExcept(userId);
  }, [userId]);

  // A different person (or none) is a different provider: nothing carries over.
  return (
    <ChatProviderInner key={userId ?? 'none'} userId={userId} enabled={!embedded}>
      {children}
    </ChatProviderInner>
  );
}

let localCounter = 0;

function ChatProviderInner({ userId, enabled, children }: { userId: string | null; enabled: boolean; children: ReactNode }) {
  const { user } = useAuth();

  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [status, setStatus] = useState<ChatContextValue['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  const [fetchedAuthors, setAuthors] = useState<Record<string, ChatAuthor>>({});
  // The signed-in person is known from the session: their own messages never wait on a lookup.
  const self = user?.id ?? null;
  const selfName = user?.name;
  const selfSlug = user?.slug;
  const selfAvatarUrl = user?.avatarUrl;
  const selfAvatarColor = user?.avatarColor;
  const selfPledged = user?.hasPledged;
  const authors = useMemo<Record<string, ChatAuthor>>(
    () =>
      self && selfName
        ? {
            [self]: { id: self, name: selfName, slug: selfSlug ?? null, avatarUrl: selfAvatarUrl ?? null, avatarColor: selfAvatarColor ?? null, hasPledged: selfPledged === true },
            ...fetchedAuthors,
          }
        : fetchedAuthors,
    [self, selfName, selfSlug, selfAvatarUrl, selfAvatarColor, selfPledged, fetchedAuthors],
  );
  const [missingAuthors, setMissingAuthors] = useState<ReadonlySet<string>>(new Set());
  const [outbox, setOutbox] = useState<LocalMessage[]>([]);
  const [revision, setRevision] = useState(0);

  const listeners = useRef(new Set<(e: ChatEvent) => void>());
  const overrides = useRef(new Map<string, Override>());
  const seq = useRef(0);
  const loaded = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewing = useRef<string | null>(null);
  const authorsRef = useRef(authors);
  authorsRef.current = authors;
  const authorsPending = useRef(new Set<string>());
  const authorsMissing = useRef(new Set<string>());
  const authorsAttempts = useRef(new Map<string, number>());
  const outboxRef = useRef(outbox);
  outboxRef.current = outbox;

  const emit = useCallback((event: ChatEvent) => {
    listeners.current.forEach((l) => l(event));
  }, []);

  const withOverrides = useCallback(
    (rows: ChatSummary[]): ChatSummary[] =>
      rows.map((c) => {
        const o = overrides.current.get(c.conversationId);
        if (!o) return c;
        return {
          ...c,
          ...(o.archived !== undefined ? { archived: o.archived } : {}),
          ...(o.manualUnread !== undefined ? { manualUnread: o.manualUnread } : {}),
          ...(o.read ? { unreadCount: 0, manualUnread: false } : {}),
        };
      }),
    [],
  );

  const refresh = useCallback(async (): Promise<ChatSummary[] | null> => {
    if (!userId) return null;
    const mine = ++seq.current;
    try {
      const rows = await Promise.race([
        getMyChats(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('chat list read timed out')), LIST_READ_TIMEOUT_MS)),
      ]);
      if (mine !== seq.current) return null;
      loaded.current = true;
      const next = withOverrides(rows);
      setChats(next);
      setStatus('ready');
      setError(null);
      return next;
    } catch (e) {
      if (mine !== seq.current) return null;
      // A failed refetch keeps the list we have; only the very first load shows the error state.
      if (!loaded.current) {
        setStatus('error');
        setError(chatErrorText(e, 'Could not load your chats.'));
      }
      return null;
    }
  }, [userId, withOverrides]);

  const scheduleRefresh = useCallback(
    (ms: number = REFRESH_DEBOUNCE_MS) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void refresh();
      }, ms);
    },
    [refresh],
  );

  useEffect(() => {
    if (!userId || !enabled) return;
    loaded.current = false;
    setStatus('loading');
    void refresh();

    const resync = () => {
      void refresh();
      setRevision((r) => r + 1);
      emit({ type: 'resync' });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') resync();
    };
    const unsubscribe = subscribeToChat(
      (event) => {
        emit({ type: 'message', event });
        const m = event.message;
        if (event.type === 'UPDATE') setRevision((r) => r + 1);
        // A thread reply changes nothing the list shows: no list work at all.
        if (m.threadRootId) return;
        const name = m.authorId ? authorsRef.current[m.authorId]?.name ?? null : null;
        let unknown = false;
        setChats((prev) => {
          const patched = patchRow(prev, event, userId, viewing.current, name);
          unknown = patched.unknown;
          return patched.chats;
        });
        // A chat the list has never seen (a new DM, a new channel) needs the real row, now.
        if (unknown) {
          if (timer.current) clearTimeout(timer.current);
          void refresh();
        } else scheduleRefresh();
      },
      (state: ChatMemberState) => {
        // Another device of this user changed read / archive state.
        if (state.profileId !== userId) return;
        setChats((prev) =>
          prev.map((c) => {
            if (c.conversationId !== state.conversationId) return c;
            const readAll =
              !!state.lastReadAt && (!c.lastMessage || Date.parse(state.lastReadAt) >= Date.parse(c.lastMessage.createdAt));
            return {
              ...c,
              archived: state.archived,
              manualUnread: state.manualUnread,
              lastReadAt: state.lastReadAt,
              unreadCount: readAll ? 0 : c.unreadCount,
            };
          }),
        );
        scheduleRefresh();
      },
      resync,
    );
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    // Only a visible, open conversation needs the timer; everything else wakes on focus or an event.
    const poll = setInterval(() => {
      if (viewing.current && document.visibilityState === 'visible') resync();
    }, SAFETY_POLL_MS);
    return () => {
      clearInterval(poll);
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      // A response for the previous user must not land after sign-out or a switch.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- a counter, not a DOM node: the latest value is the point
      seq.current++;
    };
  }, [userId, enabled, refresh, scheduleRefresh, emit]);

  /** Applies a local change at once, runs the write, then lets the server's answer replace it. */
  const runOp = useCallback(
    async (conversationId: string, patch: Override, call: () => Promise<void>, quiet: boolean) => {
      overrides.current.set(conversationId, { ...overrides.current.get(conversationId), ...patch });
      setChats((prev) => withOverrides(prev));
      try {
        await call();
      } catch (e) {
        if (!quiet) toast.error(chatErrorText(e));
      } finally {
        overrides.current.delete(conversationId);
        seq.current++; // an older in-flight refetch must not undo this change
        scheduleRefresh(300);
      }
    },
    [scheduleRefresh, withOverrides],
  );

  const setArchived = useCallback(
    (conversationId: string, archived: boolean) =>
      runOp(conversationId, { archived }, () => setChatState(conversationId, { archived }), false),
    [runOp],
  );
  const setManualUnread = useCallback(
    (conversationId: string, manualUnread: boolean) =>
      runOp(conversationId, { manualUnread }, () => setChatState(conversationId, { manualUnread }), false),
    [runOp],
  );
  const markRead = useCallback(
    (conversationId: string, throughMessageId?: string) =>
      runOp(conversationId, { read: true }, () => markReadRpc(conversationId, throughMessageId ? { throughMessageId } : undefined), true),
    [runOp],
  );

  const subscribe = useCallback((listener: (e: ChatEvent) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const setViewing = useCallback((conversationId: string | null) => {
    viewing.current = conversationId;
  }, []);

  // ---- the outbox: sends live here, above any conversation, so a failure survives switching chats ----
  const deliver = useCallback(
    async (local: LocalMessage) => {
      try {
        const row = await sendMessageRpc({
          conversationId: local.conversationId,
          threadRootId: local.threadRootId ?? undefined,
          ...local.input,
        });
        setOutbox((prev) => prev.filter((l) => l.localId !== local.localId));
        emit({ type: 'sent', message: row });
        if (!row.threadRootId && userId) {
          setChats((prev) => patchRow(prev, { type: 'INSERT', message: row }, userId, viewing.current, null).chats);
          scheduleRefresh();
        }
      } catch (e) {
        setOutbox((prev) =>
          prev.map((l) => (l.localId === local.localId ? { ...l, pending: false, failed: true, error: chatErrorText(e, 'Not sent.') } : l)),
        );
      }
    },
    [emit, scheduleRefresh, userId],
  );

  const sendMessage = useCallback(
    (conversationId: string, threadRootId: string | undefined, input: SendInput) => {
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
        input,
      };
      setOutbox((prev) => [...prev, local]);
      return deliver(local);
    },
    [userId, deliver],
  );

  const retrySend = useCallback(
    (localId: string) => {
      const failed = outboxRef.current.find((l) => l.localId === localId);
      if (!failed) return Promise.resolve();
      const again: LocalMessage = { ...failed, pending: true, failed: false, error: undefined };
      setOutbox((prev) => prev.map((l) => (l.localId === localId ? again : l)));
      return deliver(again);
    },
    [deliver],
  );

  const discardSend = useCallback((localId: string) => setOutbox((prev) => prev.filter((l) => l.localId !== localId)), []);

  // ---- authors ----
  const ensureAuthorsRef = useRef<(ids: string[]) => void>(() => undefined);
  const ensureAuthors = useCallback((ids: string[]) => {
    const need = [
      ...new Set(
        ids.filter((id) => id && !authorsRef.current[id] && !authorsPending.current.has(id) && !authorsMissing.current.has(id)),
      ),
    ];
    if (need.length === 0) return;
    need.forEach((id) => authorsPending.current.add(id));
    getChatAuthors(need)
      .then((rows) => {
        const found = new Set(rows.map((r) => r.id));
        const gone = need.filter((id) => !found.has(id));
        gone.forEach((id) => authorsMissing.current.add(id));
        if (gone.length) setMissingAuthors((prev) => new Set([...prev, ...gone]));
        if (rows.length) setAuthors((prev) => ({ ...prev, ...Object.fromEntries(rows.map((r) => [r.id, r])) }));
        need.forEach((id) => authorsAttempts.current.delete(id));
      })
      .catch(() => {
        // A dropped connection must not leave "Unknown" on screen for the rest of the visit: ask
        // again a few times, a little later each time.
        const again = need.filter((id) => (authorsAttempts.current.get(id) ?? 0) < AUTHOR_RETRIES);
        const gaveUp = need.filter((id) => !again.includes(id));
        if (gaveUp.length) setMissingAuthors((prev) => new Set([...prev, ...gaveUp]));
        again.forEach((id) => authorsAttempts.current.set(id, (authorsAttempts.current.get(id) ?? 0) + 1));
        if (again.length) {
          const wait = AUTHOR_RETRY_MS * (authorsAttempts.current.get(again[0] as string) ?? 1);
          setTimeout(() => ensureAuthorsRef.current(again), wait);
        }
      })
      .finally(() => need.forEach((id) => authorsPending.current.delete(id)));
  }, []);
  ensureAuthorsRef.current = ensureAuthors;

  // Blocking changes what the list says (canSend, blockedByMe): read it back before returning.
  const block = useCallback(
    async (profileId: string) => {
      await blockUser(profileId);
      await refresh();
    },
    [refresh],
  );
  const unblock = useCallback(
    async (profileId: string) => {
      await unblockUser(profileId);
      await refresh();
    },
    [refresh],
  );

  const unreadCount = useMemo(() => unreadChatCount(chats), [chats]);

  const value = useMemo<ChatContextValue | null>(
    () =>
      userId
        ? {
            userId,
            status,
            error,
            chats,
            unreadCount,
            refresh,
            setArchived,
            setManualUnread,
            markRead,
            subscribe,
            setViewing,
            revision,
            authors,
            missingAuthors,
            ensureAuthors,
            outbox,
            sendMessage,
            retrySend,
            discardSend,
            block,
            unblock,
          }
        : null,
    [userId, status, error, chats, unreadCount, refresh, setArchived, setManualUnread, markRead, subscribe, setViewing, revision, authors, missingAuthors, ensureAuthors, outbox, sendMessage, retrySend, discardSend, block, unblock],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
