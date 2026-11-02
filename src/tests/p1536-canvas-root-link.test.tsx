/**
 * @file p1536-canvas-root-link.test.tsx
 * @description P1536 §3c X11 (S3c.8), supersedes W0's "no thread link on a canvas root": a canvas thread root shows the same "N replies" link as every other thread in the chat
 * (`RepliesLink`), hidden at 0, singular at 1. By what the thread's draft is (read in the chat's ONE batched read, canvas-root-store):
 *  - OPEN draft: opens the workspace with the thread showing (the Thread tab below 1280px);
 *  - PUBLISHED or DISCARDED: opens the mirror chat's own thread panel in place (`onThread`), no new state on the canvas page;
 *  - no resolvable draft (an unreadable one, someone else's): no link at all.
 * It is a REAL ANCHOR with the address known now: a modifier or middle click follows it (a new tab, copy link) and checks nothing; only a plain left click reads the CURRENT state first,
 * with visible pending feedback, and a superseded read never decides where it goes. Real MessageList and MessageRow; the canvas reads are faked.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-mappers';
import type { ConversationApi } from '@/app/pages/chat/MessageList';
import type { CanvasDraft } from '@/app/data/canvas-draft-service';
import { emitCanvasDraftEvent } from '@/app/data/canvas-draft-events';
import { resetCanvasRootStore } from '@/app/pages/chat/canvas-root-store';
import { chatPath } from '@/app/pages/chat/chat-view-model';

const svc = vi.hoisted(() => ({ getCanvasDraftsByThreads: vi.fn(), listMyCanvasVersions: vi.fn(), getProfileSlug: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: { user: { id: 'me' } }, user: { id: 'me' } }) }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), ...svc }));
vi.mock('@/app/data/canvas-artifacts', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-artifacts')), listMyCanvases: vi.fn(async () => []) }));
vi.mock('@/app/pages/chat/AttachmentCard', () => ({ AttachmentCard: ({ rootId, count }: { rootId?: string; count?: number }) => <div data-testid="attachment-card" data-root-id={rootId ?? ''} data-count={count ?? ''} /> }));

import { MessageList } from '@/app/pages/chat/MessageList';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';

const mirrorChat: ChatSummary = {
  conversationId: 'c', kind: 'mirror', title: 'Mira', other: null, org: null, event: null, ownerFirstName: 'Test',
  lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false,
};

const m = (id: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id, conversationId: 'c', authorId: 'me', body: 'a plain message', createdAt: '2026-10-27T08:00:00.000Z', editedAt: null, deletedAt: null, isDeleted: false,
  replyToId: null, threadRootId: null, forwardedFromMessageId: null, forwardAuthorId: null, forwardSnapshot: null, kind: 'message',
  attachmentKind: null, attachmentId: null, clientId: null, contextConversationId: null, ...over,
});
const canvasRoot = (id: string) => m(id, { body: null, attachmentKind: 'canvas_version', attachmentId: 'ver-1' });

const chatValue = {
  userId: 'me', status: 'ready', error: null, chats: [mirrorChat], authors: { me: { id: 'me', name: 'Me', slug: 'test-user', avatarUrl: null, avatarColor: null, hasPledged: false } }, missingAuthors: new Set(), ensureAuthors: vi.fn(), outbox: [], subscribe: () => () => undefined,
} as unknown as ChatContextValue;

function Where() {
  const l = useLocation();
  const st = l.state as { tab?: string; from?: string } | null;
  return <output data-testid="where" data-tab={st?.tab ?? ''} data-from={st?.from ?? ''}>{l.pathname}{l.search}</output>;
}

function mount(messages: ChatMessage[], stats: Map<string, { count: number; authorIds: string[] }>, onThread = vi.fn(), inThread = false) {
  const conv = {
    status: 'ready', messages, stats, hasMore: false, loadingEarlier: false, loadEarlier: vi.fn(), ensureLoaded: vi.fn(), lookup: vi.fn(), getLoaded: vi.fn(), syncVersion: 0,
    retrySend: vi.fn(), discard: vi.fn(), edit: vi.fn(), reload: vi.fn(),
  } as unknown as ConversationApi;
  render(
    <MemoryRouter initialEntries={['/chats/c/c']}>
      <ChatContext.Provider value={chatValue}>
        <Routes>
          <Route path="/chats/c/c" element={<><Where /><MessageList conv={conv} actions={{ onReply: vi.fn(), onThread } as never} viewerId="me" authors={{}} label="Messages" empty="empty" inThread={inThread} /></>} />
          <Route path="*" element={<Where />} />
        </Routes>
      </ChatContext.Provider>
    </MemoryRouter>,
  );
  return onThread;
}

const WS = '/p/test-user/canvas/canvas_4?v=canvas_dd2&ws=1';
const CHAT_THREAD = chatPath('c', { rootId: 'root-new' });
const draft = (state: CanvasDraft['state'], over: Partial<CanvasDraft> = {}): CanvasDraft => ({
  id: 'd-1', versionId: 'ver-d2', canvasId: 'cv-1', baseVersionId: 'ver-1', conversationId: 'conv', threadRootId: 'root-new', state, runCount: 1, revision: 1, closedAt: null,
  canvasName: 'canvas_4', versionName: 'canvas_dd2', ...over,
});
/** What the database says for the root now (null: no draft the viewer can read). */
let now: CanvasDraft | null;
const idle = () => act(async () => { await new Promise((r) => setTimeout(r, 15)); });
const link = () => screen.getByTestId('replies-link') as HTMLAnchorElement;

beforeEach(() => {
  resetCanvasRootStore();
  vi.clearAllMocks();
  now = draft('open');
  svc.getCanvasDraftsByThreads.mockImplementation(async () => new Map(now ? [['root-new', now]] : []));
  svc.listMyCanvasVersions.mockResolvedValue([]);
  svc.getProfileSlug.mockResolvedValue('test-user');
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
});

const twoReplies = new Map([['root-new', { count: 2, authorIds: ['me'] }]]);

describe('X11: a canvas draft thread root in the main conversation', () => {
  it('with no reply yet shows no link', async () => {
    mount([canvasRoot('root-new')], new Map());
    await idle();
    expect(screen.queryByTestId('replies-link')).not.toBeInTheDocument();
  });

  it.each([[1, '1 reply'], [2, '2 replies'], [7, '7 replies']])('with %i replies it reads "%s"', async (count, text) => {
    mount([canvasRoot('root-new')], new Map([['root-new', { count, authorIds: ['me'] }]]));
    expect(await screen.findByTestId('replies-link')).toHaveTextContent(text);
  });

  it('on an OPEN draft it is a real anchor to the workspace; a plain click opens it with the thread showing (the Thread tab), and not the chat\'s panel', async () => {
    const onThread = mount([canvasRoot('root-new')], twoReplies);
    await screen.findByTestId('replies-link');
    expect(link().getAttribute('href')).toBe(WS);
    fireEvent.click(link());
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(WS));
    expect(screen.getByTestId('where').dataset.tab).toBe('thread');
    expect(screen.getByTestId('where').dataset.from).toBe('/chats/c/c'); // the workspace's back arrow returns to the chat
    expect(onThread).not.toHaveBeenCalled();
  });

  it.each([['published'], ['discarded']] as const)('on a %s thread it is an anchor to the chat\'s own thread address; a plain click opens the panel in place (onThread)', async (state) => {
    now = draft(state);
    const onThread = mount([canvasRoot('root-new')], twoReplies);
    await screen.findByTestId('replies-link');
    expect(link().getAttribute('href')).toBe(CHAT_THREAD);
    fireEvent.click(link());
    await waitFor(() => expect(onThread).toHaveBeenCalledWith(expect.objectContaining({ id: 'root-new' }))); // the tap reads the current state first
    expect(screen.getByTestId('where')).toHaveTextContent('/chats/c/c');
  });

  it.each([
    ['a root with no draft the viewer can read (not theirs, or gone)', () => { now = null; }],
    ['an open draft whose address cannot be read (it has nowhere to go)', () => { now = draft('open', { versionName: null }); }],
    ['a read that is refused (never a link that goes nowhere)', () => { svc.getCanvasDraftsByThreads.mockRejectedValue(new Error('offline')); }],
  ])('%s shows no link', async (_n, arrange) => {
    arrange();
    mount([canvasRoot('root-new')], twoReplies);
    await waitFor(() => expect(svc.getCanvasDraftsByThreads).toHaveBeenCalled());
    await idle();
    expect(screen.queryByTestId('replies-link')).not.toBeInTheDocument();
  });

  it('MEDIUM 2: a modifier or middle click follows the anchor (known address, a new tab): nothing is read, nothing is intercepted', async () => {
    const onThread = mount([canvasRoot('root-new')], twoReplies);
    await screen.findByTestId('replies-link');
    const reads = svc.getCanvasDraftsByThreads.mock.calls.length;
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      expect(fireEvent.click(link(), init)).toBe(true); // true: not preventDefault-ed, so the browser follows the anchor
    }
    await idle();
    expect(svc.getCanvasDraftsByThreads.mock.calls.length).toBe(reads);
    expect(onThread).not.toHaveBeenCalled();
    expect(screen.getByTestId('where')).toHaveTextContent('/chats/c/c');
  });

  it('MEDIUM 2: while the tap\'s read is out the link shows it (aria-busy and a spinner), a second click is ignored, and it ends', async () => {
    const onThread = mount([canvasRoot('root-new')], twoReplies);
    await screen.findByTestId('replies-link');
    let answer: (m: Map<string, CanvasDraft>) => void = () => undefined;
    svc.getCanvasDraftsByThreads.mockImplementationOnce(() => new Promise((r) => { answer = r; }));
    expect(link()).toHaveAttribute('aria-busy', 'false');
    fireEvent.click(link());
    await waitFor(() => expect(link()).toHaveAttribute('aria-busy', 'true'));
    expect(link().querySelector('svg.animate-spin')).not.toBeNull();
    const reads = svc.getCanvasDraftsByThreads.mock.calls.length;
    fireEvent.click(link());
    expect(svc.getCanvasDraftsByThreads.mock.calls.length).toBe(reads);
    await act(async () => answer(new Map([['root-new', draft('published')]])));
    await waitFor(() => expect(onThread).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(link()).toHaveAttribute('aria-busy', 'false'));
  });

  it('item 1: a link drawn for an OPEN draft, published elsewhere: the tap reads the current state and opens the chat\'s panel, never the workspace', async () => {
    const onThread = mount([canvasRoot('root-new')], twoReplies);
    await screen.findByTestId('replies-link');
    now = draft('published'); // published in another tab; no signal has reached this tab
    fireEvent.click(link());
    await waitFor(() => expect(onThread).toHaveBeenCalledWith(expect.objectContaining({ id: 'root-new' })));
    expect(screen.getByTestId('where')).toHaveTextContent('/chats/c/c');
  });

  it('item 1: the other way round (drawn for a closed thread, a draft open now) the tap goes to the workspace', async () => {
    now = draft('published');
    const onThread = mount([canvasRoot('root-new')], twoReplies);
    await screen.findByTestId('replies-link');
    now = draft('open');
    fireEvent.click(link());
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(WS));
    expect(onThread).not.toHaveBeenCalled();
  });

  it('item 1: discarded elsewhere and the tab came back: the link reads the new state before any tap, with ONE query', async () => {
    mount([canvasRoot('root-new')], twoReplies);
    await screen.findByTestId('replies-link');
    now = draft('discarded');
    const before = svc.getCanvasDraftsByThreads.mock.calls.length;
    act(() => emitCanvasDraftEvent({ kind: 'discarded', draftId: 'd-1' }));
    await waitFor(() => expect(link().getAttribute('href')).toBe(CHAT_THREAD));
    expect(svc.getCanvasDraftsByThreads.mock.calls.length - before).toBe(1);
  });

  it('item 1: a draft deleted meanwhile: the tap has nothing to open and goes nowhere, and the link goes', async () => {
    const onThread = mount([canvasRoot('root-new')], twoReplies);
    await screen.findByTestId('replies-link');
    now = null;
    fireEvent.click(link());
    await waitFor(() => expect(screen.queryByTestId('replies-link')).not.toBeInTheDocument());
    expect(onThread).not.toHaveBeenCalled();
    expect(screen.getByTestId('where')).toHaveTextContent('/chats/c/c');
  });

  it('item 3: the tap\'s read A sees OPEN and is slow; a publish event\'s read B sees published and returns first: the tap follows B (the chat\'s panel, not the workspace)', async () => {
    const onThread = mount([canvasRoot('root-new')], twoReplies);
    await screen.findByTestId('replies-link');
    let answerA: (m: Map<string, CanvasDraft>) => void = () => undefined;
    svc.getCanvasDraftsByThreads.mockImplementationOnce(() => new Promise((r) => { answerA = r; })); // A
    fireEvent.click(link());
    await waitFor(() => expect(link()).toHaveAttribute('aria-busy', 'true'));
    now = draft('published');
    act(() => emitCanvasDraftEvent({ kind: 'published', draftId: 'd-1' })); // B
    await waitFor(() => expect(link().getAttribute('href')).toBe(CHAT_THREAD));
    await act(async () => answerA(new Map([['root-new', draft('open')]]))); // A answers late, stale
    await waitFor(() => expect(onThread).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('where')).toHaveTextContent('/chats/c/c');
  });

  it('the root\'s card is told it is a thread root and its reply count; a canvas version attached to a REPLY is not', async () => {
    mount([canvasRoot('root-new'), m('reply', { threadRootId: 'root-new', attachmentKind: 'canvas_version', attachmentId: 'ver-9' })], twoReplies);
    const cards = await screen.findAllByTestId('attachment-card');
    expect(cards.map((c) => c.getAttribute('data-root-id'))).toEqual(['root-new', '']);
    expect(cards[0]!.getAttribute('data-count')).toBe('2');
  });

  it('CONTROL: an ordinary message with replies still shows "N replies" and opens its thread', () => {
    const onThread = mount([m('plain')], new Map([['plain', { count: 2, authorIds: ['me'] }]]));
    const link = screen.getByTestId('replies-link');
    expect(link).toHaveTextContent('2 replies');
    fireEvent.click(link);
    expect(onThread).toHaveBeenCalledWith(expect.objectContaining({ id: 'plain' }));
  });

  it('CONTROL: an ordinary message with no replies has no thread link', () => {
    mount([m('plain')], new Map());
    expect(screen.queryByTestId('replies-link')).not.toBeInTheDocument();
  });

  it('CONTROL: other attachments (a point) with no replies have none either', () => {
    mount([m('att', { attachmentKind: 'canvas', attachmentId: 'cv-1' })], new Map());
    expect(screen.queryByTestId('replies-link')).not.toBeInTheDocument();
  });

  it('CONTROL: inside the thread panel itself there is no thread link on the root', () => {
    mount([canvasRoot('root-new')], new Map(), vi.fn(), true);
    expect(screen.queryByTestId('replies-link')).not.toBeInTheDocument();
  });

  it('a deleted card has no link', () => {
    mount([{ ...canvasRoot('gone'), isDeleted: true, deletedAt: '2026-10-27T09:00:00.000Z', attachmentKind: null, attachmentId: null }], new Map());
    expect(screen.queryByTestId('replies-link')).not.toBeInTheDocument();
  });
});
