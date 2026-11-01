/**
 * @file p1536-walk4-held-send.test.tsx
 * @description P1536 walkthrough 4, item 1: a Send made before a thread's first read has answered WAITS and then goes the right way, instead of being
 * refused with "That did not go through":
 *  - a canvas draft's thread: the Send goes to the draft once the read says it is open (one `sendCanvasWorkspaceMessage`), no toast;
 *  - an ordinary mirror thread whose root is unread: the Send posts through the chat's own send (no canvas call, no canvas words);
 *  - a read that failed, or finds no draft: one toast and the text back; a Send that never gets an answer ends at HELD_SEND_MAX_MS the same way;
 *  - leaving the thread while a Send waits: it resolves false, with no toast and no timer left.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-mappers';
import type { CanvasDraft } from '@/app/data/canvas-draft-service';

const ME = 'user-id-me';
const CONV = 'conv-mirror-1';
const ROOT = 'root-1';

const state = vi.hoisted(() => ({ messages: [] as ChatMessage[], status: 'ready' }));
const svc = vi.hoisted(() => ({
  getCanvasDraftAvailability: vi.fn(),
  getCanvasDraftByThread: vi.fn(),
  getLatestCanvasRun: vi.fn(),
  listCanvasMaterial: vi.fn(),
  startQueuedCanvasRun: vi.fn(),
  sendCanvasWorkspaceMessage: vi.fn(),
  getLastDoneCanvasDraftRunAt: vi.fn(),
}));
const conv = vi.hoisted(() => ({ send: vi.fn() }));
const toastFn = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: toastFn }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), ...svc }));
vi.mock('@/app/pages/chat/MessageList', () => ({ MessageList: ({ lead }: { lead?: ReactNode }) => <div data-testid="message-list">{lead}</div> }));
vi.mock('@/app/pages/chat/use-message-actions', () => ({ useMessageActions: () => ({ actions: {}, dialogs: null }) }));
vi.mock('@/app/pages/chat/use-conversation', () => ({
  useConversationMessages: () => ({ server: state.messages, status: state.status, send: conv.send }),
}));

import { ThreadPanel } from '@/app/pages/chat/ThreadPanel';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { resetCanvasThreads } from '@/app/pages/chat/canvas-thread-registry';
import { clearDraftsExcept } from '@/app/pages/chat/chat-hooks';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { FIRST_READ_MAX_MS } from '@/app/pages/chat/use-canvas-thread';
import { DRAFT_ERROR_TEXT } from '@/app/pages/chat/canvas-thread-copy';
import { HELD_SEND_MAX_MS, useHeldSend } from '@/app/pages/chat/use-held-send';
import { renderHook } from '@testing-library/react';

const mirrorChat: ChatSummary = {
  conversationId: CONV, kind: 'mirror', title: 'Mira', other: null, org: null, event: null, ownerFirstName: 'Test',
  lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false,
};
const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: 'msg-1', conversationId: CONV, authorId: ME, body: 'hello', createdAt: '2026-10-27T08:30:00.000Z', editedAt: null,
  deletedAt: null, isDeleted: false, replyToId: null, threadRootId: ROOT, forwardedFromMessageId: null, forwardAuthorId: null,
  forwardSnapshot: null, kind: 'message', attachmentKind: null, attachmentId: null, clientId: null, contextConversationId: null, ...over,
});
const canvasRoot = () => msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-1' });
const plainRoot = () => msg({ id: ROOT, body: 'a plain thought', threadRootId: null });
const draftRow = (): CanvasDraft => ({
  id: 'draft-1', versionId: 'ver-draft', canvasId: 'cv-1', baseVersionId: null, conversationId: CONV, threadRootId: ROOT,
  state: 'open', runCount: 0, revision: 3, closedAt: null, canvasName: null, versionName: null,
});
const chatValue = (): ChatContextValue => ({
  userId: ME, status: 'ready', error: null, chats: [mirrorChat], unreadCount: 0, refresh: vi.fn(async () => [mirrorChat]),
  setArchived: vi.fn(), setManualUnread: vi.fn(), markRead: vi.fn(), subscribe: () => () => undefined, setViewing: vi.fn(), revision: 0,
  authors: { [ME]: { id: ME, name: 'Test Owner', slug: 'test-user', avatarUrl: null, avatarColor: null, hasPledged: false } }, missingAuthors: new Set(),
  ensureAuthors: vi.fn(), outbox: [], sendMessage: vi.fn(), retrySend: vi.fn(), discardSend: vi.fn(), block: vi.fn(), unblock: vi.fn(), goToChat: vi.fn(), resync: vi.fn(),
}) as ChatContextValue;

const panel = (workspace: boolean): ReactElement => (
  <MemoryRouter initialEntries={[`/chats/c/${CONV}/t/${ROOT}`]}>
    <ChatContext.Provider value={chatValue()}>
      <ThreadPanel summary={mirrorChat} rootId={ROOT} highlightId={null} {...(workspace ? { fill: true, workspace: {} } : {})} />
    </ChatContext.Provider>
  </MemoryRouter>
);
const field = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const typeAndSend = async (text: string) => {
  fireEvent.change(field(), { target: { value: text } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send' })); });
};
const deferred = <T,>() => {
  let resolve: (v: T) => void = () => undefined;
  let reject: (e: unknown) => void = () => undefined;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  vi.clearAllMocks();
  resetCanvasAvailability();
  resetCanvasThreads();
  clearDraftsExcept(null);
  Object.assign(state, { messages: [canvasRoot()], status: 'ready' });
  svc.getCanvasDraftAvailability.mockResolvedValue(true);
  svc.getLatestCanvasRun.mockResolvedValue(null);
  svc.listCanvasMaterial.mockResolvedValue([]);
  svc.getLastDoneCanvasDraftRunAt.mockResolvedValue(null);
  svc.startQueuedCanvasRun.mockResolvedValue({ ok: true, runId: 'run-9', kind: 'draft' });
  svc.sendCanvasWorkspaceMessage.mockResolvedValue({ ok: true, runId: 'run-up', revision: 4, draftId: 'draft-1', start: null });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('1: a canvas thread, Send before the first read answers', () => {
  it('waits (the slot reads Updating…), then goes to the draft once: one sendCanvasWorkspaceMessage, no toast', async () => {
    const read = deferred<CanvasDraft | null>();
    svc.getCanvasDraftByThread.mockReturnValue(read.promise);
    render(panel(true));
    await act(async () => {});
    await typeAndSend('Raise the price to 60');
    expect(svc.sendCanvasWorkspaceMessage).not.toHaveBeenCalled();
    expect(toastFn.error).not.toHaveBeenCalled();
    expect(screen.getByTestId('composer-send-status')).toHaveTextContent('Updating…');
    await act(async () => { read.resolve(draftRow()); });
    expect(svc.sendCanvasWorkspaceMessage).toHaveBeenCalledTimes(1);
    expect(svc.sendCanvasWorkspaceMessage).toHaveBeenCalledWith(expect.objectContaining({ canvasId: 'cv-1', expectedDraftId: 'draft-1', body: 'Raise the price to 60' }));
    expect(toastFn.error).not.toHaveBeenCalled();
    expect(conv.send).not.toHaveBeenCalled();
  });

  it('a read that fails: one toast, the text comes back, and the Retry state shows', async () => {
    const read = deferred<CanvasDraft | null>();
    svc.getCanvasDraftByThread.mockReturnValue(read.promise);
    render(panel(true));
    await act(async () => {});
    await typeAndSend('Raise the price to 60');
    expect(field().value).toBe('');
    await act(async () => { read.reject(new Error('offline')); });
    expect(toastFn.error).toHaveBeenCalledTimes(1);
    expect(toastFn.error).toHaveBeenCalledWith(DRAFT_ERROR_TEXT.FAILED);
    expect(field().value).toBe('Raise the price to 60');
    expect(svc.sendCanvasWorkspaceMessage).not.toHaveBeenCalled();
  });

  it('a thread with no draft behind it (none): one toast, the text comes back', async () => {
    const read = deferred<CanvasDraft | null>();
    svc.getCanvasDraftByThread.mockReturnValue(read.promise);
    render(panel(true));
    await act(async () => {});
    await typeAndSend('hello');
    expect(toastFn.error).not.toHaveBeenCalled(); // waiting, not refused
    await act(async () => { read.resolve(null); });
    expect(toastFn.error).toHaveBeenCalledTimes(1);
    expect(field().value).toBe('hello');
  });

  it('a first read that never answers ends at FIRST_READ_MAX_MS as a failed read: one toast, the text back', async () => {
    vi.useFakeTimers();
    svc.getCanvasDraftByThread.mockReturnValue(new Promise(() => undefined));
    render(panel(true));
    await act(async () => {});
    await typeAndSend('hello');
    expect(toastFn.error).not.toHaveBeenCalled(); // waiting, not refused
    await act(async () => { vi.advanceTimersByTime(FIRST_READ_MAX_MS + 1); });
    expect(toastFn.error).toHaveBeenCalledTimes(1);
    expect(field().value).toBe('hello');
  });

  it('the backstop: a read in hand but drafting availability that never answers ends at HELD_SEND_MAX_MS the same way', async () => {
    vi.useFakeTimers();
    svc.getCanvasDraftAvailability.mockReturnValue(new Promise(() => undefined));
    svc.getCanvasDraftByThread.mockResolvedValue(draftRow());
    render(panel(true));
    await act(async () => {});
    await typeAndSend('hello');
    await act(async () => { vi.advanceTimersByTime(HELD_SEND_MAX_MS - 1_000); });
    expect(toastFn.error).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(2_000); });
    expect(toastFn.error).toHaveBeenCalledTimes(1);
    expect(toastFn.error).toHaveBeenCalledWith(DRAFT_ERROR_TEXT.FAILED);
    expect(field().value).toBe('hello');
    expect(svc.sendCanvasWorkspaceMessage).not.toHaveBeenCalled();
  });

  it('CONTROL: once the draft is read, a Send goes straight through (no wait, no toast)', async () => {
    svc.getCanvasDraftByThread.mockResolvedValue(draftRow());
    render(panel(true));
    await act(async () => {});
    await typeAndSend('hello');
    expect(svc.sendCanvasWorkspaceMessage).toHaveBeenCalledTimes(1);
    expect(toastFn.error).not.toHaveBeenCalled();
  });
});

describe('1: an ordinary mirror thread whose root is unread', () => {
  it('a Send posts through the chat\'s own send once the root has loaded: no toast, no canvas call, nothing canvas-worded on screen', async () => {
    Object.assign(state, { messages: [], status: 'loading' });
    const view = render(panel(false));
    await act(async () => {});
    await typeAndSend('a plain reply');
    expect(conv.send).not.toHaveBeenCalled();
    expect(screen.queryByText('Updating…')).toBeNull();
    Object.assign(state, { messages: [plainRoot()], status: 'ready' });
    await act(async () => { view.rerender(panel(false)); });
    expect(conv.send).toHaveBeenCalledTimes(1);
    expect(conv.send).toHaveBeenCalledWith({ body: 'a plain reply' });
    expect(toastFn.error).not.toHaveBeenCalled();
    expect(svc.sendCanvasWorkspaceMessage).not.toHaveBeenCalled();
    expect(svc.getCanvasDraftByThread).not.toHaveBeenCalled();
  });
});

describe('1: useHeldSend', () => {
  type Route = Parameters<typeof useHeldSend>[0];
  const waitRoute: Route = { kind: 'wait' };

  it('several waiting Sends in a plain thread go out in the order they were made', async () => {
    const plain = vi.fn();
    const { result, rerender } = renderHook(({ route }: { route: Route }) => useHeldSend(route, plain), { initialProps: { route: waitRoute as Route } });
    const done: Array<Promise<boolean>> = [];
    act(() => { done.push(result.current.hold('one'), result.current.hold('two'), result.current.hold('three')); });
    expect(plain).not.toHaveBeenCalled();
    rerender({ route: { kind: 'plain' } });
    expect(await Promise.all(done)).toEqual([true, true, true]);
    expect(plain.mock.calls.map((c) => c[0])).toEqual(['one', 'two', 'three']);
  });

  it('leaving while a Send waits resolves it false, with no toast, and the backstop timer is gone', async () => {
    vi.useFakeTimers();
    const plain = vi.fn();
    const { result, unmount } = renderHook(() => useHeldSend(waitRoute, plain));
    let outcome: boolean | undefined;
    act(() => { void result.current.hold('x').then((ok) => { outcome = ok; }); });
    unmount();
    await vi.advanceTimersByTimeAsync(0);
    expect(outcome).toBe(false);
    await vi.advanceTimersByTimeAsync(HELD_SEND_MAX_MS * 2);
    expect(toastFn.error).not.toHaveBeenCalled();
    expect(plain).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a failed route says so once however many Sends waited, and resolves them false', async () => {
    const { result, rerender } = renderHook(({ route }: { route: Route }) => useHeldSend(route, vi.fn()), { initialProps: { route: waitRoute as Route } });
    const done: Array<Promise<boolean>> = [];
    act(() => { done.push(result.current.hold('a'), result.current.hold('b')); });
    rerender({ route: { kind: 'failed' } });
    expect(await Promise.all(done)).toEqual([false, false]);
    expect(toastFn.error).toHaveBeenCalledTimes(1);
  });

  it('a draft route hands the waiting Send to the draft\'s own send and returns its result', async () => {
    const draftSend = vi.fn(async () => true);
    const { result, rerender } = renderHook(({ route }: { route: Route }) => useHeldSend(route, vi.fn()), { initialProps: { route: waitRoute as Route } });
    let done: Promise<boolean> = Promise.resolve(false);
    act(() => { done = result.current.hold('x'); });
    rerender({ route: { kind: 'draft', send: draftSend } });
    expect(await done).toBe(true);
    expect(draftSend).toHaveBeenCalledWith('x');
  });
});
