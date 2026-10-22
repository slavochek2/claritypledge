/**
 * P1512: Clarity Chat service — a thin typed wrapper over the chat RPCs and the RLS-gated reads.
 *
 * The database owns every rule (docs: supabase/migrations/*_p1512_clarity_chat.sql):
 *   - reads: direct SELECTs on chat_conversations / chat_messages / chat_member_state, filtered by
 *     RLS to what the signed-in user may see (history starts at join / RSVP time);
 *   - writes: SECURITY DEFINER RPCs only. The tables grant no INSERT / UPDATE / DELETE, and no RPC
 *     takes "who am I", so there is nothing here to get wrong on the client.
 *
 * Realtime is a hint, never the source of truth: callers refetch on subscribe, on reconnect and on
 * tab focus (see subscribeToChat's onSubscribed).
 */

import { supabase } from '@/lib/supabase';
import {
  mapConversationRow,
  mapMemberStateRow,
  mapMessageRow,
  mapSummaryRow,
  keysetBeforeFilter,
  type ChatAttachmentKind,
  type ChatBlock,
  type ChatCursor,
  type ChatConversation,
  type ChatConversationRow,
  type ChatMemberState,
  type ChatMemberStateRow,
  type ChatMessage,
  type ChatMessageRow,
  type ChatPerson,
  type ChatSearchHit,
  type ChatSummary,
  type ChatSummaryRow,
} from './chat-mappers';

export * from './chat-mappers';

export const MESSAGE_COLUMNS =
  'id, conversation_id, author_id, body, created_at, edited_at, deleted_at, reply_to_id, thread_root_id, ' +
  'forwarded_from_message_id, forward_author_id, forward_snapshot, kind, attachment_kind, attachment_id, client_id, ' +
  'context_conversation_id';

const CONVERSATION_COLUMNS =
  'id, kind, org_id, event_id, owner_id, dm_user_a, dm_user_b, title, created_at, last_message_at';

const DEFAULT_PAGE = 50;

function fail(action: string, error: { message: string }): never {
  throw new Error(`chat ${action} failed: ${error.message}`);
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) fail(name, error);
  return data as T;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Every conversation the user can read, newest activity first. Also creates their mirror and any
 * missing General / event channels, so the first call after joining a group returns it. */
export async function getMyChats(): Promise<ChatSummary[]> {
  const rows = await rpc<ChatSummaryRow[] | null>('get_my_chats');
  return (rows ?? []).map(mapSummaryRow);
}

/** One conversation row, or null when it does not exist or the user may not read it. */
export async function getConversation(conversationId: string): Promise<ChatConversation | null> {
  const { data, error } = await supabase
    .from('chat_conversations')
    .select(CONVERSATION_COLUMNS)
    .eq('id', conversationId)
    .maybeSingle();
  if (error) fail('getConversation', error);
  return data ? mapConversationRow(data as unknown as ChatConversationRow) : null;
}

/**
 * Messages of a conversation, oldest first. `before` pages backwards with a keyset cursor: pass
 * `messageCursor(oldestShown)` ({ createdAt, id }); ties on the timestamp are ordered by id, so no
 * row is skipped or repeated. A bare createdAt string still works (timestamp only). Thread replies
 * are excluded unless a `threadRootId` is given.
 */
export async function listMessages(
  conversationId: string,
  options: { limit?: number; before?: string | ChatCursor; threadRootId?: string } = {},
): Promise<ChatMessage[]> {
  let query = supabase
    .from('chat_messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(options.limit ?? DEFAULT_PAGE);
  query = options.threadRootId ? query.eq('thread_root_id', options.threadRootId) : query.is('thread_root_id', null);
  if (options.before) query = query.or(keysetBeforeFilter(options.before));

  const { data, error } = await query;
  if (error) fail('listMessages', error);
  return ((data ?? []) as unknown as ChatMessageRow[]).map(mapMessageRow).reverse();
}

/**
 * The thread under a root message: the root first, then its replies, oldest first.
 *
 * Returns null unless `rootId` is a root message (no thread_root_id) OF THIS conversation and the
 * caller can read it. Every conversation kind has threads (P1546). The root is fetched by BOTH conversation_id and id, so an id from another chat cannot
 * be used to open a thread here.
 */
export async function listThread(conversationId: string, rootId: string): Promise<ChatMessage[] | null> {
  const conversation = await getConversation(conversationId);
  if (!conversation) return null;

  const { data, error } = await supabase
    .from('chat_messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', conversationId)
    .eq('id', rootId)
    .maybeSingle();
  if (error) fail('listThread', error);
  if (!data) return null;
  const root = mapMessageRow(data as unknown as ChatMessageRow);
  if (root.threadRootId !== null) return null;

  const replies = await listMessages(conversationId, { threadRootId: rootId, limit: 200 });
  return [root, ...replies];
}

/** One message by id; null when it does not exist or the user may not read it. */
export async function getMessage(messageId: string): Promise<ChatMessage | null> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select(MESSAGE_COLUMNS)
    .eq('id', messageId)
    .maybeSingle();
  if (error) fail('getMessage', error);
  return data ? mapMessageRow(data as unknown as ChatMessageRow) : null;
}

export interface ThreadStats {
  /** Replies that are not deleted and that the caller can read. */
  count: number;
  /** Up to 3 distinct most-recent repliers, newest first (erased accounts are left out). */
  authorIds: string[];
}

const THREAD_STATS_PAGE = 100;

/**
 * Reply counts and recent repliers for thread roots of one channel, computed on the server. Roots
 * that are not readable roots of this conversation are absent from the map. Accepts any number of
 * ids; the server takes at most 100 per call, so this pages.
 */
export async function getThreadStats(conversationId: string, rootIds: string[]): Promise<Map<string, ThreadStats>> {
  const out = new Map<string, ThreadStats>();
  const unique = [...new Set(rootIds)];
  for (let i = 0; i < unique.length; i += THREAD_STATS_PAGE) {
    const rows = await rpc<Array<{ root_id: string; reply_count: number; recent_author_ids: string[] | null }> | null>(
      'get_thread_stats',
      { p_conversation: conversationId, p_roots: unique.slice(i, i + THREAD_STATS_PAGE) },
    );
    for (const r of rows ?? []) {
      out.set(r.root_id, { count: r.reply_count, authorIds: r.recent_author_ids ?? [] });
    }
  }
  return out;
}

/** The signed-in user's own read / archive markers. RLS returns nobody else's. */
export async function listMyMemberState(): Promise<ChatMemberState[]> {
  const { data, error } = await supabase
    .from('chat_member_state')
    .select('conversation_id, profile_id, last_read_at, manual_unread, archived');
  if (error) fail('listMyMemberState', error);
  return ((data ?? []) as unknown as ChatMemberStateRow[]).map(mapMemberStateRow);
}

/** People the user shares a group, event or partnership with, matching `query` by name. */
export async function searchPeople(query: string): Promise<ChatPerson[]> {
  const rows = await rpc<
    Array<{
      profile_id: string;
      name: string;
      slug: string | null;
      avatar_url: string | null;
      avatar_color: string | null;
      shared: string;
      has_dm: string | null;
    }> | null
  >('search_chat_people', { p_query: query });
  return (rows ?? []).map((r) => ({
    id: r.profile_id,
    name: r.name,
    slug: r.slug,
    avatarUrl: r.avatar_url,
    avatarColor: r.avatar_color,
    shared: r.shared,
    dmConversationId: r.has_dm,
  }));
}

/** Message-text search across the chats the user can read (at least two characters). */
export async function searchMessages(query: string): Promise<ChatSearchHit[]> {
  const rows = await rpc<
    Array<{
      message_id: string;
      conversation_id: string;
      author_id: string | null;
      author_name: string | null;
      body: string;
      created_at: string;
    }> | null
  >('search_my_messages', { p_query: query });
  return (rows ?? []).map((r) => ({
    messageId: r.message_id,
    conversationId: r.conversation_id,
    authorId: r.author_id,
    authorName: r.author_name,
    body: r.body,
    createdAt: r.created_at,
  }));
}

export async function getMyBlocks(): Promise<ChatBlock[]> {
  const rows = await rpc<
    Array<{
      blocked_id: string;
      name: string;
      slug: string | null;
      avatar_url: string | null;
      avatar_color: string | null;
      created_at: string;
    }> | null
  >('get_my_blocks');
  return (rows ?? []).map((r) => ({
    blockedId: r.blocked_id,
    name: r.name,
    slug: r.slug,
    avatarUrl: r.avatar_url,
    avatarColor: r.avatar_color,
    createdAt: r.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Writes (RPCs)
// ---------------------------------------------------------------------------

/** Starts (or returns the existing) 1:1 with another person. Throws without a shared connection. */
export async function startDm(otherProfileId: string): Promise<string> {
  return rpc<string>('start_dm', { p_other: otherProfileId });
}

export interface SendMessageInput {
  conversationId: string;
  body: string | null;
  /** Quote-reply (any conversation kind). */
  replyToId?: string;
  /** Reply inside a thread (channels only); must be a root message. */
  threadRootId?: string;
  attachment?: { kind: ChatAttachmentKind; id: string };
  /**
   * Idempotency key (a fresh uuid per send, reused unchanged when the SAME send is retried). If the
   * server already stored a message from this user with this id it returns that message instead of
   * posting a second one; using it for a different conversation is an error.
   */
  clientId?: string;
}

export async function sendMessage(input: SendMessageInput): Promise<ChatMessage> {
  const row = await rpc<ChatMessageRow>('send_chat_message', {
    p_conversation: input.conversationId,
    p_body: input.body,
    p_reply_to: input.replyToId ?? null,
    p_thread_root: input.threadRootId ?? null,
    p_attachment_kind: input.attachment?.kind ?? null,
    p_attachment_id: input.attachment?.id ?? null,
    ...(input.clientId ? { p_client_id: input.clientId } : {}),
  });
  return mapMessageRow(row);
}

export async function editMessage(messageId: string, body: string): Promise<ChatMessage> {
  return mapMessageRow(await rpc<ChatMessageRow>('edit_chat_message', { p_message: messageId, p_body: body }));
}

/** Removes the body on the server (it is gone over REST and Realtime), not just a flag. */
export async function deleteMessage(messageId: string): Promise<ChatMessage> {
  return mapMessageRow(await rpc<ChatMessageRow>('delete_chat_message', { p_message: messageId }));
}

/** Copies a message the user can read into another conversation they can post to. */
export async function forwardMessage(
  sourceMessageId: string,
  targetConversationId: string,
  note?: string,
  /** Idempotency key, see SendMessageInput.clientId. */
  clientId?: string,
): Promise<ChatMessage> {
  return mapMessageRow(
    await rpc<ChatMessageRow>('forward_chat_message', {
      p_source: sourceMessageId,
      p_target_conversation: targetConversationId,
      p_note: note ?? null,
      ...(clientId ? { p_client_id: clientId } : {}),
    }),
  );
}

/**
 * Copies a message and its thread into the user's own mirror chat, with the clarifier's own note on top as the
 * same message's body. Posts nothing to the source.
 */
export async function clarifyMessage(sourceMessageId: string, note?: string | null): Promise<ChatMessage> {
  return mapMessageRow(await rpc<ChatMessageRow>('clarify_chat_message', { p_source: sourceMessageId, ...(note ? { p_note: note } : {}) }));
}

export interface MarkReadOptions {
  /** Mark read exactly up to this message (preferred). The marker lands on its created_at. */
  throughMessageId?: string;
  /** Legacy client clock. A JS Date has millisecond precision and created_at has microseconds, so
   * this can land just BEFORE the newest message and leave it unread; use throughMessageId. */
  at?: Date;
}

/**
 * Marks a conversation read for the signed-in user. Pass `{ throughMessageId }` with the newest
 * message shown: that is exact. A bare Date (the old signature) or `at` still works. With neither,
 * the server uses its own clock. The marker never moves backwards.
 */
export async function markRead(conversationId: string, options?: Date | MarkReadOptions): Promise<void> {
  const opts: MarkReadOptions = options instanceof Date ? { at: options } : (options ?? {});
  await rpc<null>('mark_chat_read', {
    p_conversation: conversationId,
    ...(opts.throughMessageId ? { p_through_message: opts.throughMessageId } : {}),
    ...(opts.at ? { p_at: opts.at.toISOString() } : {}),
  });
}

export async function setChatState(
  conversationId: string,
  state: { archived?: boolean; manualUnread?: boolean },
): Promise<void> {
  await rpc<null>('set_chat_state', {
    p_conversation: conversationId,
    p_archived: state.archived ?? null,
    p_manual_unread: state.manualUnread ?? null,
  });
}

export async function renameMirror(title: string): Promise<string> {
  return rpc<string>('rename_mirror', { p_title: title });
}

export async function blockUser(profileId: string): Promise<void> {
  await rpc<null>('block_user', { p_other: profileId });
}

export async function unblockUser(profileId: string): Promise<void> {
  await rpc<null>('unblock_user', { p_other: profileId });
}

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

export type ChatMessageEvent = { type: 'INSERT' | 'UPDATE'; message: ChatMessage };

/**
 * Subscribes to new / changed messages and to the signed-in user's own read markers.
 *
 * Row-level security is applied to every payload (a message the user cannot read is never
 * delivered), so no per-conversation filter is needed for safety. A deleted message arrives as an
 * UPDATE with a null body. Hard deletes (event removed) carry only an id and are ignored: the next
 * refetch drops the conversation.
 *
 * `onSubscribed` fires on every (re)connect: refetch there, because events can be missed while the
 * socket is down or still joining. Returns an unsubscribe function.
 */
export function subscribeToChat(
  onMessage: (event: ChatMessageEvent) => void,
  onState: (state: ChatMemberState) => void,
  onSubscribed?: () => void,
): () => void {
  const channel = supabase
    .channel(`chat:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
      onMessage({ type: 'INSERT', message: mapMessageRow(payload.new as ChatMessageRow) });
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, (payload) => {
      onMessage({ type: 'UPDATE', message: mapMessageRow(payload.new as ChatMessageRow) });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_member_state' }, (payload) => {
      if (payload.eventType === 'DELETE') return;
      onState(mapMemberStateRow(payload.new as ChatMemberStateRow));
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onSubscribed?.();
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}
