/**
 * @file p1536-canvas-with-thread.test.tsx
 * @description P1536 v3: the canvas page with the owner's mirror thread beside it.
 *  - ThreadPanel's `onClose` replaces the chat's Back (the control that closes the pane on the canvas page)
 *  - `fill`: in the workspace the frame sizes the panel and the xl-up header controls (nothing to go back to) are hidden
 * The route element (the workspace) is tested whole in p1536-canvas-workspace.test.tsx; the old `thread=` pane gate it replaced is gone (D4).
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatSummary } from '@/app/data/chat-mappers';

const ME = 'user-id-me';
const CONV = 'conv-mirror-1';
const ROOT = 'root-1';
const media = vi.hoisted(() => ({ desktop: true, queries: [] as string[] }));
const draftRead = vi.hoisted(() => ({ result: null as unknown, fail: false }));

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
import { ThreadPanel } from '@/app/pages/chat/ThreadPanel';
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

describe('ThreadPanel in the workspace (`fill`)', () => {
  it('fill: the panel is sized by its frame (no fixed 400/440px width of its own) and the header\'s back and close controls are hidden from 1280px', async () => {
    render(
      <MemoryRouter initialEntries={[`/chats/c/${CONV}/t/${ROOT}`]}>
        <ChatContext.Provider value={chatValue([summary()])}>
          <ThreadPanel summary={summary()} rootId={ROOT} highlightId={null} onClose={() => undefined} fill />
        </ChatContext.Provider>
      </MemoryRouter>,
    );
    await act(async () => {});
    const panel = screen.getByTestId('thread-panel');
    expect(panel.className).not.toMatch(/\b(?:lg|xl):w-\[/);
    expect(screen.getByLabelText('Close thread').className).toContain('xl:hidden');
    expect(screen.getByLabelText('Back to the conversation').className).toContain('xl:hidden');
  });

  it('CONTROL: without fill the panel keeps its own 440px width and both controls', async () => {
    render(
      <MemoryRouter initialEntries={[`/chats/c/${CONV}/t/${ROOT}`]}>
        <ChatContext.Provider value={chatValue([summary()])}>
          <ThreadPanel summary={summary()} rootId={ROOT} highlightId={null} onClose={() => undefined} />
        </ChatContext.Provider>
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.getByTestId('thread-panel').className).toContain('xl:w-[440px]');
    expect(screen.getByLabelText('Close thread').className).not.toContain('xl:hidden');
  });
});
