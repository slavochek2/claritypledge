/**
 * @file p1536-walk6-thread-empty.test.tsx
 * @description P1536 walkthrough 6, item 3: a canvas draft's thread never says "This thread is empty." (its list is empty only because the read did not
 * answer, or answered with a failure that the panel says right below), and no empty padded band is left where the sentence was. An ordinary empty
 * thread still says it.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-mappers';
import type { ConversationApi } from '@/app/pages/chat/MessageList';

const ME = 'user-id-me';
const CONV = 'conv-mirror-1';
const ROOT = 'root-1';

const state = vi.hoisted(() => ({ messages: [] as ChatMessage[], status: 'ready' }));
const svc = vi.hoisted(() => ({
  getCanvasDraftAvailability: vi.fn(),
  getCanvasDraftByThread: vi.fn(),
  getLatestCanvasRun: vi.fn(),
  listCanvasMaterial: vi.fn(),
  getLastDoneCanvasDraftRunAt: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), ...svc }));
vi.mock('@/app/pages/chat/use-message-actions', () => ({ useMessageActions: () => ({ actions: {}, dialogs: null }) }));
vi.mock('@/app/pages/chat/use-conversation', () => ({
  isLocal: () => false,
  useConversationMessages: () => ({
    server: state.messages, messages: state.messages, status: state.status, send: vi.fn(), stats: new Map(), hasMore: false, loadingEarlier: false,
    loadEarlier: vi.fn(), ensureLoaded: vi.fn(), lookup: vi.fn(), getLoaded: vi.fn(), syncVersion: 0, retrySend: vi.fn(), discard: vi.fn(), edit: vi.fn(), reload: vi.fn(),
  }),
}));
vi.mock('@/app/pages/chat/MessageRow', () => ({ MessageRow: ({ msg }: { msg: ChatMessage }) => <li data-msg={msg.id}>{msg.body}</li> }));

import { ThreadPanel } from '@/app/pages/chat/ThreadPanel';
import { MessageList } from '@/app/pages/chat/MessageList';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { resetCanvasThreads } from '@/app/pages/chat/canvas-thread-registry';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';

const mirrorChat: ChatSummary = {
  conversationId: CONV, kind: 'mirror', title: 'Mira', other: null, org: null, event: null, ownerFirstName: 'Test',
  lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false,
};
const chatValue = (): ChatContextValue => ({
  userId: ME, status: 'ready', error: null, chats: [mirrorChat], unreadCount: 0, refresh: vi.fn(async () => [mirrorChat]),
  setArchived: vi.fn(), setManualUnread: vi.fn(), markRead: vi.fn(), subscribe: () => () => undefined, setViewing: vi.fn(), revision: 0,
  authors: { [ME]: { id: ME, name: 'Test Owner', slug: 'test-user', avatarUrl: null, avatarColor: null, hasPledged: false } }, missingAuthors: new Set(),
  ensureAuthors: vi.fn(), outbox: [], sendMessage: vi.fn(), retrySend: vi.fn(), discardSend: vi.fn(), block: vi.fn(), unblock: vi.fn(), goToChat: vi.fn(), resync: vi.fn(),
}) as ChatContextValue;

const mount = async (workspace: boolean) => {
  render(
    <MemoryRouter initialEntries={[`/chats/c/${CONV}/t/${ROOT}`]}>
      <ChatContext.Provider value={chatValue()}>
        <ThreadPanel summary={mirrorChat} rootId={ROOT} highlightId={null} {...(workspace ? { fill: true, workspace: {} } : {})} />
      </ChatContext.Provider>
    </MemoryRouter>,
  );
  await act(async () => {});
};

beforeEach(() => {
  vi.clearAllMocks();
  resetCanvasAvailability();
  resetCanvasThreads();
  Object.assign(state, { messages: [], status: 'ready' });
  svc.getCanvasDraftAvailability.mockResolvedValue(true);
  svc.getLatestCanvasRun.mockResolvedValue(null);
  svc.listCanvasMaterial.mockResolvedValue([]);
  svc.getLastDoneCanvasDraftRunAt.mockResolvedValue(null);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
});
afterEach(() => cleanup());

describe('3: a canvas draft\'s thread never says it is empty', () => {
  it('a workspace thread whose read failed: no "This thread is empty.", the failure is shown', async () => {
    svc.getCanvasDraftByThread.mockRejectedValue(new Error('offline'));
    await mount(true);
    expect(screen.queryByText('This thread is empty.')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load this draft');
  });

  it('a workspace thread whose read is still out: no sentence and no empty band in the list', async () => {
    svc.getCanvasDraftByThread.mockReturnValue(new Promise(() => undefined));
    await mount(true);
    expect(screen.queryByText('This thread is empty.')).toBeNull();
    expect(document.querySelector('.py-12')).toBeNull();
  });

  it('CONTROL: an ordinary empty thread still says it', async () => {
    svc.getCanvasDraftByThread.mockResolvedValue(null);
    await mount(false);
    expect(screen.getByText('This thread is empty.')).toBeInTheDocument();
  });
});

describe('3: MessageList draws no band for an absent sentence', () => {
  const conv = (messages: ChatMessage[]) => ({
    status: 'ready', messages, stats: new Map(), hasMore: false, loadingEarlier: false, loadEarlier: vi.fn(), ensureLoaded: vi.fn(), lookup: vi.fn(), getLoaded: vi.fn(),
    syncVersion: 0, retrySend: vi.fn(), discard: vi.fn(), edit: vi.fn(), reload: vi.fn(),
  }) as unknown as ConversationApi;
  const list = (empty: unknown) => render(<MemoryRouter><MessageList conv={conv([])} actions={{} as never} viewerId="me" authors={{}} label="Thread messages" empty={empty as never} /></MemoryRouter>);

  it('empty null: no padded div; a sentence: drawn as before', () => {
    list(null);
    expect(document.querySelector('.py-12')).toBeNull();
    cleanup();
    list('Nothing here.');
    expect(screen.getByText('Nothing here.')).toHaveClass('py-12');
  });
});
