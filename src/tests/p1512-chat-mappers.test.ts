import { describe, it, expect } from 'vitest';
import {
  DELETED_MESSAGE_TEXT,
  DELETED_USER_NAME,
  isChatUnread,
  mapForwardSnapshot,
  mapMessageRow,
  mapSummaryRow,
  previewText,
  type ChatMessageRow,
  type ChatSummaryRow,
} from '@/app/data/chat-mappers';

const baseMessage: ChatMessageRow = {
  id: 'm1',
  conversation_id: 'c1',
  author_id: 'u1',
  body: 'hello',
  created_at: '2026-10-19T10:00:00Z',
  edited_at: null,
  deleted_at: null,
  reply_to_id: null,
  thread_root_id: null,
  forwarded_from_message_id: null,
  forward_snapshot: null,
  kind: 'message',
  attachment_kind: null,
  attachment_id: null,
};

const baseSummary: ChatSummaryRow = {
  conversation_id: 'c1',
  kind: 'dm',
  title: null,
  other_id: 'u2',
  other_name: 'Ada',
  other_slug: 'ada',
  other_avatar_url: null,
  other_avatar_color: '#4A90E2',
  other_deleted: false,
  org_id: null,
  org_slug: null,
  org_name: null,
  event_id: null,
  event_slug: null,
  event_title: null,
  event_datetime: null,
  owner_first_name: null,
  last_message_id: 'm1',
  last_author_id: 'u2',
  last_author_name: 'Ada',
  last_body: 'hi',
  last_message_kind: 'message',
  last_message_deleted: false,
  last_message_at: '2026-10-19T10:00:00Z',
  unread_count: 2,
  manual_unread: false,
  archived: false,
  last_read_at: null,
  is_partner: false,
  members_since: null,
  can_send: true,
  blocked_by_me: false,
};

describe('P1512 chat mappers', () => {
  it('flags a deleted message and keeps its body null', () => {
    const msg = mapMessageRow({ ...baseMessage, body: null, deleted_at: '2026-10-19T11:00:00Z' });
    expect(msg.isDeleted).toBe(true);
    expect(msg.body).toBeNull();
    expect(mapMessageRow(baseMessage).isDeleted).toBe(false);
  });

  it('keeps a null author (erased account) as null rather than inventing an id', () => {
    expect(mapMessageRow({ ...baseMessage, author_id: null }).authorId).toBeNull();
  });

  it('exposes who wrote the original of a forward or clarify (forward_author_id); null once erased, and absent means null', () => {
    expect(mapMessageRow({ ...baseMessage, forward_author_id: 'u7' }).forwardAuthorId).toBe('u7');
    expect(mapMessageRow({ ...baseMessage, forward_author_id: null }).forwardAuthorId).toBeNull();
    expect(mapMessageRow(baseMessage).forwardAuthorId).toBeNull();
  });

  it('maps a clarify snapshot with its thread and tombstones missing author names', () => {
    const snap = mapForwardSnapshot({
      author_name: 'Ada',
      body: 'original',
      created_at: '2026-10-19T09:00:00Z',
      conversation_kind: 'group',
      conversation_title: 'Chiang Mai · General',
      thread: [
        { author_name: 'Grace', body: 'reply one', created_at: '2026-10-19T09:05:00Z' },
        { body: 'reply from an erased account', created_at: '2026-10-19T09:06:00Z' },
      ],
    });
    expect(snap?.conversationKind).toBe('group');
    expect(snap?.conversationTitle).toBe('Chiang Mai · General');
    expect(snap?.thread).toHaveLength(2);
    expect(snap?.thread[0]?.authorName).toBe('Grace');
    expect(snap?.thread[1]?.authorName).toBe(DELETED_USER_NAME);
  });

  it('returns null for a missing snapshot and ignores an unknown conversation kind', () => {
    expect(mapForwardSnapshot(null)).toBeNull();
    expect(mapForwardSnapshot({ author_name: 'Ada' })?.conversationTitle).toBeNull();
    expect(mapForwardSnapshot({ conversation_kind: 'weird' })?.conversationKind).toBeNull();
  });

  it('shows an erased 1:1 counterpart as Deleted user', () => {
    const chat = mapSummaryRow({ ...baseSummary, other_id: null, other_name: null, other_deleted: true });
    expect(chat.other?.name).toBe(DELETED_USER_NAME);
    expect(chat.other?.id).toBeNull();
  });

  it('gives channels an org / event and no "other"', () => {
    const group = mapSummaryRow({
      ...baseSummary,
      kind: 'group',
      other_id: null,
      other_name: null,
      org_id: 'o1',
      org_slug: 'cm',
      org_name: 'Chiang Mai',
    });
    expect(group.other).toBeNull();
    expect(group.org).toEqual({ id: 'o1', slug: 'cm', name: 'Chiang Mai' });
    expect(group.event).toBeNull();
  });

  it('maps can_send and blocked_by_me for a blocked 1:1', () => {
    const open = mapSummaryRow(baseSummary);
    expect(open.canSend).toBe(true);
    expect(open.blockedByMe).toBe(false);
    const blockedByMe = mapSummaryRow({ ...baseSummary, can_send: false, blocked_by_me: true });
    expect(blockedByMe.canSend).toBe(false);
    expect(blockedByMe.blockedByMe).toBe(true);
    // the blocked side sees only that it cannot send
    const blockedSide = mapSummaryRow({ ...baseSummary, can_send: false, blocked_by_me: false });
    expect(blockedSide.canSend).toBe(false);
    expect(blockedSide.blockedByMe).toBe(false);
  });

  it('counts a manual mark-as-unread as unread even with nothing new', () => {
    expect(isChatUnread({ unreadCount: 0, manualUnread: true })).toBe(true);
    expect(isChatUnread({ unreadCount: 0, manualUnread: false })).toBe(false);
    expect(isChatUnread({ unreadCount: 3, manualUnread: false })).toBe(true);
  });

  it('previews a deleted message, a bare forward and an empty chat', () => {
    expect(previewText(mapSummaryRow({ ...baseSummary, last_body: 'Message deleted', last_message_deleted: true })))
      .toBe(DELETED_MESSAGE_TEXT);
    expect(previewText(mapSummaryRow({ ...baseSummary, last_body: null, last_message_kind: 'forward' })))
      .toBe('Forwarded message');
    expect(previewText(mapSummaryRow({ ...baseSummary, last_message_id: null }))).toBe('');
    expect(previewText(mapSummaryRow(baseSummary))).toBe('hi');
  });
});

describe('P1512 keyset paging', () => {
  it('builds a tie-aware cursor filter with quoted timestamps', async () => {
    const { keysetBeforeFilter, messageCursor } = await import('@/app/data/chat-mappers');
    const cursor = messageCursor({ createdAt: '2026-10-19T10:00:00.123456+00:00', id: 'abc' });
    expect(keysetBeforeFilter(cursor)).toBe(
      'created_at.lt."2026-10-19T10:00:00.123456+00:00",and(created_at.eq."2026-10-19T10:00:00.123456+00:00",id.lt."abc")',
    );
    expect(keysetBeforeFilter('2026-10-19T10:00:00Z')).toBe('created_at.lt."2026-10-19T10:00:00Z"');
  });
});
