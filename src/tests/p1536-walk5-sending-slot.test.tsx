/**
 * @file p1536-walk5-sending-slot.test.tsx
 * @description P1536 walkthrough 5, item A: a normal Send has a status from the moment it is made. While `sendCanvasWorkspaceMessage` (and the re-read after
 * it) is pending, the composer's slot reads Updating… and Send is not offered, Publish waits (`runActive`), and a second Send cannot start. After a
 * Send that started a run the slot stays Updating…; after a refusal it lets go and the text returns.
 */
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-mappers';
import type { CanvasDraft, CanvasDraftRun } from '@/app/data/canvas-draft-service';

const ME = 'user-id-me';
const CONV = 'conv-mirror-1';
const ROOT = 'root-1';

const state = vi.hoisted(() => ({ messages: [] as ChatMessage[] }));
const svc = vi.hoisted(() => ({
  getCanvasDraftAvailability: vi.fn(),
  getCanvasDraftByThread: vi.fn(),
  getLatestCanvasRun: vi.fn(),
  listCanvasMaterial: vi.fn(),
  sendCanvasWorkspaceMessage: vi.fn(),
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

import { ThreadPanel } from '@/app/pages/chat/ThreadPanel';
import { useCanvasActions } from '@/app/pages/chat/use-canvas-actions';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { resetCanvasThreads } from '@/app/pages/chat/canvas-thread-registry';
import { clearDraftsExcept } from '@/app/pages/chat/chat-hooks';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';

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
const draftRow = (): CanvasDraft => ({
  id: 'draft-1', versionId: 'ver-draft', canvasId: 'cv-1', baseVersionId: null, conversationId: CONV, threadRootId: ROOT,
  state: 'open', runCount: 0, revision: 3, closedAt: null, canvasName: null, versionName: null,
});
const runningRun = (): CanvasDraftRun => ({ id: 'run-up', kind: 'message', state: 'running', errorCode: null, createdAt: new Date().toISOString(), startedAt: new Date().toISOString() });
const chatValue = (): ChatContextValue => ({
  userId: ME, status: 'ready', error: null, chats: [mirrorChat], unreadCount: 0, refresh: vi.fn(async () => [mirrorChat]),
  setArchived: vi.fn(), setManualUnread: vi.fn(), markRead: vi.fn(), subscribe: () => () => undefined, setViewing: vi.fn(), revision: 0,
  authors: { [ME]: { id: ME, name: 'Test Owner', slug: 'test-user', avatarUrl: null, avatarColor: null, hasPledged: false } }, missingAuthors: new Set(),
  ensureAuthors: vi.fn(), outbox: [], sendMessage: vi.fn(), retrySend: vi.fn(), discardSend: vi.fn(), block: vi.fn(), unblock: vi.fn(), goToChat: vi.fn(), resync: vi.fn(),
}) as ChatContextValue;

const field = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const sendButton = () => screen.queryByRole('button', { name: 'Send' });
const deferred = <T,>() => {
  let resolve: (v: T) => void = () => undefined;
  const promise = new Promise<T>((a) => { resolve = a; });
  return { promise, resolve };
};

beforeEach(() => {
  vi.clearAllMocks();
  resetCanvasAvailability();
  resetCanvasThreads();
  clearDraftsExcept(null);
  state.messages = [root];
  svc.getCanvasDraftAvailability.mockResolvedValue(true);
  svc.getCanvasDraftByThread.mockResolvedValue(draftRow());
  svc.getLatestCanvasRun.mockResolvedValue(null);
  svc.listCanvasMaterial.mockResolvedValue([]);
  svc.getLastDoneCanvasDraftRunAt.mockResolvedValue(null);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
});
afterEach(() => cleanup());

describe('A: the Send is its own status', () => {
  const mount = async (onRunActive = vi.fn()) => {
    render(
      <MemoryRouter initialEntries={[`/chats/c/${CONV}/t/${ROOT}`]}>
        <ChatContext.Provider value={chatValue()}>
          <ThreadPanel summary={mirrorChat} rootId={ROOT} highlightId={null} fill workspace={{}} onRunActive={onRunActive} />
        </ChatContext.Provider>
      </MemoryRouter>,
    );
    await act(async () => {});
    return onRunActive;
  };
  const sendWords = async (text: string) => {
    fireEvent.change(field(), { target: { value: text } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send' })); });
  };

  it('while the send is pending: the slot reads Updating…, runActive is true, Send is not offered', async () => {
    const pending = deferred<unknown>();
    svc.sendCanvasWorkspaceMessage.mockReturnValue(pending.promise);
    const onRunActive = await mount();
    expect(screen.queryByTestId('composer-send-status')).toBeNull();
    expect(onRunActive).toHaveBeenLastCalledWith(false);
    await sendWords('Raise the price to 60');
    expect(field().value).toBe('');
    expect(screen.getByTestId('composer-send-status')).toHaveTextContent('Updating…');
    expect(onRunActive).toHaveBeenLastCalledWith(true);
    fireEvent.change(field(), { target: { value: 'a second one' } });
    expect(sendButton()).toBeNull();
    expect(svc.sendCanvasWorkspaceMessage).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve({ ok: true, runId: 'run-up', revision: 4, draftId: 'draft-1', start: null }); });
  });

  it('after it settles with a run going the slot stays Updating…, with no gap in runActive', async () => {
    const pending = deferred<unknown>();
    svc.sendCanvasWorkspaceMessage.mockReturnValue(pending.promise);
    let run: CanvasDraftRun | null = null;
    svc.getLatestCanvasRun.mockImplementation(async () => run);
    const onRunActive = await mount();
    await sendWords('Raise the price to 60');
    run = runningRun(); // the server started it: the re-read after the send finds it going
    onRunActive.mockClear();
    await act(async () => { pending.resolve({ ok: true, runId: 'run-up', revision: 4, draftId: 'draft-1', start: null }); });
    expect(screen.getByTestId('composer-send-status')).toHaveTextContent('Updating…');
    expect(onRunActive).not.toHaveBeenCalledWith(false);
  });

  it('after a refusal it lets go and the text returns', async () => {
    const pending = deferred<unknown>();
    svc.sendCanvasWorkspaceMessage.mockReturnValue(pending.promise);
    const onRunActive = await mount();
    await sendWords('Raise the price to 60');
    await act(async () => { pending.resolve({ ok: false, refused: 'busy' }); });
    expect(screen.queryByTestId('composer-send-status')).toBeNull();
    expect(onRunActive).toHaveBeenLastCalledWith(false);
    expect(field().value).toBe('Raise the price to 60');
    expect(toastFn.error).toHaveBeenCalledTimes(1);
  });
});

describe('A: useCanvasActions.sending', () => {
  const thread = (id = 'draft-1') => ({ draft: { id, canvasId: 'cv-1', revision: 3, state: 'open' }, reload: vi.fn(async () => undefined) }) as never;

  it('is true from the call until it settles, false before and after; null onSend still returns sending false', async () => {
    const pending = deferred<unknown>();
    svc.sendCanvasWorkspaceMessage.mockReturnValue(pending.promise);
    const t = thread();
    const { result } = renderHook(() => useCanvasActions({ thread: t, available: true }));
    expect(result.current.sending).toBe(false);
    let done: Promise<boolean> = Promise.resolve(false);
    act(() => { done = result.current.onSend!('words'); });
    expect(result.current.sending).toBe(true);
    await act(async () => { pending.resolve({ ok: true, runId: 'r', revision: 4, draftId: 'draft-1', start: null }); await done; });
    expect(result.current.sending).toBe(false);
    const closed = renderHook(() => useCanvasActions({ thread: null, available: true }));
    expect(closed.result.current).toEqual({ onSend: null, sending: false });
  });

  it('a draft change lets it go, and unmounting mid-send raises no state warning', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const pending = deferred<unknown>();
    svc.sendCanvasWorkspaceMessage.mockReturnValue(pending.promise);
    const { result, rerender, unmount } = renderHook(({ t }: { t: never }) => useCanvasActions({ thread: t, available: true }), { initialProps: { t: thread('draft-1') } });
    act(() => { void result.current.onSend!('words'); });
    expect(result.current.sending).toBe(true);
    rerender({ t: thread('draft-2') });
    expect(result.current.sending).toBe(false);
    act(() => { void result.current.onSend!('more words'); });
    unmount();
    await act(async () => { pending.resolve({ ok: false, refused: 'busy' }); });
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
