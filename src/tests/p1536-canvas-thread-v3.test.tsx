/**
 * @file p1536-canvas-thread-v3.test.tsx
 * @description P1536 v3 (founder, 2026-10-28), the canvas draft thread, services mocked. Since W0 (2026-11-01) the tray is gone (Create
 * canvas, Update draft, the rows, the draft card, the closed strip), so what remains here:
 *  - the opener never folds (the message and the steps card stay after the owner sends anything), and Copy prompt keeps one look;
 *  - the P955 fixture has no filled primary in any phase.
 */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-mappers';
import type { CanvasDraft, CanvasDraftRun, CanvasMaterialItem } from '@/app/data/canvas-draft-service';

const ME = 'user-id-me';
const MIRROR_ID = 'conv-mirror-1';
const ROOT = 'root-1';
const AFTER = '2026-10-27T10:00:00.000Z';

const state = vi.hoisted(() => ({
  draft: null as CanvasDraft | null,
  run: null as CanvasDraftRun | null,
  material: [] as CanvasMaterialItem[],
  messages: [] as ChatMessage[],
  versions: [] as Array<{ id: string; canvasId: string; canvasName: string; name: string; seq: number; publishedAt: string; hasOpenDraft: boolean }>,
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
  getCanvasVersionCard: vi.fn(),
  countDoneCanvasDraftRuns: vi.fn(),
  getLastDoneCanvasDraftRunAt: vi.fn(),
  getCanvasDraftViewPath: vi.fn(),
}));
const chatSvc = vi.hoisted(() => ({ sendMessage: vi.fn() }));
const helpers = vi.hoisted(() => ({ loadMyShareables: vi.fn() }));
const toastFn = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: toastFn }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), ...svc }));
vi.mock('@/app/data/chat-service', async () => ({ ...(await vi.importActual<object>('@/app/data/chat-service')), ...chatSvc }));
vi.mock('@/app/data/chat-ui-helpers', async () => ({ ...(await vi.importActual<object>('@/app/data/chat-ui-helpers')), ...helpers }));
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
  // The thread's own root is always in its messages, whatever thread the route opened.
  useConversationMessages: ({ threadRootId }: { threadRootId?: string }) => ({
    server: state.messages.map((m) => (m.attachmentKind === 'canvas_version' ? { ...m, id: threadRootId ?? m.id } : m)),
    status: 'ready',
    send: vi.fn(),
  }),
}));

import { ThreadPanel } from '@/app/pages/chat/ThreadPanel';
import { CanvasThreadOpener } from '@/app/pages/chat/CanvasOpener';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { clearDraftsExcept } from '@/app/pages/chat/chat-hooks';
import { resetCanvasThreads } from '@/app/pages/chat/canvas-thread-registry';
import { GateFixture } from '@/app/tree/_gate/canvas-thread/GateFixture';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';

const mirrorChat: ChatSummary = {
  conversationId: MIRROR_ID, kind: 'mirror', title: 'Mira', other: null, org: null, event: null, ownerFirstName: 'Test',
  lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false,
};

function msg(over: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'msg-1', conversationId: MIRROR_ID, authorId: ME, body: 'hello', createdAt: new Date().toISOString(), editedAt: null,
    deletedAt: null, isDeleted: false, replyToId: null, threadRootId: ROOT, forwardedFromMessageId: null, forwardAuthorId: null,
    forwardSnapshot: null, kind: 'message', attachmentKind: null, attachmentId: null, clientId: null, contextConversationId: null, ...over,
  };
}
const canvasRoot = () => msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-1' });
const note = () => msg({ id: 'note-1', body: 'I sell bookkeeping to cafe owners', createdAt: '2026-10-27T08:30:00.000Z' });

const draftRow = (over: Partial<CanvasDraft> = {}): CanvasDraft => ({
  id: 'draft-1', versionId: 'ver-draft', canvasId: 'cv-1', baseVersionId: null, conversationId: MIRROR_ID, threadRootId: ROOT,
  state: 'open', runCount: 0, revision: 3, closedAt: null, canvasName: null, versionName: null, ...over,
});

function chatValue(): ChatContextValue {
  return {
    userId: ME, status: 'ready', error: null, chats: [mirrorChat], unreadCount: 0, refresh: vi.fn(async () => [mirrorChat]),
    setArchived: vi.fn(), setManualUnread: vi.fn(), markRead: vi.fn(), subscribe: () => () => undefined, setViewing: vi.fn(),
    revision: 0, authors: { [ME]: { id: ME, name: 'Test Owner', slug: 'test-user', avatarUrl: null, avatarColor: null, hasPledged: false } }, missingAuthors: new Set(), ensureAuthors: vi.fn(), outbox: [], sendMessage: vi.fn(), retrySend: vi.fn(),
    discardSend: vi.fn(), block: vi.fn(), unblock: vi.fn(), goToChat: vi.fn(), resync: vi.fn(),
  } as ChatContextValue;
}

function wrap(ui: ReactNode, path = `/chats/c/${MIRROR_ID}/t/${ROOT}`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ChatContext.Provider value={chatValue()}>{ui}</ChatContext.Provider>
    </MemoryRouter>,
  );
}

async function renderThread() {
  const out = wrap(<ThreadPanel summary={mirrorChat} rootId={ROOT} highlightId={null} />);
  await act(async () => {});
  return out;
}

/** The names of the filled blue buttons and links on the page: the primaries. */
const bluePrimaries = () =>
  [...document.querySelectorAll('button, a')]
    .filter((e) => e.className.includes('bg-blue-600'))
    .map((e) => e.getAttribute('aria-label') ?? e.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  resetCanvasAvailability();
  resetCanvasThreads();
  clearDraftsExcept(null);
  Object.assign(state, { draft: draftRow(), run: null, material: [], messages: [canvasRoot()], versions: [] });
  svc.getCanvasDraftAvailability.mockResolvedValue(true);
  svc.getCanvasDraftByThread.mockImplementation(async (id: string) => (id === ROOT ? state.draft : null));
  svc.getLatestCanvasRun.mockImplementation(async () => state.run);
  svc.listCanvasMaterial.mockImplementation(async () => state.material);
  svc.startQueuedCanvasRun.mockResolvedValue({ ok: true, runId: 'run-9', kind: 'draft' });
  svc.publishCanvasDraft.mockResolvedValue({ ok: true, seq: 1, skippedLinks: 0 });
  svc.uploadCanvasMaterial.mockResolvedValue({ ok: true, label: 'offer.pdf', chars: 900 });
  svc.sendCanvasWorkspaceMessage.mockResolvedValue({ ok: true, runId: 'run-up', revision: 4, draftId: 'draft-1', start: null });
  svc.openCanvasDraft.mockResolvedValue({ status: 'opened', draftId: 'draft-new', revision: 2, canvasId: 'cv-1', conversationId: MIRROR_ID, threadRootId: 'root-new', canvasName: 'canvas', fromSeq: 1 });
  svc.discardCanvasDraft.mockResolvedValue({ ok: true, discarded: true });
  svc.listMyCanvasVersions.mockImplementation(async () => state.versions);
  svc.countDoneCanvasDraftRuns.mockResolvedValue(1);
  svc.getLastDoneCanvasDraftRunAt.mockResolvedValue(AFTER);
  svc.getCanvasDraftViewPath.mockResolvedValue(null);
  chatSvc.sendMessage.mockResolvedValue(msg({ id: 'carried' }));
  helpers.loadMyShareables.mockResolvedValue([]);
});

afterEach(() => cleanup());

describe('1. the opener never folds', () => {
  it('after the owner sent a note, the message and the steps card are still there, with Copy prompt as an outline', async () => {
    state.messages = [canvasRoot(), note()];
    await renderThread();
    expect(await screen.findByTestId('canvas-opener-ask')).toBeInTheDocument();
    const steps = screen.getByTestId('canvas-opener-steps');
    const copy = within(steps).getByRole('button', { name: 'Copy prompt' });
    // W0: there is no Create canvas any more; Copy prompt keeps its one outline look (P955), so nothing is filled
    expect(copy.className).toContain('border');
    expect(copy.className).not.toContain('bg-blue-600');
    expect(bluePrimaries()).toEqual([]);
  });

  it('a file already kept, or an upload in this tab, does not fold it either', async () => {
    state.material = [{ id: 'm1', kind: 'file', label: 'offer.pdf', chars: 900, createdAt: '2026-10-27T08:00:00.000Z' }];
    await renderThread();
    expect(await screen.findByTestId('canvas-opener-ask')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-opener-steps')).toBeInTheDocument();
  });

  it('Copy prompt keeps one look always (D3, rule 9): with nothing added it is an outline too, so nothing is filled', async () => {
    await renderThread();
    await screen.findByTestId('canvas-opener-steps');
    expect(bluePrimaries()).toEqual([]);
    expect(screen.getByRole('button', { name: 'Copy prompt' }).className).toContain('border');
  });

  it('the opener takes no "compact" mode: the component always draws the message and the steps card', () => {
    render(<CanvasThreadOpener title="Mira" {...({ compact: true } as object)} />);
    expect(screen.getByTestId('canvas-opener-ask')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-opener-steps')).toBeInTheDocument();
  });
});

describe('11. Copy prompt keeps one look; the fixture has no filled primary in any phase', () => {
  it('the ladder is gone: openerIsPrimary no longer exists (D3 supersedes it)', async () => {
    const copy = await import('@/app/pages/chat/canvas-thread-copy');
    expect('openerIsPrimary' in copy).toBe(false);
  });

  // Every phase of the P955 fixture, composer empty. W0 removed the tray (Create canvas, Update draft, Open, Start a new version),
  // so no phase has a filled primary: Copy prompt is an outline and Publish lives in the workspace's spot.
  it.each(['empty', 'messages', 'update-empty', 'update-messages'])('the fixture phase %s has no filled primary', (phase) => {
    render(
      <MemoryRouter initialEntries={[`/tree/_gate/canvas-thread?phase=${phase}`]}>
        <GateFixture />
      </MemoryRouter>,
    );
    expect(bluePrimaries()).toEqual([]);
  });
});
