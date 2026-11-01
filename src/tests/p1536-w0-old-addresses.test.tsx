/**
 * @file p1536-w0-old-addresses.test.tsx
 * @description P1536 §3b W0 (S3b.2): an old canvas-thread address (a chat thread whose root is a canvas version) resolves by the
 * thread's draft, with REPLACE navigation, one test per case:
 *  1. open draft          -> /p/:handle/canvas/:tag?v=<draft>&ws=1
 *  2. published version   -> /p/:handle/canvas/:tag?v=<version>              (no ws)
 *  3. discarded draft     -> the canvas page at its newest published version, or Artifacts > Canvases when none was ever published
 *  4. deleted / not yours -> nothing moves: the thread keeps its existing behaviour
 *  5. drafting off        -> the thread stays readable as it is
 * Plus: the workspace's own mount of the panel (`fill`) never redirects, and the thread is held behind a skeleton while the answer is out.
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-mappers';
import type { CanvasDraft } from '@/app/data/canvas-draft-service';

const ME = 'user-id-me';
const CONV = 'conv-mirror-1';
const ROOT = 'root-1';

const state = vi.hoisted(() => ({ draft: null as CanvasDraft | null, available: true as boolean | null, messages: [] as ChatMessage[], versions: [] as unknown[] }));
const svc = vi.hoisted(() => ({
  getCanvasDraftAvailability: vi.fn(),
  getCanvasDraftByThread: vi.fn(),
  getLatestCanvasRun: vi.fn(),
  getLastDoneCanvasDraftRunAt: vi.fn(),
  listMyCanvasVersions: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), ...svc }));
vi.mock('@/app/pages/chat/use-message-actions', () => ({ useMessageActions: () => ({ actions: {}, dialogs: null }) }));
vi.mock('@/app/pages/chat/MessageList', () => ({ MessageList: () => <div data-testid="message-list" /> }));
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
  id: 'draft-1', versionId: 'ver-draft', canvasId: 'cv-1', baseVersionId: null, conversationId: CONV, threadRootId: ROOT, state: 'open', runCount: 1, revision: 0,
  closedAt: null, canvasName: 'canvas', versionName: 'canvas_dabc', ...over,
});
const chatValue = {
  userId: ME, status: 'ready', error: null, chats: [summary], unreadCount: 0, refresh: vi.fn(async () => [summary]), setArchived: vi.fn(), setManualUnread: vi.fn(),
  markRead: vi.fn(), subscribe: () => () => undefined, setViewing: vi.fn(), revision: 0,
  authors: { [ME]: { id: ME, name: 'Test Owner', slug: 'test-user', avatarUrl: null, avatarColor: null, hasPledged: false } },
  missingAuthors: new Set(), ensureAuthors: vi.fn(), outbox: [], sendMessage: vi.fn(), retrySend: vi.fn(), discardSend: vi.fn(), block: vi.fn(), unblock: vi.fn(), goToChat: vi.fn(), resync: vi.fn(),
} as unknown as ChatContextValue;

function Where() {
  const l = useLocation();
  return (
    <>
      <output data-testid="where">{l.pathname}{l.search}</output>
      <output data-testid="nav-type">{useNavigationType()}</output>
    </>
  );
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
  Object.assign(state, {
    draft: draftRow(), available: true, versions: [],
    messages: [msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-draft' })],
  });
  svc.getCanvasDraftAvailability.mockImplementation(async () => state.available);
  svc.getCanvasDraftByThread.mockImplementation(async () => state.draft);
  svc.getLatestCanvasRun.mockResolvedValue(null);
  svc.getLastDoneCanvasDraftRunAt.mockResolvedValue(null);
  svc.listMyCanvasVersions.mockImplementation(async () => state.versions);
});
afterEach(cleanup);

describe('S3b.2 / W0: an old canvas-thread address resolves by the thread\'s draft (REPLACE)', () => {
  it('case 1, open draft: the workspace on it, replacing the old address', async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/test-user/canvas/canvas?v=canvas_dabc&ws=1'));
    expect(screen.getByTestId('nav-type')).toHaveTextContent('REPLACE');
    expect(screen.queryByTestId('thread-panel')).not.toBeInTheDocument();
  });

  it('case 2, published version: that version, plain (no ws)', async () => {
    state.draft = draftRow({ state: 'published', closedAt: '2026-10-26T10:00:00.000Z' });
    mount();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/test-user/canvas/canvas?v=canvas_dabc'));
    expect(screen.getByTestId('where').textContent).not.toContain('ws=1');
    expect(screen.getByTestId('nav-type')).toHaveTextContent('REPLACE');
  });

  it('case 3a, discarded draft: the canvas page at its newest published version (no ?v)', async () => {
    state.draft = draftRow({ state: 'discarded', closedAt: '2026-10-26T10:00:00.000Z' });
    state.versions = [{ id: 'v1', canvasId: 'cv-1', canvasName: 'canvas', name: 'canvas_d1', seq: 1, publishedAt: '2026-10-01T10:00:00Z', hasOpenDraft: false }];
    mount();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/test-user/canvas/canvas'));
    expect(screen.getByTestId('where').textContent).toBe('/p/test-user/canvas/canvas');
    expect(screen.getByTestId('nav-type')).toHaveTextContent('REPLACE');
  });

  it('case 3b, discarded draft of a canvas never published: Artifacts > Canvases', async () => {
    state.draft = draftRow({ state: 'discarded', closedAt: '2026-10-26T10:00:00.000Z' });
    mount();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/artifacts?tab=canvases'));
    expect(screen.getByTestId('nav-type')).toHaveTextContent('REPLACE');
  });

  it('case 3c, CONTROL: another canvas\'s published version does not count as this canvas having one', async () => {
    state.draft = draftRow({ state: 'discarded', closedAt: '2026-10-26T10:00:00.000Z' });
    state.versions = [{ id: 'v9', canvasId: 'cv-9', canvasName: 'other_canvas', name: 'other_d1', seq: 1, publishedAt: '2026-10-01T10:00:00Z', hasOpenDraft: false }];
    mount();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/artifacts?tab=canvases'));
  });

  it('case 4, deleted or not the viewer\'s (no draft readable): nothing moves, and the thread keeps its existing behaviour', async () => {
    state.draft = null;
    mount();
    await screen.findByTestId('thread-panel');
    await act(async () => {});
    expect(screen.getByTestId('where')).toHaveTextContent(`/chats/c/${CONV}/t/${ROOT}`);
    expect(screen.queryByTestId('thread-retired')).not.toBeInTheDocument();
  });

  it('case 5, drafting off: the thread stays readable, nothing moves', async () => {
    state.available = false;
    mount();
    await screen.findByTestId('thread-panel');
    await act(async () => {});
    expect(screen.getByTestId('where')).toHaveTextContent(`/chats/c/${CONV}/t/${ROOT}`);
    expect(svc.getCanvasDraftAvailability).toHaveBeenCalled();
  });

  it('CONTROL: a draft whose names cannot be read does not strand the owner behind a skeleton: the thread shows', async () => {
    state.draft = draftRow({ canvasName: null, versionName: null });
    mount();
    await screen.findByTestId('thread-panel');
    expect(screen.getByTestId('where')).toHaveTextContent(`/chats/c/${CONV}/t/${ROOT}`);
  });

  it('while the answer is out the thread is held behind a skeleton, not drawn and then replaced', async () => {
    let release: (d: CanvasDraft | null) => void = () => undefined;
    svc.getCanvasDraftByThread.mockImplementation(() => new Promise<CanvasDraft | null>((r) => { release = r; }));
    mount();
    expect(await screen.findByTestId('thread-retired')).toBeInTheDocument();
    expect(screen.queryByTestId('thread-panel')).not.toBeInTheDocument();
    await act(async () => release(draftRow()));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('ws=1'));
  });

  it('CONTROL: the workspace\'s own mount of the panel (fill) never redirects, whatever state the draft is in', async () => {
    mount(true);
    await screen.findByTestId('thread-panel');
    await act(async () => {});
    expect(screen.getByTestId('where')).toHaveTextContent(`/chats/c/${CONV}/t/${ROOT}`);
  });

  it('CONTROL: an ordinary mirror thread is never looked up or moved', async () => {
    state.messages = [msg({ id: ROOT, body: 'a plain thought', threadRootId: null })];
    mount();
    await screen.findByTestId('thread-panel');
    await act(async () => {});
    expect(svc.getCanvasDraftByThread).not.toHaveBeenCalled();
    expect(screen.getByTestId('where')).toHaveTextContent(`/chats/c/${CONV}/t/${ROOT}`);
  });
});
