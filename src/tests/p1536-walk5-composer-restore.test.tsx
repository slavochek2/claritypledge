/**
 * @file p1536-walk5-composer-restore.test.tsx
 * @description P1536 walkthrough 5: a failed Send gives its text back even when the owner has typed since. The returned text comes first, then a newline,
 * then what was typed meanwhile; an empty field gets exactly the text back; a Send that succeeds restores nothing. At the Composer, and in a canvas
 * thread whose held Send fails because the first read fails.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-mappers';
import type { CanvasDraft } from '@/app/data/canvas-draft-service';

const ME = 'user-id-me';
const CONV = 'conv-mirror-1';
const ROOT = 'root-1';

const state = vi.hoisted(() => ({ messages: [] as ChatMessage[] }));
const svc = vi.hoisted(() => ({
  getCanvasDraftAvailability: vi.fn(),
  getCanvasDraftByThread: vi.fn(),
  getLatestCanvasRun: vi.fn(),
  listCanvasMaterial: vi.fn(),
  getLastDoneCanvasDraftRunAt: vi.fn(),
}));
const toastFn = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: toastFn }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), ...svc }));
vi.mock('@/app/pages/chat/MessageList', () => ({ MessageList: () => <div data-testid="message-list" /> }));
vi.mock('@/app/pages/chat/use-message-actions', () => ({ useMessageActions: () => ({ actions: {}, dialogs: null }) }));
vi.mock('@/app/pages/chat/use-conversation', () => ({
  useConversationMessages: () => ({ server: state.messages, status: 'ready', send: vi.fn() }),
}));

import { Composer } from '@/app/pages/chat/Composer';
import { ThreadPanel } from '@/app/pages/chat/ThreadPanel';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { resetCanvasThreads } from '@/app/pages/chat/canvas-thread-registry';
import { clearDraftsExcept } from '@/app/pages/chat/chat-hooks';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';

const field = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const clickSend = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send' })); }); };
const deferred = <T,>() => {
  let resolve: (v: T) => void = () => undefined;
  let reject: (e: unknown) => void = () => undefined;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  vi.clearAllMocks();
  clearDraftsExcept(null);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
});
afterEach(() => cleanup());

describe('Composer: a failed Send and what was typed since', () => {
  const mountComposer = (onSend: () => unknown) => render(<Composer draftKey="walk5-a" placeholder="Message" onSend={onSend} />);

  it('keeps both, the returned text first, a newline between', async () => {
    const send = deferred<boolean>();
    mountComposer(() => send.promise);
    fireEvent.change(field(), { target: { value: 'first message' } });
    await clickSend();
    expect(field().value).toBe('');
    fireEvent.change(field(), { target: { value: 'second message' } });
    await act(async () => { send.resolve(false); });
    expect(field().value).toBe('first message\nsecond message');
  });

  it('the same when the Send rejects', async () => {
    const send = deferred<boolean>();
    mountComposer(() => send.promise);
    fireEvent.change(field(), { target: { value: 'first message' } });
    await clickSend();
    fireEvent.change(field(), { target: { value: 'second message' } });
    await act(async () => { send.reject(new Error('offline')); });
    expect(field().value).toBe('first message\nsecond message');
  });

  it('CONTROL: an empty field gets exactly the text back', async () => {
    const send = deferred<boolean>();
    mountComposer(() => send.promise);
    fireEvent.change(field(), { target: { value: 'first message' } });
    await clickSend();
    await act(async () => { send.resolve(false); });
    expect(field().value).toBe('first message');
  });

  it('CONTROL: a Send that succeeds restores nothing, whatever was typed since', async () => {
    const send = deferred<boolean>();
    mountComposer(() => send.promise);
    fireEvent.change(field(), { target: { value: 'first message' } });
    await clickSend();
    fireEvent.change(field(), { target: { value: 'second message' } });
    await act(async () => { send.resolve(true); });
    expect(field().value).toBe('second message');
  });
});

describe('a canvas thread: the held Send fails while the owner types the next one', () => {
  const mirrorChat: ChatSummary = {
    conversationId: CONV, kind: 'mirror', title: 'Mira', other: null, org: null, event: null, ownerFirstName: 'Test',
    lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
    membersSince: null, canSend: true, blockedByMe: false,
  };
  const root: ChatMessage = {
    id: ROOT, conversationId: CONV, authorId: ME, body: null, createdAt: '2026-10-27T08:30:00.000Z', editedAt: null, deletedAt: null, isDeleted: false,
    replyToId: null, threadRootId: null, forwardedFromMessageId: null, forwardAuthorId: null, forwardSnapshot: null, kind: 'message',
    attachmentKind: 'canvas_version', attachmentId: 'ver-1', clientId: null, contextConversationId: null,
  };
  const chatValue = (): ChatContextValue => ({
    userId: ME, status: 'ready', error: null, chats: [mirrorChat], unreadCount: 0, refresh: vi.fn(async () => [mirrorChat]),
    setArchived: vi.fn(), setManualUnread: vi.fn(), markRead: vi.fn(), subscribe: () => () => undefined, setViewing: vi.fn(), revision: 0,
    authors: { [ME]: { id: ME, name: 'Test Owner', slug: 'test-user', avatarUrl: null, avatarColor: null, hasPledged: false } }, missingAuthors: new Set(),
    ensureAuthors: vi.fn(), outbox: [], sendMessage: vi.fn(), retrySend: vi.fn(), discardSend: vi.fn(), block: vi.fn(), unblock: vi.fn(), goToChat: vi.fn(), resync: vi.fn(),
  }) as ChatContextValue;

  it('first message, typed second message, the read fails: both are in the field, first then second', async () => {
    resetCanvasAvailability();
    resetCanvasThreads();
    state.messages = [root];
    svc.getCanvasDraftAvailability.mockResolvedValue(true);
    svc.getLatestCanvasRun.mockResolvedValue(null);
    svc.listCanvasMaterial.mockResolvedValue([]);
    svc.getLastDoneCanvasDraftRunAt.mockResolvedValue(null);
    const read = deferred<CanvasDraft | null>();
    svc.getCanvasDraftByThread.mockReturnValue(read.promise);
    render(
      <MemoryRouter initialEntries={[`/chats/c/${CONV}/t/${ROOT}`]}>
        <ChatContext.Provider value={chatValue()}>
          <ThreadPanel summary={mirrorChat} rootId={ROOT} highlightId={null} fill workspace={{}} />
        </ChatContext.Provider>
      </MemoryRouter>,
    );
    await act(async () => {});
    fireEvent.change(field(), { target: { value: 'first message' } });
    await clickSend();
    fireEvent.change(field(), { target: { value: 'second message' } });
    await act(async () => { read.reject(new Error('offline')); });
    expect(toastFn.error).toHaveBeenCalledTimes(1);
    expect(field().value).toBe('first message\nsecond message');
  });
});
