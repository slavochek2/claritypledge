/**
 * @file p1536-b1-upload-refused-after-run-done.test.tsx
 * @description P1536 section 3b, bug B1 (founder walkthrough, 2026-11-01): the toast "That did not go through. Try again." appeared
 * although the update landed.
 *
 * The only toast with that sentence is use-canvas-uploads.ts (the unmapped-code fallback and the catch). An upload goes in two steps:
 * `canvas_workspace_send` announces it and makes a run, then the file is posted with the run's id. `postFile` posts a second time when
 * the first post's answer was lost (network error, a gateway answer with no code), because the server may or may not have seen the first.
 * When it had, and the run has already finished, the server answers the second post 409 GONE with `state: 'done'`
 * (canvas-handlers.ts refuseBegin). `uploadCanvasMaterial` threw that state away, so a run that had succeeded read as a refused upload:
 * GONE has no sentence of its own in DRAFT_ERROR_TEXT, so the toast fell back to the generic one.
 *
 * What these tests do NOT prove: that this is the path the founder hit. It is the only path in the code where the upload is refused while
 * its run succeeds; what to check in the browser is in the spec (section 3b, B1).
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
}));

const invoke = vi.hoisted(() => vi.fn());
const reads = vi.hoisted(() => ({
  getCanvasDraftAvailability: vi.fn(),
  getCanvasDraftByThread: vi.fn(),
  getLatestCanvasRun: vi.fn(),
  listCanvasMaterial: vi.fn(),
  sendCanvasWorkspaceMessage: vi.fn(),
  listMyCanvasVersions: vi.fn(),
  countDoneCanvasDraftRuns: vi.fn(),
  getLastDoneCanvasDraftRunAt: vi.fn(),
  getCanvasDraftViewPath: vi.fn(),
}));
const toastFn = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));

// The edge-function call is the only thing stubbed below the client: `uploadCanvasMaterial` and `postFile` are the real ones.
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }));
vi.mock('sonner', () => ({ toast: toastFn }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), ...reads }));
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
  useConversationMessages: () => ({ server: state.messages, status: 'ready', send: vi.fn() }),
}));

import { ThreadPanel } from '@/app/pages/chat/ThreadPanel';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { resetCanvasThreads } from '@/app/pages/chat/canvas-thread-registry';
import { clearDraftsExcept } from '@/app/pages/chat/chat-hooks';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { startCanvasRun, uploadCanvasMaterial } from '@/app/data/canvas-draft-service';

const mirrorChat: ChatSummary = {
  conversationId: MIRROR_ID, kind: 'mirror', title: 'Mira', other: null, org: null, event: null, ownerFirstName: 'Test',
  lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false,
};
const canvasRoot = (): ChatMessage => ({
  id: ROOT, conversationId: MIRROR_ID, authorId: ME, body: null, createdAt: '2026-10-27T08:30:00.000Z', editedAt: null,
  deletedAt: null, isDeleted: false, replyToId: null, threadRootId: null, forwardedFromMessageId: null, forwardAuthorId: null,
  forwardSnapshot: null, kind: 'message', attachmentKind: 'canvas_version', attachmentId: 'ver-1', clientId: null, contextConversationId: null,
});
const RUN_AT = '2026-10-27T10:00:00.000Z';
const draftRow = (over: Partial<CanvasDraft> = {}): CanvasDraft => ({
  id: 'draft-1', versionId: 'ver-draft', canvasId: 'cv-1', baseVersionId: null, conversationId: MIRROR_ID, threadRootId: ROOT,
  state: 'open', runCount: 1, revision: 3, closedAt: null, canvasName: 'canvas', versionName: 'canvas_dabc12', ...over,
});

function chatValue(): ChatContextValue {
  return {
    userId: ME, status: 'ready', error: null, chats: [mirrorChat], unreadCount: 0, refresh: vi.fn(async () => [mirrorChat]),
    setArchived: vi.fn(), setManualUnread: vi.fn(), markRead: vi.fn(), subscribe: () => () => undefined, setViewing: vi.fn(),
    revision: 0, authors: { [ME]: { id: ME, name: 'Test Owner', slug: 'test-user', avatarUrl: null, avatarColor: null, hasPledged: false } }, missingAuthors: new Set(), ensureAuthors: vi.fn(), outbox: [], sendMessage: vi.fn(), retrySend: vi.fn(),
    discardSend: vi.fn(), block: vi.fn(), unblock: vi.fn(), goToChat: vi.fn(), resync: vi.fn(),
  } as ChatContextValue;
}

/** What the browser's fetch layer gives the client for a non-2xx answer of the edge function. */
const httpError = (status: number, body: unknown) => ({ data: null, error: { context: new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) } });
/** The answer was lost on the way (the network): no response object at all. */
const lostAnswer = () => ({ data: null, error: new Error('Failed to send a request to the Edge Function') });

beforeEach(() => {
  vi.clearAllMocks();
  resetCanvasAvailability();
  resetCanvasThreads();
  clearDraftsExcept(null);
  Object.assign(state, {
    draft: draftRow(), messages: [canvasRoot()], material: [],
    run: { id: 'run-up', kind: 'message', state: 'done', errorCode: null, createdAt: RUN_AT, startedAt: RUN_AT } satisfies CanvasDraftRun,
  });
  reads.getCanvasDraftAvailability.mockResolvedValue(true);
  reads.getCanvasDraftByThread.mockImplementation(async (id: string) => (id === ROOT ? state.draft : null));
  reads.getLatestCanvasRun.mockImplementation(async () => state.run);
  reads.listCanvasMaterial.mockImplementation(async () => state.material);
  reads.sendCanvasWorkspaceMessage.mockResolvedValue({ ok: true, runId: 'run-up', revision: 4, draftId: 'draft-1', start: null });
  reads.listMyCanvasVersions.mockResolvedValue([]);
  reads.countDoneCanvasDraftRuns.mockResolvedValue(1);
  reads.getLastDoneCanvasDraftRunAt.mockResolvedValue(RUN_AT);
  reads.getCanvasDraftViewPath.mockResolvedValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('B1 service: a refused post whose run already finished is not a refusal', () => {
  const file = () => new File(['x'], 'offer.md');
  it('409 GONE with the run done: the upload was applied (nothing lost, nothing more to start)', async () => {
    invoke.mockResolvedValueOnce(httpError(409, { code: 'GONE', state: 'done', error: 'This update is no longer running', error_code: null }));
    await expect(uploadCanvasMaterial('run-up', file())).resolves.toMatchObject({ ok: true });
  });

  it.each(['failed', 'capped', 'cancelled', 'undone', null])('CONTROL: 409 GONE with the run %s stays a refusal', async (runState) => {
    invoke.mockResolvedValueOnce(httpError(409, { code: 'GONE', state: runState, error: 'This update is no longer running', error_code: 'abandoned' }));
    await expect(uploadCanvasMaterial('run-up', file())).resolves.toEqual({ ok: false, code: 'GONE' });
  });

  it('CONTROL: other refusals are unchanged', async () => {
    invoke.mockResolvedValueOnce(httpError(422, { code: 'UNREADABLE' }));
    await expect(uploadCanvasMaterial('run-up', file())).resolves.toEqual({ ok: false, code: 'UNREADABLE' });
  });

  it('CONTROL: a start by id keeps its GONE (a start has no file to lose)', async () => {
    invoke.mockResolvedValueOnce(httpError(409, { code: 'GONE', state: 'done' }));
    await expect(startCanvasRun('run-up')).resolves.toEqual({ ok: false, code: 'GONE' });
  });
});

describe('B1 thread: a successful run plus the refused second post shows no failure toast', () => {
  it('the first answer is lost, the second post meets a finished run: no toast, the row is read', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    invoke
      .mockResolvedValueOnce(lostAnswer())
      .mockResolvedValueOnce(httpError(409, { code: 'GONE', state: 'done', error: 'This update is no longer running', error_code: null }));
    render(
      <MemoryRouter initialEntries={[`/chats/c/${MIRROR_ID}/t/${ROOT}`]}>
        <ChatContext.Provider value={chatValue()}>
          <ThreadPanel fill summary={mirrorChat} rootId={ROOT} highlightId={null} />
        </ChatContext.Provider>
      </MemoryRouter>,
    );
    await act(async () => {});
    const input = (await screen.findByTestId('canvas-upload-input')) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'offer.md')] } });
    });
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await act(async () => {});
    expect(toastFn.error).not.toHaveBeenCalled();
    expect(screen.queryByText('That did not go through. Try again.')).not.toBeInTheDocument();
  });

  it('CONTROL: the same sequence with a run that FAILED still says so', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    state.run = { id: 'run-up', kind: 'message', state: 'failed', errorCode: 'abandoned', createdAt: RUN_AT, startedAt: RUN_AT };
    invoke
      .mockResolvedValueOnce(lostAnswer())
      .mockResolvedValueOnce(httpError(409, { code: 'GONE', state: 'failed', error: 'This update is no longer running', error_code: 'abandoned' }));
    render(
      <MemoryRouter initialEntries={[`/chats/c/${MIRROR_ID}/t/${ROOT}`]}>
        <ChatContext.Provider value={chatValue()}>
          <ThreadPanel fill summary={mirrorChat} rootId={ROOT} highlightId={null} />
        </ChatContext.Provider>
      </MemoryRouter>,
    );
    await act(async () => {});
    const input = (await screen.findByTestId('canvas-upload-input')) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'offer.md')] } });
    });
    await waitFor(() => expect(toastFn.error).toHaveBeenCalledWith('That did not go through. Try again.'), { timeout: 3000 });
  });
});
