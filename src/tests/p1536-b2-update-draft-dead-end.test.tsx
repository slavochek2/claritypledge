/**
 * @file p1536-b2-update-draft-dead-end.test.tsx
 * @description P1536 section 3b, bug B2 (founder walkthrough, 2026-11-01): after a file was read and the canvas was made, the thread offered
 * "Update draft"; tapping it showed "Creating your canvas…" and then "This draft is not available." with nothing to do next.
 *
 * Cause: in v6 a file is kept by the SAME run that drafts it (the run is claimed first, then the text is written, then it drafts),
 * so the file's `created_at` is always later than that run's `started_at`. `hasNewSinceRun` compared the two and called the file
 * "new since the last canvas". Update draft then started "the queued run", and a v6 draft has none (the message's run starts at once),
 * so `startQueuedCanvasRun` answered NOT_AVAILABLE and the tray said so, for a draft that is open and fine.
 *
 * The thread panel is rendered the way the canvas workspace mounts it (`fill`, `onRunActive`), because the workspace's chat is this
 * same panel. W0 removed the tray with its Update draft and its progress line, so these tests now pin the other half of B2: nothing in
 * the panel offers Update draft, says "Creating your canvas…" or says "This draft is not available." for an open draft, and the
 * workspace's status (`onRunActive`, which the Publish spot reads) ends within the poll interval once the run settles.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-mappers';
import type { CanvasDraft, CanvasDraftRun, CanvasMaterialItem } from '@/app/data/canvas-draft-service';

const ME = 'user-id-me';
const MIRROR_ID = 'conv-mirror-1';
const ROOT = 'root-1';

const state = vi.hoisted(() => ({
  draft: null as CanvasDraft | null,
  run: null as CanvasDraftRun | null,
  material: [] as CanvasMaterialItem[],
  messages: [] as ChatMessage[],
  lastDone: null as string | null,
}));

const svc = vi.hoisted(() => ({
  getCanvasDraftAvailability: vi.fn(),
  getCanvasDraftByThread: vi.fn(),
  getLatestCanvasRun: vi.fn(),
  listCanvasMaterial: vi.fn(),
  startQueuedCanvasRun: vi.fn(),
  retryCanvasRun: vi.fn(),
  publishCanvasDraft: vi.fn(),
  uploadCanvasMaterial: vi.fn(),
  sendCanvasWorkspaceMessage: vi.fn(),
  openCanvasDraft: vi.fn(),
  discardCanvasDraft: vi.fn(),
  listMyCanvasVersions: vi.fn(),
  countDoneCanvasDraftRuns: vi.fn(),
  getLastDoneCanvasDraftRunAt: vi.fn(),
  getCanvasDraftViewPath: vi.fn(),
}));
const conv = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), ...svc }));
vi.mock('@/app/pages/chat/MessageList', () => ({
  MessageList: ({ lead, tail }: { lead?: ReactNode; tail?: ReactNode }) => (
    <div data-testid="message-list">
      {lead}
      {tail}
    </div>
  ),
}));
vi.mock('@/app/pages/chat/use-message-actions', () => ({ useMessageActions: () => ({ actions: {}, dialogs: null }) }));
vi.mock('@/app/pages/chat/use-conversation', () => ({
  useConversationMessages: () => ({ server: state.messages, status: 'ready', send: conv.send }),
}));

import { ThreadPanel } from '@/app/pages/chat/ThreadPanel';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { resetCanvasThreads } from '@/app/pages/chat/canvas-thread-registry';
import { clearDraftsExcept } from '@/app/pages/chat/chat-hooks';
import { RUN_POLL_MS } from '@/app/pages/chat/use-canvas-thread';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';

const mirrorChat: ChatSummary = {
  conversationId: MIRROR_ID, kind: 'mirror', title: 'Mira', other: null, org: null, event: null, ownerFirstName: 'Test',
  lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false,
};

function msg(over: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'msg-1', conversationId: MIRROR_ID, authorId: ME, body: 'hello', createdAt: '2026-10-27T08:30:00.000Z', editedAt: null,
    deletedAt: null, isDeleted: false, replyToId: null, threadRootId: ROOT, forwardedFromMessageId: null, forwardAuthorId: null,
    forwardSnapshot: null, kind: 'message', attachmentKind: null, attachmentId: null, clientId: null, contextConversationId: null, ...over,
  };
}
const canvasRoot = () => msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-1' });

const draftRow = (over: Partial<CanvasDraft> = {}): CanvasDraft => ({
  id: 'draft-1', versionId: 'ver-draft', canvasId: 'cv-1', baseVersionId: null, conversationId: MIRROR_ID, threadRootId: ROOT,
  state: 'open', runCount: 1, revision: 3, closedAt: null, canvasName: 'canvas', versionName: 'canvas_dabc12', ...over,
});

const RUN_AT = '2026-10-27T10:00:00.000Z';
/** The file's text is kept seven seconds into its own run: after the run's `started_at`, as the v6 engine does it. */
const KEPT_BY_RUN = '2026-10-27T10:00:07.000Z';
const runRow = (over: Partial<CanvasDraftRun> = {}): CanvasDraftRun => ({
  id: 'run-1', kind: 'message', state: 'done', errorCode: null, createdAt: RUN_AT, startedAt: RUN_AT, ...over,
});
const fileRow = (over: Partial<CanvasMaterialItem> = {}): CanvasMaterialItem => ({ id: 'mat-1', kind: 'file', label: 'offer.md', chars: 900, createdAt: KEPT_BY_RUN, ...over });

function chatValue(): ChatContextValue {
  return {
    userId: ME, status: 'ready', error: null, chats: [mirrorChat], unreadCount: 0, refresh: vi.fn(async () => [mirrorChat]),
    setArchived: vi.fn(), setManualUnread: vi.fn(), markRead: vi.fn(), subscribe: () => () => undefined, setViewing: vi.fn(),
    revision: 0, authors: { [ME]: { id: ME, name: 'Test Owner', slug: 'test-user', avatarUrl: null, avatarColor: null, hasPledged: false } }, missingAuthors: new Set(), ensureAuthors: vi.fn(), outbox: [], sendMessage: vi.fn(), retrySend: vi.fn(),
    discardSend: vi.fn(), block: vi.fn(), unblock: vi.fn(), goToChat: vi.fn(), resync: vi.fn(),
  } as ChatContextValue;
}

const onRunActive = vi.fn();

/** The panel as the workspace mounts it. */
function mount() {
  return render(
    <MemoryRouter initialEntries={[`/chats/c/${MIRROR_ID}/t/${ROOT}`]}>
      <ChatContext.Provider value={chatValue()}>
        <ThreadPanel fill summary={mirrorChat} rootId={ROOT} highlightId={null} onRunActive={onRunActive} />
      </ChatContext.Provider>
    </MemoryRouter>,
  );
}
async function renderPanel() {
  const out = mount();
  await act(async () => {});
  return out;
}

const NOT_AVAILABLE = 'This draft is not available.';

beforeEach(() => {
  vi.clearAllMocks();
  resetCanvasAvailability();
  resetCanvasThreads();
  clearDraftsExcept(null);
  Object.assign(state, { draft: draftRow(), run: null, material: [], messages: [canvasRoot()], lastDone: null });
  svc.getCanvasDraftAvailability.mockResolvedValue(true);
  svc.getCanvasDraftByThread.mockImplementation(async (id: string) => (id === ROOT ? state.draft : null));
  svc.getLatestCanvasRun.mockImplementation(async () => state.run);
  svc.listCanvasMaterial.mockImplementation(async () => state.material);
  // the v6 truth: a message's run starts the moment it is sent, so after a send nothing is waiting to be started
  svc.startQueuedCanvasRun.mockResolvedValue({ ok: false, code: 'NOT_AVAILABLE' });
  svc.retryCanvasRun.mockResolvedValue({ ok: true, runId: 'run-2', revision: 5, replayed: false, start: { ok: true, runId: 'run-2', kind: 'message' } });
  svc.publishCanvasDraft.mockResolvedValue({ ok: true, seq: 1, skippedLinks: 0 });
  svc.uploadCanvasMaterial.mockResolvedValue({ ok: true, label: 'offer.md', chars: 900 });
  svc.sendCanvasWorkspaceMessage.mockResolvedValue({ ok: true, runId: 'run-up', revision: 4, draftId: 'draft-1', start: null });
  svc.listMyCanvasVersions.mockResolvedValue([]);
  svc.countDoneCanvasDraftRuns.mockResolvedValue(1);
  svc.getLastDoneCanvasDraftRunAt.mockImplementation(async () => state.lastDone);
  svc.getCanvasDraftViewPath.mockResolvedValue(null);
});
afterEach(() => cleanup());

describe('B2: after a file was read and its run is done, the thread has no dead-end Update draft', () => {
  it('a file the finished run itself kept is not new input: no Update draft is offered', async () => {
    state.draft = draftRow({ runCount: 1 });
    state.run = runRow({ state: 'done' });
    state.material = [fileRow()];
    await renderPanel();
    await waitFor(() => expect(svc.getLatestCanvasRun).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Update draft' })).not.toBeInTheDocument();
  });

  it('the file read in THIS tab (an upload that finished) is not new either once its run is done', async () => {
    // the upload's run has ended and its text is in the database by the time the post answers, as the engine leaves them
    state.draft = draftRow({ runCount: 1, revision: 6 });
    state.run = runRow({ state: 'done' });
    state.material = [fileRow()];
    await renderPanel();
    const input = (await screen.findByTestId('canvas-upload-input')) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'offer.md')] } });
    });
    await waitFor(() => expect(svc.uploadCanvasMaterial).toHaveBeenCalledWith('run-up', expect.anything()));
    await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Update draft' })).not.toBeInTheDocument();
  });

  it('W0: a note after a capped run offers no Update draft (Send is the update), and never says the open draft is not available', async () => {
    state.messages = [canvasRoot(), msg({ id: 'n1', body: 'Raise the price to 60', createdAt: '2026-10-27T10:30:00.000Z' })];
    state.draft = draftRow({ runCount: 1 });
    state.lastDone = RUN_AT;
    state.run = runRow({ state: 'capped', createdAt: '2026-10-27T11:00:00.000Z', startedAt: '2026-10-27T11:00:00.000Z' });
    await renderPanel();
    await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Update draft' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('canvas-bar')).not.toBeInTheDocument();
    expect(svc.startQueuedCanvasRun).not.toHaveBeenCalled();
    expect(screen.queryByText(NOT_AVAILABLE)).not.toBeInTheDocument();
  });
});

describe('B2: after the run settles the surface leaves the progress within the poll interval', () => {
  it('Updating… (the workspace spot) ends within the poll interval, and the panel never says the draft is not available', async () => {
    vi.useFakeTimers();
    try {
      state.draft = draftRow({ runCount: 0 });
      state.run = runRow({ state: 'running', startedAt: new Date().toISOString(), createdAt: new Date().toISOString() });
      mount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      expect(screen.queryByText('Creating your canvas…')).not.toBeInTheDocument(); // W0: status is the Publish spot's, not a tray line
      expect(onRunActive).toHaveBeenLastCalledWith(true);
      state.draft = draftRow({ runCount: 1, revision: 6 });
      state.run = runRow({ state: 'done' });
      state.material = [fileRow()];
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RUN_POLL_MS + 50);
      });
      expect(onRunActive).toHaveBeenLastCalledWith(false);
      expect(screen.queryByText(NOT_AVAILABLE)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Update draft' })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
