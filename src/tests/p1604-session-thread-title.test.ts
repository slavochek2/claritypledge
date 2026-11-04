/**
 * P1604 rule 6: a session's thread is titled by its start, shown in the READER's time zone. The server stores the root's
 * body as "session|<start ISO UTC>|<part_no>"; the client turns it into a title when it maps a message.
 */
import { describe, it, expect, vi } from 'vitest';
import { parseSessionRoot, sessionThreadTitle, displaySystemBody } from '@/app/data/session-thread-title';
import { mapMessageRow, mapSummaryRow, type ChatMessageRow, type ChatSummaryRow } from '@/app/data/chat-mappers';
import { mapForwardSnapshot } from '@/app/data/chat-snapshot';
import { INCOMPLETE_TITLE_SUFFIX } from '@/app/components/session/capture-copy';

const BODY = 'session|2026-11-03T14:05:00Z|1';

describe('parseSessionRoot', () => {
  it('reads the start and the part', () => {
    expect(parseSessionRoot(BODY)).toEqual({ startIso: '2026-11-03T14:05:00Z', partNo: 1, incomplete: false });
    expect(parseSessionRoot('session|2026-11-03T14:05:00Z|2')?.partNo).toBe(2);
  });
  it.each([null, '', 'Round 1', 'session|', 'session|not-a-date|1', 'session|2026-11-03T14:05:00Z|0', 'session|2026-11-03T14:05:00Z'])(
    'is null for %s (a title that is not a session root is shown as it is)', (b) => {
      expect(parseSessionRoot(b as string | null)).toBeNull();
    });
});

describe('sessionThreadTitle: the reader\'s time zone', () => {
  it('the same instant reads differently in two zones', () => {
    const tokyo = sessionThreadTitle(BODY, { locale: 'en-GB', timeZone: 'Asia/Tokyo' });
    const berlin = sessionThreadTitle(BODY, { locale: 'en-GB', timeZone: 'Europe/Berlin' });
    expect(tokyo).toContain('23:05');
    expect(berlin).toContain('15:05');
    expect(tokyo).not.toBe(berlin);
  });
  it('crosses midnight with the zone: the date follows the reader', () => {
    expect(sessionThreadTitle(BODY, { locale: 'en-GB', timeZone: 'Asia/Tokyo' })).toContain('3 Nov');
    expect(sessionThreadTitle('session|2026-11-03T20:00:00Z|1', { locale: 'en-GB', timeZone: 'Asia/Tokyo' })).toContain('4 Nov');
  });
  it('Part 2 says so', () => {
    expect(sessionThreadTitle('session|2026-11-03T14:05:00Z|2', { locale: 'en-GB', timeZone: 'UTC' })).toMatch(/Part 2$/);
    expect(sessionThreadTitle(BODY, { locale: 'en-GB', timeZone: 'UTC' })).not.toMatch(/Part/);
  });
  it('is null for a body that is not a session root', () => {
    expect(sessionThreadTitle('Round 1')).toBeNull();
  });
});

describe('displaySystemBody only touches the outside-rounds root', () => {
  it('leaves every other body, and every other system kind, alone', () => {
    expect(displaySystemBody('Round 2 · Ann & Bo', 'round_thread')).toBe('Round 2 · Ann & Bo');
    expect(displaySystemBody('After the last round', 'outside_rounds')).toBe('After the last round');
    expect(displaySystemBody('session|nope', 'outside_rounds')).toBe('session|nope');
    expect(displaySystemBody(BODY, null)).toBe(BODY);
    expect(displaySystemBody(null, 'outside_rounds')).toBeNull();
  });
  it('turns the root into a title', () => {
    expect(displaySystemBody(BODY, 'outside_rounds')).toMatch(/^Transcript .*2026|^Transcript /);
    expect(displaySystemBody(BODY, 'outside_rounds')).not.toContain('session|');
  });
});

describe('every place the root is shown goes through it', () => {
  it('a message row', () => {
    const row = { id: 'm', conversation_id: 'c', author_id: null, body: BODY, created_at: '2026-11-03T14:10:00Z', edited_at: null,
      deleted_at: null, reply_to_id: null, thread_root_id: null, forwarded_from_message_id: null, kind: 'message',
      attachment_kind: null, attachment_id: null, system_kind: 'outside_rounds' } as unknown as ChatMessageRow;
    expect(mapMessageRow(row).body).not.toContain('session|');
  });
  it('the inbox preview', () => {
    const row = { conversation_id: 'c', kind: 'event', title: null, last_message_id: 'm', last_body: BODY, last_system_kind: 'outside_rounds',
      last_message_at: '2026-11-03T14:10:00Z', unread_count: 0, manual_unread: false, archived: false } as unknown as ChatSummaryRow;
    expect(mapSummaryRow(row).lastMessage?.body).not.toContain('session|');
  });
  it('a forwarded copy of the root and its thread', () => {
    const snap = mapForwardSnapshot({ body: BODY, system_kind: 'outside_rounds', thread: [{ body: BODY, system_kind: 'outside_rounds' }] });
    expect(snap?.body).not.toContain('session|');
    expect(snap?.thread[0].body).not.toContain('session|');
  });
});

describe('decision 4: a session thread whose audio is incomplete says so in its title', () => {
  const INCOMPLETE = 'session|2026-11-03T14:05:00Z|1|i';
  it('parses the marker', () => {
    expect(parseSessionRoot(INCOMPLETE)).toEqual({ startIso: '2026-11-03T14:05:00Z', partNo: 1, incomplete: true });
    expect(parseSessionRoot(BODY)?.incomplete).toBe(false);
  });
  it('the title carries it, and Part 2 keeps it', () => {
    expect(sessionThreadTitle(INCOMPLETE, { locale: 'en-GB', timeZone: 'UTC' })).toContain(INCOMPLETE_TITLE_SUFFIX);
    expect(sessionThreadTitle('session|2026-11-03T14:05:00Z|2|i', { locale: 'en-GB', timeZone: 'UTC' })).toMatch(new RegExp(`Part 2 \\(${INCOMPLETE_TITLE_SUFFIX}\\)$`));
    expect(sessionThreadTitle(BODY, { locale: 'en-GB', timeZone: 'UTC' })).not.toContain(INCOMPLETE_TITLE_SUFFIX);
  });
  it('a malformed marker is not a title', () => {
    expect(parseSessionRoot('session|2026-11-03T14:05:00Z|1|x')).toBeNull();
  });
});

describe('the root never shows raw anywhere a root is shown (decision 6)', () => {
  const root = (extra: Record<string, unknown> = {}) => ({
    id: 'm', conversation_id: 'c', author_id: null, body: BODY, created_at: '2026-11-03T14:10:00Z', edited_at: null,
    deleted_at: null, reply_to_id: null, thread_root_id: null, forwarded_from_message_id: null, kind: 'message',
    attachment_kind: null, attachment_id: null, system_kind: 'outside_rounds', ...extra,
  }) as unknown as ChatMessageRow;

  it('the thread header and the message list (mapped message)', () => {
    expect(mapMessageRow(root()).body).toMatch(/^Transcript /);
  });
  it('the chat list preview, through the preview text', async () => {
    const { listPreview: previewOf } = await import('@/app/pages/chat/chat-preview');
    const summary = mapSummaryRow({ conversation_id: 'c', kind: 'event', title: null, last_message_id: 'm', last_body: BODY,
      last_system_kind: 'outside_rounds', last_message_at: '2026-11-03T14:10:00Z', unread_count: 0, manual_unread: false,
      archived: false } as unknown as ChatSummaryRow);
    expect(JSON.stringify(previewOf(summary, 'u1'))).not.toContain('session|');
  });
  it('a forwarded copy and its thread', () => {
    const snap = mapForwardSnapshot({ body: BODY, system_kind: 'outside_rounds', thread: [{ body: BODY, system_kind: 'outside_rounds' }] });
    expect(JSON.stringify(snap)).not.toContain('session|');
  });
  it('a search hit on the root', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => ({ supabase: { rpc: () => Promise.resolve({ data: [
      { message_id: 'm', conversation_id: 'c', author_id: null, author_name: null, body: BODY, created_at: 'x' },
      { message_id: 'n', conversation_id: 'c', author_id: 'u2', author_name: 'Bo', body: BODY, created_at: 'x' },
    ], error: null }) } }));
    const { searchMessages } = await import('@/app/data/chat-service');
    const hits = await searchMessages('Transcript');
    expect(hits[0].body, 'a system post is shown as its title').toMatch(/^Transcript /);
    expect(hits[1].body, 'a person\'s own message that merely looks like a root is theirs, untouched').toBe(BODY);
    vi.doUnmock('@/lib/supabase');
  });
});
