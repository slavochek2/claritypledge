/**
 * @file p1592-chat-rendering.test.tsx
 * @description P1592: how the chat shows an event's transcription. Mappers carry the two marks;
 * a thread's root (a round's, or the event's "Outside rounds") renders its title alone (never "Deleted user"), in the row, the list
 * preview and a forward / clarify copy; a transcription is typed-style text with a "Transcribed" pill beside the author and time,
 * survives a forward, and shows no "edited" mark unless edited_at is set.
 */
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { mapMessageRow, mapSummaryRow, mapForwardSnapshot, type ChatMessage, type ChatMessageRow, type ChatSummary, type ChatSummaryRow } from '@/app/data/chat-mappers';
import { mapRoundThreadRow } from '@/app/data/chat-round-threads';

vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'user-id-me' } }) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { MirrorContext } from '@/app/pages/chat/mirror-state';
import { MessageRow, type MessageActions } from '@/app/pages/chat/MessageRow';
import { listPreview } from '@/app/pages/chat/chat-preview';

const ME = 'user-id-me';
const OTHER = 'user-id-other';
const baseRow: ChatMessageRow = {
  id: 'm1', conversation_id: 'c1', author_id: OTHER, body: 'hello', created_at: '2026-10-29T10:00:00Z', edited_at: null, deleted_at: null,
  reply_to_id: null, thread_root_id: null, forwarded_from_message_id: null, forward_snapshot: null, kind: 'message', attachment_kind: null, attachment_id: null,
};
const eventChat: ChatSummary = {
  conversationId: 'c1', kind: 'event', title: null, other: null, org: null, event: { id: 'e1', slug: 'e', title: 'Mastermind', datetime: '2026-10-29T10:00:00Z' },
  ownerFirstName: null, lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false,
};
function msg(over: Partial<ChatMessage> = {}): ChatMessage {
  return { ...mapMessageRow(baseRow), ...over };
}
const chatValue = { userId: ME, status: 'ready', chats: [eventChat], authors: { [OTHER]: { id: OTHER, name: 'Anna Example', slug: 'anna' } }, missingAuthors: new Set(), ensureAuthors: vi.fn(), outbox: [], subscribe: () => () => undefined } as unknown as ChatContextValue;
const actions: MessageActions = {
  onReply: vi.fn(), onForward: vi.fn(), onClarify: vi.fn(), onThread: vi.fn(), onMarkUnread: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(),
  onRetry: vi.fn(), onDiscard: vi.fn(), onJumpTo: vi.fn(), lookup: vi.fn(async () => null), getLoaded: () => undefined, version: 0,
};
function row(m: ChatMessage, compact = false): ReactNode {
  return (
    <MemoryRouter>
      <ChatContext.Provider value={chatValue}>
        <MirrorContext.Provider value={null}>
          <ul><MessageRow msg={m} mine={false} viewerId={ME} author={m.authorId ? chatValue.authors[m.authorId] : undefined} authors={chatValue.authors} compact={compact} highlight={false} actions={actions} /></ul>
        </MirrorContext.Provider>
      </ChatContext.Provider>
    </MemoryRouter>
  );
}
beforeEach(() => vi.clearAllMocks());

describe('P1592 mappers', () => {
  it('maps system_kind and is_transcription on a message row, defaulting to a plain message', () => {
    const plain = mapMessageRow(baseRow);
    expect(plain.isTranscription).toBe(false);
    expect(plain.systemKind).toBeNull();
    const t = mapMessageRow({ ...baseRow, is_transcription: true });
    expect(t.isTranscription).toBe(true);
    const root = mapMessageRow({ ...baseRow, author_id: null, system_kind: 'round_thread' });
    expect(root.systemKind).toBe('round_thread');
    expect(mapMessageRow({ ...baseRow, author_id: null, system_kind: 'outside_rounds' }).systemKind).toBe('outside_rounds');
  });

  it('maps the two snapshot keys, top level and inside a clarify thread', () => {
    const snap = mapForwardSnapshot({
      author_name: 'Deleted user', body: 'Round 1 · A & B', created_at: 'x', is_transcription: false, system_kind: 'round_thread',
      thread: [{ author_name: 'A', body: 'words', created_at: 'x', is_transcription: true, system_kind: null }],
    });
    expect(snap?.systemKind).toBe('round_thread');
    expect(snap?.thread[0]?.isTranscription).toBe(true);
    expect(mapForwardSnapshot({ author_name: 'A', body: 'x', created_at: 'x' })?.isTranscription).toBe(false);
  });

  it('maps last_system_kind / last_is_transcription onto the list preview', () => {
    const r = {
      conversation_id: 'c1', kind: 'event', title: null, last_message_id: 'm1', last_author_id: null, last_author_name: null, last_body: 'Round 2 · A & B',
      last_message_kind: 'message', last_message_deleted: false, last_message_at: 'x', last_system_kind: 'round_thread', last_is_transcription: false,
      unread_count: 0, manual_unread: false, archived: false, last_read_at: null, is_partner: false, members_since: null, can_send: true, blocked_by_me: false,
    } as unknown as ChatSummaryRow;
    expect(mapSummaryRow(r).lastMessage?.systemKind).toBe('round_thread');
    expect(mapSummaryRow({ ...r, last_system_kind: undefined, last_is_transcription: true }).lastMessage?.isTranscription).toBe(true);
  });

  it('maps a my-rounds row', () => {
    expect(mapRoundThreadRow({ root_message_id: 'r', round_no: 2, title: 'Round 2 · A & B', created_at: 'x' })).toEqual({ rootMessageId: 'r', roundNo: 2, title: 'Round 2 · A & B', createdAt: 'x' });
  });
});

describe('P1592 round thread root', () => {
  const root = () => msg({ authorId: null, body: 'Round 1 · Anna & Ben', systemKind: 'round_thread' });

  it('renders its title alone: no author line, no avatar, never "Deleted user"', () => {
    render(row(root()));
    expect(screen.getByTestId('system-title')).toHaveTextContent('Round 1 · Anna & Ben');
    expect(screen.queryByText('Deleted user')).not.toBeInTheDocument();
    expect(screen.queryByTestId('transcription-label')).not.toBeInTheDocument();
  });

  it('the event\'s "Outside rounds" root renders the same way: its title alone', () => {
    render(row(msg({ authorId: null, body: 'Outside rounds', systemKind: 'outside_rounds' })));
    expect(screen.getByTestId('system-title')).toHaveTextContent('Outside rounds');
    expect(screen.queryByText('Deleted user')).not.toBeInTheDocument();
  });

  it('CONTROL: the same row without the system mark and no author still says "Deleted user"', () => {
    render(row(msg({ authorId: null, body: 'orphan' })));
    expect(screen.getByText('Deleted user')).toBeInTheDocument();
  });

  it('still offers Reply and Thread, and no Edit or Delete (it is not a person\'s message)', () => {
    render(row(root()));
    const bar = screen.getByRole('toolbar', { name: 'Message actions' });
    expect(within(bar).getByRole('button', { name: 'Reply' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Thread' })).toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  });

  it('the list preview is the title alone, no "Deleted user" prefix', () => {
    const chat: ChatSummary = { ...eventChat, lastMessage: { id: 'm1', authorId: null, authorName: null, body: 'Round 1 · Anna & Ben', kind: 'message', isDeleted: false, createdAt: 'x', systemKind: 'round_thread' } };
    expect(listPreview(chat, ME)).toEqual({ prefix: '', text: 'Round 1 · Anna & Ben' });
    const typed: ChatSummary = { ...eventChat, lastMessage: { id: 'm2', authorId: OTHER, authorName: 'Anna Example', body: 'hi', kind: 'message', isDeleted: false, createdAt: 'x' } };
    expect(listPreview(typed, ME)).toEqual({ prefix: 'Anna: ', text: 'hi' });
  });

  it('a forward of it shows the title, not "Forwarded from Deleted user"', () => {
    const snapshot = mapForwardSnapshot({ author_name: 'Deleted user', body: 'Round 1 · Anna & Ben', created_at: 'x', is_transcription: false, system_kind: 'round_thread' });
    render(row(msg({ kind: 'forward', body: null, forwardSnapshot: snapshot, forwardedFromMessageId: 'm0' })));
    const card = screen.getByTestId('forwarded-card');
    expect(card).toHaveTextContent('Round 1 · Anna & Ben');
    expect(card).not.toHaveTextContent('Deleted user');
  });

  it('a clarify of it shows the title and no "Deleted user" author line', () => {
    const snapshot = mapForwardSnapshot({ author_name: 'Deleted user', body: 'Round 1 · Anna & Ben', created_at: 'x', system_kind: 'round_thread', conversation_kind: 'event', conversation_title: 'Mastermind', thread: [] });
    render(row(msg({ kind: 'clarify', body: null, forwardSnapshot: snapshot })));
    const card = screen.getByTestId('clarified-card');
    expect(card).toHaveTextContent('Round 1 · Anna & Ben');
    expect(card).not.toHaveTextContent('Deleted user');
    expect(screen.queryByTestId('clarified-author')).not.toBeInTheDocument();
  });
});

describe('P1592 transcription message', () => {
  it('shows a "Transcribed" pill on the author line, right after the time, and plain (not italic) text', () => {
    render(row(msg({ isTranscription: true, body: 'we talked about pricing' })));
    const pill = screen.getByTestId('transcription-label');
    expect(pill).toHaveTextContent('Transcribed');
    expect(pill.className).not.toContain('uppercase');
    const time = pill.previousElementSibling as HTMLElement;
    expect(time.textContent).toMatch(/\d/);
    expect(pill.parentElement).toContainElement(screen.getByText('Anna Example'));
    expect(screen.getByText('we talked about pricing').className).not.toContain('italic');
  });

  it('a grouped message (no author line) still shows the pill, on a line of its own above the words', () => {
    render(row(msg({ isTranscription: true, body: 'grouped words' }), true));
    const pill = screen.getByTestId('transcription-label');
    expect(pill).toHaveTextContent('Transcribed');
    expect(screen.queryByText('Anna Example')).not.toBeInTheDocument();
    expect(pill.compareDocumentPosition(screen.getByText('grouped words')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a deleted transcription shows no pill', () => {
    render(row(msg({ isTranscription: true, body: null, isDeleted: true })));
    expect(screen.queryByTestId('transcription-label')).not.toBeInTheDocument();
  });

  it('shows no "(edited)" mark for an appended message (edited_at null), and does when edited_at is set', () => {
    const { unmount } = render(row(msg({ isTranscription: true, body: 'grown by appends' })));
    expect(screen.queryByTestId('edited-mark')).not.toBeInTheDocument();
    unmount();
    render(row(msg({ isTranscription: true, body: 'edited by the speaker', editedAt: '2026-10-29T10:05:00Z' })));
    expect(screen.getByTestId('edited-mark')).toBeInTheDocument();
  });

  it('keeps Reply, Forward and Clarify on the toolbar', () => {
    render(row(msg({ isTranscription: true, body: 'words' })));
    const bar = screen.getByRole('toolbar', { name: 'Message actions' });
    expect(within(bar).getByRole('button', { name: 'Reply' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Forward' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: /Clarify/ })).toBeInTheDocument();
  });

  it('a forwarded transcription keeps its pill and reads as plain text', () => {
    const snapshot = mapForwardSnapshot({ author_name: 'Anna Example', body: 'what she said', created_at: 'x', is_transcription: true, system_kind: null });
    render(row(msg({ kind: 'forward', body: null, forwardSnapshot: snapshot, forwardedFromMessageId: 'm0', forwardAuthorId: OTHER })));
    const card = screen.getByTestId('forwarded-card');
    expect(within(card).getByTestId('transcription-label')).toHaveTextContent('Transcribed');
    expect(within(card).getByText('what she said').className).not.toContain('italic');
  });

  it('a Clarify thread entry that is a transcription shows the pill and plain (not italic) text', () => {
    const snapshot = mapForwardSnapshot({
      author_name: 'Anna Example', body: 'the clarified line', created_at: 'x', conversation_kind: 'event', conversation_title: 'Mastermind',
      thread: [
        { author_name: 'Ben Example', body: 'spoken in the round', created_at: '2026-10-29T10:00:00Z', is_transcription: true, system_kind: null },
        { author_name: 'Cleo Example', body: 'typed in the round', created_at: '2026-10-29T10:01:00Z', is_transcription: false, system_kind: null },
      ],
    });
    render(row(msg({ kind: 'clarify', body: null, forwardSnapshot: snapshot })));
    const thread = screen.getByTestId('forwarded-thread');
    expect(within(thread).getAllByTestId('transcription-label')).toHaveLength(1);
    expect(within(thread).getByTestId('transcription-label')).toHaveTextContent('Transcribed');
    expect(within(thread).getByText('spoken in the round').className).not.toContain('italic');
    expect(within(thread).getByText('typed in the round').className).not.toContain('italic');
  });

  it('a Clarify thread entry that is the Outside rounds root renders as a bold title with no author', () => {
    const snapshot = mapForwardSnapshot({
      author_name: 'Anna Example', body: 'the clarified line', created_at: 'x', conversation_kind: 'event', conversation_title: 'Mastermind',
      thread: [{ author_name: 'Deleted user', body: 'Outside rounds', created_at: '2026-10-29T09:00:00Z', is_transcription: false, system_kind: 'outside_rounds' }],
    });
    render(row(msg({ kind: 'clarify', body: null, forwardSnapshot: snapshot })));
    const thread = screen.getByTestId('forwarded-thread');
    const title = within(thread).getByText('Outside rounds');
    expect(title.className).toContain('font-semibold');
    expect(thread).not.toHaveTextContent('Deleted user');
    expect(within(thread).queryByTestId('transcription-label')).not.toBeInTheDocument();
  });

  it('a copy whose transcription words were removed (body null) shows NO pill', () => {
    const snapshot = mapForwardSnapshot({ author_name: 'Deleted user', body: null, created_at: 'x', is_transcription: true, system_kind: null, conversation_kind: 'event', conversation_title: 'Mastermind', thread: [] });
    render(row(msg({ kind: 'clarify', body: null, forwardSnapshot: snapshot })));
    const card = screen.getByTestId('clarified-card');
    expect(within(card).queryByTestId('transcription-label')).not.toBeInTheDocument();
    expect(within(card).getByTestId('snapshot-removed')).toBeInTheDocument();
  });

  it('CONTROL: typed messages look as before (no label, no italic)', () => {
    render(row(msg({ body: 'typed words' })));
    expect(screen.queryByTestId('transcription-label')).not.toBeInTheDocument();
    expect(screen.getByText('typed words').className).not.toContain('italic');
  });
});
