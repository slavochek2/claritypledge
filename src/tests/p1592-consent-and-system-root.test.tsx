/**
 * @file p1592-consent-and-system-root.test.tsx
 * @description P1592 review round 1:
 *  - the consent section never lets a person agree under the narrower "everyone in this room"
 *    wording in an event room: it waits for the room lookup (toggle disabled, no agreed text) and
 *    on a failed lookup shows the EVENT wording;
 *  - a round thread's root never reads "Deleted user": reply quote bar, clarify staging bar,
 *    forward dialog, search hit heading; and a forwarded/clarified root copy is jumpable.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-mappers';
import { mapMessageRow, mapForwardSnapshot } from '@/app/data/chat-mappers';

const room = vi.hoisted(() => ({ getRoomByCode: vi.fn() }));
vi.mock('@/app/data/transcribe-service', () => ({ getRoomByCode: room.getRoomByCode }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'user-id-me' } }) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

import { ConsentSection } from '@/app/pages/ConsentLabel';
import { PendingQuote } from '@/app/pages/chat/PendingQuote';
import { searchHitHeading } from '@/app/pages/chat/chat-preview';
import { ForwardDialog } from '@/app/pages/chat/ChatDialogs';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { MirrorContext } from '@/app/pages/chat/mirror-state';
import { MessageRow, type MessageActions } from '@/app/pages/chat/MessageRow';

const EVENT_LABEL = "Recorded. A clean transcript is posted to this event's channel after each round. Anything said outside a round is posted after the room ends.";
const ROOM_LABEL = 'Recorded and visible to everyone in this room';
const EVENT_INTRO = "a clean version is posted to this event's channel after each round; anything said outside a round is posted after the room ends";
const ROOM_INTRO = 'shown to everyone in this room';
let n = 0;
const code = () => `CODE${++n}`;
const mount = (c: string | undefined, agreed = true) => render(<ConsentSection agreed={agreed} code={c} onToggle={() => undefined} />);

// No mockClear/mockReset between tests: under vitest 4 a cleared spy reports a HANDLED rejection as a
// test error. Call counts are read as deltas instead.
const calls = () => room.getRoomByCode.mock.calls.length;

describe('P1592 consent wording follows the room', () => {
  it('while the lookup runs: toggle disabled, no agreed-label text and no committed intro', async () => {
    let resolve: (v: unknown) => void = () => undefined;
    room.getRoomByCode.mockReturnValue(new Promise((r) => { resolve = r; }));
    mount(code());
    expect(screen.getByTestId('transcribe-recording-toggle')).toBeDisabled();
    expect(screen.queryByText(EVENT_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByText(ROOM_LABEL)).not.toBeInTheDocument();
    expect(screen.getByTestId('transcribe-consent-intro').textContent).not.toContain(ROOM_INTRO);
    resolve({ id: 'r', eventId: 'ev-1' });
    await waitFor(() => expect(screen.getByText(EVENT_LABEL)).toBeInTheDocument());
    expect(screen.getByTestId('transcribe-recording-toggle')).toBeEnabled();
  });

  it('an event room: event label and intro', async () => {
    room.getRoomByCode.mockResolvedValue({ id: 'r', eventId: 'ev-1' });
    mount(code());
    await waitFor(() => expect(screen.getByText(EVENT_LABEL)).toBeInTheDocument());
    expect(screen.getByTestId('transcribe-consent-intro').textContent).toContain(EVENT_INTRO);
    expect(screen.getByTestId('transcribe-consent-intro').textContent).not.toContain(ROOM_INTRO);
  });

  it('an ad-hoc room (no event): today\'s label and intro', async () => {
    room.getRoomByCode.mockResolvedValue({ id: 'r', eventId: null });
    mount(code());
    await waitFor(() => expect(screen.getByText(ROOM_LABEL)).toBeInTheDocument());
    expect(screen.getByTestId('transcribe-consent-intro').textContent).toContain(ROOM_INTRO);
  });

  it('no code in the URL: today\'s wording at once, no lookup', () => {
    const before = calls();
    mount(undefined);
    expect(screen.getByText(ROOM_LABEL)).toBeInTheDocument();
    expect(screen.getByTestId('transcribe-recording-toggle')).toBeEnabled();
    expect(calls()).toBe(before);
  });

  it('FAILURE: a rejected lookup shows the EVENT wording (the broader audience), never the narrower one', async () => {
    room.getRoomByCode.mockImplementation(() => Promise.reject(new Error('offline')));
    mount(code());
    await waitFor(() => expect(screen.getByText(EVENT_LABEL)).toBeInTheDocument());
    expect(screen.queryByText(ROOM_LABEL)).not.toBeInTheDocument();
    expect(screen.getByTestId('transcribe-consent-intro').textContent).toContain(EVENT_INTRO);
    expect(screen.getByTestId('transcribe-recording-toggle')).toBeEnabled();
  });

  it('FAILURE: a room that is not found also shows the event wording', async () => {
    room.getRoomByCode.mockResolvedValue(null);
    mount(code());
    await waitFor(() => expect(screen.getByText(EVENT_LABEL)).toBeInTheDocument());
  });

  it('not agreed: the prompt, not a label', async () => {
    room.getRoomByCode.mockResolvedValue({ id: 'r', eventId: 'ev-1' });
    mount(code(), false);
    await waitFor(() => expect(screen.getByTestId('transcribe-recording-toggle')).toBeEnabled());
    expect(screen.getByText('Not yet agreed — tap to agree')).toBeInTheDocument();
  });

  it('one lookup is shared by the intro and the label', async () => {
    room.getRoomByCode.mockResolvedValue({ id: 'r', eventId: 'ev-1' });
    const before = calls();
    mount(code());
    await waitFor(() => expect(screen.getByText(EVENT_LABEL)).toBeInTheDocument());
    expect(calls() - before).toBe(1);
  });
});

const ME = 'user-id-me';
const baseRow = {
  id: 'root1', conversation_id: 'c1', author_id: null, body: 'Round 1', created_at: '2026-10-29T10:00:00Z', edited_at: null, deleted_at: null,
  reply_to_id: null, thread_root_id: null, forwarded_from_message_id: null, forward_snapshot: null, kind: 'message' as const, attachment_kind: null, attachment_id: null,
  system_kind: 'round_thread' as const,
};
const root = (): ChatMessage => mapMessageRow(baseRow);
const eventChat: ChatSummary = {
  conversationId: 'c1', kind: 'event', title: null, other: null, org: null, event: { id: 'e1', slug: 'e', title: 'Mastermind', datetime: '2026-10-29T10:00:00Z' },
  ownerFirstName: null, lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false,
};

describe('P1592 a round root never reads "Deleted user"', () => {
  it('the reply bar says just "Reply"', () => {
    render(<PendingQuote clarify={null} replyTo={root()} authors={{}} onClearClarify={() => undefined} onClearReply={() => undefined} />);
    expect(screen.getByTestId('reply-bar')).toHaveTextContent('Reply');
    expect(screen.getByTestId('reply-bar')).not.toHaveTextContent('Deleted user');
    expect(screen.getByTestId('reply-bar')).toHaveTextContent('Round 1');
  });
  it('CONTROL: an authorless message that is not a system post still says "Deleted user"', () => {
    render(<PendingQuote clarify={null} replyTo={mapMessageRow({ ...baseRow, system_kind: null })} authors={{}} onClearClarify={() => undefined} onClearReply={() => undefined} />);
    expect(screen.getByTestId('reply-bar')).toHaveTextContent('Deleted user');
  });
  it('the clarify staging bar shows the title with no author line', () => {
    render(<PendingQuote clarify={{ message: root(), authorName: 'Deleted user' }} replyTo={null} authors={{}} onClearClarify={() => undefined} onClearReply={() => undefined} />);
    expect(screen.getByTestId('clarify-bar')).toHaveTextContent('Round 1');
    expect(screen.getByTestId('clarify-bar')).not.toHaveTextContent('Deleted user');
  });
  it('the forward dialog preview says "Forwarded" and the title', () => {
    render(<ForwardDialog source={root()} authorName="Deleted user" chats={[eventChat]} revalidate={async () => [eventChat]} onClose={() => undefined} onForwarded={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /Mastermind/ }));
    const preview = screen.getByTestId('forward-preview');
    expect(preview).toHaveTextContent('Round 1');
    expect(preview).not.toHaveTextContent('Deleted user');
  });
  it('a search hit with no author reads as the chat alone; a normal hit keeps "<name> · <chat>"', () => {
    expect(searchHitHeading({ authorId: null, authorName: null }, 'Mastermind')).toBe('Mastermind');
    expect(searchHitHeading({ authorId: 'u', authorName: 'Anna Example' }, 'Mastermind')).toBe('Anna Example · Mastermind');
  });
});

describe('P1592 a forwarded round root can be jumped to', () => {
  const chatValue = { userId: ME, status: 'ready', chats: [eventChat], authors: {}, missingAuthors: new Set(), ensureAuthors: vi.fn(), outbox: [], subscribe: () => () => undefined } as unknown as ChatContextValue;
  const actions: MessageActions = {
    onReply: vi.fn(), onForward: vi.fn(), onClarify: vi.fn(), onThread: vi.fn(), onMarkUnread: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(),
    onRetry: vi.fn(), onDiscard: vi.fn(), onJumpTo: vi.fn(), lookup: vi.fn(async () => null), getLoaded: () => undefined, version: 0,
  };
  const copy = (kind: 'forward' | 'clarify', snap: Record<string, unknown>) =>
    mapMessageRow({ ...baseRow, id: 'copy1', author_id: ME, kind, body: null, system_kind: null, forwarded_from_message_id: 'root1', forward_snapshot: snap });
  const show = (m: ChatMessage) =>
    render(
      <MemoryRouter>
        <ChatContext.Provider value={chatValue}>
          <MirrorContext.Provider value={null}>
            <ul><MessageRow msg={m} mine viewerId={ME} author={undefined} authors={{}} compact={false} highlight={false} actions={actions} /></ul>
          </MirrorContext.Provider>
        </ChatContext.Provider>
      </MemoryRouter>,
    );

  it('a forward copy whose body is just "Round 2" is a button to the original, titled alone', () => {
    show(copy('forward', { author_name: 'Deleted user', body: 'Round 2', created_at: 'x', system_kind: 'round_thread' }));
    // P1652: the jump is the separate "Go to original" control; the card around it carries the words.
    expect(screen.getByRole('button', { name: /Go to original message/ })).toBeInTheDocument();
    const card = screen.getByTestId('forwarded-card');
    expect(card).toHaveTextContent('Round 2');
    expect(card).not.toHaveTextContent('Deleted user');
  });
  it('a clarify copy of a root is jumpable too', () => {
    show(copy('clarify', { author_name: 'Deleted user', body: 'Round 2', created_at: 'x', system_kind: 'round_thread', conversation_kind: 'event', conversation_title: 'Mastermind', thread: [] }));
    expect(screen.getByRole('button', { name: /Go to original message/ })).toBeInTheDocument();
  });
  it('CONTROL: a copy of an erased author\'s ordinary message is still NOT jumpable', () => {
    show(copy('forward', { author_name: 'Deleted user', body: 'old words', created_at: 'x' }));
    expect(screen.queryByRole('button', { name: /Go to original message/ })).not.toBeInTheDocument();
    expect(mapForwardSnapshot({ author_name: 'x', body: 'y', created_at: 'z' })?.systemKind).toBeNull();
  });
});
