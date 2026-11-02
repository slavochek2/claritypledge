/**
 * @file p1536-x11-closed-thread.test.tsx
 * @description P1536 §3c X11 + S3c.15: a PUBLISHED or DISCARDED canvas thread, opened from the mirror chat's own "N replies", is read in the chat's own
 * thread panel, in place (no canvas page state):
 *  - the history, and NO composer, upload or voice: J11's closed line sits in their place
 *      published: "Published as v3." with **Open canvas** (that published version, no `ws=1`)
 *      discarded: "This draft was discarded." (a founder-decision default of the wording table), no button
 *  - the Publish reply carries **Open canvas** too, to the version THIS thread's draft became (the root attaches the base, so reading it
 *    through the attached version sent the owner to v1)
 *  - an OPEN draft's thread still redirects to the workspace (Thread tab below 1280px); inside the workspace (`fill`) the composer is there
 *  - an ordinary mirror thread is untouched
 * Real ThreadPanel, Composer and canvas hooks; the database reads and the message list are faked.
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-mappers';
import type { CanvasDraft, CanvasVersionCardData } from '@/app/data/canvas-draft-service';

const ME = 'user-id-me';
const CONV = 'conv-mirror-1';
const ROOT = 'root-1';

const state = vi.hoisted(() => ({ draft: null as CanvasDraft | null, messages: [] as ChatMessage[], card: null as CanvasVersionCardData | null }));
const svc = vi.hoisted(() => ({
  getCanvasDraftAvailability: vi.fn(),
  getCanvasDraftByThread: vi.fn(),
  getLatestCanvasRun: vi.fn(),
  getLastDoneCanvasDraftRunAt: vi.fn(),
  getCanvasRootCard: vi.fn(),
  getCanvasVersionCard: vi.fn(),
  listMyCanvasVersions: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), ...svc }));
vi.mock('@/app/pages/chat/use-message-actions', () => ({ useMessageActions: () => ({ actions: {}, dialogs: null }) }));
vi.mock('@/app/pages/chat/MessageList', () => ({
  MessageList: ({ trailing }: { trailing?: { afterId: string; node: React.ReactNode } | null }) => <div data-testid="message-list">{trailing?.node}</div>,
}));
vi.mock('@/app/pages/chat/use-conversation', () => ({
  useConversationMessages: () => ({ server: state.messages, status: 'ready', send: vi.fn() }),
}));

import { ThreadPanel } from '@/app/pages/chat/ThreadPanel';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { resetCanvasThreads } from '@/app/pages/chat/canvas-thread-registry';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';

const summary: ChatSummary = {
  conversationId: CONV, kind: 'mirror', title: 'Mira', other: null, org: null, event: null, ownerFirstName: 'Test',
  lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false,
};
const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: 'm', conversationId: CONV, authorId: ME, body: 'hello', createdAt: '2026-10-27T08:00:00.000Z', editedAt: null, deletedAt: null, isDeleted: false,
  replyToId: null, threadRootId: ROOT, forwardedFromMessageId: null, forwardAuthorId: null, forwardSnapshot: null, kind: 'message', attachmentKind: null,
  attachmentId: null, clientId: null, contextConversationId: null, ...over,
});
const draftRow = (over: Partial<CanvasDraft> = {}): CanvasDraft => ({
  id: 'draft-1', versionId: 'ver-d3', canvasId: 'cv-1', baseVersionId: 'ver-1', conversationId: CONV, threadRootId: ROOT, state: 'published', runCount: 2, revision: 7,
  closedAt: '2026-10-26T10:00:00.000Z', canvasName: 'canvas', versionName: 'canvas_dabc', ...over,
});
const PUBLISHED_HREF = '/p/test-user/canvas/canvas?v=canvas_dabc';
const publishedCard = (): CanvasVersionCardData => ({
  title: 'Canvas', canvasId: 'cv-1', label: 'v3 · Oct 26, 2026', state: 'published', draft: false, href: PUBLISHED_HREF, openHref: PUBLISHED_HREF, seq: 3, hasThread: true, draftId: 'draft-1',
});
const chatValue = {
  userId: ME, status: 'ready', error: null, chats: [summary], unreadCount: 0, refresh: vi.fn(async () => [summary]), setArchived: vi.fn(), setManualUnread: vi.fn(),
  markRead: vi.fn(), subscribe: () => () => undefined, setViewing: vi.fn(), revision: 0,
  authors: { [ME]: { id: ME, name: 'Test Owner', slug: 'test-user', avatarUrl: null, avatarColor: null, hasPledged: false } },
  missingAuthors: new Set(), ensureAuthors: vi.fn(), outbox: [], sendMessage: vi.fn(), retrySend: vi.fn(), discardSend: vi.fn(), block: vi.fn(), unblock: vi.fn(), goToChat: vi.fn(), resync: vi.fn(),
} as unknown as ChatContextValue;

function Where() {
  const l = useLocation();
  return <output data-testid="where" data-tab={(l.state as { tab?: string } | null)?.tab ?? ''}>{l.pathname}{l.search}</output>;
}
function mount(fill = false) {
  return render(
    <MemoryRouter initialEntries={['/artifacts', `/chats/c/${CONV}/t/${ROOT}`]} initialIndex={1}>
      <ChatContext.Provider value={chatValue}>
        <Routes>
          <Route path="/chats/c/:cid/t/:rid" element={<><Where /><ThreadPanel summary={summary} rootId={ROOT} highlightId={null} fill={fill} /></>} />
          <Route path="*" element={<Where />} />
        </Routes>
      </ChatContext.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  resetCanvasAvailability();
  resetCanvasThreads();
  state.draft = draftRow();
  state.card = publishedCard();
  state.messages = [msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-1' })];
  svc.getCanvasDraftAvailability.mockResolvedValue(true);
  svc.getCanvasDraftByThread.mockImplementation(async () => state.draft);
  svc.getLatestCanvasRun.mockResolvedValue(null);
  svc.getLastDoneCanvasDraftRunAt.mockResolvedValue(null);
  svc.getCanvasRootCard.mockImplementation(async () => state.card);
  svc.getCanvasVersionCard.mockImplementation(async () => state.card);
  svc.listMyCanvasVersions.mockResolvedValue([]);
});
afterEach(cleanup);

const noComposer = () => {
  expect(screen.queryByTestId('composer')).toBeNull();
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByTestId('canvas-upload')).toBeNull();
  expect(screen.queryByRole('button', { name: /voice|record|dictate/i })).toBeNull();
};

describe('X11: a published thread, read in the chat\'s own panel', () => {
  it('stays where it is (no redirect), with history, no composer / upload / voice, and J11\'s closed line with Open canvas', async () => {
    mount();
    const line = await screen.findByTestId('canvas-closed-line');
    expect(screen.getByTestId('where')).toHaveTextContent(`/chats/c/${CONV}/t/${ROOT}`);
    expect(screen.getByTestId('message-list')).toBeInTheDocument();
    expect(line).toHaveTextContent('Published as v3.');
    const open = screen.getByTestId('canvas-closed-open');
    expect(open).toHaveTextContent('Open canvas');
    expect(open.getAttribute('href')).toBe(PUBLISHED_HREF);
    expect(open.getAttribute('href')).not.toContain('ws=1');
    noComposer();
  });

  it('the closed line is read through the THREAD (the root attaches the base version, not the published one)', async () => {
    mount();
    await screen.findByTestId('canvas-closed-line');
    expect(svc.getCanvasRootCard).toHaveBeenCalledWith(ROOT, 'ver-1', ME);
  });

  it('the panel header does not say "Draft" for a thread that is not one any more', async () => {
    mount();
    await screen.findByTestId('canvas-closed-line');
    const title = screen.getByTestId('canvas-thread-title');
    expect(title).toHaveTextContent('Thread');
    expect(title).not.toHaveTextContent(/Draft|New canvas/);
  });

  it('with no readable address there is still the line, and no button', async () => {
    state.card = { ...publishedCard(), href: null, openHref: null };
    mount();
    expect(await screen.findByTestId('canvas-closed-line')).toHaveTextContent('Published as v3.');
    expect(screen.queryByTestId('canvas-closed-open')).toBeNull();
  });
});

describe('X11: a discarded thread, read in the chat\'s own panel', () => {
  beforeEach(() => {
    state.draft = draftRow({ state: 'discarded' });
    state.card = { title: 'Canvas', canvasId: 'cv-1', label: 'Discarded', state: 'discarded', draft: false, href: '/p/test-user/canvas/canvas', openHref: '/p/test-user/canvas/canvas', hasThread: true, draftId: 'draft-1' };
  });

  it('says it was discarded, with no button, and no composer / upload / voice', async () => {
    mount();
    const line = await screen.findByTestId('canvas-closed-line');
    expect(screen.getByTestId('where')).toHaveTextContent(`/chats/c/${CONV}/t/${ROOT}`);
    expect(line).toHaveTextContent('This draft was discarded.');
    expect(screen.queryByTestId('canvas-closed-open')).toBeNull();
    expect(screen.getByTestId('canvas-thread-title')).not.toHaveTextContent(/Draft|New canvas/);
    noComposer();
  });
});

describe('S3c.15: the Publish reply carries Open canvas', () => {
  it('to the version this thread\'s draft became, with no ws=1 (the root attaches the base, so not v1)', async () => {
    state.messages = [
      msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-1' }),
      msg({ id: 'reply-1', authorId: null, kind: 'agent', body: 'Published v3. I deleted the text of your uploads.' }),
    ];
    mount();
    const open = await screen.findByTestId('publish-reply-open');
    expect(open).toHaveTextContent('Open canvas');
    expect(open.getAttribute('href')).toBe(PUBLISHED_HREF);
    expect(svc.getCanvasRootCard).toHaveBeenCalledWith(ROOT, 'ver-1', ME);
  });
});

describe('X11 controls', () => {
  it('CONTROL: an OPEN draft\'s thread still redirects to the workspace, REPLACING, on the Thread tab', async () => {
    state.draft = draftRow({ state: 'open', closedAt: null });
    mount();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/test-user/canvas/canvas?v=canvas_dabc&ws=1'));
    expect(screen.getByTestId('where').dataset.tab).toBe('thread');
    expect(screen.queryByTestId('canvas-closed-line')).toBeNull();
  });

  it('CONTROL: inside the workspace (fill) an open draft\'s thread has its composer and no closed line', async () => {
    state.draft = draftRow({ state: 'open', closedAt: null });
    mount(true);
    await screen.findByTestId('thread-panel');
    await act(async () => {});
    expect(screen.getByTestId('composer')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-closed-line')).toBeNull();
  });

  it('CONTROL: an ordinary mirror thread keeps its composer and has no closed line', async () => {
    state.messages = [msg({ id: ROOT, body: 'a plain thought', threadRootId: null })];
    mount();
    await screen.findByTestId('thread-panel');
    await act(async () => {});
    expect(screen.getByTestId('composer')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-closed-line')).toBeNull();
  });

  it('CONTROL: with drafting off the old thread stays readable AS IT IS (nothing closed is drawn over it)', async () => {
    svc.getCanvasDraftAvailability.mockResolvedValue(false);
    mount();
    await screen.findByTestId('thread-panel');
    await act(async () => {});
    expect(screen.queryByTestId('canvas-closed-line')).toBeNull();
  });
});
