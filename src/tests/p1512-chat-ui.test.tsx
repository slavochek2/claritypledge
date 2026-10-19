/**
 * @file p1512-chat-ui.test.tsx
 * @description P1512 Clarity Chat v1 — the real chat UI, with the service module mocked.
 * Covers: list tabs, archive / mark-unread, the empty-state hint, an open conversation (deleted and
 * erased cases), optimistic send with Retry, own-only edit / delete, threads in channels only,
 * quote-reply, forward, clarify, attachments the reader cannot see, the blocked composer, the
 * mirror's name and rename, Realtime merge + dedupe, and "no Coming soon / placeholder / mock".
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatMemberState, ChatSummary } from '@/app/data/chat-mappers';
import type { ChatMessageEvent } from '@/app/data/chat-service';

const ME = vi.hoisted(() => ({ id: 'me', name: 'Mia Maker', slug: 'mia', isVerified: true, avatarColor: '#10b981', avatarUrl: undefined as string | undefined }));

const svc = vi.hoisted(() => ({
  getMyChats: vi.fn(),
  listMessages: vi.fn(),
  listThread: vi.fn(),
  getMessage: vi.fn(),
  sendMessage: vi.fn(),
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
  forwardMessage: vi.fn(),
  clarifyMessage: vi.fn(),
  markRead: vi.fn(),
  setChatState: vi.fn(),
  renameMirror: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
  getMyBlocks: vi.fn(),
  searchPeople: vi.fn(),
  searchMessages: vi.fn(),
  startDm: vi.fn(),
  subscribeToChat: vi.fn(),
}));
const helpers = vi.hoisted(() => ({
  getChatAuthors: vi.fn(),
  getThreadStats: vi.fn(),
  loadMyShareables: vi.fn(),
  loadAttachment: vi.fn(),
}));
const toastFn = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));

vi.mock('@/auth', () => ({ useAuth: () => ({ user: ME }) }));
vi.mock('sonner', () => ({ toast: toastFn }));
vi.mock('@/app/data/events-service-real', () => ({ EVENT_GRACE_HOURS: 12 }));
vi.mock('@/app/data/chat-service', async () => ({ ...(await vi.importActual<object>('@/app/data/chat-mappers')), ...svc }));
vi.mock('@/app/data/chat-ui-helpers', () => ({
  ...helpers,
  filterShareables: (items: Array<{ kind: string }>, _q: string, kind: string) => items.filter((i) => i.kind === kind),
}));
vi.mock('@/app/components/feed/feed-point-card', () => ({ FeedPointCard: ({ point }: { point: { statement: string } }) => <div data-testid="point-card">{point.statement}</div> }));
vi.mock('@/app/components/feed/feed-story-card', () => ({ FeedStoryCard: ({ story }: { story: { content: string } }) => <div data-testid="story-card">{story.content}</div> }));

import { ChatProvider, SAFETY_POLL_MS } from '@/app/pages/chat/chat-provider';
import ChatHomePage from '@/app/pages/chat/ChatHomePage';
import {
  chatErrorText,
  isChatVisibleInList,
  mirrorLabel,
  parseChatRoute,
  previewLine,
  splitChats,
  unreadChatCount,
} from '@/app/pages/chat/chat-view-model';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const NOW = Date.now();
const iso = (minsAgo: number) => new Date(NOW - minsAgo * 60_000).toISOString();

const base: Omit<ChatSummary, 'conversationId' | 'kind'> = {
  title: null,
  other: null,
  org: null,
  event: null,
  ownerFirstName: null,
  lastMessage: null,
  unreadCount: 0,
  manualUnread: false,
  archived: false,
  lastReadAt: null,
  isPartner: false,
  membersSince: null,
  canSend: true,
  blockedByMe: false,
};

const last = (body: string, minsAgo: number, authorId: string | null, authorName: string | null) => ({
  id: `lm-${body}`,
  authorId,
  authorName,
  body,
  kind: 'message' as const,
  isDeleted: false,
  createdAt: iso(minsAgo),
});

const dm = (id: string, name: string, extra: Partial<ChatSummary> = {}): ChatSummary => ({
  ...base,
  conversationId: id,
  kind: 'dm',
  other: { id: `p-${id}`, name, slug: name.toLowerCase().split(' ')[0] ?? null, avatarUrl: null, avatarColor: null },
  ...extra,
});
const group = (id: string, orgName: string, extra: Partial<ChatSummary> = {}): ChatSummary => ({
  ...base,
  conversationId: id,
  kind: 'group',
  org: { id: `o-${id}`, slug: orgName.toLowerCase().replace(/\s+/g, '-'), name: orgName },
  membersSince: iso(1000),
  ...extra,
});
const eventChat = (id: string, title: string, startsInHours: number, extra: Partial<ChatSummary> = {}): ChatSummary => ({
  ...base,
  conversationId: id,
  kind: 'event',
  event: { id: `e-${id}`, slug: title.toLowerCase().replace(/\s+/g, '-'), title, datetime: new Date(NOW + startsInHours * 3_600_000).toISOString() },
  membersSince: iso(1000),
  ...extra,
});
const mirror = (id = 'c-mirror', extra: Partial<ChatSummary> = {}): ChatSummary => ({
  ...base,
  conversationId: id,
  kind: 'mirror',
  ownerFirstName: 'Mia',
  ...extra,
});

let msgSeq = 0;
const msg = (conversationId: string, authorId: string | null, body: string | null, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: extra.id ?? `m${++msgSeq}`,
  conversationId,
  authorId,
  body,
  createdAt: iso(60 - msgSeq),
  editedAt: null,
  deletedAt: null,
  isDeleted: false,
  replyToId: null,
  threadRootId: null,
  forwardedFromMessageId: null,
  forwardSnapshot: null,
  kind: 'message',
  attachmentKind: null,
  attachmentId: null,
  ...extra,
});

const ADA = { id: 'p-dm1', name: 'Ada Lovelace', slug: 'ada', avatarUrl: null, avatarColor: null, hasPledged: false };
const authors = [ADA, { id: ME.id, name: ME.name, slug: ME.slug, avatarUrl: null, avatarColor: null, hasPledged: false }, { id: 'p-grace', name: 'Grace Hopper', slug: 'grace', avatarUrl: null, avatarColor: null, hasPledged: false }];

let handlers: { onMessage: (e: ChatMessageEvent) => void; onState: (s: ChatMemberState) => void; onSubscribed?: () => void } | null = null;

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname}{l.search}</div>;
}

function renderChat(path: string, chats: ChatSummary[], messagesByConv: Record<string, ChatMessage[]> = {}) {
  svc.getMyChats.mockResolvedValue(chats);
  svc.listMessages.mockImplementation(async (id: string, opts: { threadRootId?: string } = {}) =>
    (messagesByConv[id] ?? []).filter((m) => (opts.threadRootId ? m.threadRootId === opts.threadRootId : !m.threadRootId)),
  );
  svc.listThread.mockImplementation(async (id: string, rootId: string) =>
    (messagesByConv[id] ?? []).filter((m) => m.id === rootId || m.threadRootId === rootId),
  );
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ChatProvider>
        <Routes>
          <Route path="/home/*" element={<ChatHomePage />} />
          <Route path="*" element={<div>elsewhere</div>} />
        </Routes>
        <Probe />
      </ChatProvider>
    </MemoryRouter>,
  );
}

const rowFor = (title: string | RegExp) => screen.getByText(title, { selector: '[data-testid="row-title"]' }).closest('li') as HTMLElement;
const rowButton = (title: string) => within(rowFor(title)).getAllByRole('button')[0] as HTMLElement;
const menuOn = (text: string | RegExp) => fireEvent.contextMenu(screen.getByText(text));

beforeEach(() => {
  vi.clearAllMocks();
  msgSeq = 0;
  handlers = null;
  svc.getMyBlocks.mockResolvedValue([]);
  svc.markRead.mockResolvedValue(undefined);
  svc.setChatState.mockResolvedValue(undefined);
  svc.getMessage.mockResolvedValue(null);
  svc.searchPeople.mockResolvedValue([]);
  svc.searchMessages.mockResolvedValue([]);
  svc.subscribeToChat.mockImplementation((onMessage: (e: ChatMessageEvent) => void, onState: (s: ChatMemberState) => void, onSubscribed?: () => void) => {
    handlers = { onMessage, onState, onSubscribed };
    return () => undefined;
  });
  helpers.getChatAuthors.mockImplementation(async (ids: string[]) => authors.filter((a) => ids.includes(a.id)));
  helpers.getThreadStats.mockResolvedValue(new Map());
  helpers.loadMyShareables.mockResolvedValue([]);
  helpers.loadAttachment.mockResolvedValue(null);
});
afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------
describe('chat view model', () => {
  it('shows an event channel while the event is upcoming or within 12 hours of its start, or once it has messages', () => {
    const now = new Date(NOW);
    expect(isChatVisibleInList(eventChat('e1', 'Soon', 5), now)).toBe(true);
    expect(isChatVisibleInList(eventChat('e2', 'Just started', -11), now)).toBe(true);
    expect(isChatVisibleInList(eventChat('e3', 'Long gone', -30), now)).toBe(false);
    expect(isChatVisibleInList(eventChat('e4', 'Long gone, talked', -30, { lastMessage: last('hi', 100, 'x', 'X') }), now)).toBe(true);
    expect(isChatVisibleInList(group('g1', 'Org'), now)).toBe(true);
  });

  it('builds preview lines: You:, first name in channels, Message deleted', () => {
    expect(previewLine(dm('a', 'Ada', { lastMessage: last('hello', 1, 'me', 'Mia Maker') }), 'me')).toEqual({ prefix: 'You: ', text: 'hello' });
    expect(previewLine(group('g', 'Org', { lastMessage: last('hello', 1, 'p-grace', 'Grace Hopper') }), 'me')).toEqual({ prefix: 'Grace: ', text: 'hello' });
    expect(previewLine(dm('a', 'Ada', { lastMessage: { ...last('x', 1, 'p-a', 'Ada'), isDeleted: true } }), 'me')).toEqual({ prefix: '', text: 'Message deleted' });
  });

  it('counts unread chats the person has not archived', () => {
    const chats = [dm('a', 'A', { unreadCount: 2 }), dm('b', 'B', { manualUnread: true }), dm('c', 'C', { unreadCount: 5, archived: true }), dm('d', 'D')];
    expect(unreadChatCount(chats)).toBe(2);
    const split = splitChats(chats, 'unread');
    expect(split.active.map((c) => c.conversationId).sort()).toEqual(['a', 'b']);
    expect(split.archived.map((c) => c.conversationId)).toEqual(['c']);
  });

  it('parses the chat routes and labels the mirror', () => {
    expect(parseChatRoute('/home')).toEqual({ conversationId: null, rootId: null });
    expect(parseChatRoute('/home/c/abc')).toEqual({ conversationId: 'abc', rootId: null });
    expect(parseChatRoute('/home/c/abc/t/xyz')).toEqual({ conversationId: 'abc', rootId: 'xyz' });
    expect(mirrorLabel({ title: null, ownerFirstName: 'Mia' })).toBe("Mia's mirror");
    expect(mirrorLabel({ title: 'Scratchpad', ownerFirstName: 'Mia' })).toBe("Scratchpad · Mia's mirror");
  });

  it('turns RPC errors into sentences', () => {
    expect(chatErrorText(new Error('chat send_chat_message failed: chat: cannot message this person'))).toMatch(/cannot message/i);
    expect(chatErrorText(new Error('boom'), 'fallback')).toBe('fallback');
  });
});

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------
describe('chat list', () => {
  const chats = [
    mirror('c-mirror', { lastMessage: last('note', 500, ME.id, ME.name) }),
    dm('dm1', 'Ada Lovelace', { unreadCount: 2, isPartner: true, lastMessage: last('see you', 5, 'p-dm1', 'Ada Lovelace') }),
    dm('dm2', 'Linus Torvalds', { lastMessage: last('ok', 50, ME.id, ME.name) }),
    group('g1', 'Builders', { lastMessage: last('welcome', 20, 'p-grace', 'Grace Hopper') }),
    eventChat('ev1', 'Friday Night', 5),
  ];

  it('filters by tab: All, Unread, Partners, Channels', async () => {
    renderChat('/home', chats);
    await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
    const titles = () => screen.getAllByTestId('row-title').map((n) => n.textContent);
    expect(titles()).toHaveLength(5);

    fireEvent.click(screen.getByRole('tab', { name: /^Unread/ }));
    expect(titles()).toEqual(['Ada Lovelace']);

    fireEvent.click(screen.getByRole('tab', { name: 'Partners' }));
    expect(titles()).toEqual(['Ada Lovelace']);

    fireEvent.click(screen.getByRole('tab', { name: 'Channels' }));
    expect(titles().sort()).toEqual(['Builders · General', 'Friday Night']);

    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(titles()).toHaveLength(5);
  });

  it('shows the unread count on the Unread tab and on the row, in recency order', async () => {
    renderChat('/home', chats);
    await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
    expect(screen.getByRole('tab', { name: /Unread/ })).toHaveTextContent('1');
    expect(within(rowFor('Ada Lovelace')).getByLabelText('2 unread')).toBeInTheDocument();
    expect(screen.getAllByTestId('row-title')[0]).toHaveTextContent('Ada Lovelace'); // newest activity first
  });

  it('hides a past event channel with no messages', async () => {
    renderChat('/home', [mirror(), eventChat('old', 'Old Night', -48), eventChat('new', 'Next Night', 30)]);
    await screen.findByText('Next Night', { selector: '[data-testid="row-title"]' });
    expect(screen.queryByText('Old Night')).not.toBeInTheDocument();
  });

  it('archives a chat through the service and moves it to the collapsed Archived section', async () => {
    renderChat('/home', chats);
    await screen.findByText('Linus Torvalds', { selector: '[data-testid="row-title"]' });
    fireEvent.contextMenu(rowButton('Linus Torvalds'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    expect(svc.setChatState).toHaveBeenCalledWith('dm2', { archived: true });
    await waitFor(() => expect(screen.queryByText('Linus Torvalds', { selector: '[data-testid="row-title"]' })).not.toBeInTheDocument());

    const toggle = screen.getByRole('button', { name: /Archived \(1\)/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    fireEvent.contextMenu(rowButton('Linus Torvalds'));
    expect(await screen.findByRole('menuitem', { name: 'Unarchive' })).toBeInTheDocument();
  });

  it('marks a chat unread through the service and shows the dot', async () => {
    renderChat('/home', chats);
    await screen.findByText('Linus Torvalds', { selector: '[data-testid="row-title"]' });
    fireEvent.contextMenu(rowButton('Linus Torvalds'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Mark as unread' }));
    expect(svc.setChatState).toHaveBeenCalledWith('dm2', { manualUnread: true });
    expect(await within(rowFor('Linus Torvalds')).findByRole('img', { name: 'Marked unread' })).toBeInTheDocument();
  });

  it('marks an unread chat read', async () => {
    renderChat('/home', chats);
    await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
    fireEvent.contextMenu(rowButton('Ada Lovelace'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Mark as read' }));
    expect(svc.markRead).toHaveBeenCalledWith('dm1', expect.any(Date));
    await waitFor(() => expect(within(rowFor('Ada Lovelace')).queryByLabelText('2 unread')).not.toBeInTheDocument());
  });

  it('says "Message someone from your groups or events" only when there are no 1:1s', async () => {
    const { unmount } = renderChat('/home', [mirror(), group('g1', 'Builders')]);
    expect(await screen.findByTestId('no-dm-hint')).toHaveTextContent('Message someone from your groups or events');
    unmount();
    renderChat('/home', chats);
    await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
    expect(screen.queryByTestId('no-dm-hint')).not.toBeInTheDocument();
  });

  it('has a "+" that opens the live partner invite', async () => {
    renderChat('/home', chats);
    await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
    expect(screen.getByRole('link', { name: 'Invite a Clarity Partner' })).toHaveAttribute('href', '/agreements/new/create');
  });

  it('shows a skeleton while loading, then an inline error with Retry that reads again', async () => {
    svc.getMyChats.mockRejectedValueOnce(new Error('network'));
    renderChat('/home', chats);
    expect(screen.getByRole('status', { name: 'Loading chats' })).toBeInTheDocument();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load your chats');
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' })).toBeInTheDocument();
  });

  it('starts a 1:1 from a people result: Message calls startDm and opens the chat', async () => {
    svc.searchPeople.mockResolvedValue([{ id: 'p-new', name: 'Grace Hopper', slug: 'grace', avatarUrl: null, avatarColor: null, shared: 'Builders', dmConversationId: null }]);
    svc.startDm.mockResolvedValue('dm-new');
    renderChat('/home', chats);
    await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
    fireEvent.change(screen.getByLabelText('Search chats and people'), { target: { value: 'Grace' } });
    const button = await screen.findByRole('button', { name: 'Message Grace Hopper' }, { timeout: 3000 });
    expect(screen.getByText('Builders')).toBeInTheDocument(); // the shared reason
    fireEvent.click(button);
    await waitFor(() => expect(svc.startDm).toHaveBeenCalledWith('p-new'));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/home/c/dm-new'));
  });

  it('opens a message hit at the message', async () => {
    svc.searchMessages.mockResolvedValue([{ messageId: 'm-hit', conversationId: 'dm1', authorId: 'p-dm1', authorName: 'Ada Lovelace', body: 'the needle', createdAt: iso(3) }]);
    renderChat('/home', chats);
    await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
    fireEvent.change(screen.getByLabelText('Search chats and people'), { target: { value: 'needle' } });
    fireEvent.click(await screen.findByText('the needle', {}, { timeout: 3000 }));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/home/c/dm1?m=m-hit'));
  });
});

// ---------------------------------------------------------------------------
// A conversation
// ---------------------------------------------------------------------------
describe('conversation', () => {
  const dmChat = dm('dm1', 'Ada Lovelace', { isPartner: true });

  it('renders messages with author, grouping, "(edited)", "Message deleted" and an erased author as "Deleted user"', async () => {
    const msgs = [
      msg('dm1', 'p-dm1', 'first from Ada'),
      msg('dm1', 'p-dm1', 'second from Ada'),
      msg('dm1', ME.id, 'mine', { editedAt: iso(1) }),
      msg('dm1', 'p-dm1', null, { isDeleted: true, deletedAt: iso(2) }),
      msg('dm1', null, 'from a gone account'),
    ];
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: msgs });
    expect(await screen.findByText('first from Ada')).toBeInTheDocument();
    expect(screen.getByText('(edited)')).toBeInTheDocument();
    expect(screen.getByText('Message deleted', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Deleted user', { selector: 'span' })).toBeInTheDocument(); // erased author: not a link
    // grouping: Ada's two consecutive messages share one name header
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Ada Lovelace' }).length).toBeGreaterThan(0));
    const names = screen.getAllByTestId('message').filter((li) => within(li).queryByRole('link', { name: 'Ada Lovelace' }));
    expect(names).toHaveLength(2); // the first message and the one after the break; the second is compact
    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(screen.getByText('Clarity Partner')).toBeInTheDocument();
    expect(screen.getByRole('log', { name: 'Messages' })).toHaveAttribute('aria-live', 'polite');
  });

  it('asks again for author names after a dropped connection instead of leaving "Unknown"', async () => {
    helpers.getChatAuthors.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [msg('dm1', 'p-dm1', 'who wrote this')] });
    expect(await screen.findByText('who wrote this')).toBeInTheDocument();
    // while the name is on its way: a quiet bar, never a flash of "Unknown"
    expect(screen.getByRole('status', { name: 'Loading name' })).toBeInTheDocument();
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Ada Lovelace' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading name' })).not.toBeInTheDocument();
    expect(helpers.getChatAuthors).toHaveBeenCalledTimes(2);
  }, 10_000);

  it('says "Unknown" once the lookup finds no profile for an author', async () => {
    helpers.getChatAuthors.mockResolvedValue([]);
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [msg('dm1', 'p-ghost', 'from someone unreadable')] });
    expect(await screen.findByText('from someone unreadable')).toBeInTheDocument();
    expect(await screen.findByText('Unknown', { selector: 'span' })).toBeInTheDocument();
  });

  it('links the header to the live profile, group page and event page', async () => {
    const { unmount } = renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [] });
    expect(await screen.findByRole('link', { name: /Ada Lovelace/ })).toHaveAttribute('href', '/p/ada');
    unmount();
    const g = group('g1', 'Builders');
    const { unmount: u2 } = renderChat('/home/c/g1', [mirror(), g], { g1: [] });
    expect(await screen.findByRole('link', { name: /Builders/ })).toHaveAttribute('href', '/groups/builders');
    u2();
    const e = eventChat('ev1', 'Friday Night', 5);
    renderChat('/home/c/ev1', [mirror(), e], { ev1: [] });
    expect(await screen.findByRole('link', { name: /Friday Night/ })).toHaveAttribute('href', '/events/friday-night');
  });

  it('marks the open chat read up to its newest message', async () => {
    const c = dm('dm1', 'Ada Lovelace', { unreadCount: 1, lastMessage: last('hey', 2, 'p-dm1', 'Ada') });
    renderChat('/home/c/dm1', [mirror(), c], { dm1: [msg('dm1', 'p-dm1', 'hey')] });
    await waitFor(() => expect(svc.markRead).toHaveBeenCalledWith('dm1', expect.any(Date)));
  });

  it('sends optimistically: shows "Sending…" at once, then the confirmed message', async () => {
    let resolve!: (m: ChatMessage) => void;
    svc.sendMessage.mockImplementation(() => new Promise<ChatMessage>((r) => { resolve = r; }));
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [] });
    const box = await screen.findByRole('textbox', { name: 'Message Ada' });
    await userEvent.type(box, 'hello Ada');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Sending…')).toBeInTheDocument();
    expect(screen.getByText('hello Ada')).toBeInTheDocument();
    expect(svc.sendMessage).toHaveBeenCalledWith({ conversationId: 'dm1', threadRootId: undefined, body: 'hello Ada', replyToId: undefined, attachment: undefined });
    await act(async () => resolve(msg('dm1', ME.id, 'hello Ada', { id: 'server-1' })));
    await waitFor(() => expect(screen.queryByText('Sending…')).not.toBeInTheDocument());
    expect(screen.getAllByText('hello Ada')).toHaveLength(1);
    expect((box as HTMLTextAreaElement).value).toBe('');
  });

  it('shows a failed send with Retry, and Retry sends again', async () => {
    svc.sendMessage.mockRejectedValueOnce(new Error('chat send_chat_message failed: chat: cannot message this person'));
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [] });
    await userEvent.type(await screen.findByRole('textbox', { name: 'Message Ada' }), 'will fail');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const failed = await screen.findByTestId('send-failed');
    expect(failed).toHaveTextContent(/cannot message/i);
    svc.sendMessage.mockResolvedValueOnce(msg('dm1', ME.id, 'will fail', { id: 'server-2' }));
    fireEvent.click(within(failed).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByTestId('send-failed')).not.toBeInTheDocument());
    expect(svc.sendMessage).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText('will fail')).toHaveLength(1);
  });

  it('Enter sends and Shift+Enter starts a new line on a desktop pointer', async () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: q.includes('pointer: fine'), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
    try {
      svc.sendMessage.mockResolvedValue(msg('dm1', ME.id, 'one', { id: 'server-3' }));
      renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [] });
      const box = await screen.findByRole('textbox', { name: 'Message Ada' });
      fireEvent.change(box, { target: { value: 'one' } });
      fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
      expect(svc.sendMessage).not.toHaveBeenCalled();
      fireEvent.keyDown(box, { key: 'Enter' });
      await waitFor(() => expect(svc.sendMessage).toHaveBeenCalledTimes(1));
    } finally {
      window.matchMedia = original;
    }
  });

  it('offers Edit and Delete on my own message only; edit and delete call the service', async () => {
    const mine = msg('dm1', ME.id, 'my words', { id: 'mine' });
    const theirs = msg('dm1', 'p-dm1', 'their words', { id: 'theirs' });
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [theirs, mine] });
    await screen.findByText('my words');

    menuOn('their words');
    expect(await screen.findByRole('menuitem', { name: 'Reply' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });

    menuOn('my words');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    svc.editMessage.mockResolvedValue({ ...mine, body: 'better words', editedAt: iso(0) });
    const field = await screen.findByLabelText('Edit message');
    fireEvent.change(field, { target: { value: 'better words' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(svc.editMessage).toHaveBeenCalledWith('mine', 'better words'));
    expect(await screen.findByText('better words')).toBeInTheDocument();

    menuOn('better words');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    svc.deleteMessage.mockResolvedValue({ ...mine, body: null, isDeleted: true, deletedAt: iso(0) });
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(svc.deleteMessage).toHaveBeenCalledWith('mine'));
    expect(await screen.findByText('Message deleted', { selector: 'p' })).toBeInTheDocument();
  });

  it('offers a thread only in channels, with the reply count, and opens the panel from the route', async () => {
    const root = msg('g1', 'p-grace', 'start a thread here', { id: 'root' });
    const reply = msg('g1', ME.id, 'a reply in the thread', { id: 'rep', threadRootId: 'root' });
    helpers.getThreadStats.mockResolvedValue(new Map([['root', { count: 1, authorIds: [ME.id] }]]));
    const { unmount } = renderChat('/home/c/g1', [mirror(), group('g1', 'Builders')], { g1: [root, reply] });
    await screen.findByText('start a thread here');
    expect(await screen.findByTestId('replies-link')).toHaveTextContent('1 reply');
    menuOn('start a thread here');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reply in thread' }));
    expect(screen.getByTestId('loc')).toHaveTextContent('/home/c/g1/t/root');
    const panel = await screen.findByTestId('thread-panel');
    expect(within(panel).getByText('a reply in the thread')).toBeInTheDocument();
    expect(within(panel).getByRole('textbox', { name: 'Reply in thread' })).toBeInTheDocument();
    unmount();

    // a 1:1 has no thread action, and a thread URL on it falls back to the chat
    renderChat('/home/c/dm1/t/x', [mirror(), dm('dm1', 'Ada Lovelace')], { dm1: [msg('dm1', 'p-dm1', 'plain dm message')] });
    await screen.findByText('plain dm message');
    expect(screen.getByTestId('loc')).toHaveTextContent('/home/c/dm1');
    expect(screen.queryByTestId('thread-panel')).not.toBeInTheDocument();
    menuOn('plain dm message');
    expect(await screen.findByRole('menuitem', { name: 'Reply' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Reply in thread' })).not.toBeInTheDocument();
  });

  it('keeps the conversation loaded and in place when its thread opens', async () => {
    const root = msg('g1', 'p-grace', 'main pane message', { id: 'root2' });
    const reply = msg('g1', ME.id, 'thread pane reply', { id: 'rep2', threadRootId: 'root2' });
    helpers.getThreadStats.mockResolvedValue(new Map([['root2', { count: 1, authorIds: [ME.id] }]]));
    renderChat('/home/c/g1', [mirror(), group('g1', 'Builders')], { g1: [root, reply] });
    await screen.findByText('main pane message');
    const mainLoads = svc.listMessages.mock.calls.length;
    fireEvent.click(await screen.findByTestId('replies-link'));
    const panel = await screen.findByTestId('thread-panel');
    expect(await within(panel).findByText('thread pane reply')).toBeInTheDocument();
    // the conversation behind the panel: still showing its message, never back to a skeleton, no refetch
    expect(screen.queryByRole('status', { name: 'Loading messages' })).not.toBeInTheDocument();
    expect(within(screen.getByTestId('conversation')).getByText('main pane message')).toBeInTheDocument();
    expect(svc.listMessages.mock.calls.filter((c) => !(c[1] as { threadRootId?: string } | undefined)?.threadRootId).length).toBe(mainLoads);
  });

  it('opens a thread URL directly with both the conversation and the thread loaded', async () => {
    const root = msg('g1', 'p-grace', 'direct main message', { id: 'root3' });
    const reply = msg('g1', ME.id, 'direct thread reply', { id: 'rep3', threadRootId: 'root3' });
    renderChat('/home/c/g1/t/root3', [mirror(), group('g1', 'Builders')], { g1: [root, reply] });
    const panel = await screen.findByTestId('thread-panel');
    expect(await within(panel).findByText('direct thread reply')).toBeInTheDocument();
    expect(await within(screen.getByTestId('conversation')).findByText('direct main message')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading messages' })).not.toBeInTheDocument();
  });

  it('a tap shows the actions in line under the message (never floating over text) and a scroll dismisses them', async () => {
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [msg('dm1', 'p-dm1', 'tap me'), msg('dm1', 'p-dm1', 'the next row')] });
    const text = await screen.findByText('tap me');
    const toolbar = () => within(text.closest('li') as HTMLElement).getByRole('toolbar', { name: 'Message actions' });
    expect(toolbar()).toHaveClass('absolute'); // not selected: the hover variant, invisible until hover or focus
    fireEvent.pointerUp(text);
    expect(toolbar()).toHaveClass('inline-flex', 'flex-wrap');
    expect(toolbar()).not.toHaveClass('absolute');
    expect(within(toolbar()).getByText('Forward')).toBeInTheDocument(); // touch has no hover tip: the words show
    fireEvent.scroll(screen.getByTestId('message-scroller'));
    expect(toolbar()).toHaveClass('absolute');
    fireEvent.pointerUp(text);
    expect(toolbar()).toHaveClass('inline-flex');
    fireEvent.mouseDown(screen.getByText('the next row')); // a tap elsewhere
    expect(toolbar()).toHaveClass('absolute');
  });

  it('quote-replies: the bar shows above the field and the send carries replyToId', async () => {
    const theirs = msg('dm1', 'p-dm1', 'quote me please', { id: 'q1' });
    svc.sendMessage.mockResolvedValue(msg('dm1', ME.id, 'answer', { id: 'a1', replyToId: 'q1' }));
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [theirs] });
    await screen.findByText('quote me please');
    menuOn('quote me please');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reply' }));
    const bar = await screen.findByTestId('reply-bar');
    expect(bar).toHaveTextContent('Ada Lovelace');
    expect(bar).toHaveTextContent('quote me please');
    await userEvent.type(screen.getByRole('textbox', { name: 'Message Ada' }), 'answer');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(svc.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ body: 'answer', replyToId: 'q1' })));
    await waitFor(() => expect(screen.queryByTestId('reply-bar')).not.toBeInTheDocument());
  });

  it('renders a quote, "Original message deleted" and "not available"', async () => {
    const original = msg('dm1', 'p-dm1', 'the original', { id: 'o1' });
    const gone = msg('dm1', 'p-dm1', null, { id: 'o2', isDeleted: true, deletedAt: iso(9) });
    const a = msg('dm1', ME.id, 'reply one', { replyToId: 'o1' });
    const b = msg('dm1', ME.id, 'reply two', { replyToId: 'o2' });
    const c = msg('dm1', ME.id, 'reply three', { replyToId: 'unreadable' });
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [original, gone, a, b, c] });
    await screen.findByText('reply one');
    await waitFor(() => expect(screen.getAllByTestId('reply-quote')).toHaveLength(3));
    const quotes = screen.getAllByTestId('reply-quote').map((q) => q.textContent);
    expect(quotes[0]).toContain('the original');
    expect(quotes[1]).toContain('Original message deleted');
    expect(quotes[2]).toContain('Original message not available');
  });

  it('forward: pick a chat, add a note, call forwardMessage with the source, target and note', async () => {
    const theirs = msg('dm1', 'p-dm1', 'worth forwarding', { id: 'fw1' });
    svc.forwardMessage.mockResolvedValue(msg('g1', ME.id, 'see this', { id: 'f2', kind: 'forward' }));
    renderChat('/home/c/dm1', [mirror(), dmChat, group('g1', 'Builders')], { dm1: [theirs] });
    await screen.findByText('worth forwarding');
    menuOn('worth forwarding');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Forward' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Search chats'), { target: { value: 'build' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Builders/ }));
    fireEvent.change(within(dialog).getByLabelText(/Add a note/), { target: { value: 'see this' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(svc.forwardMessage).toHaveBeenCalledWith('fw1', 'g1', 'see this'));
    expect(toastFn).toHaveBeenCalledWith('Forwarded', expect.objectContaining({ action: expect.objectContaining({ label: 'Open' }) }));
  });

  it('clarify: calls clarifyMessage and says "Sent to your mirror"; the mirror itself has no Clarify', async () => {
    const theirs = msg('dm1', 'p-dm1', 'clarify this', { id: 'cl1' });
    svc.clarifyMessage.mockResolvedValue(msg('c-mirror', ME.id, null, { id: 'cl2', kind: 'clarify' }));
    const { unmount } = renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [theirs] });
    await screen.findByText('clarify this');
    menuOn('clarify this');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Clarify' }));
    await waitFor(() => expect(svc.clarifyMessage).toHaveBeenCalledWith('cl1'));
    await waitFor(() => expect(toastFn).toHaveBeenCalledWith('Sent to your mirror', expect.objectContaining({ action: expect.objectContaining({ label: 'Open' }) })));
    unmount();

    const own = msg('c-mirror', ME.id, 'a note to self', { id: 'n1' });
    renderChat('/home/c/c-mirror', [mirror(), dmChat], { 'c-mirror': [own] });
    await screen.findByText('a note to self');
    menuOn('a note to self');
    expect(await screen.findByRole('menuitem', { name: 'Reply' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Clarify' })).not.toBeInTheDocument();
  });

  it('renders forwarded and clarified cards with their snapshot, the thread, and an "Open original" only when readable', async () => {
    const snap = (body: string, thread: Array<{ authorName: string; body: string | null; createdAt: string }> = []) => ({ authorName: 'Grace Hopper', body, createdAt: iso(30), conversationKind: 'group' as const, conversationTitle: null, thread });
    const fwd = msg('dm1', 'p-dm1', 'note on top', { id: 'f1', kind: 'forward', forwardSnapshot: snap('forwarded words'), forwardedFromMessageId: 'src-ok' });
    const cla = msg('dm1', ME.id, null, { id: 'f2', kind: 'clarify', forwardSnapshot: snap('clarified words', [{ authorName: 'Linus', body: 'a thread entry', createdAt: iso(20) }]), forwardedFromMessageId: 'src-gone' });
    svc.getMessage.mockImplementation(async (id: string) => (id === 'src-ok' ? msg('g1', 'p-grace', 'original', { id: 'src-ok' }) : null));
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [fwd, cla] });
    const forwarded = await screen.findByTestId('forwarded-card');
    expect(forwarded).toHaveTextContent('Forwarded from Grace Hopper');
    expect(forwarded).toHaveTextContent('forwarded words');
    expect(screen.getByText('note on top')).toBeInTheDocument();
    expect(await within(forwarded).findByRole('link', { name: 'Open original' })).toHaveAttribute('href', '/home/c/g1?m=src-ok');
    const clarified = screen.getByTestId('clarified-card');
    expect(clarified).toHaveTextContent('Clarified from Grace Hopper in a group chat');
    expect(screen.getAllByTestId('forwarded-label')).toHaveLength(2);
    expect(clarified).toHaveTextContent('a thread entry');
    await waitFor(() => expect(svc.getMessage).toHaveBeenCalledWith('src-gone'));
    expect(within(clarified).queryByRole('link', { name: 'Open original' })).not.toBeInTheDocument();
  });

  it('renders a forward or clarify from an erased account as "Forwarded from Deleted user · Message removed"', async () => {
    const gone = (extra: object = {}) => ({ authorName: 'Deleted user', body: null, createdAt: iso(30), conversationKind: 'group' as const, conversationTitle: null, thread: [] as Array<{ authorName: string; body: string | null; createdAt: string }>, ...extra });
    const fwd = msg('dm1', 'p-dm1', null, { id: 'e1', kind: 'forward', forwardSnapshot: gone() });
    const cla = msg('dm1', ME.id, null, { id: 'e2', kind: 'clarify', forwardSnapshot: gone({ thread: [{ authorName: 'Deleted user', body: null, createdAt: iso(20) }, { authorName: 'Linus', body: 'still here', createdAt: iso(10) }] }) });
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [fwd, cla] });
    const forwarded = await screen.findByTestId('forwarded-card');
    expect(forwarded).toHaveTextContent('Forwarded from Deleted user · Message removed');
    const clarified = screen.getByTestId('clarified-card');
    expect(clarified).toHaveTextContent('Deleted user · Message removed');
    expect(clarified).toHaveTextContent('Linus: still here');
  });

  it('does not call a forwarded attachment "removed" and copes with a clarify snapshot that has no thread', async () => {
    const att = msg('dm1', 'p-dm1', null, { id: 'e3', kind: 'forward', attachmentKind: 'point', attachmentId: 'pt-1', forwardSnapshot: { authorName: 'Grace Hopper', body: null, createdAt: iso(30), conversationKind: 'group', conversationTitle: null, thread: [] } });
    const noThread = msg('dm1', ME.id, null, { id: 'e4', kind: 'clarify', forwardSnapshot: { authorName: 'Grace Hopper', body: 'words', createdAt: iso(30), conversationKind: 'dm', conversationTitle: null, thread: [] } });
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [att, noThread] });
    await screen.findByTestId('clarified-card');
    expect(screen.queryByTestId('snapshot-removed')).not.toBeInTheDocument();
    expect(screen.getByTestId('clarified-card')).toHaveTextContent('Clarified from Grace Hopper in a direct message');
  });

  it('names the source of a clarified copy when the snapshot carries its title', async () => {
    const cla = (title: string | null, kind: 'group' | 'dm', id: string) =>
      msg('dm1', ME.id, null, { id, kind: 'clarify', forwardSnapshot: { authorName: 'Grace Hopper', body: 'words', createdAt: iso(30), conversationKind: kind, conversationTitle: title, thread: [] } });
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [cla('Builders · General', 'group', 'k1'), cla('Linus Torvalds', 'dm', 'k2')] });
    const cards = await screen.findAllByTestId('clarified-card');
    expect(cards[0]).toHaveTextContent('Clarified from Grace Hopper in Builders · General');
    expect(cards[1]).toHaveTextContent('Clarified from Grace Hopper in a chat with Linus Torvalds');
  });

  it('shows "Not available to you" for an attachment the reader cannot read, and the card when they can', async () => {
    const unreadable = msg('dm1', 'p-dm1', 'look', { id: 'at1', attachmentKind: 'point', attachmentId: 'pt-secret' });
    const readable = msg('dm1', 'p-dm1', 'and this', { id: 'at2', attachmentKind: 'story', attachmentId: 'st-open' });
    helpers.loadAttachment.mockImplementation(async (kind: string, id: string) =>
      id === 'st-open' ? { kind, id, title: 'T', tags: [], story: { id, content: 'a story everyone may read' }, linkedPoints: [] } : null,
    );
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [unreadable, readable] });
    expect(await screen.findByText('Not available to you')).toBeInTheDocument();
    expect(await screen.findByTestId('story-card')).toHaveTextContent('a story everyone may read');
    expect(helpers.loadAttachment).toHaveBeenCalledWith('point', 'pt-secret', ME.id);
  });

  it('attaches one of my points: the picker stages it and the send carries the attachment', async () => {
    helpers.loadMyShareables.mockResolvedValue([{ kind: 'point', id: 'pt-1', title: 'Clarity beats cleverness', tags: ['clarity'] }]);
    svc.sendMessage.mockResolvedValue(msg('dm1', ME.id, null, { id: 'sent-at', attachmentKind: 'point', attachmentId: 'pt-1' }));
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [] });
    fireEvent.click(await screen.findByRole('button', { name: 'Attach a point or story' }));
    fireEvent.click(await screen.findByRole('button', { name: /Attach Clarity beats cleverness/ }));
    expect(await screen.findByTestId('staged-attachment')).toHaveTextContent('Clarity beats cleverness');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(svc.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ body: null, attachment: { kind: 'point', id: 'pt-1' } })));
  });

  it('disables the composer with an explanation for a blocked person, and Unblock reads the list back', async () => {
    svc.unblockUser.mockResolvedValue(undefined);
    renderChat('/home/c/dm1', [mirror(), { ...dmChat, canSend: false, blockedByMe: true }], { dm1: [] });
    const notice = await screen.findByTestId('composer-blocked');
    expect(notice).toHaveTextContent('You blocked Ada Lovelace. Unblock to send messages.');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    svc.getMyChats.mockResolvedValue([mirror(), dmChat]);
    fireEvent.click(within(notice).getByRole('button', { name: 'Unblock' }));
    await waitFor(() => expect(svc.unblockUser).toHaveBeenCalledWith('p-dm1'));
    expect(await screen.findByRole('textbox', { name: 'Message Ada' })).toBeInTheDocument();
  });

  it('when the OTHER person blocked me, the composer explains without saying who blocked', async () => {
    renderChat('/home/c/dm1', [mirror(), { ...dmChat, canSend: false, blockedByMe: false }], { dm1: [] });
    const notice = await screen.findByTestId('composer-blocked');
    expect(notice).toHaveTextContent('You cannot send messages in this chat.');
    expect(notice).not.toHaveTextContent(/blocked/i);
    expect(within(notice).queryByRole('button', { name: 'Unblock' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('blocks from the header menu after a confirmation', async () => {
    svc.blockUser.mockResolvedValue(undefined);
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [] });
    await userEvent.click(await screen.findByRole('button', { name: 'More' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Block' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Block Ada Lovelace?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Block' }));
    await waitFor(() => expect(svc.blockUser).toHaveBeenCalledWith('p-dm1'));
  });

  it('names the mirror "<title> · <First>\'s mirror" in the header and the list, and Rename persists', async () => {
    svc.renameMirror.mockResolvedValue('Scratchpad');
    renderChat('/home/c/c-mirror', [mirror('c-mirror', { title: 'Scratchpad' }), dmChat], { 'c-mirror': [] });
    expect(await screen.findByRole('heading', { name: "Scratchpad · Mia's mirror" })).toBeInTheDocument();
    expect(screen.getAllByTestId('row-title').map((n) => n.textContent)).toContain("Scratchpad · Mia's mirror");
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByLabelText(/^Name/);
    expect(field).toHaveValue('Scratchpad');
    fireEvent.change(field, { target: { value: '' } });
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled(); // 1 to 60 characters
    fireEvent.change(field, { target: { value: 'Thinking out loud' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(svc.renameMirror).toHaveBeenCalledWith('Thinking out loud'));
  });

  it('leaves the chat when a message is marked unread, and sets the flag', async () => {
    const theirs = msg('dm1', 'p-dm1', 'read later', { id: 'ml' });
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [theirs] });
    await screen.findByText('read later');
    menuOn('read later');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Mark as unread' }));
    expect(svc.setChatState).toHaveBeenCalledWith('dm1', { manualUnread: true });
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent(/^\/home$/));
  });

  it('says a chat is not available when the id is not one the person can read', async () => {
    renderChat('/home/c/nope', [mirror(), dmChat]);
    expect(await screen.findByTestId('chat-unavailable')).toHaveTextContent("This chat isn't available");
  });
});

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------
describe('realtime', () => {
  const dmChat = dm('dm1', 'Ada Lovelace');

  it('appends a message from another person without a reload and shows it once', async () => {
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [msg('dm1', 'p-dm1', 'earlier')] });
    await screen.findByText('earlier');
    const incoming = msg('dm1', 'p-dm1', 'live from Realtime', { id: 'rt-1' });
    act(() => handlers?.onMessage({ type: 'INSERT', message: incoming }));
    expect(await screen.findByText('live from Realtime')).toBeInTheDocument();
    act(() => handlers?.onMessage({ type: 'INSERT', message: incoming })); // the same event twice
    expect(screen.getAllByText('live from Realtime')).toHaveLength(1);
  });

  it('applies an UPDATE: an edit and a delete arrive live', async () => {
    const m = msg('dm1', 'p-dm1', 'before', { id: 'rt-2' });
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [m] });
    await screen.findByText('before');
    act(() => handlers?.onMessage({ type: 'UPDATE', message: { ...m, body: 'after', editedAt: iso(0) } }));
    expect(await screen.findByText('after')).toBeInTheDocument();
    act(() => handlers?.onMessage({ type: 'UPDATE', message: { ...m, body: null, isDeleted: true, deletedAt: iso(0) } }));
    expect(await screen.findByText('Message deleted', { selector: 'p' })).toBeInTheDocument();
    expect(screen.queryByText('after')).not.toBeInTheDocument();
  });

  it('drops the pending twin when my own message arrives by Realtime before the RPC replies', async () => {
    let resolve!: (m: ChatMessage) => void;
    svc.sendMessage.mockImplementation(() => new Promise<ChatMessage>((r) => { resolve = r; }));
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [] });
    await userEvent.type(await screen.findByRole('textbox', { name: 'Message Ada' }), 'race me');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Sending…');
    const confirmed = msg('dm1', ME.id, 'race me', { id: 'rt-3' });
    act(() => handlers?.onMessage({ type: 'INSERT', message: confirmed }));
    await waitFor(() => expect(screen.queryByText('Sending…')).not.toBeInTheDocument());
    expect(screen.getAllByText('race me')).toHaveLength(1);
    await act(async () => resolve(confirmed));
    expect(screen.getAllByText('race me')).toHaveLength(1);
  });

  it('refetches the list and the open conversation when the subscription (re)connects', async () => {
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [msg('dm1', 'p-dm1', 'one')] });
    await screen.findByText('one');
    const listCalls = svc.getMyChats.mock.calls.length;
    const msgCalls = svc.listMessages.mock.calls.length;
    act(() => handlers?.onSubscribed?.());
    await waitFor(() => expect(svc.getMyChats.mock.calls.length).toBeGreaterThan(listCalls));
    await waitFor(() => expect(svc.listMessages.mock.calls.length).toBeGreaterThan(msgCalls));
  });

  it('refetches on a timer while the tab is visible, in case Realtime went quiet without saying so', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [msg('dm1', 'p-dm1', 'one')] });
    await screen.findByText('one');
    const listCalls = svc.getMyChats.mock.calls.length;
    const msgCalls = svc.listMessages.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAFETY_POLL_MS + 50);
    });
    expect(svc.getMyChats.mock.calls.length).toBeGreaterThan(listCalls);
    expect(svc.listMessages.mock.calls.length).toBeGreaterThan(msgCalls);
  });

  it('updates unread and archived when another device changes the state', async () => {
    const c = dm('dm1', 'Ada Lovelace', { unreadCount: 3, lastMessage: last('hi', 4, 'p-dm1', 'Ada') });
    renderChat('/home', [mirror(), c]);
    await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
    expect(within(rowFor('Ada Lovelace')).getByLabelText('3 unread')).toBeInTheDocument();
    act(() => handlers?.onState({ conversationId: 'dm1', profileId: ME.id, lastReadAt: iso(0), manualUnread: false, archived: true }));
    await waitFor(() => expect(screen.queryByText('Ada Lovelace', { selector: '[data-testid="row-title"]' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Archived \(1\)/ })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Nothing fake
// ---------------------------------------------------------------------------
describe('nothing fake', () => {
  it('renders no "coming soon", placeholder, prototype or mock text in the list, a conversation or a dialog', async () => {
    const chats = [mirror(), dm('dm1', 'Ada Lovelace', { isPartner: true }), group('g1', 'Builders'), eventChat('ev1', 'Friday Night', 5)];
    renderChat('/home/c/dm1', chats, { dm1: [msg('dm1', 'p-dm1', 'a normal message')] });
    await screen.findByText('a normal message');
    menuOn('a normal message');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Forward' }));
    await screen.findByRole('dialog');
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/coming soon|placeholder|prototype|mock/i);
    expect(text).not.toMatch(/transcribe|voice|topic vote/i);
  });
});
