/**
 * @file chat-provider.tsx
 * @description P1512: one chat subscription for the signed-in user.
 *
 * Owns the chat list, the single Realtime subscription (subscribeToChat), the Home unread count,
 * the author cache and the block list. Realtime is a hint, never the source of truth: the list and
 * the open conversation refetch on every (re)subscribe, on window focus and on tab-visible, and the
 * list refetches (debounced) after every event.
 *
 * Mounted once above the routes so the Home badge in the sidebar and the phone bottom bar works on
 * every page, not only on Home.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/auth';
import {
  blockUser,
  getMyChats,
  setChatState,
  markRead as markReadRpc,
  subscribeToChat,
  unblockUser,
  type ChatMemberState,
  type ChatSummary,
} from '@/app/data/chat-service';
import { getChatAuthors, type ChatAuthor } from '@/app/data/chat-ui-helpers';
import { ChatContext, type ChatContextValue, type ChatEvent } from './chat-state';
import { chatErrorText, unreadChatCount } from './chat-view-model';

/** Events and focus changes burst; one list refetch per quiet period is enough. */
export const REFRESH_DEBOUNCE_MS = 300;
/**
 * Safety net, not the delivery path: a visible tab refetches this often even if Realtime said nothing.
 * A socket that died without telling anyone (a VPN or Wi-Fi change) is only noticed by the library's
 * heartbeat after up to a minute; this bounds how long a message can stay invisible.
 */
export const SAFETY_POLL_MS = 20_000;
/** A failed author read is retried this many times, waiting a little longer each time. */
const AUTHOR_RETRIES = 4;
const AUTHOR_RETRY_MS = 2000;

interface Override {
  archived?: boolean;
  manualUnread?: boolean;
  read?: boolean;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.isVerified ? user.id : null;

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

  const listeners = useRef(new Set<(e: ChatEvent) => void>());
  const overrides = useRef(new Map<string, Override>());
  const seq = useRef(0);
  const loaded = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authorsRef = useRef(authors);
  authorsRef.current = authors;
  const authorsPending = useRef(new Set<string>());
  const authorsMissing = useRef(new Set<string>());
  const authorsAttempts = useRef(new Map<string, number>());

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

  const refresh = useCallback(async () => {
    if (!userId) return;
    const mine = ++seq.current;
    try {
      const rows = await getMyChats();
      if (mine !== seq.current) return;
      loaded.current = true;
      setChats(withOverrides(rows));
      setStatus('ready');
      setError(null);
    } catch (e) {
      if (mine !== seq.current) return;
      // A failed refetch keeps the list we have; only the very first load shows the error state.
      if (!loaded.current) {
        setStatus('error');
        setError(chatErrorText(e, 'Could not load your chats.'));
      }
    }
  }, [userId, withOverrides]);

  const scheduleRefresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void refresh();
    }, REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  useEffect(() => {
    if (!userId) {
      setChats([]);
      setStatus('loading');
      loaded.current = false;
      return;
    }
    loaded.current = false;
    setStatus('loading');
    void refresh();

    const resync = () => {
      void refresh();
      emit({ type: 'resync' });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') resync();
    };
    const unsubscribe = subscribeToChat(
      (event) => {
        emit({ type: 'message', event });
        scheduleRefresh();
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
    const poll = setInterval(onVisible, SAFETY_POLL_MS);
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
  }, [userId, refresh, scheduleRefresh, emit]);

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
        scheduleRefresh();
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
    (conversationId: string, at?: string) =>
      runOp(conversationId, { read: true }, () => markReadRpc(conversationId, at ? new Date(at) : undefined), true),
    [runOp],
  );

  const subscribe = useCallback((listener: (e: ChatEvent) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

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
            authors,
            missingAuthors,
            ensureAuthors,
            block,
            unblock,
          }
        : null,
    [userId, status, error, chats, unreadCount, refresh, setArchived, setManualUnread, markRead, subscribe, authors, missingAuthors, ensureAuthors, block, unblock],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
