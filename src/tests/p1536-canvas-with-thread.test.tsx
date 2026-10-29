/**
 * @file p1536-canvas-with-thread.test.tsx
 * @description P1536 v3: the canvas page with the owner's mirror thread beside it.
 *  - ThreadPanel's `onClose` replaces the chat's Back (the control that closes the pane on the canvas page)
 *  - the route wrapper shows the pane only from 1280px, with a `thread` param, the viewer's mirror chat, THEIR OWN canvas and that
 *    canvas's open draft's thread; closing it removes only `thread` (replacing the entry, keeping its state) and the canvas page
 *    stays mounted; the page's parts are told whether the pane is shown
 * Each "only" has a control showing the same thing present where it should be.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatSummary } from '@/app/data/chat-mappers';

const ME = 'user-id-me';
const CONV = 'conv-mirror-1';
const ROOT = 'root-1';
const media = vi.hoisted(() => ({ desktop: true, queries: [] as string[] }));
const draftRead = vi.hoisted(() => ({ result: null as unknown, fail: false }));
const pageMounts = vi.hoisted(() => ({ count: 0 }));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'user-id-me', slug: 'Ana' }, session: null, sessionChecked: true }) }));
vi.mock('@/app/data/canvas-draft-service', async () => ({
  ...(await vi.importActual<object>('@/app/data/canvas-draft-service')),
  getCanvasDraftByThread: async () => { if (draftRead.fail) throw new Error('down'); return draftRead.result; },
}));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@/app/pages/chat/use-message-actions', () => ({ useMessageActions: () => ({ actions: {}, dialogs: null }) }));
vi.mock('@/app/pages/chat/use-conversation', () => ({
  isLocal: () => false,
  useConversationMessages: () => ({
    server: [], messages: [], status: 'ready', send: vi.fn(), stats: new Map(), hasMore: false, loadingEarlier: false,
    loadEarlier: vi.fn(), ensureLoaded: vi.fn(), lookup: vi.fn(), getLoaded: vi.fn(), syncVersion: 0, retrySend: vi.fn(), discard: vi.fn(), edit: vi.fn(), reload: vi.fn(),
  }),
}));
vi.mock('@/app/pages/chat/chat-hooks', async () => ({
  ...(await vi.importActual<object>('@/app/pages/chat/chat-hooks')),
  useMediaQuery: (q: string) => { media.queries.push(q); return media.desktop; },
}));
// The canvas page is its own suite; here it is a marker that must survive the pane coming and going.
vi.mock('@/app/pages/canvas-page', async () => {
  const { useEffect } = await import('react');
  const { useCanvasPaneShown } = await import('@/app/components/canvas/canvas-pane-context');
  return {
    CanvasPage: () => {
      useEffect(() => { pageMounts.count += 1; }, []);
      return <div data-testid="canvas-page-stub" data-pane={String(useCanvasPaneShown())} />;
    },
  };
});

import { ThreadPanel } from '@/app/pages/chat/ThreadPanel';
import { CanvasWithThread } from '@/app/pages/canvas/canvas-with-thread';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';

const summary = (over: Partial<ChatSummary> = {}): ChatSummary => ({
  conversationId: CONV, kind: 'mirror', title: 'Mira', other: null, org: null, event: null, ownerFirstName: 'Test',
  lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false, ...over,
});
const chatValue = (chats: ChatSummary[]): ChatContextValue => ({
  userId: ME, status: 'ready', error: null, chats, unreadCount: 0, refresh: vi.fn(async () => chats), setArchived: vi.fn(), setManualUnread: vi.fn(),
  markRead: vi.fn(), subscribe: () => () => undefined, setViewing: vi.fn(), revision: 0,
  authors: { [ME]: { id: ME, name: 'Test Owner', slug: 'test-user', avatarUrl: null, avatarColor: null, hasPledged: false } },
  missingAuthors: new Set(), ensureAuthors: vi.fn(), outbox: [], sendMessage: vi.fn(), retrySend: vi.fn(), discardSend: vi.fn(), block: vi.fn(), unblock: vi.fn(), goToChat: vi.fn(), resync: vi.fn(),
}) as ChatContextValue;

const openDraft = (over: Record<string, unknown> = {}) => ({
  id: 'draft-1', state: 'open', conversationId: CONV, threadRootId: ROOT, canvasName: 'canvas', versionName: 'canvas_dabc123', ...over,
});

function Where() {
  const l = useLocation();
  return (
    <>
      <output data-testid="where">{l.pathname}{l.search}</output>
      <output data-testid="nav-type">{useNavigationType()}</output>
      <output data-testid="state">{JSON.stringify(l.state ?? null)}</output>
    </>
  );
}
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  resetCanvasAvailability();
  media.desktop = true;
  media.queries = [];
  pageMounts.count = 0;
  draftRead.fail = false;
  draftRead.result = openDraft();
});
afterEach(() => vi.unstubAllGlobals());

describe('ThreadPanel onClose', () => {
  const mount = (onClose?: () => void) => render(
    <MemoryRouter initialEntries={['/other', `/chats/c/${CONV}/t/${ROOT}`]} initialIndex={1}>
      <ChatContext.Provider value={chatValue([summary()])}>
        <Where />
        <ThreadPanel summary={summary()} rootId={ROOT} highlightId={null} onClose={onClose} />
      </ChatContext.Provider>
    </MemoryRouter>,
  );

  it('the close control calls onClose instead of the chat\'s Back (the address does not move)', async () => {
    const onClose = vi.fn();
    mount(onClose);
    await act(async () => {});
    fireEvent.click(screen.getByLabelText('Close thread'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('where')).toHaveTextContent(`/chats/c/${CONV}/t/${ROOT}`);
  });

  it('CONTROL: without onClose the same control is the chat\'s Back (the address moves)', async () => {
    mount();
    await act(async () => {});
    fireEvent.click(screen.getByLabelText('Close thread'));
    await act(async () => {});
    expect(screen.getByTestId('where')).not.toHaveTextContent(`/t/${ROOT}`);
  });
});

describe('the canvas route wrapper', () => {
  const mount = (at: string | { pathname: string; search: string; state: unknown }, chats: ChatSummary[] = [summary()]) => render(
    <MemoryRouter initialEntries={[at]}>
      <ChatContext.Provider value={chatValue(chats)}>
        <Where />
        <Routes><Route path="/p/:handle/canvas/:projectTag" element={<CanvasWithThread />} /></Routes>
      </ChatContext.Provider>
    </MemoryRouter>,
  );
  const URL = `/p/ana/canvas/canvas?v=canvas_dabc123&thread=${ROOT}`;
  const settle = () => act(async () => {});

  it('from 1280px, with a thread param, a mirror chat, the viewer\'s own canvas and its open draft\'s thread: the canvas page and the thread side by side', async () => {
    mount(URL);
    await settle();
    expect(screen.getByTestId('canvas-page-stub')).toHaveAttribute('data-pane', 'true'); // the page's parts adapt
    expect(screen.getByTestId('canvas-thread-pane')).toBeInTheDocument();
    expect(screen.getByTestId('thread-panel')).toBeInTheDocument();
    expect(media.queries).toContain('(min-width: 1280px)'); // 1024px cannot hold sidebar + canvas + thread
    expect(media.queries).not.toContain('(min-width: 1024px)');
  });

  it.each([
    ['below 1280px', () => { media.desktop = false; }, URL, [summary()]],
    ['with no thread param', () => undefined, '/p/ana/canvas/canvas?v=canvas_dabc123', [summary()]],
    ['with no mirror chat', () => undefined, URL, [summary({ kind: 'dm' as ChatSummary['kind'], conversationId: 'conv-dm' })]],
    ['on someone else\'s canvas (another handle), even with a thread id that is the viewer\'s own', () => undefined, `/p/bo/canvas/canvas?thread=${ROOT}`, [summary()]],
    ['when the thread is not a draft of the viewer (no such draft for them)', () => { draftRead.result = null; }, URL, [summary()]],
    ['when the thread is the open draft of ANOTHER canvas', () => { draftRead.result = openDraft({ canvasName: 'other_canvas' }); }, URL, [summary()]],
    ['when the draft is already closed', () => { draftRead.result = openDraft({ state: 'published' }); }, URL, [summary()]],
    ['when the draft lives in another conversation', () => { draftRead.result = openDraft({ conversationId: 'conv-elsewhere' }); }, URL, [summary()]],
    ['when the draft cannot be read', () => { draftRead.fail = true; }, URL, [summary()]],
  ])('%s: just the canvas page, no pane', async (_name, arrange, at, chats) => {
    arrange();
    mount(at, chats);
    await settle();
    expect(screen.getByTestId('canvas-page-stub')).toHaveAttribute('data-pane', 'false');
    expect(screen.queryByTestId('canvas-thread-pane')).toBeNull();
    expect(screen.queryByTestId('thread-panel')).toBeNull();
  });

  it('closing the pane removes only `thread` (the draft\'s ?v stays), REPLACES the entry keeping its state (the page\'s panel mark), and keeps the canvas page mounted', async () => {
    mount({ pathname: '/p/ana/canvas/canvas', search: `?v=canvas_dabc123&thread=${ROOT}&point=p1`, state: { canvasPanel: true } });
    await settle();
    expect(pageMounts.count).toBe(1);
    fireEvent.click(screen.getByLabelText('Close thread'));
    await settle();
    expect(screen.getByTestId('where')).toHaveTextContent('/p/ana/canvas/canvas?v=canvas_dabc123&point=p1');
    expect(screen.getByTestId('where')).not.toHaveTextContent('thread=');
    expect(screen.getByTestId('nav-type')).toHaveTextContent('REPLACE');
    expect(screen.getByTestId('state')).toHaveTextContent('{"canvasPanel":true}'); // so Back from the point panel still steps back
    expect(screen.queryByTestId('canvas-thread-pane')).toBeNull();
    expect(screen.getByTestId('canvas-page-stub')).toHaveAttribute('data-pane', 'false');
    expect(pageMounts.count).toBe(1);
  });
});
