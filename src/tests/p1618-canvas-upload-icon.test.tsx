/**
 * @file p1618-canvas-upload-icon.test.tsx
 * @description P1618 (amends P1536 X3): the paperclip means "Attach a point or story", so a canvas thread's upload has its own icon and the thread's
 * hint names the upload while one can be made. Every other composer keeps "Reply in thread".
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-mappers';
import type { CanvasDraft, CanvasDraftRun } from '@/app/data/canvas-draft-service';

const ME = 'user-id-me';
const MIRROR_ID = 'conv-mirror-1';
const ROOT = 'root-1';
const RUN_AT = '2026-10-27T10:00:00.000Z';

const state = vi.hoisted(() => ({ draft: null as CanvasDraft | null, run: null as CanvasDraftRun | null, messages: [] as ChatMessage[] }));
const reads = vi.hoisted(() => ({
  getCanvasDraftAvailability: vi.fn(),
  getCanvasDraftByThread: vi.fn(),
  getLatestCanvasRun: vi.fn(),
  listCanvasMaterial: vi.fn(),
  listMyCanvasVersions: vi.fn(),
  countDoneCanvasDraftRuns: vi.fn(),
  getLastDoneCanvasDraftRunAt: vi.fn(),
  getCanvasDraftViewPath: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), ...reads }));
vi.mock('@/app/pages/chat/MessageList', () => ({ MessageList: () => <div data-testid="message-list" /> }));
vi.mock('@/app/pages/chat/use-message-actions', () => ({ useMessageActions: () => ({ actions: {}, dialogs: null }) }));
vi.mock('@/app/pages/chat/use-conversation', () => ({ useConversationMessages: () => ({ server: state.messages, status: 'ready', send: vi.fn() }) }));

import { ThreadPanel } from '@/app/pages/chat/ThreadPanel';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { resetCanvasThreads } from '@/app/pages/chat/canvas-thread-registry';
import { clearDraftsExcept } from '@/app/pages/chat/chat-hooks';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { UploadSpot } from '@/app/pages/chat/CanvasUploadButton';

const mirrorChat: ChatSummary = {
  conversationId: MIRROR_ID, kind: 'mirror', title: 'Mira', other: null, org: null, event: null, ownerFirstName: 'Test',
  lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false,
};
const root = (canvas: boolean): ChatMessage => ({
  id: ROOT, conversationId: MIRROR_ID, authorId: ME, body: canvas ? null : 'plain', createdAt: RUN_AT, editedAt: null,
  deletedAt: null, isDeleted: false, replyToId: null, threadRootId: null, forwardedFromMessageId: null, forwardAuthorId: null,
  forwardSnapshot: null, kind: 'message', attachmentKind: canvas ? 'canvas_version' : null, attachmentId: canvas ? 'ver-1' : null, clientId: null, contextConversationId: null,
});
const draft = (): CanvasDraft => ({
  id: 'draft-1', versionId: 'ver-draft', canvasId: 'cv-1', baseVersionId: null, conversationId: MIRROR_ID, threadRootId: ROOT,
  state: 'open', runCount: 1, revision: 3, closedAt: null, canvasName: 'canvas', versionName: 'canvas_dabc12',
});
const run = (runState: CanvasDraftRun['state']): CanvasDraftRun => ({ id: 'run-1', kind: 'message', state: runState, errorCode: null, createdAt: RUN_AT, startedAt: RUN_AT });

function chatValue(): ChatContextValue {
  return {
    userId: ME, status: 'ready', error: null, chats: [mirrorChat], unreadCount: 0, refresh: vi.fn(async () => [mirrorChat]),
    setArchived: vi.fn(), setManualUnread: vi.fn(), markRead: vi.fn(), subscribe: () => () => undefined, setViewing: vi.fn(),
    revision: 0, authors: { [ME]: { id: ME, name: 'Test Owner', slug: 'test-user', avatarUrl: null, avatarColor: null, hasPledged: false } }, missingAuthors: new Set(), ensureAuthors: vi.fn(), outbox: [], sendMessage: vi.fn(), retrySend: vi.fn(),
    discardSend: vi.fn(), block: vi.fn(), unblock: vi.fn(), goToChat: vi.fn(), resync: vi.fn(),
  } as ChatContextValue;
}

async function mountThread() {
  render(
    <MemoryRouter initialEntries={[`/chats/c/${MIRROR_ID}/t/${ROOT}`]}>
      <ChatContext.Provider value={chatValue()}>
        <ThreadPanel fill summary={mirrorChat} rootId={ROOT} highlightId={null} />
      </ChatContext.Provider>
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  resetCanvasAvailability();
  resetCanvasThreads();
  clearDraftsExcept(null);
  Object.assign(state, { draft: draft(), run: run('done'), messages: [root(true)] });
  reads.getCanvasDraftAvailability.mockResolvedValue(true);
  reads.getCanvasDraftByThread.mockImplementation(async () => state.draft);
  reads.getLatestCanvasRun.mockImplementation(async () => state.run);
  reads.listCanvasMaterial.mockResolvedValue([]);
  reads.listMyCanvasVersions.mockResolvedValue([]);
  reads.countDoneCanvasDraftRuns.mockResolvedValue(1);
  reads.getLastDoneCanvasDraftRunAt.mockResolvedValue(RUN_AT);
  reads.getCanvasDraftViewPath.mockResolvedValue(null);
});
afterEach(cleanup);

describe('P1618: the upload icon', () => {
  it('the button shows the Upload icon, named Upload for readers and on hover, and no paperclip', () => {
    render(<UploadSpot waiting={false} busy={false} onPick={vi.fn()} />);
    const button = screen.getByTestId('canvas-upload');
    expect(button.querySelector('svg.lucide-upload')).not.toBeNull();
    expect(button.querySelector('svg.lucide-paperclip')).toBeNull();
    expect(button).toHaveAttribute('aria-label', 'Upload');
    // P1621: the hover name is a real tooltip, shown on focus too (p1621-composer-pills.test.tsx), so no native title doubles it.
    expect(button).not.toHaveAttribute('title');
  });

  it('the waiting status in the same spot carries no paperclip either', () => {
    render(<UploadSpot waiting busy={false} onPick={vi.fn()} />);
    const status = screen.getByTestId('canvas-upload-waits');
    expect(status.querySelector('svg.lucide-upload')).not.toBeNull();
    expect(status.querySelector('svg.lucide-paperclip')).toBeNull();
  });
});

describe('P1618: the thread hint', () => {
  it('a canvas thread with an open draft says the upload exists', async () => {
    await mountThread();
    await screen.findByTestId('canvas-upload');
    expect(screen.getByTestId('composer-hint')).toHaveTextContent('Reply, or upload a file');
    expect(screen.getByRole('textbox', { name: 'Reply, or upload a file' })).toBeInTheDocument();
  });

  it('while an update runs Upload waits, so the hint does not offer it', async () => {
    const now = new Date().toISOString(); // inside the run's lease
    state.run = { ...run('running'), createdAt: now, startedAt: now };
    await mountThread();
    await screen.findByTestId('canvas-upload-waits');
    expect(screen.getByTestId('composer-hint')).toHaveTextContent('Reply in thread');
  });

  it('CONTROL: a plain thread keeps "Reply in thread" and has no upload', async () => {
    state.draft = null;
    state.messages = [root(false)];
    await mountThread();
    expect(screen.queryByTestId('canvas-upload')).toBeNull();
    expect(screen.getByTestId('composer-hint')).toHaveTextContent('Reply in thread');
  });
});
