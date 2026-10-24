/**
 * @file p1512-chat-ui.test.tsx
 * @description P1512 Clarity Chat v1 — the real chat UI, with the service module mocked.
 * Covers: list tabs, archive / mark-unread, the empty-state hint, an open conversation (deleted and
 * erased cases), optimistic send with Retry, own-only edit / delete, threads in channels only,
 * quote-reply, forward, clarify, attachments the reader cannot see, the blocked composer, the
 * mirror's name and rename, Realtime merge + dedupe, and "no Coming soon / placeholder / mock".
 */
import { act, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatMemberState, ChatSummary } from '@/app/data/chat-mappers';
import type { ChatMessageEvent } from '@/app/data/chat-service';

// Rendering a whole chat page is heavy; a shared, busy machine must not turn a slow render into a failure.
configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30_000 });

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
  getThreadStats: vi.fn(),
}));
const helpers = vi.hoisted(() => ({
  getChatAuthors: vi.fn(),
  loadMyShareables: vi.fn(),
  loadAttachment: vi.fn(),
}));
const toastFn = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));

const AUTH = vi.hoisted(() => ({ signOut: vi.fn(), refreshProfile: vi.fn(), user: ME as typeof ME }));
vi.mock('@/auth', () => ({
  useAuth: () => ({ session: { user: { id: AUTH.user.id } }, user: AUTH.user, isLoading: false, sessionChecked: true, signOut: AUTH.signOut, refreshProfile: AUTH.refreshProfile }),
}));
vi.mock('sonner', () => ({ toast: toastFn }));
vi.mock('@/app/data/events-service-real', () => ({ EVENT_GRACE_HOURS: 12 }));
vi.mock('@/app/data/chat-service', async () => ({ ...(await vi.importActual<object>('@/app/data/chat-mappers')), ...svc }));
vi.mock('@/app/data/chat-ui-helpers', () => ({
  ...helpers,
  filterShareables: (items: Array<{ kind: string }>, _q: string, kind: string) => items.filter((i) => i.kind === kind),
}));
vi.mock('@/app/components/feed/feed-point-card', () => ({ FeedPointCard: ({ point }: { point: { statement: string } }) => <div data-testid="point-card">{point.statement}</div> }));
vi.mock('@/app/components/feed/feed-story-card', () => ({ FeedStoryCard: ({ story }: { story: { content: string } }) => <div data-testid="story-card">{story.content}</div> }));

import { ChatProvider, LIST_POLL_MS, LIST_READ_TIMEOUT_MS, SAFETY_POLL_MS } from '@/app/pages/chat/chat-provider';
import { SYNC_LIMITS } from '@/app/pages/chat/use-conversation';
import { PICKER_TIMEOUT_MS } from '@/app/pages/chat/NewMessageDialog';
import { MirrorMark } from '@/app/pages/chat/chat-kit';
import ChatHomePage from '@/app/pages/chat/ChatHomePage';
import { useChat } from '@/app/pages/chat/chat-state';
import { MirrorContext, type MirrorContextValue } from '@/app/pages/chat/mirror-state';
import { stageClarify } from '@/app/pages/chat/chat-hooks';
import { Composer } from '@/app/pages/chat/Composer';
import { AttachmentCard, ATTACHMENT_TIMEOUT_MS } from '@/app/pages/chat/AttachmentCard';
import {
  chatErrorText,
  compareMessages,
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
  // A channel with a message is in the Inbox (an empty one is under Channels only).
  lastMessage: last('hello', 900, 'p-grace', 'Grace Hopper'),
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
  forwardAuthorId: null,
  forwardSnapshot: null,
  kind: 'message',
  attachmentKind: null,
  attachmentId: null,
  ...extra,
});

const ADA = { id: 'p-dm1', name: 'Ada Lovelace', slug: 'ada', avatarUrl: null, avatarColor: null, hasPledged: false };
const authors = [ADA, { id: ME.id, name: ME.name, slug: ME.slug, avatarUrl: null, avatarColor: null, hasPledged: false }, { id: 'p-grace', name: 'Grace Hopper', slug: 'grace', avatarUrl: null, avatarColor: null, hasPledged: false }];

let handlers: { onMessage: (e: ChatMessageEvent) => void; onState: (s: ChatMemberState) => void; onSubscribed?: () => void } | null = null;

// What a browser's own back button does, for tests that prove a Back in the app popped or replaced.
let historyBack: () => void = () => undefined;
let historyForward: () => void = () => undefined;

function Probe() {
  const l = useLocation();
  const navigate = useNavigate();
  historyBack = () => navigate(-1);
  historyForward = () => navigate(1);
  // data-nav: how the router arrived here (PUSH, POP or REPLACE).
  return <div data-testid="loc" data-nav={useNavigationType()} data-state={JSON.stringify(l.state)}>{l.pathname}{l.search}</div>;
}

/** A path, or a stack of entries with the current one at `index` (a person who came from somewhere else). */
type Entry = string | { pathname: string; search?: string; state?: unknown };
type Start = string | { entries: Entry[]; index: number };

function treeFor(start: Start, mirrorValue?: MirrorContextValue) {
  const entries = typeof start === 'string' ? [start] : start.entries;
  const index = typeof start === 'string' ? 0 : start.index;
  return (
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <ChatProvider>
        {(() => {
          const routes = (
            <Routes>
              <Route path="/home/*" element={<ChatHomePage />} />
              <Route path="*" element={<div>elsewhere</div>} />
            </Routes>
          );
          return mirrorValue ? <MirrorContext.Provider value={mirrorValue}>{routes}</MirrorContext.Provider> : routes;
        })()}
        <Probe />
      </ChatProvider>
    </MemoryRouter>
  );
}

function renderChat(path: Start, chats: ChatSummary[] | (() => Promise<ChatSummary[]>), messagesByConv: Record<string, ChatMessage[]> = {}) {
  if (typeof chats === 'function') svc.getMyChats.mockImplementation(chats);
  else svc.getMyChats.mockResolvedValue(chats);
  svc.listMessages.mockImplementation(async (id: string, opts: { threadRootId?: string } = {}) =>
    (messagesByConv[id] ?? []).filter((m) => (opts.threadRootId ? m.threadRootId === opts.threadRootId : !m.threadRootId)),
  );
  svc.listThread.mockImplementation(async (id: string, rootId: string) =>
    (messagesByConv[id] ?? []).filter((m) => m.id === rootId || m.threadRootId === rootId),
  );
  return render(treeFor(path));
}

const rowFor = (title: string | RegExp) => screen.getByText(title, { selector: '[data-testid="row-title"]' }).closest('li') as HTMLElement;
const logOf = () => within(screen.getByRole('log', { name: 'Messages' }));
const rowButton = (title: string) => within(rowFor(title)).getAllByRole('button')[0] as HTMLElement;
const menuOn = (text: string | RegExp) => fireEvent.contextMenu(screen.getByText(text));

beforeEach(() => {
  vi.clearAllMocks();
  AUTH.user = ME;
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
  svc.getThreadStats.mockResolvedValue(new Map());
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
    expect(mirrorLabel({ title: null, ownerFirstName: 'Mia' })).toBe("Your mirror agent");
    expect(mirrorLabel({ title: 'Scratchpad', ownerFirstName: 'Mia' })).toBe("Scratchpad · Your mirror agent");
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

    fireEvent.click(screen.getByRole('tab', { name: 'Inbox' }));
    expect(titles()).toHaveLength(5);
  });

  it('the folder tabs are at least 40px tall touch targets', async () => {
    renderChat('/home', chats);
    await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
    for (const name of ['Inbox', /^Unread/, 'Partners', 'Channels']) {
      expect(screen.getByRole('tab', { name }).className).toContain('min-h-11'); // 44px
    }
  });

  it('shows the unread count on the Unread tab and on the row, in recency order', async () => {
    renderChat('/home', chats);
    await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
    expect(screen.getByRole('tab', { name: /Unread/ })).toHaveTextContent('1');
    expect(within(rowFor('Ada Lovelace')).getByLabelText('2 unread')).toBeInTheDocument();
    expect(screen.getAllByTestId('row-title')[0]).toHaveTextContent('Ada Lovelace'); // newest activity first
  });

  it('hides a past event channel with no messages', async () => {
    renderChat('/home', [mirror(), eventChat('old', 'Old Night', -48), eventChat('new', 'Next Night', 20)]);
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
    expect(svc.markRead).toHaveBeenCalledWith('dm1', { throughMessageId: 'lm-see you' });
    await waitFor(() => expect(within(rowFor('Ada Lovelace')).queryByLabelText('2 unread')).not.toBeInTheDocument());
  });

  it('says "Message someone from your groups or events" only when there are no chats besides the mirror', async () => {
    const first = renderChat('/home', [mirror()]);
    expect(await screen.findByTestId('no-dm-hint')).toHaveTextContent('Message someone from your groups or events');
    first.unmount();
    const second = renderChat('/home', [mirror(), group('g1', 'Builders')]);
    await screen.findByText('Builders · General', { selector: '[data-testid="row-title"]' });
    expect(screen.queryByTestId('no-dm-hint')).not.toBeInTheDocument();
    second.unmount();
    renderChat('/home', chats);
    await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
    expect(screen.queryByTestId('no-dm-hint')).not.toBeInTheDocument();
  });

  describe('the "+" opens a New message picker', () => {
    const grace = { id: 'p-new', name: 'Grace Hopper', slug: 'grace', avatarUrl: null, avatarColor: null, shared: 'Builders', dmConversationId: null };
    const ada = { id: 'p-dm1', name: 'Ada Lovelace', slug: 'ada', avatarUrl: null, avatarColor: null, shared: 'Clarity Partner', dmConversationId: 'dm1' };
    const open = async () => {
      renderChat('/home', chats);
      await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
      const plus = screen.getByRole('button', { name: 'New message' });
      fireEvent.click(plus);
      return { plus, dialog: await screen.findByRole('dialog', { name: 'New message' }) };
    };

    it('has a visible tooltip "New message" on hover and on keyboard focus, and stays an outline button', async () => {
      const view = renderChat('/home', chats);
      await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
      const plus = screen.getByRole('button', { name: 'New message' });
      expect(plus).not.toHaveAttribute('title');
      const cls = (plus.getAttribute('class') ?? '').split(/\s+/);
      expect(cls).toContain('border');
      expect(cls.filter((c) => /^(bg-|hover:bg-blue|text-white)/.test(c))).toEqual([]);
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      await userEvent.hover(plus);
      expect(await screen.findByRole('tooltip')).toHaveTextContent('New message');
      view.unmount();

      // Keyboard focus shows it too.
      renderChat('/home', chats);
      await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      act(() => screen.getByRole('button', { name: 'New message' }).focus());
      expect(await screen.findByRole('tooltip')).toHaveTextContent('New message');
    });

    it('replaces the invite link: the old "+" link is gone, the picker has the title, a search field and the invite as its last row', async () => {
      svc.searchPeople.mockResolvedValue([ada, grace]);
      const { dialog } = await open();
      expect(screen.queryByRole('link', { name: 'Invite a Clarity Partner' })?.closest('[role="dialog"]')).toBe(dialog);
      expect(within(dialog).getByRole('searchbox', { name: 'Search people' })).toHaveFocus();
      const invite = within(dialog).getByRole('link', { name: 'Invite a Clarity Partner' });
      expect(invite).toHaveAttribute('href', '/agreements/new/create');
      // the last row, after the people
      const people = await within(dialog).findByRole('list', { name: 'People' });
      expect(people.compareDocumentPosition(invite) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('lists the people the server returns for an empty search, each with the reason they are connected', async () => {
      svc.searchPeople.mockResolvedValue([ada, grace]);
      const { dialog } = await open();
      await waitFor(() => expect(svc.searchPeople).toHaveBeenCalledWith(''));
      const list = await within(dialog).findByRole('list', { name: 'People' });
      const rows = within(list).getAllByRole('listitem');
      expect(rows[0]).toHaveTextContent('Ada Lovelace');
      expect(rows[0]).toHaveTextContent('Clarity Partner');
      expect(rows[1]).toHaveTextContent('Grace Hopper');
      expect(rows[1]).toHaveTextContent('Builders');
    });

    it('typing narrows the list through the same search', async () => {
      svc.searchPeople.mockResolvedValue([ada, grace]);
      const { dialog } = await open();
      await within(dialog).findByRole('list', { name: 'People' });
      svc.searchPeople.mockResolvedValue([grace]);
      await userEvent.type(within(dialog).getByRole('searchbox', { name: 'Search people' }), 'gra');
      await waitFor(() => expect(svc.searchPeople).toHaveBeenCalledWith('gra'));
      await waitFor(() => expect(within(within(dialog).getByRole('list', { name: 'People' })).getAllByRole('listitem')).toHaveLength(1));
    });

    it('picking someone with a 1:1 opens it without starting a new one', async () => {
      svc.searchPeople.mockResolvedValue([ada]);
      const { dialog } = await open();
      fireEvent.click(await within(dialog).findByRole('button', { name: /Ada Lovelace/ }));
      await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/home/c/dm1'));
      expect(svc.startDm).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog', { name: 'New message' })).not.toBeInTheDocument();
    });

    it('picking someone new starts a 1:1 and opens it', async () => {
      svc.searchPeople.mockResolvedValue([grace]);
      svc.startDm.mockResolvedValue('dm-new');
      const { dialog } = await open();
      // The server's list has the new chat once it is started.
      svc.getMyChats.mockResolvedValue([...chats, dm('dm-new', 'Grace Hopper')]);
      fireEvent.click(await within(dialog).findByRole('button', { name: /Grace Hopper/ }));
      await waitFor(() => expect(svc.startDm).toHaveBeenCalledWith('p-new'));
      await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/home/c/dm-new'));
      expect(screen.queryByRole('dialog', { name: 'New message' })).not.toBeInTheDocument();
    });

    it('a start that fails says so and keeps the picker open', async () => {
      svc.searchPeople.mockResolvedValue([grace]);
      svc.startDm.mockRejectedValue(new Error('chat start_dm failed: chat: cannot message this person'));
      const { dialog } = await open();
      fireEvent.click(await within(dialog).findByRole('button', { name: /Grace Hopper/ }));
      await waitFor(() => expect(toastFn.error).toHaveBeenCalledWith('You cannot message this person.'));
      expect(screen.getByRole('dialog', { name: 'New message' })).toBeInTheDocument();
    });

    it('with no connections it says so briefly and still offers the invite', async () => {
      svc.searchPeople.mockResolvedValue([]);
      const { dialog } = await open();
      expect(await within(dialog).findByTestId('new-message-empty')).toHaveTextContent('No one to message yet');
      expect(within(dialog).getByRole('link', { name: 'Invite a Clarity Partner' })).toBeInTheDocument();
    });

    it('a search that fails offers Retry, which reads again', async () => {
      svc.searchPeople.mockRejectedValueOnce(new Error('network'));
      const { dialog } = await open();
      svc.searchPeople.mockResolvedValue([grace]);
      fireEvent.click(await within(dialog).findByRole('button', { name: 'Retry' }));
      expect(await within(dialog).findByRole('button', { name: /Grace Hopper/ })).toBeInTheDocument();
    });

    it('Escape closes it and gives focus back to the "+"', async () => {
      svc.searchPeople.mockResolvedValue([ada]);
      const { plus } = await open();
      fireEvent.keyDown(screen.getByRole('dialog', { name: 'New message' }), { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New message' })).not.toBeInTheDocument());
      await waitFor(() => expect(plus).toHaveFocus());
    });

    it('after picking someone, focus stays where the new chat put it (the composer), not back on the "+"', async () => {
      svc.searchPeople.mockResolvedValue([ada]);
      const { plus, dialog } = await open();
      fireEvent.click(await within(dialog).findByRole('button', { name: /Ada Lovelace/ }));
      await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/home/c/dm1'));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New message' })).not.toBeInTheDocument());
      await screen.findByRole('textbox', { name: 'Message Ada' });
      await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
      expect(plus).not.toHaveFocus();
    });

    it('a pick still pending when the dialog is dismissed does not navigate afterwards', async () => {
      svc.searchPeople.mockResolvedValue([grace]);
      let resolve!: (id: string) => void;
      svc.startDm.mockImplementation(() => new Promise<string>((r) => { resolve = r; }));
      const { dialog } = await open();
      fireEvent.click(await within(dialog).findByRole('button', { name: /Grace Hopper/ }));
      await waitFor(() => expect(svc.startDm).toHaveBeenCalled());
      fireEvent.keyDown(dialog, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New message' })).not.toBeInTheDocument());
      await act(async () => { resolve('dm-late'); await new Promise((r) => setTimeout(r, 50)); });
      expect(screen.getByTestId('loc')).toHaveTextContent(/^\/home$/);
    });

    it('the Close control sits in the header row with the title: ghost, 40px, one control (like the Me sheet)', async () => {
      svc.searchPeople.mockResolvedValue([ada]);
      const { dialog } = await open();
      const close = within(dialog).getByRole('button', { name: 'Close' });
      expect(within(dialog).getAllByRole('button', { name: 'Close' })).toHaveLength(1);
      const title = within(dialog).getByText('New message', { selector: 'h2' });
      const header = title.parentElement as HTMLElement;
      expect(header.contains(close)).toBe(true);
      const row = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/);
      expect(row(header)).toContain('items-center');
      expect(row(close)).not.toContain('absolute');
      expect(row(close)).toEqual(expect.arrayContaining(['h-10', 'w-10', 'rounded-full', 'hover:bg-accent']));
      // Ghost: no fill until hover.
      expect(row(close).filter((c) => /^bg-/.test(c))).toEqual([]);
      fireEvent.click(close);
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New message' })).not.toBeInTheDocument());
    });

    describe('typing while a request is in flight', () => {
      const deferred = () => {
        let resolve!: (v: unknown) => void;
        let reject!: (e: unknown) => void;
        const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
        return { promise, resolve, reject };
      };
      const carol = { id: 'p-car', name: 'Carol Danvers', slug: 'carol', avatarUrl: null, avatarColor: null, shared: 'Builders', dmConversationId: null };
      const typeCar = async (dialog: HTMLElement) => {
        fireEvent.change(within(dialog).getByRole('searchbox', { name: 'Search people' }), { target: { value: 'car' } });
        await waitFor(() => expect(svc.searchPeople).toHaveBeenCalledWith('car'));
      };
      const names = (dialog: HTMLElement) => within(within(dialog).getByRole('list', { name: 'People' })).getAllByRole('listitem').map((li) => li.textContent);

      it.each([
        ['the typed query answers first, then the initial one', ['car', 'initial']],
        ['the initial one answers first, then the typed query', ['initial', 'car']],
      ])('%s: the list ends on the typed query\'s people, never stuck on Loading', async (_name, order) => {
        const initial = deferred();
        const typed = deferred();
        svc.searchPeople.mockImplementation((q: string) => (q === '' ? initial.promise : typed.promise));
        const { dialog } = await open();
        await waitFor(() => expect(svc.searchPeople).toHaveBeenCalledWith(''));
        await typeCar(dialog);
        for (const which of order) {
          await act(async () => {
            if (which === 'initial') initial.resolve([ada, grace, carol]);
            else typed.resolve([carol]);
          });
        }
        await waitFor(() => expect(names(dialog)).toHaveLength(1));
        expect(names(dialog)[0]).toContain('Carol Danvers');
        expect(within(dialog).queryByRole('status')).toBeNull();
      });

      it('an initial request that never resolves does not block the typed query', async () => {
        svc.searchPeople.mockImplementation((q: string) => (q === '' ? new Promise(() => undefined) : Promise.resolve([carol])));
        const { dialog } = await open();
        await typeCar(dialog);
        await waitFor(() => expect(names(dialog)).toEqual([expect.stringContaining('Carol Danvers')]));
        expect(within(dialog).queryByRole('status')).toBeNull();
      });

      it('a typed query that never resolves ends in an error with Retry, not Loading forever', async () => {
        vi.useFakeTimers();
        try {
          svc.searchPeople.mockImplementation(() => new Promise(() => undefined));
          renderChat('/home', chats);
          await act(async () => { await vi.advanceTimersByTimeAsync(50); });
          fireEvent.click(screen.getByRole('button', { name: 'New message' }));
          const dialog = screen.getByRole('dialog', { name: 'New message' });
          fireEvent.change(within(dialog).getByRole('searchbox', { name: 'Search people' }), { target: { value: 'car' } });
          await act(async () => { await vi.advanceTimersByTimeAsync(400); });
          expect(within(dialog).getByRole('status')).toHaveTextContent('Loading');
          await act(async () => { await vi.advanceTimersByTimeAsync(PICKER_TIMEOUT_MS + 100); });
          expect(within(dialog).queryByRole('status')).toBeNull();
          expect(within(dialog).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
        } finally {
          vi.useRealTimers();
        }
      });

      it('after a failed read, typing does not flash Loading on each keystroke before the pause ends', async () => {
        svc.searchPeople.mockRejectedValueOnce(new Error('network'));
        const { dialog } = await open();
        await within(dialog).findByRole('button', { name: 'Retry' });
        const field = within(dialog).getByRole('searchbox', { name: 'Search people' });
        fireEvent.change(field, { target: { value: 'c' } });
        fireEvent.change(field, { target: { value: 'ca' } });
        // Still inside the debounce: the error stays, nothing flashes to Loading.
        expect(within(dialog).queryByRole('status')).toBeNull();
        expect(within(dialog).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
        svc.searchPeople.mockResolvedValue([carol]);
        await waitFor(() => expect(names(dialog)).toHaveLength(1));
      });
    });

    it('rows that share a display name show their handle; rows with a unique name do not', async () => {
      const ben = (id: string, slug: string | null) => ({ id, name: 'Ben', slug, avatarUrl: null, avatarColor: null, shared: 'Builders', dmConversationId: null });
      svc.searchPeople.mockResolvedValue([ada, ben('p-b1', 'ben-one'), ben('p-b2', 'ben-two'), { ...grace, name: 'ben' }]);
      const { dialog } = await open();
      const list = await within(dialog).findByRole('list', { name: 'People' });
      const rows = within(list).getAllByRole('listitem');
      // Ben, Ben and ben (case differs, same name) are all ambiguous; Ada is not.
      expect(rows[0]).not.toHaveTextContent('@');
      expect(rows[1]).toHaveTextContent('Builders · @ben-one');
      expect(rows[2]).toHaveTextContent('Builders · @ben-two');
      expect(rows[3]).toHaveTextContent('Builders · @grace');
    });

    it('a duplicate name without a handle keeps its reason alone', async () => {
      const twin = (id: string) => ({ id, name: 'Sam Twin', slug: null, avatarUrl: null, avatarColor: null, shared: 'Friday Night', dmConversationId: null });
      svc.searchPeople.mockResolvedValue([twin('t1'), twin('t2')]);
      const { dialog } = await open();
      const rows = within(await within(dialog).findByRole('list', { name: 'People' })).getAllByRole('listitem');
      for (const row of rows) {
        expect(row).toHaveTextContent('Friday Night');
        expect(row.textContent).not.toContain('@');
      }
    });

    describe('picking someone', () => {
      it('whose 1:1 exists but is not in the local list yet (made on another device) reads the list again, then opens it', async () => {
        svc.searchPeople.mockResolvedValue([{ ...ada, dmConversationId: 'dm-remote' }]);
        const { dialog } = await open();
        svc.getMyChats.mockResolvedValue([...chats, dm('dm-remote', 'Ada Lovelace')]);
        const before = svc.getMyChats.mock.calls.length;
        fireEvent.click(await within(dialog).findByRole('button', { name: /Ada Lovelace/ }));
        await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/home/c/dm-remote'));
        expect(svc.getMyChats.mock.calls.length).toBeGreaterThan(before);
        expect(screen.queryByTestId('chat-unavailable')).not.toBeInTheDocument();
        expect(await screen.findByTestId('conversation')).toBeInTheDocument();
      });

      it('a re-read of the list that fails says so and keeps the picker open', async () => {
        svc.searchPeople.mockResolvedValue([{ ...ada, dmConversationId: 'dm-remote' }]);
        const { dialog } = await open();
        svc.getMyChats.mockRejectedValue(new Error('network'));
        fireEvent.click(await within(dialog).findByRole('button', { name: /Ada Lovelace/ }));
        await waitFor(() => expect(toastFn.error).toHaveBeenCalled());
        expect(screen.getByTestId('loc')).toHaveTextContent(/^\/home$/);
        expect(screen.getByRole('dialog', { name: 'New message' })).toBeInTheDocument();
      });

      it('a re-read that still lacks the chat says so instead of opening a chat that is not there', async () => {
        svc.searchPeople.mockResolvedValue([{ ...ada, dmConversationId: 'dm-ghost' }]);
        const { dialog } = await open();
        fireEvent.click(await within(dialog).findByRole('button', { name: /Ada Lovelace/ }));
        await waitFor(() => expect(toastFn.error).toHaveBeenCalled());
        expect(screen.getByTestId('loc')).toHaveTextContent(/^\/home$/);
      });

      it('the person whose chat is already open: focus goes to that chat\'s composer, not the page body', async () => {
        svc.searchPeople.mockResolvedValue([ada]);
        renderChat('/home/c/dm1', chats, { dm1: [] });
        await screen.findByRole('textbox', { name: 'Message Ada' });
        fireEvent.click(screen.getByRole('button', { name: 'New message' }));
        const dialog = await screen.findByRole('dialog', { name: 'New message' });
        fireEvent.click(await within(dialog).findByRole('button', { name: /Ada Lovelace/ }));
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New message' })).not.toBeInTheDocument());
        await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
        expect(screen.getByRole('textbox', { name: 'Message Ada' })).toHaveFocus();
      });

      it('another existing chat: its composer takes focus once it is open', async () => {
        svc.searchPeople.mockResolvedValue([ada]);
        const { dialog } = await open();
        fireEvent.click(await within(dialog).findByRole('button', { name: /Ada Lovelace/ }));
        await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/home/c/dm1'));
        const composer = await screen.findByRole('textbox', { name: 'Message Ada' });
        await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
        expect(composer).toHaveFocus();
      });
    });

    it('the phone sheet keeps clear of the notch and the home bar (safe areas), and only on a phone', async () => {
      svc.searchPeople.mockResolvedValue([ada]);
      const { dialog } = await open();
      const cls = (dialog.getAttribute('class') ?? '').split(/\s+/);
      expect(cls).toEqual(expect.arrayContaining(['pt-[env(safe-area-inset-top)]', 'pb-[env(safe-area-inset-bottom)]', 'sm:pt-0', 'sm:pb-0']));
    });

    it('while a new query is on its way over a list already showing, a subtle "Searching" indicator shows; it goes when the list is current', async () => {
      let resolve!: (v: unknown) => void;
      svc.searchPeople.mockImplementation((q: string) => (q === '' ? Promise.resolve([ada, grace]) : new Promise((r) => { resolve = r; })));
      const { dialog } = await open();
      await within(dialog).findByRole('list', { name: 'People' });
      expect(within(dialog).queryByRole('status')).toBeNull();
      fireEvent.change(within(dialog).getByRole('searchbox', { name: 'Search people' }), { target: { value: 'gr' } });
      expect(within(dialog).getByRole('status', { name: 'Searching' })).toBeInTheDocument();
      // the old list stays while it waits
      expect(within(dialog).getByRole('list', { name: 'People' })).toBeInTheDocument();
      await waitFor(() => expect(svc.searchPeople).toHaveBeenCalledWith('gr'));
      expect(within(dialog).getByRole('status', { name: 'Searching' })).toBeInTheDocument();
      await act(async () => resolve([grace]));
      await waitFor(() => expect(within(dialog).queryByRole('status')).toBeNull());
      expect(within(within(dialog).getByRole('list', { name: 'People' })).getAllByRole('listitem')).toHaveLength(1);
    });

    it('Retry reads at once: it does not wait out the typing pause', async () => {
      svc.searchPeople.mockRejectedValue(new Error('network'));
      const { dialog } = await open();
      await within(dialog).findByRole('button', { name: 'Retry' });
      fireEvent.change(within(dialog).getByRole('searchbox', { name: 'Search people' }), { target: { value: 'car' } });
      await waitFor(() => expect(svc.searchPeople).toHaveBeenCalledWith('car'));
      await within(dialog).findByRole('button', { name: 'Retry' });
      const calls = () => svc.searchPeople.mock.calls.filter((c) => c[0] === 'car').length;
      const before = calls();
      svc.searchPeople.mockResolvedValue([grace]);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(calls()).toBe(before + 1), { timeout: 120 });
    });

    it('is a full-height sheet on a phone and a dialog from sm up', async () => {
      svc.searchPeople.mockResolvedValue([ada]);
      const { dialog } = await open();
      const cls = (dialog.getAttribute('class') ?? '').split(/\s+/);
      expect(cls).toContain('h-[100dvh]');
      expect(cls).toContain('w-full');
      expect(cls).toContain('sm:max-w-md');
      expect(cls.some((c) => c.startsWith('sm:h-'))).toBe(true);
    });
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

  it('says "Unknown member" once the lookup finds no profile for an author', async () => {
    helpers.getChatAuthors.mockResolvedValue([]);
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [msg('dm1', 'p-ghost', 'from someone unreadable')] });
    expect(await screen.findByText('from someone unreadable')).toBeInTheDocument();
    expect(await screen.findByText('Unknown member', { selector: 'span' })).toBeInTheDocument();
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
    await waitFor(() => expect(svc.markRead).toHaveBeenCalledWith('dm1', { throughMessageId: 'lm-hey' }));
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
    expect(svc.sendMessage).toHaveBeenCalledWith({ conversationId: 'dm1', threadRootId: undefined, body: 'hello Ada', replyToId: undefined, attachment: undefined, clientId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/) });
    await act(async () => resolve(msg('dm1', ME.id, 'hello Ada', { id: 'server-1' })));
    await waitFor(() => expect(screen.queryByText('Sending…')).not.toBeInTheDocument());
    expect(logOf().getAllByText('hello Ada')).toHaveLength(1);
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
    expect(logOf().getAllByText('will fail')).toHaveLength(1);
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

  it('offers a thread in a channel, with the reply count, and opens the panel from the route (P1546: and in a 1:1)', async () => {
    const root = msg('g1', 'p-grace', 'start a thread here', { id: 'root' });
    const reply = msg('g1', ME.id, 'a reply in the thread', { id: 'rep', threadRootId: 'root' });
    svc.getThreadStats.mockResolvedValue(new Map([['root', { count: 1, authorIds: [ME.id] }]]));
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

    // P1546: a 1:1 has threads too: the thread URL opens (and reopens on reload) the thread, and the action is offered
    const dmRoot = msg('dm1', 'p-dm1', 'plain dm message', { id: 'x' });
    const dmReply = msg('dm1', ME.id, 'a reply in the dm thread', { id: 'dmrep', threadRootId: 'x' });
    renderChat('/home/c/dm1/t/x', [mirror(), dm('dm1', 'Ada Lovelace')], { dm1: [dmRoot, dmReply] });
    const dmPanel = await screen.findByTestId('thread-panel');
    expect(await within(dmPanel).findByText('a reply in the dm thread')).toBeInTheDocument();
    expect(screen.getByTestId('loc')).toHaveTextContent('/home/c/dm1/t/x');
    fireEvent.contextMenu(within(screen.getByTestId('conversation')).getByText('plain dm message'));
    expect(await screen.findByRole('menuitem', { name: 'Reply in thread' })).toBeInTheDocument();
  });

  it('P1546: a reloaded mirror thread asks for the status of its own unanswered questions', async () => {
    const loadStatuses = vi.fn();
    const value = {
      enabled: true, profile: null, portraitStatus: 'idle', statusFor: () => undefined, requestReply: vi.fn(), loadStatuses,
      ask: vi.fn(), newFace: vi.fn(), ensurePortrait: vi.fn(), setGender: vi.fn(),
    } as unknown as MirrorContextValue;
    const m = mirror();
    const root = msg(m.conversationId, ME.id, 'mirror thread root', { id: 'mroot' });
    const answered = msg(m.conversationId, ME.id, 'answered in thread', { id: 'mq1', threadRootId: 'mroot' });
    const answer = msg(m.conversationId, null as unknown as string, 'the answer', { id: 'ma1', threadRootId: 'mroot', kind: 'agent', replyToId: 'mq1' });
    const waiting = msg(m.conversationId, ME.id, 'still waiting in thread', { id: 'mq2', threadRootId: 'mroot' });
    svc.getMyChats.mockResolvedValue([m]);
    svc.listMessages.mockImplementation(async (_id: string, opts: { threadRootId?: string } = {}) => (opts.threadRootId ? [answered, answer, waiting] : [root]));
    svc.listThread.mockImplementation(async () => [root, answered, answer, waiting]);
    render(treeFor(`/home/c/${m.conversationId}/t/mroot`, value));
    const panel = await screen.findByTestId('thread-panel');
    expect(await within(panel).findByText('still waiting in thread')).toBeInTheDocument();
    await waitFor(() => expect(loadStatuses.mock.calls.some(([ids]) => (ids as string[]).includes('mq2'))).toBe(true));
    // the answered question is not asked about
    expect(loadStatuses.mock.calls.every(([ids]) => !(ids as string[]).includes('mq1'))).toBe(true);
  });

  it('P1546: mirror availability that resolves after the thread loaded still restores its status', async () => {
    const loadStatuses = vi.fn();
    const base = {
      profile: null, portraitStatus: 'idle', statusFor: () => undefined, requestReply: vi.fn(), loadStatuses,
      ask: vi.fn(), newFace: vi.fn(), ensurePortrait: vi.fn(), setGender: vi.fn(),
    };
    const m = mirror();
    const root = msg(m.conversationId, ME.id, 'late root', { id: 'lroot' });
    const waiting = msg(m.conversationId, ME.id, 'late waiting', { id: 'lq', threadRootId: 'lroot' });
    svc.getMyChats.mockResolvedValue([m]);
    svc.listMessages.mockImplementation(async (_id: string, opts: { threadRootId?: string } = {}) => (opts.threadRootId ? [waiting] : [root]));
    svc.listThread.mockImplementation(async () => [root, waiting]);
    const path = `/home/c/${m.conversationId}/t/lroot`;
    const { rerender } = render(treeFor(path, { ...base, enabled: false } as unknown as MirrorContextValue));
    expect(await within(await screen.findByTestId('thread-panel')).findByText('late waiting')).toBeInTheDocument();
    expect(loadStatuses, 'nothing is asked while the mirror is not yet available').not.toHaveBeenCalled();
    rerender(treeFor(path, { ...base, enabled: true } as unknown as MirrorContextValue));
    await waitFor(() => expect(loadStatuses.mock.calls.some(([ids]) => (ids as string[]).includes('lq'))).toBe(true));
  });

  it('keeps the conversation loaded and in place when its thread opens', async () => {
    const root = msg('g1', 'p-grace', 'main pane message', { id: 'root2' });
    const reply = msg('g1', ME.id, 'thread pane reply', { id: 'rep2', threadRootId: 'root2' });
    svc.getThreadStats.mockResolvedValue(new Map([['root2', { count: 1, authorIds: [ME.id] }]]));
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
    expect(toolbar()).toHaveClass('inline-flex', 'flex-nowrap');
    expect(toolbar()).not.toHaveClass('absolute');
    expect(within(toolbar()).getByRole('button', { name: 'Forward' })).toBeInTheDocument(); // icon-only, so the row can never wrap
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
    await waitFor(() => expect(svc.forwardMessage).toHaveBeenCalledWith('fw1', 'g1', 'see this', expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)));
    expect(toastFn).toHaveBeenCalledWith('Forwarded', expect.objectContaining({ action: expect.objectContaining({ label: 'Open' }) }));
  });

  it('clarify: opens the mirror with the message staged and the composer focused, sending nothing until Send; the mirror itself has no Clarify', async () => {
    const theirs = msg('dm1', 'p-dm1', 'clarify this', { id: 'cl1' });
    svc.clarifyMessage.mockResolvedValue(msg('c-mirror', ME.id, null, { id: 'cl2', kind: 'clarify' }));
    svc.sendMessage.mockResolvedValue(msg('c-mirror', ME.id, 'because it is vague', { id: 'cl3' }));
    const { unmount } = renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [theirs], 'c-mirror': [] });
    await screen.findByText('clarify this');
    menuOn('clarify this');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Clarify' }));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/home/c/c-mirror'));
    const pending = await screen.findByTestId('clarify-pending');
    expect(pending).toHaveTextContent('Clarify');
    expect(pending).toHaveTextContent('clarify this');
    expect(svc.clarifyMessage).not.toHaveBeenCalled();
    expect(toastFn).not.toHaveBeenCalled();
    expect(await screen.findByRole('textbox', { name: 'Write to your mirror agent' })).toHaveFocus();
    // Cancel (x): nothing is posted, and the staged message is gone.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel clarify' }));
    expect(screen.queryByTestId('clarify-pending')).not.toBeInTheDocument();
    expect(svc.clarifyMessage).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
    unmount();

    // Stage again, add a note, send: ONE clarify message carrying the note.
    const again = renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [theirs], 'c-mirror': [] });
    await screen.findByText('clarify this');
    menuOn('clarify this');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Clarify' }));
    await screen.findByTestId('clarify-pending');
    fireEvent.change(screen.getByRole('textbox', { name: 'Write to your mirror agent' }), { target: { value: 'because it is vague' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(svc.clarifyMessage).toHaveBeenCalledTimes(1));
    // ONE message: the copy carries the note; no second message is sent.
    expect(svc.clarifyMessage).toHaveBeenCalledWith('cl1', 'because it is vague');
    await waitFor(() => expect(screen.queryByTestId('clarify-pending')).not.toBeInTheDocument());
    expect(svc.sendMessage).not.toHaveBeenCalled();
    expect(screen.queryByTestId('clarify-pending')).not.toBeInTheDocument();
    again.unmount();

    const own = msg('c-mirror', ME.id, 'a note to self', { id: 'n1' });
    renderChat('/home/c/c-mirror', [mirror(), dmChat], { 'c-mirror': [own] });
    await screen.findByText('a note to self');
    menuOn('a note to self');
    expect(await screen.findByRole('menuitem', { name: 'Reply' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Clarify' })).not.toBeInTheDocument();
  });

  it('renders forwarded and clarified cards with their snapshot, the thread, and a tap-to-jump block that checks access when pressed', async () => {
    const snap = (body: string, thread: Array<{ authorName: string; body: string | null; createdAt: string }> = []) => ({ authorName: 'Grace Hopper', body, createdAt: iso(30), conversationKind: 'group' as const, conversationTitle: null, thread });
    const fwd = msg('dm1', 'p-dm1', 'note on top', { id: 'f1', kind: 'forward', forwardSnapshot: snap('forwarded words'), forwardedFromMessageId: 'src-ok' });
    const cla = msg('dm1', ME.id, null, { id: 'f2', kind: 'clarify', forwardSnapshot: snap('clarified words', [{ authorName: 'Linus', body: 'a thread entry', createdAt: iso(20) }]), forwardedFromMessageId: 'src-gone' });
    svc.getMessage.mockImplementation(async (id: string) => (id === 'src-ok' ? msg('g1', 'p-grace', 'original', { id: 'src-ok' }) : null));
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [fwd, cla] });
    const forwarded = await screen.findByTestId('forwarded-card');
    expect(forwarded).toHaveTextContent('Forwarded from Grace Hopper');
    expect(forwarded).toHaveTextContent('forwarded words');
    expect(screen.getByText('note on top')).toBeInTheDocument();
    const clarified = screen.getByTestId('clarified-card');
    expect(within(clarified).getByTestId('forwarded-label')).toHaveTextContent("Sent to your mirror agent to clarify · from a group chat");
    expect(within(clarified).getByTestId('clarified-author')).toHaveTextContent('Grace Hopper');
    expect(clarified).not.toHaveTextContent('Clarified from');
    expect(clarified).toHaveTextContent('a thread entry');
    // The source is read when the button is pressed, not when the card is drawn.
    expect(svc.getMessage).not.toHaveBeenCalledWith('src-ok');
    expect(svc.getMessage).not.toHaveBeenCalledWith('src-gone');
    // A source this reader can no longer read: a quiet note, and nowhere to go.
    fireEvent.click(clarified);
    await waitFor(() => expect(toastFn).toHaveBeenCalledWith("The original isn't available to you any more."));
    expect(screen.getByTestId('loc')).toHaveTextContent(/^\/home\/c\/dm1$/);
    fireEvent.click(forwarded);
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/home/c/g1?m=src-ok'));
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
    helpers.loadMyShareables.mockResolvedValue([{ kind: 'point', id: 'pt-1', title: 'Clarity beats cleverness', tags: ['clarity'], point: { id: 'pt-1', statement: 'Clarity beats cleverness' } }]);
    svc.sendMessage.mockResolvedValue(msg('dm1', ME.id, null, { id: 'sent-at', attachmentKind: 'point', attachmentId: 'pt-1' }));
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [] });
    fireEvent.click(await screen.findByRole('button', { name: 'Attach a point or story' }));
    fireEvent.click(await screen.findByRole('button', { name: /Attach Clarity beats cleverness/ }));
    expect(await within(await screen.findByTestId('staged-attachment')).findByTestId('point-card')).toHaveTextContent('Clarity beats cleverness');
    // The card is inert, so the attachment is named outside it for screen readers, and in the Remove button.
    expect(within(screen.getByTestId('staged-attachment')).getByText('Attached point: Clarity beats cleverness')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove attachment: Clarity beats cleverness' })).toBeInTheDocument();
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

  it('P1554 AC5: the mirror greets first, with one "Give me a name" button that opens rename, and the greeting stays', async () => {
    renderChat('/home/c/c-mirror', [mirror('c-mirror'), dmChat], { 'c-mirror': [msg('c-mirror', ME.id, 'my first line', { id: 'mfirst' })] });
    const welcome = await screen.findByTestId('mirror-welcome');
    expect(welcome).toHaveTextContent("Hi, I'm your mirror agent. Want to give me a name? Or just tell me what's on your mind.");
    expect(welcome).not.toHaveTextContent(/Clarify|quietly/);
    // the greeting is still there, above the person's first message
    expect(welcome.compareDocumentPosition(await screen.findByText('my first line')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(welcome).getAllByRole('button')).toHaveLength(1);
    await userEvent.click(within(welcome).getByRole('button', { name: 'Give me a name' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent(/Its role/);
  });

  it('P1554: a named mirror greets by its name and has no naming button', async () => {
    renderChat('/home/c/c-mirror', [mirror('c-mirror', { title: 'Scratchpad' }), dmChat], { 'c-mirror': [] });
    const welcome = await screen.findByTestId('mirror-welcome');
    expect(welcome).toHaveTextContent("Hi, I'm Scratchpad, your mirror agent. Tell me what's on your mind.");
    expect(within(welcome).queryAllByRole('button')).toHaveLength(0);
  });

  it('P1554: while the first portrait is painting, the greeting says so and the avatar pulses', async () => {
    const value = {
      enabled: true, profile: null, portraitStatus: 'painting', statusFor: () => undefined, requestReply: vi.fn(), loadStatuses: vi.fn(),
      ask: vi.fn(), newFace: vi.fn(), ensurePortrait: vi.fn(), setGender: vi.fn(),
    } as unknown as MirrorContextValue;
    svc.getMyChats.mockResolvedValue([mirror('c-mirror')]);
    svc.listMessages.mockResolvedValue([]);
    render(treeFor('/home/c/c-mirror', value));
    const welcome = await screen.findByTestId('mirror-welcome');
    expect(within(welcome).getByRole('status')).toHaveTextContent('Painting my portrait…');
    expect(within(welcome).getByTestId('mirror-disc')).toHaveAttribute('data-painting', 'true');
  });

  it('P1554: a window resized while scrolled up re-decides the jump-down button without a scroll (review fix)', async () => {
    const callbacks: (() => void)[] = [];
    const before = globalThis.ResizeObserver;
    vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { callbacks.push(cb); } observe() {} unobserve() {} disconnect() {} });
    try {
      renderChat('/home/c/dm1', [dmChat], { dm1: [msg('dm1', ME.id, 'only line', { id: 'j2' })] });
      await screen.findByText('only line');
      const scroller = screen.getByTestId('message-scroller');
      Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 3000 });
      Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 500 });
      scroller.scrollTop = 2300; // 200px up of a 500px window: no button
      fireEvent.scroll(scroller);
      expect(screen.queryByTestId('jump-down')).toBeNull();
      Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 200 }); // the window shrinks
      scroller.scrollTop = 2300;
      act(() => callbacks.forEach((cb) => cb()));
      expect(await screen.findByTestId('jump-down')).toBeInTheDocument();
    } finally {
      vi.stubGlobal('ResizeObserver', before);
    }
  });

  it('P1554: the jump-down button shows half a screen up from the bottom and takes the reader to the newest message', async () => {
    renderChat('/home/c/dm1', [dmChat], { dm1: [msg('dm1', ME.id, 'only line', { id: 'j1' })] });
    await screen.findByText('only line');
    const scroller = screen.getByTestId('message-scroller');
    expect(screen.queryByTestId('jump-down')).toBeNull();
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 3000 });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 500 });
    scroller.scrollTop = 2200; // 300px up: more than half a screen
    fireEvent.scroll(scroller);
    const jump = await screen.findByRole('button', { name: 'Jump to the newest message' });
    fireEvent.click(jump);
    expect(scroller.scrollTop).toBe(3000);
    expect(screen.queryByTestId('jump-down')).toBeNull();
    scroller.scrollTop = 2300; // 200px up: less than half a screen, no button
    fireEvent.scroll(scroller);
    expect(screen.queryByTestId('jump-down')).toBeNull();
  });

  it('names the mirror "<title> · <First>\'s mirror" in the header and the list, and Rename persists', async () => {
    svc.renameMirror.mockResolvedValue('Scratchpad');
    renderChat('/home/c/c-mirror', [mirror('c-mirror', { title: 'Scratchpad' }), dmChat], { 'c-mirror': [] });
    expect(await screen.findByRole('heading', { name: "Scratchpad · Your mirror agent" })).toBeInTheDocument();
    // in the list the name has the first line and the role leads the second
    expect(screen.getAllByTestId('row-title').map((n) => n.textContent)).toContain('Scratchpad');
    expect(screen.getByTestId('row-role')).toHaveTextContent("Your mirror agent ·");
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /^About / }));
    await userEvent.click(within(await screen.findByTestId('mirror-info')).getByRole('button', { name: 'Rename' }));
    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByLabelText(/^Name/);
    expect(field).toHaveValue('Scratchpad');
    fireEvent.change(field, { target: { value: '' } });
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled(); // 1 to 60 characters
    fireEvent.change(field, { target: { value: 'Thinking out loud' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(svc.renameMirror).toHaveBeenCalledWith('Thinking out loud'));
  });

  it('leaves the chat when it is marked unread from the header menu, and sets the flag', async () => {
    const theirs = msg('dm1', 'p-dm1', 'read later', { id: 'ml' });
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [theirs] });
    await screen.findByText('read later');
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
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
    expect(await logOf().findByText('live from Realtime')).toBeInTheDocument();
    act(() => handlers?.onMessage({ type: 'INSERT', message: incoming })); // the same event twice
    expect(logOf().getAllByText('live from Realtime')).toHaveLength(1);
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
    const sentWith = (svc.sendMessage.mock.calls[0]![0] as { clientId: string }).clientId;
    const confirmed = msg('dm1', ME.id, 'race me', { id: 'rt-3', createdAt: new Date().toISOString(), clientId: sentWith });
    act(() => handlers?.onMessage({ type: 'INSERT', message: confirmed }));
    await waitFor(() => expect(screen.queryByText('Sending…')).not.toBeInTheDocument());
    expect(logOf().getAllByText('race me')).toHaveLength(1);
    await act(async () => resolve(confirmed));
    expect(logOf().getAllByText('race me')).toHaveLength(1);
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
// Review round 2: regressions that failed before the fix
// ---------------------------------------------------------------------------
describe('review round 2', () => {
  const dmChat = dm('dm1', 'Ada Lovelace');
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const cursorTime = (before: unknown) =>
    typeof before === 'string' ? Date.parse(before) : before && typeof before === 'object' ? Date.parse((before as { createdAt: string }).createdAt) : Infinity;

  it('mark read: the chat is marked read ONCE, through the newest message, even when created_at has microseconds', async () => {
    const MICRO = new Date(NOW - 60_000).toISOString().replace('Z', '123+00:00'); // .xxx123: a JS Date cannot say this
    let readThrough = false;
    svc.markRead.mockImplementation(async (_id: string, opts?: { throughMessageId?: string }) => {
      // A client-clock Date lands on the millisecond, before the microsecond timestamp: still unread.
      if (opts && !(opts instanceof Date) && opts.throughMessageId) readThrough = true;
    });
    renderChat(
      '/home/c/dm1',
      async () => [
        mirror(),
        dm('dm1', 'Ada Lovelace', { unreadCount: readThrough ? 0 : 1, lastMessage: { ...last('hey', 1, 'p-dm1', 'Ada'), id: 'lm-newest', createdAt: MICRO } }),
      ],
      { dm1: [msg('dm1', 'p-dm1', 'hey', { id: 'lm-newest', createdAt: MICRO })] },
    );
    await screen.findByText('hey');
    await waitFor(() => expect(svc.markRead).toHaveBeenCalled());
    for (let i = 0; i < 3; i++) {
      act(() => handlers?.onSubscribed?.());
      await sleep(450);
    }
    expect(svc.markRead).toHaveBeenCalledTimes(1);
    expect(svc.markRead).toHaveBeenCalledWith('dm1', { throughMessageId: 'lm-newest' });
  });

  it('an UPDATE for a message that is not loaded is not inserted, so "Load earlier" still reaches every older message', async () => {
    const all = Array.from({ length: 60 }, (_, i) => msg('dm1', 'p-dm1', `history ${String(i + 1).padStart(2, '0')}`, { id: `h${i + 1}`, createdAt: new Date(NOW - (3600 - i) * 1000).toISOString() }));
    svc.getMyChats.mockResolvedValue([mirror(), dmChat]);
    svc.listMessages.mockImplementation(async (_id: string, opts: { before?: unknown; limit?: number } = {}) => {
      const older = all.filter((m) => Date.parse(m.createdAt) < cursorTime(opts.before));
      return older.slice(-(opts.limit ?? 50));
    });
    render(
      <MemoryRouter initialEntries={['/home/c/dm1']}>
        <ChatProvider>
          <Routes>
            <Route path="/home/*" element={<ChatHomePage />} />
          </Routes>
        </ChatProvider>
      </MemoryRouter>,
    );
    await screen.findByText('history 60');
    expect(screen.queryByText('history 10')).not.toBeInTheDocument(); // only the newest 50 are loaded
    act(() => handlers?.onMessage({ type: 'UPDATE', message: { ...(all[4] as ChatMessage), body: 'history 05 (edited elsewhere)' } }));
    expect(screen.queryByText(/history 05/)).not.toBeInTheDocument(); // not loaded: not shown
    fireEvent.click(await screen.findByRole('button', { name: 'Load earlier messages' }));
    expect(await screen.findByText('history 10')).toBeInTheDocument(); // the rows between were not skipped
    expect(await screen.findByText('history 01')).toBeInTheDocument();
  });

  it('a fetch that started before a delete cannot bring the deleted words back', async () => {
    const m = msg('dm1', 'p-dm1', 'about to be deleted', { id: 'del1' });
    let release!: () => void;
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [m] });
    await screen.findByText('about to be deleted');
    // the next read (a resync) is slow and returns the row as it was BEFORE the delete
    svc.listMessages.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve([m]); }));
    act(() => handlers?.onSubscribed?.());
    await waitFor(() => expect(release).toBeDefined());
    act(() => handlers?.onMessage({ type: 'UPDATE', message: { ...m, body: null, isDeleted: true, deletedAt: iso(0) } }));
    expect(await screen.findByText('Message deleted', { selector: 'p' })).toBeInTheDocument();
    await act(async () => release());
    await sleep(50);
    expect(screen.queryByText('about to be deleted')).not.toBeInTheDocument();
    expect(screen.getByText('Message deleted', { selector: 'p' })).toBeInTheDocument();
  });

  it('a Realtime event never removes a pending send: when the send then fails, Retry is still there', async () => {
    let reject!: (e: Error) => void;
    svc.sendMessage.mockImplementation(() => new Promise<ChatMessage>((_r, rej) => { reject = rej; }));
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [] });
    await userEvent.type(await screen.findByRole('textbox', { name: 'Message Ada' }), 'ok');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Sending…');
    // the same words arrive from another device of mine: a different message
    act(() => handlers?.onMessage({ type: 'INSERT', message: msg('dm1', ME.id, 'ok', { id: 'other-device' }) }));
    await act(async () => reject(new Error('chat send_chat_message failed: chat: cannot message this person')));
    expect(await screen.findByTestId('send-failed')).toHaveTextContent(/cannot message/i);
    expect(within(screen.getByTestId('send-failed')).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('review round 2 (continued)', () => {
  const dmChat = dm('dm1', 'Ada Lovelace');
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const cursorTime = (before: unknown) =>
    typeof before === 'string' ? Date.parse(before) : before && typeof before === 'object' ? Date.parse((before as { createdAt: string }).createdAt) : Infinity;
  const asDesktop = <T,>(fn: () => Promise<T>) => async () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: q.includes('min-width: 1024px'), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
    try {
      return await fn();
    } finally {
      window.matchMedia = original;
    }
  };

  it('a different signed-in person starts clean: no draft, no failed send, nothing of the previous person', async () => {
    svc.sendMessage.mockRejectedValue(new Error('chat send_chat_message failed: chat: cannot message this person'));
    const view = renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [] });
    const box = await screen.findByRole('textbox', { name: 'Message Ada' });
    await userEvent.type(box, 'failing one');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByTestId('send-failed');
    await userEvent.type(box, 'half-written draft');
    // someone else signs in on this tab
    AUTH.user = { ...ME, id: 'other-user', name: 'Olga Other' };
    svc.getMyChats.mockResolvedValue([mirror('c-olga', { ownerFirstName: 'Olga' }), dmChat]);
    view.rerender(treeFor('/home/c/dm1'));
    expect(await screen.findByRole('textbox', { name: 'Message Ada' })).toHaveValue('');
    expect(screen.queryByTestId('send-failed')).not.toBeInTheDocument();
    expect(screen.queryByText('failing one')).not.toBeInTheDocument();
  });

  it('a thread that does not exist for this person closes itself and returns to the conversation', async () => {
    renderChat('/home/c/g1/t/not-a-thread', [mirror(), group('g1', 'Builders')], { g1: [msg('g1', 'p-grace', 'a channel message', { id: 'cm1' })] });
    svc.listThread.mockImplementation(async () => null);
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent(/^\/home\/c\/g1$/));
    expect(screen.queryByTestId('thread-panel')).not.toBeInTheDocument();
    expect(await screen.findByText('a channel message')).toBeInTheDocument();
  });

  it('a phone showing a thread does not mark the hidden channel read; a desktop showing both does', async () => {
    const chats = async () => [mirror(), group('g1', 'Builders', { unreadCount: 2, lastMessage: last('hi all', 1, 'p-grace', 'Grace Hopper') })];
    const msgs = { g1: [msg('g1', 'p-grace', 'root message', { id: 'root8' }), msg('g1', ME.id, 'a reply', { id: 'rep8', threadRootId: 'root8' })] };
    const { unmount } = renderChat('/home/c/g1/t/root8', chats, msgs);
    await screen.findByTestId('thread-panel');
    await sleep(250);
    expect(svc.markRead).not.toHaveBeenCalled();
    unmount();
    await asDesktop(async () => {
      renderChat('/home/c/g1/t/root8', chats, msgs);
      await screen.findByTestId('thread-panel');
      await waitFor(() => expect(svc.markRead).toHaveBeenCalledWith('g1', { throughMessageId: 'lm-hi all' }));
    })();
  });

  it('a quote follows its source: an edit and a delete show at once, and the same search re-reads after an edit', async () => {
    const orig = msg('dm1', 'p-dm1', 'before the edit', { id: 'src9' });
    const reply = msg('dm1', ME.id, 'my reply', { id: 'rep9', replyToId: 'src9' });
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [orig, reply] });
    await screen.findByText('my reply');
    expect(screen.getByTestId('reply-quote')).toHaveTextContent('before the edit');
    act(() => handlers?.onMessage({ type: 'UPDATE', message: { ...orig, body: 'after the edit', editedAt: iso(0) } }));
    await waitFor(() => expect(screen.getByTestId('reply-quote')).toHaveTextContent('after the edit'));
    act(() => handlers?.onMessage({ type: 'UPDATE', message: { ...orig, body: null, isDeleted: true, deletedAt: iso(0) } }));
    await waitFor(() => expect(screen.getByTestId('reply-quote')).toHaveTextContent('Original message deleted'));
  });

  it('search results are read again when a message is edited or deleted', async () => {
    svc.searchMessages.mockResolvedValue([{ messageId: 'mh', conversationId: 'dm1', authorId: 'p-dm1', authorName: 'Ada Lovelace', body: 'the old words', createdAt: iso(3) }]);
    renderChat('/home', [mirror(), dmChat]);
    await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
    fireEvent.change(screen.getByLabelText('Search chats and people'), { target: { value: 'words' } });
    expect(await screen.findByText('the old words', {}, { timeout: 3000 })).toBeInTheDocument();
    const calls = svc.searchMessages.mock.calls.length;
    svc.searchMessages.mockResolvedValue([]);
    act(() => handlers?.onMessage({ type: 'UPDATE', message: msg('dm1', 'p-dm1', null, { id: 'mh', isDeleted: true, deletedAt: iso(0) }) }));
    await waitFor(() => expect(svc.searchMessages.mock.calls.length).toBeGreaterThan(calls));
    await waitFor(() => expect(screen.queryByText('the old words')).not.toBeInTheDocument());
  });

  it('the forward picker lists only chats that can receive, and checks again when you send', async () => {
    const theirs = msg('dm1', 'p-dm1', 'forward this one', { id: 'fw10' });
    const chats = [mirror(), dmChat, dm('dm2', 'Blocked Bob', { canSend: false }), group('g1', 'Builders')];
    svc.forwardMessage.mockResolvedValue(msg('g1', ME.id, null, { id: 'fwd-ok', kind: 'forward' }));
    renderChat('/home/c/dm1', chats, { dm1: [theirs] });
    await screen.findByText('forward this one');
    menuOn('forward this one');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Forward' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: /Blocked Bob/ })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /Builders/ }));
    // meanwhile that channel closed to this person
    svc.getMyChats.mockResolvedValue([mirror(), dmChat, group('g1', 'Builders', { canSend: false })]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('can no longer send messages in that chat');
    expect(svc.forwardMessage).not.toHaveBeenCalled();
  });

  it('a thread whose first message was deleted takes no new replies and says why', async () => {
    const root = msg('g1', 'p-grace', null, { id: 'root11', isDeleted: true, deletedAt: iso(2) });
    renderChat('/home/c/g1/t/root11', [mirror(), group('g1', 'Builders')], { g1: [root, msg('g1', ME.id, 'an old reply', { threadRootId: 'root11' })] });
    const note = await screen.findByTestId('thread-composer-blocked');
    expect(note).toHaveTextContent("The first message of this thread was deleted, so it can't take new replies.");
    expect(screen.queryByRole('textbox', { name: 'Reply in thread' })).not.toBeInTheDocument();
  });

  it('a failed send survives switching to another chat and back, and still offers Retry', async () => {
    svc.sendMessage.mockRejectedValueOnce(new Error('chat send_chat_message failed: chat: cannot message this person'));
    renderChat('/home/c/dm1', [mirror(), dmChat, dm('dm2', 'Linus Torvalds')], { dm1: [], dm2: [] });
    await userEvent.type(await screen.findByRole('textbox', { name: 'Message Ada' }), 'still mine');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByTestId('send-failed');
    fireEvent.click(within(rowFor('Linus Torvalds')).getAllByRole('button')[0] as HTMLElement);
    await screen.findByRole('textbox', { name: 'Message Linus' });
    expect(screen.queryByText('still mine', { selector: 'p' })).not.toBeInTheDocument();
    fireEvent.click(within(rowFor('Ada Lovelace')).getAllByRole('button')[0] as HTMLElement);
    const failed = await screen.findByTestId('send-failed');
    svc.sendMessage.mockResolvedValueOnce(msg('dm1', ME.id, 'still mine', { id: 'srv-13' }));
    fireEvent.click(within(failed).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByTestId('send-failed')).not.toBeInTheDocument());
    expect(svc.sendMessage).toHaveBeenCalledTimes(2);
    expect(logOf().getAllByText('still mine')).toHaveLength(1);
  });

  it('pressing a quote of a message that is not loaded pages back to it, and says so when it cannot be found', async () => {
    const all = Array.from({ length: 60 }, (_, i) => msg('dm1', 'p-dm1', `history ${String(i + 1).padStart(2, '0')}`, { id: `h${i + 1}`, createdAt: new Date(NOW - (7200 - i) * 1000).toISOString() }));
    const quoter = msg('dm1', ME.id, 'quoting an old one', { id: 'q14', replyToId: 'h5', createdAt: new Date(NOW - 1000).toISOString() });
    const lost = msg('dm1', ME.id, 'quoting a lost one', { id: 'q15', replyToId: 'lost1', createdAt: new Date(NOW - 500).toISOString() });
    const pool = [...all, quoter, lost];
    svc.getMyChats.mockResolvedValue([mirror(), dmChat]);
    svc.listMessages.mockImplementation(async (_id: string, opts: { before?: unknown; limit?: number } = {}) =>
      pool.filter((m) => Date.parse(m.createdAt) < cursorTime(opts.before)).slice(-(opts.limit ?? 50)),
    );
    svc.getMessage.mockImplementation(async (id: string) => (id === 'lost1' ? msg('dm1', 'p-dm1', 'a message paging cannot reach', { id: 'lost1', createdAt: new Date(NOW - 99999 * 1000).toISOString() }) : (pool.find((m) => m.id === id) ?? null)));
    render(treeFor('/home/c/dm1'));
    await screen.findByText('quoting an old one');
    expect(screen.queryByText('history 05')).not.toBeInTheDocument();
    const quotes = await screen.findAllByTestId('reply-quote');
    await waitFor(() => expect(quotes[0]).toHaveTextContent('history 05'));
    fireEvent.click(quotes[0] as HTMLElement);
    await waitFor(() => expect(logOf().getAllByText('history 05').length).toBeGreaterThan(0));
    // the second quote points at a message the pages never contain
    const lostQuote = (await screen.findAllByTestId('reply-quote')).find((q) => q.textContent?.includes('a message paging cannot reach')) as HTMLElement;
    fireEvent.click(lostQuote);
    await waitFor(() => expect(toastFn).toHaveBeenCalledWith("That message isn't loaded, and could not be found further back."), { timeout: 8000 });
  }, 20_000);

  it('the message menu gives focus back to the control that opened it', async () => {
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [msg('dm1', ME.id, 'menu focus')] }); // my own message: More exists only where Edit and Delete do
    const text = await screen.findByText('menu focus');
    const more = within(text.closest('li') as HTMLElement).getByRole('button', { name: 'More actions' });
    more.focus();
    fireEvent.click(more);
    const menu = await screen.findByRole('menu', { name: 'Message menu' });
    expect(menu).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Message menu' })).not.toBeInTheDocument());
    expect(more).toHaveFocus();
  });

  it('a thread with more than 200 replies offers "Load earlier replies"', async () => {
    const root = msg('g1', 'p-grace', 'long thread root', { id: 'root16', createdAt: new Date(NOW - 99999 * 1000).toISOString() });
    const replies = Array.from({ length: 205 }, (_, i) => msg('g1', 'p-grace', `reply ${String(i + 1).padStart(3, '0')}`, { id: `rp${i + 1}`, threadRootId: 'root16', createdAt: new Date(NOW - (90000 - i) * 1000).toISOString() }));
    svc.getMyChats.mockResolvedValue([mirror(), group('g1', 'Builders')]);
    svc.listMessages.mockImplementation(async (_id: string, opts: { before?: unknown; limit?: number; threadRootId?: string } = {}) =>
      replies.filter((m) => Date.parse(m.createdAt) < cursorTime(opts.before)).slice(-(opts.limit ?? 50)),
    );
    svc.listThread.mockImplementation(async () => [root, ...replies.slice(-200)]);
    render(treeFor('/home/c/g1/t/root16'));
    const panel = await screen.findByTestId('thread-panel');
    await within(panel).findByText('reply 205');
    expect(within(panel).queryByText('reply 005')).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Load earlier replies' }));
    expect(await within(panel).findByText('reply 005')).toBeInTheDocument();
    expect(svc.listMessages).toHaveBeenCalledWith('g1', expect.objectContaining({ threadRootId: 'root16', before: expect.objectContaining({ id: 'rp6' }) }));
  }, 30_000);

  it('a resync after a long gap pages back until it overlaps what was loaded, leaves no hole, and drops what the server no longer returns', async () => {
    const mk = (n: number, prefix: string, ageSec: number) => msg('dm1', 'p-dm1', `${prefix} ${String(n).padStart(3, '0')}`, { id: `${prefix}${n}`, createdAt: new Date(NOW - ageSec * 1000).toISOString() });
    let pool: ChatMessage[] = Array.from({ length: 60 }, (_, i) => mk(i + 1, 'old', 9000 - i));
    svc.getMyChats.mockResolvedValue([mirror(), dmChat]);
    svc.listMessages.mockImplementation(async (_id: string, opts: { before?: unknown; limit?: number } = {}) =>
      pool.filter((m) => Date.parse(m.createdAt) < cursorTime(opts.before)).slice(-(opts.limit ?? 50)),
    );
    render(treeFor('/home/c/dm1'));
    await screen.findByText('old 060');
    // 130 messages arrive while the socket is down (more than two pages), and one old one (inside the re-read range) is removed
    pool = [...pool.filter((m) => m.id !== 'old50'), ...Array.from({ length: 130 }, (_, i) => mk(i + 1, 'new', 4000 - i))];
    act(() => handlers?.onSubscribed?.());
    await logOf().findByText('new 130');
    expect(logOf().getByText('new 001')).toBeInTheDocument(); // the oldest of the gap: no hole under the new ones
    expect(logOf().getByText('new 065')).toBeInTheDocument();
    expect(logOf().getByText('old 060')).toBeInTheDocument(); // overlap with what was loaded
    await waitFor(() => expect(logOf().queryByText('old 050')).not.toBeInTheDocument()); // no longer returned: gone
  }, 30_000);

  it('a deleted thread reply lowers the reply count', async () => {
    const root = msg('g1', 'p-grace', 'counted root', { id: 'root20' });
    svc.getThreadStats.mockResolvedValueOnce(new Map([['root20', { count: 2, authorIds: [ME.id] }]]));
    renderChat('/home/c/g1', [mirror(), group('g1', 'Builders')], { g1: [root] });
    expect(await screen.findByTestId('replies-link')).toHaveTextContent('2 replies');
    svc.getThreadStats.mockResolvedValueOnce(new Map([['root20', { count: 1, authorIds: [ME.id] }]]));
    act(() => handlers?.onMessage({ type: 'UPDATE', message: msg('g1', ME.id, null, { id: 'gone-reply', threadRootId: 'root20', isDeleted: true, deletedAt: iso(0) }) }));
    await waitFor(() => expect(screen.getByTestId('replies-link')).toHaveTextContent('1 reply'));
  });

  it('a list read that never answers ends in an error with Retry, not an endless skeleton', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    svc.getMyChats.mockImplementationOnce(() => new Promise(() => undefined));
    renderChat('/home', [mirror(), dmChat]);
    expect(screen.getByRole('status', { name: 'Loading chats' })).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIST_READ_TIMEOUT_MS + 100);
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load your chats');
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' })).toBeInTheDocument();
  });

  describe('cost', () => {
    it('a thread reply costs no list read; a top-level message patches its row at once and reads the list after two quiet seconds', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      renderChat('/home', [mirror(), dmChat]);
      await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
      const reads = () => svc.getMyChats.mock.calls.length;
      const base = reads();
      act(() => handlers?.onMessage({ type: 'INSERT', message: msg('dm1', 'p-dm1', 'a reply', { id: 'tr1', threadRootId: 'x' }) }));
      await act(async () => { await vi.advanceTimersByTimeAsync(2600); });
      expect(reads()).toBe(base);
      act(() => handlers?.onMessage({ type: 'INSERT', message: msg('dm1', 'p-dm1', 'fresh words', { id: 'tl1', createdAt: new Date().toISOString() }) }));
      expect(within(rowFor('Ada Lovelace')).getByText('fresh words')).toBeInTheDocument(); // patched locally, no read yet
      expect(within(rowFor('Ada Lovelace')).getByLabelText('1 unread')).toBeInTheDocument();
      expect(reads()).toBe(base);
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(reads()).toBe(base);
      await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
      expect(reads()).toBe(base + 1);
    });

    it('a conversation the list has never seen is read at once', async () => {
      renderChat('/home', [mirror(), dmChat]);
      await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
      const base = svc.getMyChats.mock.calls.length;
      act(() => handlers?.onMessage({ type: 'INSERT', message: msg('brand-new', 'p-x', 'hello out of nowhere', { id: 'nn1' }) }));
      await waitFor(() => expect(svc.getMyChats.mock.calls.length).toBe(base + 1));
    });

    it('the slow timer runs only while a conversation is open and visible, every 60 seconds', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const list = renderChat('/home', [mirror(), dmChat], { dm1: [msg('dm1', 'p-dm1', 'one')] });
      await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
      let base = svc.getMyChats.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(SAFETY_POLL_MS + 5_000); });
      expect(svc.getMyChats.mock.calls.length).toBe(base); // nothing open: the 60s conversation timer does not run (the 2-minute list refresh is tested separately)
      list.unmount();
      renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [msg('dm1', 'p-dm1', 'one')] });
      await screen.findByText('one');
      base = svc.getMyChats.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(SAFETY_POLL_MS - 500); });
      expect(svc.getMyChats.mock.calls.length).toBe(base);
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(svc.getMyChats.mock.calls.length).toBeGreaterThan(base);
    });

    it('stays idle inside ?embed=true, /live and /transcribe', async () => {
      const { unmount } = render(
        <MemoryRouter initialEntries={['/feed?embed=true']}>
          <ChatProvider>
            <div>embedded page</div>
          </ChatProvider>
        </MemoryRouter>,
      );
      await screen.findByText('embedded page');
      unmount();
      render(
        <MemoryRouter initialEntries={['/live/ABC123']}>
          <ChatProvider>
            <div>live page</div>
          </ChatProvider>
        </MemoryRouter>,
      );
      await screen.findByText('live page');
      expect(svc.subscribeToChat).not.toHaveBeenCalled();
      expect(svc.getMyChats).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Final batch
// ---------------------------------------------------------------------------
describe('final batch', () => {
  const dmChat = dm('dm1', 'Ada Lovelace');
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const cursorTime = (before: unknown) =>
    typeof before === 'string' ? Date.parse(before) : before && typeof before === 'object' ? Date.parse((before as { createdAt: string }).createdAt) : Infinity;
  const mk = (n: number, prefix: string, ageSec: number) => msg('dm1', 'p-dm1', `${prefix} ${String(n).padStart(3, '0')}`, { id: `${prefix}${n}`, createdAt: new Date(NOW - ageSec * 1000).toISOString() });
  const treeAt = (path: string) => (
    <MemoryRouter initialEntries={[path]}>
      <ChatProvider>
        <Routes>
          <Route path="/home/*" element={<ChatHomePage />} />
        </Routes>
        <Probe />
      </ChatProvider>
    </MemoryRouter>
  );
  afterEach(() => {
    SYNC_LIMITS.maxPages = 20;
  });

  // ---- E: full-precision timestamps ----
  it('E: messages are ordered by their full microsecond timestamps, whatever offset the string is written in', () => {
    const a = { id: 'a', createdAt: '2026-10-19T10:00:00.123500+00:00' };
    const b = { id: 'b', createdAt: '2026-10-19T17:00:00.123400+07:00' }; // the same second, 100 microseconds EARLIER
    expect(compareMessages(a, b)).toBeGreaterThan(0);
    expect(compareMessages(b, a)).toBeLessThan(0);
    expect(compareMessages({ id: 'x', createdAt: '2026-10-19T10:00:00.1235Z' }, { id: 'x', createdAt: '2026-10-19T10:00:00.123500+00:00' })).toBe(0);
    expect(compareMessages({ id: 'x', createdAt: '2026-10-19T10:00:00Z' }, { id: 'y', createdAt: '2026-10-19T10:00:00.000001Z' })).toBeLessThan(0);
  });

  it('E: "read through" is the message that is really newest, even when two differ by microseconds inside one millisecond', async () => {
    const base = new Date(NOW - 60_000).toISOString().replace('Z', ''); // ...:00.mmm
    const shownNewest = msg('dm1', 'p-dm1', 'the newest', { id: 'S', createdAt: `${base}789+00:00` });
    const staleListed = { ...last('older', 1, 'p-dm1', 'Ada'), id: 'L', createdAt: `${base}456+00:00` }; // the list lags by 333 microseconds
    renderChat('/home/c/dm1', async () => [mirror(), dm('dm1', 'Ada Lovelace', { unreadCount: 1, lastMessage: staleListed })], { dm1: [shownNewest] });
    await screen.findByText('the newest');
    await waitFor(() => expect(svc.markRead).toHaveBeenCalledWith('dm1', { throughMessageId: 'S' }));
    expect(svc.markRead).not.toHaveBeenCalledWith('dm1', { throughMessageId: 'L' });
  });

  // ---- A: a resync that cannot overlap must not merge across a gap ----
  it('A: a resync that never reaches what was loaded replaces the window (no gap), and "Load earlier" then pages back cleanly', async () => {
    SYNC_LIMITS.maxPages = 2;
    let pool: ChatMessage[] = Array.from({ length: 60 }, (_, i) => mk(i + 1, 'old', 9000 - i));
    svc.getMyChats.mockResolvedValue([mirror(), dmChat]);
    svc.listMessages.mockImplementation(async (_id: string, opts: { before?: unknown; limit?: number } = {}) =>
      pool.filter((m) => Date.parse(m.createdAt) < cursorTime(opts.before)).slice(-(opts.limit ?? 50)),
    );
    render(treeAt('/home/c/dm1'));
    await screen.findByText('old 060');
    pool = [...pool, ...Array.from({ length: 130 }, (_, i) => mk(i + 1, 'new', 4000 - i))]; // more than two pages while away
    act(() => handlers?.onSubscribed?.());
    await logOf().findByText('new 130');
    expect(logOf().getByText('new 031')).toBeInTheDocument(); // the two pages that were read
    expect(logOf().queryByText('old 060')).not.toBeInTheDocument(); // NOT glued across the unread gap
    fireEvent.click(await screen.findByRole('button', { name: 'Load earlier messages' }));
    expect(await logOf().findByText('new 001')).toBeInTheDocument(); // the gap fills in order
    expect(logOf().getByText('old 060')).toBeInTheDocument();
  });

  it('A: when the resync reaches the start of the conversation without overlap, "Load earlier" is not offered', async () => {
    let pool: ChatMessage[] = Array.from({ length: 60 }, (_, i) => mk(i + 1, 'old', 9000 - i));
    svc.getMyChats.mockResolvedValue([mirror(), dmChat]);
    svc.listMessages.mockImplementation(async (_id: string, opts: { before?: unknown; limit?: number } = {}) =>
      pool.filter((m) => Date.parse(m.createdAt) < cursorTime(opts.before)).slice(-(opts.limit ?? 50)),
    );
    render(treeAt('/home/c/dm1'));
    await screen.findByText('old 060');
    expect(screen.getByRole('button', { name: 'Load earlier messages' })).toBeInTheDocument();
    pool = Array.from({ length: 12 }, (_, i) => mk(i + 1, 'only', 100 - i)); // everything older is gone
    act(() => handlers?.onSubscribed?.());
    await logOf().findByText('only 012');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Load earlier messages' })).not.toBeInTheDocument());
  });

  // ---- B: an authoritative resync drops what the server no longer returns ----
  it('B: a resync that returns nothing empties the window it captured', async () => {
    let pool: ChatMessage[] = [mk(1, 'gone', 300), mk(2, 'gone', 200)];
    svc.getMyChats.mockResolvedValue([mirror(), dmChat]);
    svc.listMessages.mockImplementation(async () => pool);
    render(treeAt('/home/c/dm1'));
    await screen.findByText('gone 002');
    pool = [];
    act(() => handlers?.onSubscribed?.());
    await waitFor(() => expect(screen.queryByText('gone 002')).not.toBeInTheDocument());
    expect(screen.queryByText('gone 001')).not.toBeInTheDocument();
  });

  it('B: a message newer than everything the server returned is dropped too, unless it arrived after the read began', async () => {
    const m1 = mk(1, 'keep', 300);
    const m2 = mk(2, 'keep', 200);
    const m3 = mk(3, 'removed', 100); // deleted at the database level while the socket was down
    let pool: ChatMessage[] = [m1, m2, m3];
    svc.getMyChats.mockResolvedValue([mirror(), dmChat]);
    svc.listMessages.mockImplementation(async () => pool);
    render(treeAt('/home/c/dm1'));
    await screen.findByText('removed 003');
    pool = [m1, m2];
    let release!: () => void;
    svc.listMessages.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve([m1, m2]); }));
    act(() => handlers?.onSubscribed?.());
    await waitFor(() => expect(release).toBeDefined());
    // an ordinary message arrives by Realtime while that read is in flight: it must survive
    act(() => handlers?.onMessage({ type: 'INSERT', message: mk(4, 'arrived', 0) }));
    await act(async () => release());
    await waitFor(() => expect(screen.queryByText('removed 003')).not.toBeInTheDocument());
    expect(logOf().getByText('arrived 004')).toBeInTheDocument();
    expect(logOf().getByText('keep 002')).toBeInTheDocument();
  });

  // ---- C: an own thread reply is counted once ----
  it('C: my own thread reply is counted once, not once by the send and once by Realtime', async () => {
    await asDesktopAsync(async () => {
      const root = msg('g1', 'p-grace', 'counted once root', { id: 'rootC' });
      svc.getThreadStats.mockResolvedValue(new Map([['rootC', { count: 1, authorIds: ['p-grace'] }]]));
      const reply = msg('g1', ME.id, 'my reply', { id: 'replyC', threadRootId: 'rootC', createdAt: new Date().toISOString() });
      svc.sendMessage.mockResolvedValue(reply);
      renderChat('/home/c/g1/t/rootC', [mirror(), group('g1', 'Builders')], { g1: [root] });
      const panel = await screen.findByTestId('thread-panel');
      const main = within(screen.getByTestId('conversation'));
      expect(await main.findByTestId('replies-link')).toHaveTextContent('1 reply');
      await userEvent.type(within(panel).getByRole('textbox', { name: 'Reply in thread' }), 'my reply');
      fireEvent.click(within(panel).getByRole('button', { name: 'Send' }));
      await waitFor(() => expect(main.getByTestId('replies-link')).toHaveTextContent('2 replies'));
      act(() => handlers?.onMessage({ type: 'INSERT', message: reply })); // the same message again, by Realtime
      await sleep(100);
      expect(main.getByTestId('replies-link')).toHaveTextContent('2 replies');
    });
  });

  // ---- G: a slow list-only refresh ----
  it('G: the list refreshes every 2 minutes while it is shown and the tab is visible; no conversation read, nothing before then', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderChat('/home', [mirror(), dmChat], { dm1: [msg('dm1', 'p-dm1', 'one')] });
    await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
    const base = svc.getMyChats.mock.calls.length;
    const msgBase = svc.listMessages.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(LIST_POLL_MS - 1000); });
    expect(svc.getMyChats.mock.calls.length).toBe(base);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(svc.getMyChats.mock.calls.length).toBe(base + 1);
    expect(svc.listMessages.mock.calls.length).toBe(msgBase);
  });

  it('G: no list timer on other pages, and none while the tab is hidden', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = render(
      <MemoryRouter initialEntries={['/feed']}>
        <ChatProvider>
          <Routes>
            <Route path="/feed" element={<div>the feed</div>} />
          </Routes>
        </ChatProvider>
      </MemoryRouter>,
    );
    svc.getMyChats.mockResolvedValue([mirror(), dmChat]);
    await screen.findByText('the feed');
    const base = svc.getMyChats.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(LIST_POLL_MS * 2 + 100); });
    expect(svc.getMyChats.mock.calls.length).toBe(base);
    view.unmount();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    try {
      renderChat('/home', [mirror(), dmChat]);
      await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
      const b2 = svc.getMyChats.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(LIST_POLL_MS * 2 + 100); });
      expect(svc.getMyChats.mock.calls.length).toBe(b2);
    } finally {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Review round 3: H to M (visual QA)
// ---------------------------------------------------------------------------
describe('review round 3', () => {
  const dmChat = dm('dm1', 'Ada Lovelace');
  const mirrorChat = mirror('c-mirror', { ownerFirstName: 'Mia' });
  const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/);

  // ---- H: an attachment card is never an empty box ----
  describe('H: attachment card states', () => {
    const readyItem = { kind: 'point', id: 'pt', title: 'T', tags: [], point: { id: 'pt', statement: 'a point everyone may read' } };
    let onLine = true;
    beforeEach(() => {
      onLine = true;
      vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => onLine);
    });
    afterEach(() => vi.restoreAllMocks());

    it('while loading it is a labelled skeleton row that says what is coming, not an empty box', () => {
      helpers.loadAttachment.mockReturnValue(new Promise(() => undefined));
      render(<AttachmentCard kind="point" id="pt" viewerId={ME.id} />);
      const status = screen.getByRole('status', { name: 'Loading attachment' });
      expect(status).toHaveTextContent('Loading point');
      expect(status.className).toContain('animate-pulse');
    });

    it('a failed read is a compact "Couldn\'t load this point" row with Retry, and Retry loads it', async () => {
      helpers.loadAttachment.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(readyItem);
      render(<AttachmentCard kind="point" id="pt" viewerId={ME.id} />);
      const row = await screen.findByTestId('attachment-error');
      expect(row).toHaveTextContent("Couldn't load this point");
      expect(screen.queryByRole('status', { name: 'Loading attachment' })).not.toBeInTheDocument();
      fireEvent.click(within(row).getByRole('button', { name: 'Retry' }));
      expect(await screen.findByTestId('point-card')).toHaveTextContent('a point everyone may read');
      expect(helpers.loadAttachment).toHaveBeenCalledTimes(2);
    });

    it('a read that never answers becomes the error row instead of a skeleton for ever', async () => {
      vi.useFakeTimers();
      helpers.loadAttachment.mockReturnValue(new Promise(() => undefined));
      render(<AttachmentCard kind="story" id="st" viewerId={ME.id} />);
      expect(screen.getByRole('status', { name: 'Loading attachment' })).toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(ATTACHMENT_TIMEOUT_MS + 100); });
      expect(screen.getByTestId('attachment-error')).toHaveTextContent("Couldn't load this story");
    });

    it('offline it says "Available when you\'re back online" (never a skeleton) and loads by itself when the connection returns', async () => {
      onLine = false;
      helpers.loadAttachment.mockReturnValueOnce(new Promise(() => undefined)).mockResolvedValueOnce(readyItem);
      render(<AttachmentCard kind="point" id="pt" viewerId={ME.id} />);
      expect(screen.getByTestId('attachment-offline')).toHaveTextContent("Available when you're back online");
      expect(screen.queryByRole('status', { name: 'Loading attachment' })).not.toBeInTheDocument();
      onLine = true;
      act(() => { window.dispatchEvent(new Event('online')); });
      expect(await screen.findByTestId('point-card')).toBeInTheDocument();
      expect(screen.queryByTestId('attachment-offline')).not.toBeInTheDocument();
    });

    it('an item that came back with nothing to draw reads "Not available to you", never an empty card', async () => {
      helpers.loadAttachment.mockResolvedValue({ kind: 'point', id: 'pt', title: 'T', tags: [] });
      render(<AttachmentCard kind="point" id="pt" viewerId={ME.id} />);
      expect(await screen.findByText('Not available to you')).toBeInTheDocument();
      expect(screen.queryByTestId('attachment-point')).not.toBeInTheDocument();
    });
  });

  // ---- I: no "Open original" on a copy whose source is erased ----
  it('I: a forward or clarify whose snapshot is erased or removed is not a tap-to-jump button; a normal one is', async () => {
    const snap = (authorName: string, body: string | null) => ({ authorName, body, createdAt: iso(30), conversationKind: 'group' as const, conversationTitle: null, thread: [] });
    const erasedAuthor = msg('dm1', 'p-dm1', null, { id: 'e1', kind: 'forward', forwardSnapshot: snap('Deleted user', 'words from an erased person'), forwardedFromMessageId: 's1' });
    const nullBody = msg('dm1', 'p-dm1', null, { id: 'e2', kind: 'forward', forwardSnapshot: snap('Grace Hopper', null), forwardedFromMessageId: 's2' });
    const clarifyGone = msg('dm1', ME.id, null, { id: 'e3', kind: 'clarify', forwardSnapshot: snap('Deleted user', null), forwardedFromMessageId: 's3' });
    const fine = msg('dm1', 'p-dm1', null, { id: 'e4', kind: 'forward', forwardSnapshot: snap('Grace Hopper', 'still here'), forwardedFromMessageId: 's4' });
    renderChat('/home/c/dm1', [mirrorChat, dmChat], { dm1: [erasedAuthor, nullBody, clarifyGone, fine] });
    await screen.findByText('still here');
    const cards = [...screen.getAllByTestId('forwarded-card'), ...screen.getAllByTestId('clarified-card')];
    expect(cards).toHaveLength(4);
    const withButton = cards.filter((c) => c.tagName === 'BUTTON' && c.getAttribute('aria-label')?.startsWith('Go to original message') === true);
    expect(withButton).toHaveLength(1);
    expect(withButton[0]).toHaveTextContent('still here');
  });

  // ---- J: the mirror keeps its role as its own segment ----
  describe('J: the mirror role is never cut', () => {
    const long = 'A very long mirror name that will certainly not fit on one line of a phone';
    const named = mirror('c-mirror', { ownerFirstName: 'Mia', title: long });

    it('in the list the custom name has the whole first line (truncating alone) and "Mia\'s mirror ·" leads the second line, never cut', async () => {
      renderChat('/home', [mirror('c-mirror', { ownerFirstName: 'Mia', title: long, lastMessage: last('a note', 3, ME.id, ME.name) }), dmChat]);
      await screen.findAllByTestId('row-title');
      const li = document.querySelector('[data-chat="c-mirror"]') as HTMLElement;
      const title = within(li).getByTestId('row-title');
      expect(title).toHaveTextContent(long);
      expect(title.textContent).not.toContain("Your mirror agent"); // the role is not on this line
      expect(title.children).toHaveLength(0); // one plain, truncating line
      expect(classesOf(title)).toContain('truncate');
      const role = within(li).getByTestId('row-role');
      expect(role.textContent).toBe("Your mirror agent · ");
      expect(classesOf(role)).toContain('shrink-0');
      expect(classesOf(role)).toContain('text-muted-foreground');
      expect(classesOf(role)).not.toContain('truncate');
      // the preview follows on the same line and is what truncates there
      const line2 = role.parentElement as HTMLElement;
      expect(line2).toHaveTextContent("Your mirror agent · You: a note");
      expect(classesOf(line2.querySelector(':scope > span.min-w-0') as HTMLElement)).toContain('truncate');
    });

    it('in the header the same two segments, under one heading that still reads as the full label', async () => {
      renderChat('/home/c/c-mirror', [named, dmChat]);
      const h1 = await screen.findByRole('heading', { name: `${long} · Your mirror agent` });
      const [name, role] = Array.from(h1.querySelectorAll(':scope > span > span'));
      expect(classesOf(name!)).toContain('truncate');
      expect(classesOf(role!)).toContain('shrink-0');
    });

    it('with no custom name the role alone is the first line and the preview is the second', async () => {
      renderChat('/home', [mirrorChat, dmChat]);
      expect(await screen.findByText("Your mirror agent", { selector: '[data-testid="row-title"]' })).toBeInTheDocument();
      const li = document.querySelector('[data-chat="c-mirror"]') as HTMLElement;
      expect(within(li).queryByTestId('row-role')).not.toBeInTheDocument();
      expect(li).toHaveTextContent('No messages yet');
    });
  });

  // ---- K and L: the selected row and the preview prefixes ----
  describe('K and L: list row styling', () => {
    // Tailwind palette values for the few classes a row may use, to check contrast without a browser.
    const HEX: Record<string, string> = {
      'blue-50': '#eff6ff', 'gray-600': '#4b5563', 'gray-700': '#374151', 'gray-900': '#111827', 'blue-700': '#1d4ed8', white: '#ffffff',
    };
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
      return (hi + 0.05) / (lo + 0.05);
    };
    const colorOf = (el: Element) => {
      const m = classesOf(el).find((c) => /^text-(gray|blue)-\d+$/.test(c) || c === 'text-white');
      return m ? HEX[m.slice(5)] : undefined;
    };

    it('K: the selected row is a light blue tint with a blue accent, not a blue fill; avatars stay visible and text is at least 4.5:1', async () => {
      const grp = group('g1', 'Builders', { lastMessage: last('hello all', 5, 'p-grace', 'Grace Hopper') });
      renderChat('/home/c/g1', [mirrorChat, dmChat, grp]);
      const row = (await screen.findByText('Builders · General', { selector: '[data-testid="row-title"]' })).closest('li')!;
      const btn = within(row).getAllByRole('button')[0]!;
      const cls = classesOf(btn);
      expect(btn).toHaveAttribute('aria-current', 'true');
      expect(cls).toContain('bg-blue-50');
      expect(cls).not.toContain('bg-blue-600');
      expect(cls).not.toContain('text-white');
      expect(cls.join(' ')).toMatch(/shadow-\[inset_3px_0_0_0_#2563eb\]/);
      // The channel avatar keeps its own light disc (it used to turn white-on-blue).
      expect(row.querySelector('.bg-white.text-blue-600')).toBeNull();
      // Every coloured text inside the selected row reads against the tint at 4.5:1.
      const texts = [...row.querySelectorAll('span')].map(colorOf).filter(Boolean) as string[];
      expect(texts.length).toBeGreaterThan(0);
      for (const t of texts) expect(ratio(t, HEX['blue-50']!)).toBeGreaterThanOrEqual(4.5);
      expect(classesOf(within(row).getByTestId('row-title')).some((c) => c === 'text-white' || c === 'text-blue-50' || c === 'text-blue-100')).toBe(false);
    });

    it('L: "You:" and sender names are gray on a read row and emphasised, not blue, only on an unread one', async () => {
      const readRow = group('g1', 'Builders', { lastMessage: last('hello all', 5, 'p-grace', 'Grace Hopper') });
      const unreadRow = group('g2', 'Readers', { unreadCount: 2, lastMessage: last('news', 4, 'p-grace', 'Grace Hopper') });
      const mine = dm('dm1', 'Ada Lovelace', { lastMessage: last('see you', 3, ME.id, ME.name) });
      renderChat('/home', [mirrorChat, readRow, unreadRow, mine]);
      await screen.findByText('Builders · General', { selector: '[data-testid="row-title"]' });
      const prefixOf = (title: string) => within(rowFor(title)).getByText(/^(Grace|You):$/);
      for (const t of ['Builders · General', 'Ada Lovelace']) {
        const p = prefixOf(t);
        expect(classesOf(p).some((c) => /^text-blue/.test(c))).toBe(false);
        expect(classesOf(p)).not.toContain('font-semibold');
        expect(classesOf(p)).not.toContain('font-bold');
      }
      const u = prefixOf('Readers · General');
      expect(classesOf(u)).toContain('font-semibold');
      expect(classesOf(u).some((c) => /^text-blue/.test(c))).toBe(false);
    });
  });

  // ---- M: the phone action bar and phone dialogs ----
  describe('M: phone action bar and dialogs', () => {
    it('the tapped message toolbar is one non-wrapping row: icon buttons with names, a labelled Clarify, and no More on someone else\'s message', async () => {
      const grp = group('g1', 'Builders');
      renderChat('/home/c/g1', [mirrorChat, grp], { g1: [msg('g1', 'p-grace', 'a message to tap', { id: 'tap1' })] });
      const text = await screen.findByText('a message to tap');
      fireEvent.pointerUp(text);
      const bar = within(text.closest('li') as HTMLElement).getByRole('toolbar', { name: 'Message actions' });
      expect(classesOf(bar)).toContain('inline-flex');
      expect(classesOf(bar)).not.toContain('flex-wrap');
      expect(classesOf(bar)).toContain('flex-nowrap');
      const buttons = within(bar).getAllByRole('button');
      expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Reply', 'Forward', 'Thread', "Clarify with your mirror agent"]);
      // Icons only, except Clarify (the mirror's face and the word, which drops out below 360px so the row keeps one line at 320).
      for (const b of buttons.filter((x) => x.getAttribute('data-testid') !== 'clarify-button')) expect(b.textContent).toBe('');
      for (const b of buttons) expect(classesOf(b)).toContain('shrink-0');
    });

    it('the block, rename, forward and attach dialogs have rounded corners on a phone, a side margin, and a left-aligned title', async () => {
      const check = (dialog: HTMLElement) => {
        const cls = classesOf(dialog);
        expect(cls).toContain('rounded-lg'); // not only sm:rounded-lg
        expect(cls).toContain('w-[calc(100vw-2rem)]');
        const head = within(dialog).getAllByRole('heading')[0]!;
        expect(classesOf(head.parentElement!)).toContain('text-left');
      };
      // Block (the confirmation) and Forward (a sheet) on a 1:1.
      const view = renderChat('/home/c/dm1', [mirrorChat, dmChat], { dm1: [msg('dm1', 'p-dm1', 'something')] });
      await screen.findByText('something');
      await userEvent.click(screen.getByRole('button', { name: 'More' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Block' }));
      check(await screen.findByRole('dialog'));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      menuOn('something');
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Forward' }));
      check(await screen.findByRole('dialog'));
      view.unmount();
      // Attach (a sheet) and Rename on the mirror.
      renderChat('/home/c/c-mirror', [mirror('c-mirror', { ownerFirstName: 'Mia' }), dmChat], { 'c-mirror': [] });
      fireEvent.click(await screen.findByRole('button', { name: 'Attach a point or story' }));
      check(await screen.findByRole('dialog'));
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: 'More' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: /^About / }));
      await userEvent.click(within(await screen.findByTestId('mirror-info')).getByRole('button', { name: 'Rename' }));
      check(await screen.findByRole('dialog'));
    });
  });
});

// ---------------------------------------------------------------------------
// Review round 4: N (send idempotency) and O (one-line composer hint)
// ---------------------------------------------------------------------------
describe('review round 4', () => {
  const dmChat = dm('dm1', 'Ada Lovelace');
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const sentWith = (n: number) => (svc.sendMessage.mock.calls[n]![0] as { clientId?: string }).clientId;
  const typeAndSend = async (text: string) => {
    await userEvent.type(await screen.findByRole('textbox', { name: 'Message Ada' }), text);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  };

  it('N: every send mints its own uuid, and a Retry of the same send reuses it', async () => {
    svc.sendMessage.mockRejectedValueOnce(new Error('chat send_chat_message failed: chat: cannot message this person'));
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [] });
    await typeAndSend('first');
    const failed = await screen.findByTestId('send-failed');
    svc.sendMessage.mockImplementation(async (input: { body: string; clientId: string }) => msg('dm1', ME.id, input.body, { id: `srv-${input.body}`, clientId: input.clientId }));
    fireEvent.click(within(failed).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByTestId('send-failed')).not.toBeInTheDocument());
    await typeAndSend('second');
    await waitFor(() => expect(svc.sendMessage).toHaveBeenCalledTimes(3));
    expect(sentWith(0)).toMatch(UUID);
    expect(sentWith(1)).toBe(sentWith(0));
    expect(sentWith(2)).toMatch(UUID);
    expect(sentWith(2)).not.toBe(sentWith(0));
  });

  it('N: a reply that is lost (the call rejects after the server stored the message), then Retry: the service sees the same clientId and the UI shows one message', async () => {
    const stored = new Map<string, ChatMessage>();
    let lose = true;
    svc.sendMessage.mockImplementation(async (input: { body: string; clientId: string }) => {
      // The server is idempotent: a replay of the same clientId returns the stored row, never a second one.
      const row = stored.get(input.clientId) ?? msg('dm1', ME.id, input.body, { id: `srv-${stored.size + 1}`, clientId: input.clientId });
      stored.set(input.clientId, row);
      if (lose) {
        lose = false;
        throw new Error('TypeError: Failed to fetch');
      }
      return row;
    });
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [] });
    await typeAndSend('lost reply');
    const failed = await screen.findByTestId('send-failed');
    expect(logOf().getAllByText('lost reply')).toHaveLength(1);
    fireEvent.click(within(failed).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByTestId('send-failed')).not.toBeInTheDocument());
    expect(svc.sendMessage).toHaveBeenCalledTimes(2);
    expect(sentWith(0)).toMatch(UUID);
    expect(sentWith(1)).toBe(sentWith(0));
    expect(stored.size).toBe(1);
    expect(logOf().getAllByText('lost reply')).toHaveLength(1);
  });

  it('N: the Realtime copy of a send whose reply was lost settles it: no failed row, no Retry, one message', async () => {
    svc.sendMessage.mockImplementation(async () => {
      throw new Error('TypeError: Failed to fetch');
    });
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [] });
    await typeAndSend('stored anyway');
    await screen.findByTestId('send-failed');
    act(() => handlers?.onMessage({ type: 'INSERT', message: msg('dm1', ME.id, 'stored anyway', { id: 'rt-9', createdAt: new Date().toISOString(), clientId: sentWith(0)! }) }));
    await waitFor(() => expect(screen.queryByTestId('send-failed')).not.toBeInTheDocument());
    expect(logOf().getAllByText('stored anyway')).toHaveLength(1);
  });

  it('N: the pending row is matched by clientId, not words: the same words from another device are a second message', async () => {
    svc.sendMessage.mockImplementation(() => new Promise<ChatMessage>(() => undefined));
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [] });
    await typeAndSend('same words');
    await screen.findByText('Sending…');
    act(() => handlers?.onMessage({ type: 'INSERT', message: msg('dm1', ME.id, 'same words', { id: 'other-dev', createdAt: new Date().toISOString(), clientId: 'some-other-uuid' }) }));
    // (The pending row now follows my other message, so it is drawn compact, without its "Sending…" stamp.)
    await waitFor(() => expect(logOf().getAllByText('same words')).toHaveLength(2));
  });

  it('N: a forward carries one clientId per target, so pressing Send again after a lost reply replays it', async () => {
    const theirs = msg('dm1', 'p-dm1', 'worth forwarding', { id: 'fw1' });
    svc.forwardMessage.mockRejectedValueOnce(new Error('TypeError: Failed to fetch')).mockResolvedValue(msg('g1', ME.id, null, { id: 'f2', kind: 'forward' }));
    renderChat('/home/c/dm1', [mirror(), dmChat, group('g1', 'Builders')], { dm1: [theirs] });
    await screen.findByText('worth forwarding');
    menuOn('worth forwarding');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Forward' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Builders/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send' }));
    await screen.findByRole('alert');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(svc.forwardMessage).toHaveBeenCalledTimes(2));
    const ids = svc.forwardMessage.mock.calls.map((c) => c[3]);
    expect(ids[0]).toMatch(UUID);
    expect(ids[1]).toBe(ids[0]);
  });

  it('O: the composer hint is one truncating line, drawn by hand, and the field keeps its accessible name', async () => {
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [] });
    const box = await screen.findByRole('textbox', { name: 'Message Ada' });
    expect(box).not.toHaveAttribute('placeholder');
    const hint = screen.getByTestId('composer-hint');
    expect(hint).toHaveTextContent('Message Ada');
    expect(hint.className).toContain('truncate');
    expect(hint.className).toContain('pointer-events-none');
    await userEvent.type(box, 'x');
    expect(screen.queryByTestId('composer-hint')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Review round 5: P (card generations), Q (forward keys), R (echo settles a send)
// ---------------------------------------------------------------------------
describe('review round 5', () => {
  const dmChat = dm('dm1', 'Ada Lovelace');
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const readyItem = { kind: 'point', id: 'pt', title: 'T', tags: [], point: { id: 'pt', statement: 'a point everyone may read' } };

  describe('P: an attachment card only listens to its current read', () => {
    it('a request that rejects late, after its timeout and a successful Retry, does not overwrite the loaded card', async () => {
      vi.useFakeTimers();
      let rejectFirst!: (e: Error) => void;
      helpers.loadAttachment
        .mockImplementationOnce(() => new Promise((_r, rej) => { rejectFirst = rej; }))
        .mockResolvedValueOnce(readyItem);
      render(<AttachmentCard kind="point" id="pt" viewerId={ME.id} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(ATTACHMENT_TIMEOUT_MS + 100); });
      const row = screen.getByTestId('attachment-error');
      fireEvent.click(within(row).getByRole('button', { name: 'Retry' }));
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(screen.getByTestId('point-card')).toHaveTextContent('a point everyone may read');
      await act(async () => { rejectFirst(new Error('timed out request finally fails')); await vi.advanceTimersByTimeAsync(0); });
      expect(screen.getByTestId('point-card')).toBeInTheDocument();
      expect(screen.queryByTestId('attachment-error')).not.toBeInTheDocument();
    });

    it('a late success from a request that already timed out does not replace what the Retry is showing', async () => {
      vi.useFakeTimers();
      let resolveFirst!: (v: unknown) => void;
      let resolveSecond!: (v: unknown) => void;
      helpers.loadAttachment
        .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
        .mockImplementationOnce(() => new Promise((r) => { resolveSecond = r; }));
      render(<AttachmentCard kind="point" id="pt" viewerId={ME.id} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(ATTACHMENT_TIMEOUT_MS + 100); });
      fireEvent.click(within(screen.getByTestId('attachment-error')).getByRole('button', { name: 'Retry' }));
      await act(async () => { resolveFirst(null); await vi.advanceTimersByTimeAsync(0); });
      // the first read said "not available" long after it was given up on: the Retry is still loading
      expect(screen.queryByText('Not available to you')).not.toBeInTheDocument();
      expect(screen.getByRole('status', { name: 'Loading attachment' })).toBeInTheDocument();
      await act(async () => { resolveSecond(readyItem); await vi.advanceTimersByTimeAsync(0); });
      expect(screen.getByTestId('point-card')).toBeInTheDocument();
    });

    it('an unmounted card ignores its answer', async () => {
      let resolve!: (v: unknown) => void;
      helpers.loadAttachment.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const view = render(<AttachmentCard kind="point" id="pt" viewerId={ME.id} />);
      view.unmount();
      await act(async () => { resolve(readyItem); });
      expect(errors).not.toHaveBeenCalled();
      errors.mockRestore();
    });
  });

  it('Q: going A, B, back to A reuses A\'s original forward key; B gets its own', async () => {
    const theirs = msg('dm1', 'p-dm1', 'worth forwarding', { id: 'fw1' });
    svc.forwardMessage.mockRejectedValue(new Error('TypeError: Failed to fetch'));
    renderChat('/home/c/dm1', [mirror(), dmChat, group('g1', 'Builders'), group('g2', 'Readers')], { dm1: [theirs] });
    await screen.findByText('worth forwarding');
    menuOn('worth forwarding');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Forward' }));
    const dialog = await screen.findByRole('dialog');
    const pickAndSend = async (name: RegExp) => {
      fireEvent.click(within(dialog).getByRole('button', { name }));
      fireEvent.click(within(dialog).getByRole('button', { name: 'Send' }));
      await screen.findByRole('alert');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Back to chats' }));
    };
    await pickAndSend(/Builders/);
    await pickAndSend(/Readers/);
    await pickAndSend(/Builders/);
    const calls = svc.forwardMessage.mock.calls as Array<[string, string, string | undefined, string]>;
    expect(calls.map((c) => c[1])).toEqual(['g1', 'g2', 'g1']);
    expect(calls[0]![3]).toMatch(UUID);
    expect(calls[2]![3]).toBe(calls[0]![3]);
    expect(calls[1]![3]).not.toBe(calls[0]![3]);
  });

  describe('R: the Realtime copy of my send settles its outbox entry at once', () => {
    function OutboxSize() {
      return <div data-testid="outbox-size">{useChat().outbox.length}</div>;
    }
    const renderWithProbe = () => {
      svc.getMyChats.mockResolvedValue([mirror(), dmChat]);
      svc.listMessages.mockResolvedValue([]);
      return render(
        <MemoryRouter initialEntries={['/home/c/dm1']}>
          <ChatProvider>
            <Routes>
              <Route path="/home/*" element={<ChatHomePage />} />
            </Routes>
            <OutboxSize />
          </ChatProvider>
        </MemoryRouter>,
      );
    };
    const echo = (clientId: string) => msg('dm1', ME.id, 'settle me', { id: 'rt-echo', createdAt: new Date().toISOString(), clientId });

    it('the entry leaves the outbox when the echo arrives, even while pending, and the RPC resolving later changes nothing', async () => {
      let resolve!: (m: ChatMessage) => void;
      svc.sendMessage.mockImplementation(() => new Promise<ChatMessage>((r) => { resolve = r; }));
      renderWithProbe();
      await userEvent.type(await screen.findByRole('textbox', { name: 'Message Ada' }), 'settle me');
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      await screen.findByText('Sending…');
      expect(screen.getByTestId('outbox-size')).toHaveTextContent('1');
      const clientId = (svc.sendMessage.mock.calls[0]![0] as { clientId: string }).clientId;
      act(() => handlers?.onMessage({ type: 'INSERT', message: echo(clientId) }));
      expect(screen.getByTestId('outbox-size')).toHaveTextContent('0');
      expect(logOf().getAllByText('settle me')).toHaveLength(1);
      await act(async () => resolve(echo(clientId)));
      expect(screen.getByTestId('outbox-size')).toHaveTextContent('0');
      expect(logOf().getAllByText('settle me')).toHaveLength(1);
    });

    it('the RPC failing after the echo does not bring the entry back as a failed send', async () => {
      let reject!: (e: Error) => void;
      svc.sendMessage.mockImplementation(() => new Promise<ChatMessage>((_r, rej) => { reject = rej; }));
      renderWithProbe();
      await userEvent.type(await screen.findByRole('textbox', { name: 'Message Ada' }), 'settle me');
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      await screen.findByText('Sending…');
      const clientId = (svc.sendMessage.mock.calls[0]![0] as { clientId: string }).clientId;
      act(() => handlers?.onMessage({ type: 'INSERT', message: echo(clientId) }));
      await act(async () => reject(new Error('TypeError: Failed to fetch')));
      expect(screen.queryByTestId('send-failed')).not.toBeInTheDocument();
      expect(screen.getByTestId('outbox-size')).toHaveTextContent('0');
      expect(logOf().getAllByText('settle me')).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Review round 6: B1, S1 to S4, N1
// ---------------------------------------------------------------------------
describe('review round 6', () => {
  const dmChat = dm('dm1', 'Ada Lovelace');
  const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/);
  const LONG = 'A very long mirror name that will certainly not fit on one line of a phone';
  const openForward = async (chats: ChatSummary[]) => {
    renderChat('/home/c/dm1', chats, { dm1: [msg('dm1', 'p-dm1', 'worth forwarding', { id: 'fw1' })] });
    await screen.findByText('worth forwarding');
    menuOn('worth forwarding');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Forward' }));
    return screen.findByRole('dialog');
  };

  it('B1 and S1: the forward list keeps the mirror role, "· General" and the event date as segments that do not shrink', async () => {
    const dialog = await openForward([
      mirror('c-mirror', { ownerFirstName: 'Mia', title: LONG }),
      dmChat,
      group('g1', 'A group with a really quite long organisation name'),
      eventChat('ev1', 'An event with a really quite long title', 40),
    ]);
    const segments = (name: RegExp) => {
      const btn = within(dialog).getByRole('button', { name });
      const wrapper = btn.querySelector('span.flex.min-w-0') as HTMLElement;
      return Array.from(wrapper.querySelectorAll(':scope > span')) as HTMLElement[];
    };
    // A renamed mirror: its name has the whole first line, its role is the second line.
    const mirrorBtn = within(dialog).getByRole('button', { name: /Your mirror agent/ });
    const lines = Array.from((mirrorBtn.querySelector('span.block.min-w-0') as HTMLElement).querySelectorAll(':scope > span')) as HTMLElement[];
    expect(lines[0]).toHaveTextContent(LONG);
    expect(classesOf(lines[0]!)).toContain('truncate');
    expect(lines[0]!.textContent).not.toContain("Your mirror agent");
    expect(lines[1]).toHaveTextContent("Your mirror agent");
    expect(classesOf(lines[1]!)).toContain('shrink-0');
    expect(classesOf(lines[1]!)).toContain('text-muted-foreground');
    const [gName, gTail] = segments(/organisation/);
    expect(classesOf(gName!)).toContain('truncate');
    expect(gTail).toHaveTextContent('· General');
    expect(classesOf(gTail!)).toContain('shrink-0');
    const [eName, eTail] = segments(/An event with/);
    expect(classesOf(eName!)).toContain('truncate');
    expect(eTail!.textContent).toMatch(/^ · [A-Z][a-z]{2} \d{1,2}$/);
    expect(classesOf(eTail!)).toContain('shrink-0');
    // and in the dialog's own title once a target is chosen
    fireEvent.click(within(dialog).getByRole('button', { name: /Your mirror agent/ }));
    expect(within(dialog).getByRole('heading')).toHaveTextContent(`Forward to ${LONG} · Your mirror agent`);
  });

  it('S2: offline, an author whose profile cannot load is "Unknown member" with a gray initials avatar at once, never a permanent skeleton', async () => {
    const online = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    helpers.getChatAuthors.mockRejectedValue(new TypeError('Failed to fetch'));
    renderChat('/home/c/g1', [mirror(), group('g1', 'Builders')], { g1: [msg('g1', 'p-stranger', 'from a stranger')] });
    await screen.findByText('from a stranger');
    expect(await screen.findByText('Unknown member', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading name' })).not.toBeInTheDocument();
    const row = screen.getByText('from a stranger').closest('li') as HTMLElement;
    expect(row.querySelector('.animate-pulse')).toBeNull();
    const avatar = row.querySelector('.bg-gray-200') as HTMLElement;
    expect(avatar).toHaveTextContent('UM');
    online.mockRestore();
  });

  it('S2: a name that has not loaded after a short wait is taken from the chat list (the 1:1 partner), and the real profile replaces it when it loads', async () => {
    helpers.getChatAuthors.mockRejectedValue(new TypeError('Failed to fetch'));
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [msg('dm1', 'p-dm1', 'who wrote this')] });
    await screen.findByText('who wrote this');
    expect(screen.getByRole('status', { name: 'Loading name' })).toBeInTheDocument();
    const row = screen.getByText('who wrote this').closest('li') as HTMLElement;
    await waitFor(() => expect(within(row).getByText('Ada Lovelace')).toBeInTheDocument(), { timeout: 6000 });
    expect(screen.queryByRole('status', { name: 'Loading name' })).not.toBeInTheDocument();
    // the connection returns: the profile is read again
    helpers.getChatAuthors.mockImplementation(async (ids: string[]) => authors.filter((a) => ids.includes(a.id)));
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(await within(row).findByRole('link', { name: 'Ada Lovelace' })).toHaveAttribute('href', '/p/ada');
  }, 20_000);

  it('S3: the rename dialog names the role exactly as it is shown', async () => {
    renderChat('/home/c/c-mirror', [mirror('c-mirror', { ownerFirstName: 'Mia' }), dmChat], { 'c-mirror': [] });
    const shown = (await screen.findByRole('heading', { name: "Your mirror agent" })).textContent;
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /^About / }));
    await userEvent.click(within(await screen.findByTestId('mirror-info')).getByRole('button', { name: 'Rename' }));
    const dialog = await screen.findByRole('dialog');
    expect(shown).toBe("Your mirror agent");
    expect(dialog).toHaveTextContent("Its role, “Your mirror agent”, always stays next to the name.");
    expect(dialog).not.toHaveTextContent('“your mirror”');
  });

  it('S4: an erased account has a neutral gray avatar, not a coloured initials disc', async () => {
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [msg('dm1', null, 'words of an erased person', { id: 'gone1' })] });
    const row = (await screen.findByText('words of an erased person')).closest('li') as HTMLElement;
    const avatar = row.querySelector('.bg-gray-200') as HTMLElement;
    expect(avatar).not.toBeNull();
    expect(avatar.textContent).toBe('');
    expect(within(row).queryByText('DU')).not.toBeInTheDocument();
    expect(within(row).getByText('Deleted user')).toBeInTheDocument();
  });

  it('N1: the conversation header title is one line with an ellipsis, on the title and the subtitle', async () => {
    renderChat('/home/c/g1', [mirror(), group('g1', 'An organisation with a very long name indeed')], { g1: [] });
    const h1 = await screen.findByRole('heading', { name: 'An organisation with a very long name indeed' });
    expect(classesOf(h1)).toContain('truncate');
    expect(classesOf(h1).some((c) => c.startsWith('line-clamp'))).toBe(false);
    expect(classesOf(screen.getByText('General', { selector: 'header span' }))).toContain('truncate');
  });
});

async function asDesktopAsync<T>(fn: () => Promise<T>): Promise<T> {
  const original = window.matchMedia;
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: q.includes('min-width: 1024px'), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
  try {
    return await fn();
  } finally {
    window.matchMedia = original;
  }
}

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

// ---------------------------------------------------------------------------
// Back, the message actions and Clarify (founder fixes after QA)
// ---------------------------------------------------------------------------
describe('Back goes back', () => {
  const dmChat = dm('dm1', 'Ada Lovelace');
  const channel = group('g1', 'Builders');
  const root = msg('g1', 'p-grace', 'start a thread here', { id: 'root' });
  const threadMsgs = { g1: [root, msg('g1', ME.id, 'a reply in the thread', { id: 'rep', threadRootId: 'root' })], dm1: [msg('dm1', 'p-dm1', 'hello there')] };
  const nav = () => screen.getByTestId('loc').getAttribute('data-nav');
  const where = () => screen.getByTestId('loc').textContent;
  const openThread = async () => {
    menuOn('start a thread here');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reply in thread' }));
    await screen.findByTestId('thread-panel');
  };

  it('a chat opened from the list: Back pops to the list, and one more pop leaves the app (no chat in between)', async () => {
    renderChat({ entries: ['/feed', '/home'], index: 1 }, [mirror(), dmChat], threadMsgs);
    await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
    fireEvent.click(rowButton('Ada Lovelace'));
    expect(where()).toBe('/home/c/dm1');
    expect(nav()).toBe('PUSH');
    fireEvent.click(await screen.findByRole('button', { name: 'Back to chats' }));
    expect(where()).toBe('/home');
    expect(nav()).toBe('POP');
    act(() => historyBack());
    expect(where()).toBe('/feed');
  });

  it('a chat arrived at cold (a link, a toast): Back replaces it with the list, so no loop forms', async () => {
    renderChat({ entries: ['/feed', '/home/c/dm1'], index: 1 }, [mirror(), dmChat], threadMsgs);
    await screen.findByText('hello there');
    fireEvent.click(screen.getByRole('button', { name: 'Back to chats' }));
    expect(where()).toBe('/home');
    expect(nav()).toBe('REPLACE');
    act(() => historyBack());
    expect(where()).toBe('/feed');
  });

  it('a thread opened from its chat: Back pops to the chat, then to the list, then out of the app', async () => {
    renderChat({ entries: ['/feed', '/home'], index: 1 }, [mirror(), channel], threadMsgs);
    await screen.findByText('Builders · General', { selector: '[data-testid="row-title"]' });
    fireEvent.click(rowButton('Builders · General'));
    await screen.findByText('start a thread here');
    await openThread();
    expect(where()).toBe('/home/c/g1/t/root');
    fireEvent.click(screen.getByRole('button', { name: 'Back to the conversation' }));
    expect(where()).toBe('/home/c/g1');
    expect(nav()).toBe('POP');
    fireEvent.click(screen.getByRole('button', { name: 'Back to chats' }));
    expect(where()).toBe('/home');
    expect(nav()).toBe('POP');
    act(() => historyBack());
    expect(where()).toBe('/feed');
  });

  it('a thread arrived at cold: Back and Close replace it with its chat', async () => {
    const { unmount } = renderChat({ entries: ['/feed', '/home/c/g1/t/root'], index: 1 }, [mirror(), channel], threadMsgs);
    await screen.findByTestId('thread-panel');
    fireEvent.click(screen.getByRole('button', { name: 'Back to the conversation' }));
    expect(where()).toBe('/home/c/g1');
    expect(nav()).toBe('REPLACE');
    act(() => historyBack());
    expect(where()).toBe('/feed');
    unmount();

    renderChat({ entries: ['/feed', '/home/c/g1/t/root'], index: 1 }, [mirror(), channel], threadMsgs);
    await screen.findByTestId('thread-panel');
    fireEvent.click(screen.getByRole('button', { name: 'Close thread' }));
    expect(where()).toBe('/home/c/g1');
    expect(nav()).toBe('REPLACE');
  });

  it('Escape closes a thread the same way: pop when the chat is the previous entry, replace when it is not', async () => {
    const { unmount } = renderChat('/home/c/g1', [mirror(), channel], threadMsgs);
    await screen.findByText('start a thread here');
    await openThread();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(where()).toBe('/home/c/g1');
    expect(nav()).toBe('POP');
    unmount();

    renderChat({ entries: ['/feed', '/home/c/g1/t/root'], index: 1 }, [mirror(), channel], threadMsgs);
    await screen.findByTestId('thread-panel');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(where()).toBe('/home/c/g1');
    expect(nav()).toBe('REPLACE');
  });

  it('archiving the open chat steps back to the list it came from: no duplicate list entry, never the archived chat', async () => {
    renderChat({ entries: ['/feed', '/home'], index: 1 }, [mirror(), dmChat], threadMsgs);
    await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
    fireEvent.click(rowButton('Ada Lovelace'));
    await screen.findByText('hello there');
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    expect(where()).toBe('/home');
    expect(nav()).toBe('POP');
    expect(screen.queryByTestId('conversation')).not.toBeInTheDocument();
    act(() => historyBack());
    expect(where()).toBe('/feed');
  });

  it('archiving a chat that was arrived at cold replaces it with the list', async () => {
    renderChat({ entries: ['/feed', '/home/c/dm1'], index: 1 }, [mirror(), dmChat], threadMsgs);
    await screen.findByText('hello there');
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    expect(where()).toBe('/home');
    expect(nav()).toBe('REPLACE');
  });

  it('archiving with a thread open steps back over the thread AND the chat, to the list', async () => {
    renderChat({ entries: ['/feed', '/home'], index: 1 }, [mirror(), channel], threadMsgs);
    await screen.findByText('Builders · General', { selector: '[data-testid="row-title"]' });
    fireEvent.click(rowButton('Builders · General'));
    await screen.findByText('start a thread here');
    await openThread();
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    expect(where()).toBe('/home');
    expect(nav()).toBe('POP');
    act(() => historyBack());
    expect(where()).toBe('/feed');
  });

  it('marking unread with a thread open leaves nothing behind that reopens the chat', async () => {
    renderChat({ entries: ['/feed', '/home'], index: 1 }, [mirror(), channel], threadMsgs);
    await screen.findByText('Builders · General', { selector: '[data-testid="row-title"]' });
    fireEvent.click(rowButton('Builders · General'));
    await screen.findByText('start a thread here');
    await openThread();
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Mark as unread' }));
    await waitFor(() => expect(where()).toBe('/home'));
    act(() => historyBack());
    expect(where()).toBe('/feed');
  });

  it('archiving the open chat from its list row steps back too', async () => {
    renderChat({ entries: ['/feed', '/home'], index: 1 }, [mirror(), dmChat], threadMsgs);
    await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
    fireEvent.click(rowButton('Ada Lovelace'));
    await screen.findByText('hello there');
    fireEvent.contextMenu(rowButton('Ada Lovelace'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    await waitFor(() => expect(where()).toBe('/home'));
    expect(nav()).toBe('POP');
    act(() => historyBack());
    expect(where()).toBe('/feed');
  });

  it('opening another thread while one is open replaces it: closing the second does not reopen the first', async () => {
    const second = msg('g1', 'p-grace', 'a second thread root', { id: 'root2' });
    renderChat({ entries: ['/feed', '/home'], index: 1 }, [mirror(), channel], { g1: [...threadMsgs.g1, second] });
    await screen.findByText('Builders · General', { selector: '[data-testid="row-title"]' });
    fireEvent.click(rowButton('Builders · General'));
    await screen.findByText('start a thread here');
    await openThread();
    expect(where()).toBe('/home/c/g1/t/root');
    menuOn('a second thread root');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reply in thread' }));
    await waitFor(() => expect(where()).toBe('/home/c/g1/t/root2'));
    expect(nav()).toBe('REPLACE');
    fireEvent.click(screen.getByRole('button', { name: 'Back to the conversation' }));
    expect(where()).toBe('/home/c/g1');
    expect(nav()).toBe('POP');
  });

  it('pressing the already-open thread again does nothing: no duplicate entry', async () => {
    svc.getThreadStats.mockResolvedValue(new Map([['root', { count: 1, authorIds: [ME.id] }]]));
    renderChat({ entries: ['/feed', '/home'], index: 1 }, [mirror(), channel], threadMsgs);
    await screen.findByText('Builders · General', { selector: '[data-testid="row-title"]' });
    fireEvent.click(rowButton('Builders · General'));
    await screen.findByText('start a thread here');
    await openThread();
    fireEvent.click(await screen.findByTestId('replies-link'));
    expect(where()).toBe('/home/c/g1/t/root');
    fireEvent.click(screen.getByRole('button', { name: 'Back to the conversation' }));
    expect(where()).toBe('/home/c/g1');
  });

  it('a thread reply found by search: the thread\'s Back goes to its conversation (which the history lacks), then to the list', async () => {
    svc.getMessage.mockResolvedValue(msg('g1', ME.id, 'a reply in the thread', { id: 'rep', threadRootId: 'root' }));
    renderChat(
      { entries: ['/feed', '/home', { pathname: '/home/c/g1', search: '?m=rep', state: { below: ['list'] } }], index: 2 },
      [mirror(), channel],
      threadMsgs,
    );
    await screen.findByTestId('thread-panel');
    expect(where()).toBe('/home/c/g1/t/root?m=rep');
    fireEvent.click(screen.getByRole('button', { name: 'Back to the conversation' }));
    expect(where()).toBe('/home/c/g1');
    expect(nav()).toBe('REPLACE');
    fireEvent.click(await screen.findByRole('button', { name: 'Back to chats' }));
    expect(where()).toBe('/home');
    expect(nav()).toBe('POP');
  });

  it('a cold-arrived channel -> thread -> archive leaves no channel behind', async () => {
    renderChat({ entries: ['/feed', '/home/c/g1'], index: 1 }, [mirror(), channel], threadMsgs);
    await screen.findByText('start a thread here');
    await openThread();
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    await waitFor(() => expect(where()).toBe('/home'));
    act(() => historyBack());
    await waitFor(() => expect(where()).toBe('/feed'));
  });

  it('a cold-arrived channel -> thread -> mark unread leaves no channel behind', async () => {
    renderChat({ entries: ['/feed', '/home/c/g1'], index: 1 }, [mirror(), channel], threadMsgs);
    await screen.findByText('start a thread here');
    await openThread();
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Mark as unread' }));
    await waitFor(() => expect(where()).toBe('/home'));
    act(() => historyBack());
    await waitFor(() => expect(where()).toBe('/feed'));
  });

  it('list beside an open thread -> select another chat: Back goes to the list, not the first channel', async () => {
    renderChat({ entries: ['/feed', '/home'], index: 1 }, [mirror(), channel, dmChat], threadMsgs);
    await screen.findByText('Builders · General', { selector: '[data-testid="row-title"]' });
    fireEvent.click(rowButton('Builders · General'));
    await screen.findByText('start a thread here');
    await openThread();
    fireEvent.click(rowButton('Ada Lovelace'));
    expect(where()).toBe('/home/c/dm1');
    fireEvent.click(await screen.findByRole('button', { name: 'Back to chats' }));
    expect(where()).toBe('/home');
    expect(nav()).toBe('POP');
    act(() => historyBack());
    expect(where()).toBe('/feed');
  });

  it('list -> chat -> Clarify -> mirror -> select another chat: Back goes to the list, not into the chat', async () => {
    svc.clarifyMessage.mockResolvedValue(msg('c-mirror', ME.id, null, { id: 'cl20', kind: 'clarify' }));
    renderChat({ entries: ['/feed', '/home'], index: 1 }, [mirror(), dmChat, channel], { dm1: [msg('dm1', 'p-dm1', 'clarify then switch')], g1: [] });
    await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
    fireEvent.click(rowButton('Ada Lovelace'));
    await screen.findByText('clarify then switch');
    menuOn('clarify then switch');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Clarify' }));
    await waitFor(() => expect(where()).toBe('/home/c/c-mirror'));
    fireEvent.click(rowButton('Builders · General'));
    expect(where()).toBe('/home/c/g1');
    fireEvent.click(await screen.findByRole('button', { name: 'Back to chats' }));
    expect(where()).toBe('/home');
  });

  it('a chat reached from a group page -> Clarify -> mirror -> archive leaves no chat behind', async () => {
    svc.clarifyMessage.mockResolvedValue(msg('c-mirror', ME.id, null, { id: 'cl21', kind: 'clarify' }));
    renderChat({ entries: ['/feed', '/groups/cm', '/home/c/g1'], index: 2 }, [mirror(), channel], { g1: [msg('g1', 'p-grace', 'clarify from group')] });
    await screen.findByText('clarify from group');
    menuOn('clarify from group');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Clarify' }));
    await waitFor(() => expect(where()).toBe('/home/c/c-mirror'));
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    await waitFor(() => expect(where()).toBe('/home'));
    act(() => historyBack());
    await waitFor(() => expect(where()).toBe('/groups/cm'));
  });

  it('the composer focus Clarify asks for is spent once: going back and forward again does not take focus', async () => {
    svc.clarifyMessage.mockResolvedValue(msg('c-mirror', ME.id, null, { id: 'cl22', kind: 'clarify' }));
    renderChat({ entries: ['/feed', '/home/c/dm1'], index: 1 }, [mirror(), dmChat], { dm1: [msg('dm1', 'p-dm1', 'clarify once')] });
    await screen.findByText('clarify once');
    menuOn('clarify once');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Clarify' }));
    expect(await screen.findByRole('textbox', { name: 'Write to your mirror agent' })).toHaveFocus();
    act(() => historyBack());
    await screen.findByRole('textbox', { name: 'Message Ada' });
    (document.activeElement as HTMLElement | null)?.blur();
    act(() => historyForward());
    const composer = await screen.findByRole('textbox', { name: 'Write to your mirror agent' });
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(composer).not.toHaveFocus();
  });

  it('a double tap on Back pops once, not twice out of the app', async () => {
    renderChat({ entries: ['/feed', '/home'], index: 1 }, [mirror(), dmChat], threadMsgs);
    await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
    fireEvent.click(rowButton('Ada Lovelace'));
    const back = await screen.findByRole('button', { name: 'Back to chats' });
    act(() => {
      back.click();
      back.click();
    });
    expect(where()).toBe('/home');
  });

  it('switching chats while one is open (desktop list) keeps the list as the entry before the chat', async () => {
    renderChat({ entries: ['/feed', '/home'], index: 1 }, [mirror(), dmChat, channel], threadMsgs);
    await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
    fireEvent.click(rowButton('Ada Lovelace'));
    await screen.findByText('hello there');
    fireEvent.click(rowButton('Builders · General'));
    expect(where()).toBe('/home/c/g1');
    expect(nav()).toBe('REPLACE');
    fireEvent.click(await screen.findByRole('button', { name: 'Back to chats' }));
    expect(where()).toBe('/home');
    expect(nav()).toBe('POP');
    act(() => historyBack());
    expect(where()).toBe('/feed');
  });

  it('marking the chat unread steps back to the list, so Back does not return and read it again', async () => {
    renderChat({ entries: ['/feed', '/home'], index: 1 }, [mirror(), dmChat], threadMsgs);
    await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
    fireEvent.click(rowButton('Ada Lovelace'));
    await screen.findByText('hello there');
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Mark as unread' }));
    await waitFor(() => expect(where()).toBe('/home'));
    expect(nav()).toBe('POP');
    act(() => historyBack());
    expect(where()).toBe('/feed');
  });

  it('marking a chat arrived at cold unread replaces it with the list', async () => {
    renderChat({ entries: ['/feed', '/home/c/dm1'], index: 1 }, [mirror(), dmChat], threadMsgs);
    await screen.findByText('hello there');
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Mark as unread' }));
    await waitFor(() => expect(where()).toBe('/home'));
    expect(nav()).toBe('REPLACE');
  });

  it('a chat link that cannot be opened: "Back to chats" follows the same rule', async () => {
    renderChat({ entries: ['/feed', '/home/c/nope'], index: 1 }, [mirror(), dmChat]);
    fireEvent.click(await within(await screen.findByTestId('chat-unavailable')).findByRole('button', { name: 'Back to chats' }));
    expect(where()).toBe('/home');
    expect(nav()).toBe('REPLACE');
  });

  it('a chat switched to from one that had no list before it carries no marker: Back replaces with the list', async () => {
    renderChat({ entries: ['/feed', '/home/c/dm1'], index: 1 }, [mirror(), dmChat, channel], threadMsgs);
    await screen.findByText('hello there');
    fireEvent.click(rowButton('Builders · General'));
    expect(where()).toBe('/home/c/g1');
    fireEvent.click(await screen.findByRole('button', { name: 'Back to chats' }));
    expect(where()).toBe('/home');
    expect(nav()).toBe('REPLACE');
  });
});

describe('message actions: toolbar and More', () => {
  const dmChat = dm('dm1', 'Ada Lovelace');
  const channel = group('g1', 'Builders');
  const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/);
  const toolbarOf = (text: string) => within(screen.getByText(text).closest('li') as HTMLElement).getByRole('toolbar', { name: 'Message actions' });
  const names = (bar: HTMLElement) => within(bar).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
  const menuNames = () => within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent);

  it('in a channel the toolbar reads Reply, Forward, Thread, Clarify', async () => {
    renderChat('/home/c/g1', [mirror(), channel], { g1: [msg('g1', 'p-grace', 'a channel post', { id: 'cp' })] });
    await screen.findByText('a channel post');
    fireEvent.pointerUp(screen.getByText('a channel post'));
    expect(names(toolbarOf('a channel post'))).toEqual(['Reply', 'Forward', 'Thread', "Clarify with your mirror agent"]);
  });

  it('on my own channel post More joins the toolbar (Edit and Delete live there)', async () => {
    renderChat('/home/c/g1', [mirror(), channel], { g1: [msg('g1', ME.id, 'my own post', { id: 'op' })] });
    await screen.findByText('my own post');
    fireEvent.pointerUp(screen.getByText('my own post'));
    expect(names(toolbarOf('my own post'))).toEqual(['Reply', 'Forward', 'Thread', "Clarify with your mirror agent", 'More actions']);
  });

  it('a 1:1 and the mirror offer Thread (P1546), and in the mirror no Clarify', async () => {
    const { unmount } = renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [msg('dm1', 'p-dm1', 'a plain message')] });
    await screen.findByText('a plain message');
    fireEvent.pointerUp(screen.getByText('a plain message'));
    expect(names(toolbarOf('a plain message'))).toEqual(['Reply', 'Forward', 'Thread', "Clarify with your mirror agent"]);
    unmount();

    renderChat('/home/c/c-mirror', [mirror(), dmChat], { 'c-mirror': [msg('c-mirror', ME.id, 'a note to self')] });
    await screen.findByText('a note to self');
    fireEvent.pointerUp(screen.getByText('a note to self'));
    expect(names(toolbarOf('a note to self'))).toEqual(['Reply', 'Forward', 'Thread', 'More actions']);
  });

  it('More holds only Edit and Delete, on my own messages; on someone else\'s message there is no More', async () => {
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [msg('dm1', 'p-dm1', 'theirs'), msg('dm1', ME.id, 'mine')] });
    await screen.findByText('mine');
    fireEvent.pointerUp(screen.getByText('theirs'));
    expect(within(toolbarOf('theirs')).queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();

    fireEvent.pointerUp(screen.getByText('mine'));
    fireEvent.click(within(toolbarOf('mine')).getByRole('button', { name: 'More actions' }));
    expect(menuNames()).toEqual(['Edit', 'Delete']);
  });

  it('a right-click opens the full list (no Mark as unread: that marks the whole chat, so it lives on the chat)', async () => {
    renderChat('/home/c/g1', [mirror(), channel], { g1: [msg('g1', ME.id, 'my channel post')] });
    await screen.findByText('my channel post');
    menuOn('my channel post');
    expect(menuNames()).toEqual(['Reply', 'Reply in thread', 'Forward', 'Clarify', 'Edit', 'Delete']);
  });

  it('no message menu offers Mark as unread (right-click on someone else\'s message), while the chat menus still do', async () => {
    renderChat('/home/c/g1', [mirror(), channel], { g1: [msg('g1', 'p-grace', 'not mine')] });
    await screen.findByText('not mine');
    menuOn('not mine');
    expect(menuNames()).toEqual(['Reply', 'Reply in thread', 'Forward', 'Clarify']);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(await screen.findByRole('menuitem', { name: 'Mark as unread' })).toBeInTheDocument();
  });

  it('Clarify is a labelled button: the mirror\'s face, the word, and "Clarify with <mirror name>" for its name and tip', async () => {
    renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [msg('dm1', 'p-dm1', 'clarify me')] });
    await screen.findByText('clarify me');
    fireEvent.pointerUp(screen.getByText('clarify me'));
    const button = within(toolbarOf('clarify me')).getByRole('button', { name: "Clarify with your mirror agent" });
    expect(button).toHaveTextContent('Clarify');
    expect(button).toHaveAttribute('title', "Clarify with your mirror agent");
    // The mirror's own mark (a glyph, never the owner's photo) on a dashed ring.
    expect(button.querySelector('span[aria-hidden="true"][class*="outline-dashed"]')).not.toBeNull();
    expect(button.querySelector('[data-testid="mirror-glyph"]')).not.toBeNull();
    expect(button.querySelector('img')).toBeNull();
    // 40px target, and the word drops out below 360px so five buttons keep one row at 320.
    expect(classesOf(button)).toContain('min-w-10');
    expect(classesOf(button)).toContain('h-10');
    expect(classesOf(button.lastElementChild!)).toEqual(expect.arrayContaining(['hidden', 'min-[360px]:inline']));
  });

  it('a renamed mirror is named by its title, in the button and the clarified card', async () => {
    const renamed = mirror('c-mirror', { title: 'Thinking out loud' });
    svc.clarifyMessage.mockResolvedValue(msg('c-mirror', ME.id, null, { id: 'cl9', kind: 'clarify' }));
    renderChat('/home/c/dm1', [renamed, dmChat], {
      dm1: [msg('dm1', 'p-dm1', 'rename test', { id: 'rn1' })],
      'c-mirror': [msg('c-mirror', ME.id, null, { id: 'cl9', kind: 'clarify', forwardSnapshot: { authorName: 'Ada Lovelace', body: 'words', createdAt: iso(5), conversationKind: 'dm', conversationTitle: 'Ada Lovelace', thread: [] } })],
    });
    await screen.findByText('rename test');
    fireEvent.pointerUp(screen.getByText('rename test'));
    fireEvent.click(within(toolbarOf('rename test')).getByRole('button', { name: 'Clarify with Thinking out loud' }));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/home/c/c-mirror'));
    expect(await screen.findByTestId('clarified-card')).toHaveTextContent('Sent to Thinking out loud to clarify');
  });

  describe('Clarify jumps to the mirror', () => {
    const nav = () => screen.getByTestId('loc').getAttribute('data-nav');
    const clarifyIt = async (text: string) => {
      menuOn(text);
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Clarify' }));
      await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/home/c/c-mirror'));
    };
    beforeEach(() => {
      svc.clarifyMessage.mockResolvedValue(msg('c-mirror', ME.id, null, { id: 'cl7', kind: 'clarify' }));
    });

    it('pushes the mirror, and its Back returns to the chat clarified from', async () => {
      renderChat({ entries: ['/feed', '/home/c/dm1'], index: 1 }, [mirror(), dmChat], { dm1: [msg('dm1', 'p-dm1', 'clarify back')] });
      await screen.findByText('clarify back');
      await clarifyIt('clarify back');
      expect(nav()).toBe('PUSH');
      fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
      expect(screen.getByTestId('loc')).toHaveTextContent(/^\/home\/c\/dm1$/);
      expect(nav()).toBe('POP');
    });

    it('leaving the mirror for good (archive) steps back over it and the chat it was clarified from, to the list', async () => {
      renderChat({ entries: ['/feed', '/home'], index: 1 }, [mirror(), dmChat], { dm1: [msg('dm1', 'p-dm1', 'clarify deep')] });
      await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
      fireEvent.click(rowButton('Ada Lovelace'));
      await screen.findByText('clarify deep');
      await clarifyIt('clarify deep');
      await userEvent.click(screen.getByRole('button', { name: 'More' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
      expect(screen.getByTestId('loc')).toHaveTextContent(/^\/home$/);
      expect(nav()).toBe('POP');
    });

    it('a failed clarify shows an error toast, keeps the quote staged and puts the typed note back', async () => {
      svc.clarifyMessage.mockRejectedValue(new Error('chat clarify failed: chat: not available'));
      renderChat('/home/c/dm1', [mirror(), dmChat], { dm1: [msg('dm1', 'p-dm1', 'clarify fail')], 'c-mirror': [] });
      await screen.findByText('clarify fail');
      menuOn('clarify fail');
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Clarify' }));
      await screen.findByTestId('clarify-pending');
      const field = screen.getByRole('textbox', { name: 'Write to your mirror agent' });
      fireEvent.change(field, { target: { value: 'my reason' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      await waitFor(() => expect(toastFn.error).toHaveBeenCalled());
      expect(screen.getByTestId('clarify-pending')).toBeInTheDocument();
      await waitFor(() => expect(field).toHaveValue('my reason'));
    });
  });
});

describe('the clarified card and the mirror preview', () => {
  const clarified = (author: string, kind: 'dm' | 'group' | 'event' | null, title: string | null, forwardAuthorId: string | null = null, id = 'cc1') =>
    msg('c-mirror', ME.id, null, { id, kind: 'clarify', forwardAuthorId, forwardSnapshot: { authorName: author, body: 'what I said', createdAt: iso(5), conversationKind: kind, conversationTitle: title, thread: [] } });
  const cardFor = async (m: ChatMessage) => {
    renderChat('/home/c/c-mirror', [mirror(), dm('dm1', 'Alice Moreau')], { 'c-mirror': [m] });
    return await screen.findByTestId('clarified-card');
  };

  const label = (card: HTMLElement) => within(card).getByTestId('forwarded-label');
  const author = (card: HTMLElement) => within(card).getByTestId('clarified-author');

  it('a 1:1 from the other person: line 1 says where, line 2 names them once', async () => {
    const card = await cardFor(clarified('Alice Moreau', 'dm', 'Alice Moreau'));
    expect(label(card).textContent).toBe("Sent to your mirror agent to clarify · from your chat with Alice Moreau");
    expect(author(card).textContent).toBe('Alice Moreau');
    // Never the same name twice on one line.
    expect(label(card).textContent!.match(/Alice Moreau/g)).toHaveLength(1);
    expect(card.textContent).not.toContain('Clarified from');
  });

  it('my own message in a 1:1 reads "You", decided by the author\'s id, not by their name', async () => {
    // A different display name than the account's (renamed since): the id still says it is mine.
    const card = await cardFor(clarified('Mia M.', 'dm', 'Alice Moreau', ME.id));
    expect(label(card).textContent).toBe("Sent to your mirror agent to clarify · from your chat with Alice Moreau");
    expect(author(card).textContent).toBe('You');
    expect(card.textContent).not.toContain('Mia M.');
  });

  it('another person with the same name as mine shows their name, not "You"', async () => {
    const card = await cardFor(clarified('Mia Maker', 'dm', 'Alice Moreau', 'p-someone-else'));
    expect(author(card).textContent).toBe('Mia Maker');
  });

  it('an erased author (no id) shows the snapshot name, which erasure sets to "Deleted user"', async () => {
    const card = await cardFor(clarified('Deleted user', 'dm', 'Alice Moreau', null));
    expect(author(card).textContent).toBe('Deleted user');
  });

  it('a snapshot with no author id never says "You", even when the name matches mine', async () => {
    const card = await cardFor(clarified('Mia Maker', 'dm', 'Alice Moreau', null));
    expect(author(card).textContent).toBe('Mia Maker');
  });

  it('a channel names the channel or event chat on line 1 and the author on line 2', async () => {
    const { unmount } = renderChat('/home/c/c-mirror', [mirror(), dm('dm1', 'Alice Moreau')], { 'c-mirror': [clarified('Grace Hopper', 'group', 'Builders · General')] });
    let card = await screen.findByTestId('clarified-card');
    expect(label(card).textContent).toBe("Sent to your mirror agent to clarify · from Builders · General");
    expect(author(card).textContent).toBe('Grace Hopper');
    unmount();
    renderChat('/home/c/c-mirror', [mirror(), dm('dm1', 'Alice Moreau')], { 'c-mirror': [clarified('Grace Hopper', 'event', 'Friday Night')] });
    card = await screen.findByTestId('clarified-card');
    expect(label(card).textContent).toBe("Sent to your mirror agent to clarify · from Friday Night");
  });

  it('with no title the kind speaks: "your chat", "a group chat"', async () => {
    const { unmount } = renderChat('/home/c/c-mirror', [mirror(), dm('dm1', 'Alice Moreau')], { 'c-mirror': [clarified('Alice Moreau', 'dm', null)] });
    expect(label(await screen.findByTestId('clarified-card')).textContent).toBe("Sent to your mirror agent to clarify · from your chat");
    unmount();
    renderChat('/home/c/c-mirror', [mirror(), dm('dm1', 'Alice Moreau')], { 'c-mirror': [clarified('Grace Hopper', 'group', null)] });
    expect(label(await screen.findByTestId('clarified-card')).textContent).toBe("Sent to your mirror agent to clarify · from a group chat");
  });

  it('the mirror row previews "Clarify: <first words>", and just "Clarify" when there are none; others are untouched', () => {
    const lastOf = (kind: 'clarify' | 'message' | 'forward', body: string | null, authorId = ME.id) => ({ ...last('x', 1, authorId, 'Mia Maker'), kind, body });
    expect(previewLine(mirror('m', { lastMessage: lastOf('clarify', 'what   I said\nover two lines') }), ME.id)).toEqual({ prefix: 'Clarify: ', text: 'what I said over two lines' });
    expect(previewLine(mirror('m', { lastMessage: lastOf('clarify', null) }), ME.id)).toEqual({ prefix: '', text: 'Clarify' });
    expect(previewLine(mirror('m', { lastMessage: lastOf('clarify', '   ') }), ME.id)).toEqual({ prefix: '', text: 'Clarify' });
    expect(previewLine(mirror('m', { lastMessage: lastOf('message', 'a note') }), ME.id)).toEqual({ prefix: 'You: ', text: 'a note' });
    expect(previewLine(mirror('m', { lastMessage: lastOf('forward', null) }), ME.id)).toEqual({ prefix: 'You: ', text: 'Forwarded message' });
  });

  it('the mirror list row reads "Clarify: <words>" when the list carries the clarified body', async () => {
    renderChat('/home', [mirror('c-mirror', { lastMessage: { ...last('x', 1, ME.id, ME.name), kind: 'clarify', body: 'what I said to Alice' } }), dm('dm1', 'Alice Moreau')]);
    const row = await screen.findByText("Your mirror agent", { selector: '[data-testid="row-title"]' });
    const li = row.closest('li') as HTMLElement;
    expect(li).toHaveTextContent('Clarify: what I said to Alice');
    expect(li.textContent).not.toContain('You:');
  });

  it('the mirror list row reads "Clarify" with no "You: Clarified message"', async () => {
    renderChat('/home', [mirror('c-mirror', { lastMessage: { ...last('x', 1, ME.id, ME.name), kind: 'clarify', body: null } }), dm('dm1', 'Alice Moreau')]);
    const row = await screen.findByText("Your mirror agent", { selector: '[data-testid="row-title"]' });
    const li = row.closest('li') as HTMLElement;
    expect(li).toHaveTextContent('Clarify');
    expect(li.textContent).not.toContain('Clarified message');
    expect(li.textContent).not.toContain('You:');
  });
});

// ---------------------------------------------------------------------------
// The mirror wears its own mark, never the owner's photo
// ---------------------------------------------------------------------------
describe('the mirror mark', () => {
  const PHOTO = 'https://example.test/me.png';
  const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/);
  beforeEach(() => {
    AUTH.user = { ...ME, avatarUrl: PHOTO };
  });

  it('is a soft blue disc with a mirror glyph on a dashed ring: no photo, no initials', () => {
    const { container } = render(<MirrorMark size="list" />);
    const ring = container.firstElementChild as HTMLElement;
    expect(classesOf(ring)).toEqual(expect.arrayContaining(['outline-dashed']));
    const disc = container.querySelector('[data-testid="mirror-disc"]') as HTMLElement;
    expect(classesOf(disc)).toEqual(expect.arrayContaining(['bg-blue-100', 'text-blue-700']));
    expect(container.querySelector('[data-testid="mirror-glyph"]')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('shows a generated portrait in place of the glyph when one is given (a later spec supplies it)', () => {
    const { container } = render(<MirrorMark size="list" imageUrl="https://example.test/portrait.png" />);
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.test/portrait.png');
    expect(container.querySelector('[data-testid="mirror-glyph"]')).toBeNull();
  });

  it('is the same glyph at every size', () => {
    for (const size of ['xs', 'sm', 'list'] as const) {
      const { container, unmount } = render(<MirrorMark size={size} />);
      expect(container.querySelector('[data-testid="mirror-glyph"]'), size).not.toBeNull();
      unmount();
    }
  });

  it('the list row, the header and the forward picker show it, and never the owner\'s photo or initials', async () => {
    const theirs = msg('c-mirror', ME.id, 'a note to self', { id: 'nn1' });
    renderChat('/home/c/c-mirror', [mirror('c-mirror', { lastMessage: { ...last('preview words', 1, ME.id, ME.name) } }), dm('dm1', 'Ada Lovelace')], { 'c-mirror': [theirs] });
    const row = (await screen.findByText("Your mirror agent", { selector: '[data-testid="row-title"]' })).closest('li') as HTMLElement;
    expect(row.querySelector('[data-testid="mirror-glyph"]')).not.toBeNull();
    expect(row.querySelector('img')).toBeNull();
    expect(row.textContent).not.toContain('MM');
    const header = screen.getByTestId('conversation').querySelector('header') as HTMLElement;
    expect(header.querySelector('[data-testid="mirror-glyph"]')).not.toBeNull();
    expect(header.querySelector('img')).toBeNull();
    await screen.findByText('a note to self');
    menuOn('a note to self');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Forward' }));
    const dialog = await screen.findByRole('dialog');
    const pickerRow = within(dialog).getByRole('button', { name: /mirror/i });
    expect(pickerRow.querySelector('[data-testid="mirror-glyph"]')).not.toBeNull();
    expect(pickerRow.querySelector('img')).toBeNull();
    expect(dialog.textContent).not.toContain('MM');
  });
});

// ---------------------------------------------------------------------------
// The header title opens the person, group or event
// ---------------------------------------------------------------------------
describe('the conversation header title is a link to who or what the chat is with', () => {
  const titleLink = (name: string | RegExp) => within(screen.getByTestId('conversation').querySelector('header') as HTMLElement).queryByRole('link', { name });

  it('a 1:1 links the person\'s profile', async () => {
    renderChat('/home/c/dm1', [mirror(), dm('dm1', 'Ada Lovelace')], { dm1: [] });
    await screen.findByTestId('conversation');
    expect(titleLink(/Ada Lovelace/)).toHaveAttribute('href', '/p/ada');
  });

  it('a group links its page, an event links its page', async () => {
    const { unmount } = renderChat('/home/c/g1', [mirror(), group('g1', 'Builders')], { g1: [] });
    await screen.findByTestId('conversation');
    expect(within(screen.getByTestId('conversation')).getByRole('link', { name: /Builders/ })).toHaveAttribute('href', '/groups/builders');
    unmount();
    renderChat('/home/c/e1', [mirror(), eventChat('e1', 'Friday Night', 5)], { e1: [] });
    await screen.findByTestId('conversation');
    expect(within(screen.getByTestId('conversation')).getByRole('link', { name: /Friday Night/ })).toHaveAttribute('href', '/events/friday-night');
  });

  it('the mirror and a person whose account is gone have no link to follow', async () => {
    const { unmount } = renderChat('/home/c/c-mirror', [mirror(), dm('dm1', 'Ada Lovelace')], { 'c-mirror': [] });
    await screen.findByTestId('conversation');
    expect(within(screen.getByTestId('conversation').querySelector('header') as HTMLElement).queryAllByRole('link')).toHaveLength(0);
    unmount();
    const gone = dm('dm9', 'Gone', { other: { id: null, name: 'Deleted user', slug: null, avatarUrl: null, avatarColor: null } });
    renderChat('/home/c/dm9', [mirror(), gone], { dm9: [] });
    await screen.findByTestId('conversation');
    expect(within(screen.getByTestId('conversation').querySelector('header') as HTMLElement).queryAllByRole('link')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Last review: Back out of followed threads, a leave that must not read, toasts that know where they are
// ---------------------------------------------------------------------------
describe('freshness fixes', () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const dmChat = dm('dm1', 'Ada Lovelace');
  const channel = group('g1', 'Builders');
  const stateOf = () => JSON.parse(screen.getByTestId('loc').getAttribute('data-state') ?? 'null');
  const nav = () => screen.getByTestId('loc').getAttribute('data-nav');
  const where = () => screen.getByTestId('loc').textContent;
  const rootMsg = msg('g1', 'p-grace', 'start a thread here', { id: 'root' });

  it('a cold chat -> thread -> Mark as unread ends unread: nothing reads the chat on the way out', async () => {
    renderChat({ entries: ['/feed', '/home/c/g1'], index: 1 }, [mirror(), channel], { g1: [rootMsg] });
    await screen.findByText('start a thread here');
    menuOn('start a thread here');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reply in thread' }));
    await screen.findByTestId('thread-panel');
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Mark as unread' }));
    await waitFor(() => expect(where()).toBe('/home'));
    await sleep(100);
    expect(svc.setChatState).toHaveBeenCalledWith('g1', { manualUnread: true });
    expect(svc.markRead).not.toHaveBeenCalled();
    expect(await within(rowFor('Builders · General')).findByRole('img', { name: 'Marked unread' })).toBeInTheDocument();
  });

  describe('the "Open" on a toast goes by where the person is when they press it', () => {
    const forwardFromAda = async () => {
      svc.forwardMessage.mockResolvedValue(msg('g1', ME.id, 'see this', { id: 'f9', kind: 'forward' }));
      renderChat({ entries: ['/feed', '/home'], index: 1 }, [mirror(), dmChat, channel], { dm1: [msg('dm1', 'p-dm1', 'worth forwarding', { id: 'fw9' })], g1: [] });
      await screen.findByText('Ada Lovelace', { selector: '[data-testid="row-title"]' });
      fireEvent.click(rowButton('Ada Lovelace'));
      await screen.findByText('worth forwarding');
      menuOn('worth forwarding');
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Forward' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: /Builders/ }));
      fireEvent.click(within(dialog).getByRole('button', { name: 'Send' }));
      await waitFor(() => expect(toastFn).toHaveBeenCalledWith('Forwarded', expect.anything()));
      const [, options] = toastFn.mock.calls.find((c) => c[0] === 'Forwarded')!;
      return (options as { action: { onClick: () => void } }).action.onClick;
    };

    it('still on the chat it forwarded from: the target opens on top of it, and Back returns to it', async () => {
      const open = await forwardFromAda();
      act(() => open());
      expect(where()).toBe('/home/c/g1');
      expect(nav()).toBe('PUSH');
      expect(stateOf()).toEqual({ below: ['conv', 'list'] });
      fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
      expect(where()).toBe('/home/c/dm1');
      expect(nav()).toBe('POP');
    });

    it('after the person went back to the list (the chat it came from is gone): the list is what is below', async () => {
      const open = await forwardFromAda();
      fireEvent.click(await screen.findByRole('button', { name: 'Back to chats' }));
      expect(where()).toBe('/home');
      act(() => open());
      expect(where()).toBe('/home/c/g1');
      expect(stateOf()).toEqual({ below: ['list'] });
    });
  });

  describe('a thread URL that cannot be a thread keeps its Back state', () => {
    it('a thread URL on a 1:1 whose thread is not available is replaced by the chat, carrying what was below', async () => {
      renderChat({ entries: ['/feed', { pathname: '/home/c/dm1/t/x', state: { below: ['list'] } }], index: 1 }, [mirror(), dmChat], { dm1: [msg('dm1', 'p-dm1', 'plain dm')] });
      svc.listThread.mockImplementation(async () => null);
      await screen.findByText('plain dm');
      await waitFor(() => expect(where()).toBe('/home/c/dm1'));
      expect(where()).toBe('/home/c/dm1');
      expect(nav()).toBe('REPLACE');
      expect(stateOf()).toEqual({ below: ['list'] });
    });

    it('a thread that is not available, arrived at with the list below: replaced by its chat, state kept', async () => {
      renderChat({ entries: ['/feed', { pathname: '/home/c/g1/t/gone', state: { below: ['list'] } }], index: 1 }, [mirror(), channel], { g1: [rootMsg] });
      svc.listThread.mockImplementation(async () => null);
      await waitFor(() => expect(where()).toBe('/home/c/g1'));
      expect(nav()).toBe('REPLACE');
      expect(stateOf()).toEqual({ below: ['list'] });
    });

    it('a thread that is not available, opened from its chat: closing it pops back to that chat', async () => {
      renderChat(
        { entries: ['/feed', '/home', { pathname: '/home/c/g1', state: { below: ['list'] } }, { pathname: '/home/c/g1/t/gone', state: { below: ['conv', 'list'] } }], index: 3 },
        [mirror(), channel],
        { g1: [rootMsg] },
      );
      svc.listThread.mockImplementation(async () => null);
      await waitFor(() => expect(where()).toBe('/home/c/g1'));
      expect(nav()).toBe('POP');
    });
  });
});

describe('a pending Clarify (review fixes)', () => {
  const dmChat = dm('dm1', 'Ada Lovelace');
  const src = (text = 'to clarify') => msg('dm1', 'p-dm1', text, { id: 'src1' });

  it('F6: one staged for a mirror pane that is already open appears without a navigation', async () => {
    renderChat('/home/c/c-mirror', [mirror(), dmChat], { 'c-mirror': [] });
    await screen.findByRole('textbox', { name: 'Write to your mirror agent' });
    expect(screen.queryByTestId('clarify-pending')).not.toBeInTheDocument();
    act(() => stageClarify('c-mirror', { message: src('late clarify'), authorName: 'Ada Lovelace' }));
    expect(await screen.findByTestId('clarify-pending')).toHaveTextContent('late clarify');
  });

  it('F5: it is taken once: after the pane is closed and opened again it does not come back', async () => {
    stageClarify('c-mirror', { message: src('only once'), authorName: 'Ada Lovelace' });
    const first = renderChat('/home/c/c-mirror', [mirror(), dmChat], { 'c-mirror': [] });
    expect(await screen.findByTestId('clarify-pending')).toBeInTheDocument();
    first.unmount();
    renderChat('/home/c/c-mirror', [mirror(), dmChat], { 'c-mirror': [] });
    await screen.findByRole('textbox', { name: 'Write to your mirror agent' });
    expect(screen.queryByTestId('clarify-pending')).not.toBeInTheDocument();
  });

  it('F7: Reply and Clarify are never pending together', async () => {
    stageClarify('c-mirror', { message: src('stage first'), authorName: 'Ada Lovelace' });
    renderChat('/home/c/c-mirror', [mirror(), dmChat], { 'c-mirror': [msg('c-mirror', ME.id, 'a note to self', { id: 'n9' })] });
    await screen.findByTestId('clarify-pending');
    menuOn('a note to self');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reply' }));
    expect(await screen.findByTestId('reply-pending')).toBeInTheDocument();
    expect(screen.queryByTestId('clarify-pending')).not.toBeInTheDocument();
    // ...and a Clarify staged later replaces the reply.
    act(() => stageClarify('c-mirror', { message: src('stage second'), authorName: 'Ada Lovelace' }));
    expect(await screen.findByTestId('clarify-pending')).toHaveTextContent('stage second');
    expect(screen.queryByTestId('reply-pending')).not.toBeInTheDocument();
  });

  it('F3: a send that is refused at once gives the typed note back, and Send waits while one is in flight', async () => {
    const onSend = vi.fn().mockReturnValue(false);
    const { rerender } = render(<MemoryRouter><Composer draftKey="k-f3" placeholder="Write" onSend={onSend} /></MemoryRouter>);
    const field = screen.getByRole('textbox', { name: 'Write' });
    fireEvent.change(field, { target: { value: 'keep me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(field).toHaveValue('keep me');
    rerender(<MemoryRouter><Composer draftKey="k-f3" placeholder="Write" onSend={onSend} sendDisabled /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    fireEvent.submit(field.closest('form')!);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('F4: only the attachment that was submitted is cleared when the clarify lands', async () => {
    helpers.loadMyShareables.mockResolvedValue([
      { kind: 'point', id: 'pt-a', title: 'Alpha', tags: [], point: { id: 'pt-a', statement: 'Alpha' } },
      { kind: 'point', id: 'pt-b', title: 'Beta', tags: [], point: { id: 'pt-b', statement: 'Beta' } },
    ]);
    let land!: (m: ChatMessage) => void;
    svc.clarifyMessage.mockImplementation(() => new Promise<ChatMessage>((r) => { land = r; }));
    svc.sendMessage.mockResolvedValue(msg('c-mirror', ME.id, null, { id: 'x1' }));
    stageClarify('c-mirror', { message: src('with attachment'), authorName: 'Ada Lovelace' });
    renderChat('/home/c/c-mirror', [mirror(), dmChat], { 'c-mirror': [] });
    await screen.findByTestId('clarify-pending');
    fireEvent.click(screen.getByRole('button', { name: 'Attach a point or story' }));
    fireEvent.click(await screen.findByRole('button', { name: /Attach Alpha/ }));
    await screen.findByText('Attached point: Alpha');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(svc.clarifyMessage).toHaveBeenCalled());
    // While the send is out, another attachment is picked.
    fireEvent.click(screen.getByRole('button', { name: 'Attach a point or story' }));
    fireEvent.click(await screen.findByRole('button', { name: /Attach Beta/ }));
    await screen.findByText('Attached point: Beta');
    await act(async () => { land(msg('c-mirror', ME.id, null, { id: 'cl-f4', kind: 'clarify' })); await new Promise((r) => setTimeout(r, 30)); });
    expect(screen.getByText('Attached point: Beta')).toBeInTheDocument();
  });
});
