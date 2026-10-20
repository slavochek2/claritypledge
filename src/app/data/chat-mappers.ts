/**
 * P1512: Clarity Chat — row types and the pure row-to-domain mappers.
 *
 * Kept free of the Supabase client so it can be unit-tested without environment variables.
 * The service (chat-service.ts) is the only caller that touches the network.
 */

export type ChatKind = 'dm' | 'group' | 'event' | 'mirror';
/** 'agent': the mirror's own reply (P1520), always in its owner's mirror, with no human author. */
export type ChatMessageKind = 'message' | 'forward' | 'clarify' | 'agent';
export type ChatAttachmentKind = 'point' | 'story';

/** Shown for an author that no longer exists (account erased). */
export const DELETED_USER_NAME = 'Deleted user';
/** Shown instead of a removed message body. */
export const DELETED_MESSAGE_TEXT = 'Message deleted';

export interface ForwardThreadEntry {
  authorName: string;
  body: string | null;
  createdAt: string;
}

export interface ForwardSnapshot {
  authorName: string;
  body: string | null;
  createdAt: string;
  conversationKind: ChatKind | null;
  /** Clarify only: the source chat as the clarifier saw it (dm: the other person; group: "<Org> · General"; event: its title). */
  conversationTitle: string | null;
  /** Clarify only: the replies of the thread the message sat in, oldest first. */
  thread: ForwardThreadEntry[];
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  /** NULL once the author's account is erased. */
  authorId: string | null;
  /** NULL when deleted or when the message is an attachment / bare forward. */
  body: string | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  isDeleted: boolean;
  replyToId: string | null;
  threadRootId: string | null;
  forwardedFromMessageId: string | null;
  /** Who wrote the original of a forward or clarify; NULL once that account is erased (and for a plain message). */
  forwardAuthorId: string | null;
  forwardSnapshot: ForwardSnapshot | null;
  kind: ChatMessageKind;
  attachmentKind: ChatAttachmentKind | null;
  attachmentId: string | null;
  /** The sender's idempotency key; lets the sender match the Realtime echo to its pending message. */
  clientId?: string | null;
  /**
   * P1520: set on a row in the owner's mirror that belongs to a channel — a private @mirror ask made
   * there, or the mirror's answer to it. Only the owner can ever read such a row.
   */
  contextConversationId?: string | null;
}

export interface ChatSummary {
  conversationId: string;
  kind: ChatKind;
  /** Mirror rename; NULL for every other kind. */
  title: string | null;
  /** dm: the other person. other.id is NULL when that account was erased. */
  other: { id: string | null; name: string; slug: string | null; avatarUrl: string | null; avatarColor: string | null } | null;
  org: { id: string; slug: string; name: string } | null;
  event: { id: string; slug: string; title: string; datetime: string } | null;
  /** mirror: first name of the owner, for "<Name> · <First>'s mirror". */
  ownerFirstName: string | null;
  lastMessage: {
    id: string;
    authorId: string | null;
    authorName: string | null;
    /** Already "Message deleted" for a removed message. */
    body: string | null;
    kind: ChatMessageKind;
    isDeleted: boolean;
    createdAt: string;
  } | null;
  unreadCount: number;
  manualUnread: boolean;
  archived: boolean;
  lastReadAt: string | null;
  isPartner: boolean;
  /** When this person's history in a channel starts (join / RSVP time); NULL for dm and mirror. */
  membersSince: string | null;
  /** False in a 1:1 once either side blocked the other (or the other account is gone). Never says who. */
  canSend: boolean;
  /** True when the signed-in user blocked the other person in this 1:1 (offer Unblock). */
  blockedByMe: boolean;
}

export interface ChatMemberState {
  conversationId: string;
  profileId: string;
  lastReadAt: string | null;
  manualUnread: boolean;
  archived: boolean;
}

export interface ChatPerson {
  id: string;
  name: string;
  slug: string | null;
  avatarUrl: string | null;
  avatarColor: string | null;
  /** Why the caller may message them: "Clarity Partner", a group name or an event title. */
  shared: string;
  /** Existing 1:1 with this person, if any. */
  dmConversationId: string | null;
}

export interface ChatBlock {
  blockedId: string;
  name: string;
  slug: string | null;
  avatarUrl: string | null;
  avatarColor: string | null;
  createdAt: string;
}

export interface ChatSearchHit {
  messageId: string;
  conversationId: string;
  authorId: string | null;
  authorName: string | null;
  body: string;
  createdAt: string;
}

export interface ChatConversation {
  id: string;
  kind: ChatKind;
  orgId: string | null;
  eventId: string | null;
  ownerId: string | null;
  dmUserA: string | null;
  dmUserB: string | null;
  title: string | null;
  createdAt: string;
  lastMessageAt: string | null;
}

// ---------------------------------------------------------------------------
// Raw rows, as PostgREST returns them
// ---------------------------------------------------------------------------
export interface ChatMessageRow {
  id: string;
  conversation_id: string;
  author_id: string | null;
  body: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  reply_to_id: string | null;
  thread_root_id: string | null;
  forwarded_from_message_id: string | null;
  forward_author_id?: string | null;
  forward_snapshot: Record<string, unknown> | null;
  kind: ChatMessageKind;
  attachment_kind: ChatAttachmentKind | null;
  attachment_id: string | null;
  client_id?: string | null;
  context_conversation_id?: string | null;
}

export interface ChatSummaryRow {
  conversation_id: string;
  kind: ChatKind;
  title: string | null;
  other_id: string | null;
  other_name: string | null;
  other_slug: string | null;
  other_avatar_url: string | null;
  other_avatar_color: string | null;
  other_deleted: boolean;
  org_id: string | null;
  org_slug: string | null;
  org_name: string | null;
  event_id: string | null;
  event_slug: string | null;
  event_title: string | null;
  event_datetime: string | null;
  owner_first_name: string | null;
  last_message_id: string | null;
  last_author_id: string | null;
  last_author_name: string | null;
  last_body: string | null;
  last_message_kind: ChatMessageKind | null;
  last_message_deleted: boolean | null;
  last_message_at: string | null;
  unread_count: number;
  manual_unread: boolean;
  archived: boolean;
  last_read_at: string | null;
  is_partner: boolean;
  members_since: string | null;
  can_send: boolean;
  blocked_by_me: boolean;
}

export interface ChatMemberStateRow {
  conversation_id: string;
  profile_id: string;
  last_read_at: string | null;
  manual_unread: boolean;
  archived: boolean;
}

export interface ChatConversationRow {
  id: string;
  kind: ChatKind;
  org_id: string | null;
  event_id: string | null;
  owner_id: string | null;
  dm_user_a: string | null;
  dm_user_b: string | null;
  title: string | null;
  created_at: string;
  last_message_at: string | null;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function mapThread(raw: unknown): ForwardThreadEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e) => {
    const entry = (e ?? {}) as Record<string, unknown>;
    return {
      authorName: asString(entry.author_name) ?? DELETED_USER_NAME,
      body: asString(entry.body),
      createdAt: asString(entry.created_at) ?? '',
    };
  });
}

export function mapForwardSnapshot(raw: Record<string, unknown> | null): ForwardSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const kind = asString(raw.conversation_kind);
  return {
    authorName: asString(raw.author_name) ?? DELETED_USER_NAME,
    body: asString(raw.body),
    createdAt: asString(raw.created_at) ?? '',
    conversationKind: kind === 'dm' || kind === 'group' || kind === 'event' || kind === 'mirror' ? kind : null,
    conversationTitle: asString(raw.conversation_title),
    thread: mapThread(raw.thread),
  };
}

export function mapMessageRow(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    isDeleted: row.deleted_at !== null,
    replyToId: row.reply_to_id,
    threadRootId: row.thread_root_id,
    forwardedFromMessageId: row.forwarded_from_message_id,
    forwardAuthorId: row.forward_author_id ?? null,
    forwardSnapshot: mapForwardSnapshot(row.forward_snapshot),
    kind: row.kind,
    attachmentKind: row.attachment_kind,
    attachmentId: row.attachment_id,
    clientId: row.client_id ?? null,
    contextConversationId: row.context_conversation_id ?? null,
  };
}

export function mapSummaryRow(row: ChatSummaryRow): ChatSummary {
  const hasOther = row.kind === 'dm';
  return {
    conversationId: row.conversation_id,
    kind: row.kind,
    title: row.title,
    other: hasOther
      ? {
          id: row.other_id,
          name: row.other_deleted || !row.other_name ? DELETED_USER_NAME : row.other_name,
          slug: row.other_slug,
          avatarUrl: row.other_avatar_url,
          avatarColor: row.other_avatar_color,
        }
      : null,
    org: row.org_id && row.org_slug ? { id: row.org_id, slug: row.org_slug, name: row.org_name ?? row.org_slug } : null,
    event:
      row.event_id && row.event_slug && row.event_datetime
        ? { id: row.event_id, slug: row.event_slug, title: row.event_title ?? row.event_slug, datetime: row.event_datetime }
        : null,
    ownerFirstName: row.owner_first_name,
    lastMessage: row.last_message_id
      ? {
          id: row.last_message_id,
          authorId: row.last_author_id,
          authorName: row.last_author_name,
          body: row.last_body,
          kind: row.last_message_kind ?? 'message',
          isDeleted: row.last_message_deleted === true,
          createdAt: row.last_message_at ?? '',
        }
      : null,
    unreadCount: row.unread_count,
    manualUnread: row.manual_unread,
    archived: row.archived,
    lastReadAt: row.last_read_at,
    isPartner: row.is_partner,
    membersSince: row.members_since,
    canSend: row.can_send,
    blockedByMe: row.blocked_by_me,
  };
}

export function mapMemberStateRow(row: ChatMemberStateRow): ChatMemberState {
  return {
    conversationId: row.conversation_id,
    profileId: row.profile_id,
    lastReadAt: row.last_read_at,
    manualUnread: row.manual_unread,
    archived: row.archived,
  };
}

export function mapConversationRow(row: ChatConversationRow): ChatConversation {
  return {
    id: row.id,
    kind: row.kind,
    orgId: row.org_id,
    eventId: row.event_id,
    ownerId: row.owner_id,
    dmUserA: row.dm_user_a,
    dmUserB: row.dm_user_b,
    title: row.title,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at,
  };
}

/** Position in a conversation's message order: (createdAt, id), newest last. */
export interface ChatCursor {
  createdAt: string;
  id: string;
}

export function messageCursor(message: Pick<ChatMessage, 'createdAt' | 'id'>): ChatCursor {
  return { createdAt: message.createdAt, id: message.id };
}

/**
 * PostgREST `or` filter selecting messages strictly BEFORE a cursor in (created_at, id) order, so
 * rows that share a timestamp are neither skipped nor repeated when paging backwards. A bare string
 * is treated as a timestamp only (the original behaviour; ties at that instant are skipped).
 * Values are quoted: timestamps carry ':' and '+'.
 */
export function keysetBeforeFilter(before: string | ChatCursor): string {
  if (typeof before === 'string') return `created_at.lt."${before}"`;
  return `created_at.lt."${before.createdAt}",and(created_at.eq."${before.createdAt}",id.lt."${before.id}")`;
}

/** A chat shows as unread when it has unread messages or the user marked it unread by hand. */
export function isChatUnread(chat: Pick<ChatSummary, 'unreadCount' | 'manualUnread'>): boolean {
  return chat.unreadCount > 0 || chat.manualUnread;
}

/** One line for a chat-list row. */
export function previewText(chat: Pick<ChatSummary, 'lastMessage'>): string {
  const last = chat.lastMessage;
  if (!last) return '';
  if (last.isDeleted) return DELETED_MESSAGE_TEXT;
  if (last.body) return last.body;
  if (last.kind === 'forward') return 'Forwarded message';
  if (last.kind === 'clarify') return 'Clarify';
  return 'Attachment';
}

/** Escapes a user query for a Postgres ILIKE pattern the RPCs build themselves (client-side filter). */
export function normaliseQuery(q: string): string {
  return q.trim().toLowerCase();
}
