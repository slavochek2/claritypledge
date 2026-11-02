/**
 * @file p1536-canvas-root-link.test.tsx
 * @description P1536 §3c X11 (S3c.8), supersedes W0's "no thread link on a canvas root": a canvas thread root shows the same "N replies" link as every other
 * thread in the chat (`RepliesLink`), hidden at 0, singular at 1. By what the thread's draft is:
 *  - OPEN draft: opens the workspace with the thread showing (the Thread tab below 1280px), REPLACE-free (a plain push, so Back returns to the chat);
 *  - PUBLISHED or DISCARDED: opens the mirror chat's own thread panel in place (`onThread`), no new state on the canvas page;
 *  - no resolvable draft (an unreadable one, someone else's): no link at all.
 * The root's card is read through its thread (AttachmentCard gets the root's id). Real MessageList and MessageRow; the canvas reads are faked.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-mappers';
import type { ConversationApi } from '@/app/pages/chat/MessageList';
import type { CanvasVersionCardData } from '@/app/data/canvas-draft-service';

const svc = vi.hoisted(() => ({ getCanvasRootCard: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: { user: { id: 'me' } }, user: { id: 'me' } }) }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), ...svc }));
vi.mock('@/app/pages/chat/AttachmentCard', () => ({ AttachmentCard: ({ rootId }: { rootId?: string }) => <div data-testid="attachment-card" data-root-id={rootId ?? ''} /> }));

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
  userId: 'me', status: 'ready', error: null, chats: [mirrorChat], authors: {}, missingAuthors: new Set(), ensureAuthors: vi.fn(), outbox: [], subscribe: () => () => undefined,
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
const card = (over: Partial<CanvasVersionCardData>): CanvasVersionCardData => ({
  title: 'Canvas 4', canvasId: 'cv-1', label: 'Draft', state: 'draft', draft: true, href: WS, openHref: WS, nextSeq: 2, hasThread: true, draftId: 'd-1', ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  svc.getCanvasRootCard.mockResolvedValue(card({}));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
});

describe('X11: a canvas draft thread root in the main conversation', () => {
  it('with no reply yet shows no link', async () => {
    mount([canvasRoot('root-new')], new Map());
    await screen.findByTestId('attachment-card');
    expect(screen.queryByTestId('replies-link')).not.toBeInTheDocument();
  });

  it.each([[1, '1 reply'], [2, '2 replies'], [7, '7 replies']])('with %i replies it reads "%s"', async (count, text) => {
    mount([canvasRoot('root-new')], new Map([['root-new', { count, authorIds: ['me'] }]]));
    expect(await screen.findByTestId('replies-link')).toHaveTextContent(text);
  });

  it('on an OPEN draft it opens the workspace with the thread showing (the Thread tab), and does not open the chat\'s panel', async () => {
    const onThread = mount([canvasRoot('root-new')], new Map([['root-new', { count: 2, authorIds: ['me'] }]]));
    fireEvent.click(await screen.findByTestId('replies-link'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(WS));
    expect(screen.getByTestId('where').dataset.tab).toBe('thread');
    expect(screen.getByTestId('where').dataset.from).toBe('/chats/c/c'); // the workspace's back arrow returns to the chat
    expect(onThread).not.toHaveBeenCalled();
    expect(svc.getCanvasRootCard).toHaveBeenCalledWith('root-new', 'ver-1', 'me');
  });

  it.each([
    ['published', card({ state: 'published', draft: false, label: 'v2 · Nov 2, 2026', seq: 2, href: '/p/test-user/canvas/canvas_4?v=canvas_dd2', openHref: '/p/test-user/canvas/canvas_4?v=canvas_dd2' })],
    ['discarded', card({ state: 'discarded', draft: false, label: 'Discarded' })],
  ])('on a %s thread it opens the chat\'s own thread panel in place (onThread), and goes nowhere else', async (_n, data) => {
    svc.getCanvasRootCard.mockResolvedValue(data);
    const onThread = mount([canvasRoot('root-new')], new Map([['root-new', { count: 2, authorIds: ['me'] }]]));
    fireEvent.click(await screen.findByTestId('replies-link'));
    expect(onThread).toHaveBeenCalledWith(expect.objectContaining({ id: 'root-new' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/chats/c/c');
  });

  it.each([
    ['a root with no draft the viewer can read (the card fell back to the attached version)', card({ hasThread: undefined, draftId: undefined, state: 'published', draft: false })],
    ['a root that is not the viewer\'s at all (no card)', null],
  ])('%s shows no link', async (_n, data) => {
    svc.getCanvasRootCard.mockResolvedValue(data);
    mount([canvasRoot('root-new')], new Map([['root-new', { count: 2, authorIds: ['me'] }]]));
    await waitFor(() => expect(svc.getCanvasRootCard).toHaveBeenCalled());
    await screen.findByTestId('attachment-card');
    expect(screen.queryByTestId('replies-link')).not.toBeInTheDocument();
  });

  it('a read that fails shows no link (never a link that goes nowhere)', async () => {
    svc.getCanvasRootCard.mockRejectedValue(new Error('offline'));
    mount([canvasRoot('root-new')], new Map([['root-new', { count: 2, authorIds: ['me'] }]]));
    await waitFor(() => expect(svc.getCanvasRootCard).toHaveBeenCalled());
    expect(screen.queryByTestId('replies-link')).not.toBeInTheDocument();
  });

  it('the root\'s card is told it is a thread root (it reads its thread\'s draft); a canvas version attached to a REPLY is not', async () => {
    mount([canvasRoot('root-new'), m('reply', { threadRootId: 'root-new', attachmentKind: 'canvas_version', attachmentId: 'ver-9' })], new Map());
    const cards = await screen.findAllByTestId('attachment-card');
    expect(cards.map((c) => c.getAttribute('data-root-id'))).toEqual(['root-new', '']);
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
