/**
 * P1536 S6 review: the rule-9 assertion (assertStableVariantsOnInput, src/tests/p955-gate.test.ts) over the REAL composers
 * the app mounts, not only the gate fixture: the thread panel (a canvas thread and a plain thread) and the conversation
 * pane (a direct chat and the mirror chat). Providers are the minimal ones the neighbouring tests use
 * (p1536-thread-order.test.tsx): the chat context, a router, and the data hooks replaced by fixed values.
 * Today's canvas thread flips buttons while the owner types (slice S3 rebuilds it), so that surface is `it.fails`.
 */
import { act, cleanup, render, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-mappers';
import type { CanvasDraft } from '@/app/data/canvas-draft-service';

const ME = 'user-id-me';
const CONV = 'conv-mirror-1';
const ROOT = 'root-1';

const state = vi.hoisted(() => ({ draft: null as CanvasDraft | null, available: true, messages: [] as ChatMessage[] }));
const svc = vi.hoisted(() => ({
  getCanvasDraftAvailability: vi.fn(),
  getCanvasDraftByThread: vi.fn(),
  getLatestCanvasRun: vi.fn(),
  listCanvasMaterial: vi.fn(),
  getCanvasVersionCard: vi.fn(),
  countDoneCanvasDraftRuns: vi.fn(),
  getLastDoneCanvasDraftRunAt: vi.fn(),
  getCanvasDraftViewPath: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), ...svc }));
vi.mock('@/app/pages/chat/use-message-actions', () => ({ useMessageActions: () => ({ actions: {}, dialogs: null }) }));
vi.mock('@/app/pages/chat/use-conversation', () => ({
  isLocal: () => false,
  useConversationMessages: () => ({
    server: state.messages, messages: state.messages, status: 'ready', send: vi.fn(), stats: new Map(), hasMore: false, loadingEarlier: false,
    loadEarlier: vi.fn(), ensureLoaded: vi.fn(), lookup: vi.fn(), getLoaded: vi.fn(), syncVersion: 0, retrySend: vi.fn(), discard: vi.fn(), edit: vi.fn(), reload: vi.fn(),
  }),
}));
vi.mock('@/app/pages/chat/MessageRow', () => ({ MessageRow: ({ msg }: { msg: ChatMessage }) => <li data-msg={msg.id}>{msg.body ?? 'card'}</li> }));

import { ThreadPanel } from '@/app/pages/chat/ThreadPanel';
import { ConversationPane } from '@/app/pages/chat/ConversationPane';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { resetCanvasThreads } from '@/app/pages/chat/canvas-thread-registry';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { assertStableVariantsOnInput, buttonsChangedOnInput } from './p955-stable-variants';

const summary = (over: Partial<ChatSummary>): ChatSummary => ({
  conversationId: CONV, kind: 'mirror', title: 'Mira', other: null, org: null, event: null, ownerFirstName: 'Test',
  lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false, ...over,
});
const MIRROR = summary({});
const DIRECT = summary({ conversationId: 'conv-direct-1', kind: 'direct', title: 'Example Person', other: { id: 'user-id-other', name: 'Example Person', slug: 'example-person', avatarUrl: null, avatarColor: null, hasPledged: false } } as Partial<ChatSummary>);
const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: 'm', conversationId: CONV, authorId: ME, body: 'hello', createdAt: '2026-10-27T08:00:00.000Z', editedAt: null, deletedAt: null, isDeleted: false,
  replyToId: null, threadRootId: ROOT, forwardedFromMessageId: null, forwardAuthorId: null, forwardSnapshot: null, kind: 'message', attachmentKind: null,
  attachmentId: null, clientId: null, contextConversationId: null, ...over,
});
const draftRow = (over: Partial<CanvasDraft>): CanvasDraft => ({
  id: 'draft-1', versionId: 'ver-draft', canvasId: 'cv-1', baseVersionId: null, conversationId: CONV, threadRootId: ROOT, state: 'open', runCount: 0,
  closedAt: null, canvasName: null, versionName: null, ...over,
});

function chatValue(chats: ChatSummary[]): ChatContextValue {
  return {
    userId: ME, status: 'ready', error: null, chats, unreadCount: 0, refresh: vi.fn(async () => chats), setArchived: vi.fn(), setManualUnread: vi.fn(),
    markRead: vi.fn(), subscribe: () => () => undefined, setViewing: vi.fn(), revision: 0,
    authors: { [ME]: { id: ME, name: 'Test Owner', slug: 'test-user', avatarUrl: null, avatarColor: null, hasPledged: false } },
    missingAuthors: new Set(), ensureAuthors: vi.fn(), outbox: [], sendMessage: vi.fn(), retrySend: vi.fn(), discardSend: vi.fn(), block: vi.fn(), unblock: vi.fn(), goToChat: vi.fn(), resync: vi.fn(),
  } as ChatContextValue;
}

async function mount(ui: ReactNode, chats: ChatSummary[], path: string) {
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <ChatContext.Provider value={chatValue(chats)}>{ui}</ChatContext.Provider>
    </MemoryRouter>,
  );
  await act(async () => {});
  return { container: view.container, composer: within(view.container).getByTestId('composer') };
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  resetCanvasAvailability();
  resetCanvasThreads();
  state.messages = [msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-1' }), msg({ id: 'note-1', body: 'my note' })];
  state.draft = null;
  state.available = true;
  svc.getCanvasDraftAvailability.mockImplementation(async () => state.available);
  svc.getCanvasDraftByThread.mockImplementation(async () => state.draft);
  svc.getLatestCanvasRun.mockResolvedValue(null);
  svc.listCanvasMaterial.mockResolvedValue([]);
  svc.countDoneCanvasDraftRuns.mockResolvedValue(0);
  svc.getLastDoneCanvasDraftRunAt.mockResolvedValue(null);
  svc.getCanvasDraftViewPath.mockResolvedValue(null);
});

describe('rule 9 on the real thread panel composer', () => {
  it('a plain thread (no canvas) keeps every button\'s look while typing', async () => {
    state.available = false;
    const { container, composer } = await mount(<ThreadPanel summary={MIRROR} rootId={ROOT} highlightId={null} />, [MIRROR], `/chats/c/${CONV}/t/${ROOT}`);
    expect(container.querySelector('[data-testid="canvas-opener"]')).toBeNull(); // CONTROL: this really is not a canvas thread
    expect(buttonsChangedOnInput(container, composer)).toEqual([]);
  });

  // The real thread panel with an open draft, with and without the owner's own messages in it.
  const CANVAS_CASES: Array<[string, string, string[]]> = [
    ['a new canvas thread with no messages yet', 'Copy prompt', []],
    ['a new canvas thread with a note in it', 'Create canvas', ['note-1']],
  ];
  const mountCanvas = async (notes: string[]) => {
    state.draft = draftRow({});
    state.messages = [state.messages[0]!, ...notes.map((id) => msg({ id, body: 'my note' }))];
    return mount(<ThreadPanel summary={MIRROR} rootId={ROOT} highlightId={null} />, [MIRROR], `/chats/c/${CONV}/t/${ROOT}`);
  };

  it.each(CANVAS_CASES)('KNOWN-BAD CONTROL: %s flips exactly "%s" while typing', async (_what, button, notes) => {
    const { container, composer } = await mountCanvas(notes);
    expect(container.querySelector('[data-testid="canvas-opener"]')).not.toBeNull(); // CONTROL: this really is a canvas thread
    expect(buttonsChangedOnInput(container, composer).map((c) => c.replace(/ \(.*\)$/, ''))).toEqual([`${button}: look`]);
  });

  // Slice S3 rebuilds the canvas thread. When it lands each of these turns red: change `it.fails` to `it`.
  it.fails.each(CANVAS_CASES)('S3 wires this in: %s keeps every button\'s look while typing', async (_what, _button, notes) => {
    const { container, composer } = await mountCanvas(notes);
    assertStableVariantsOnInput(container, composer);
  });
});

describe('rule 9 on the real conversation pane composer', () => {
  it('a direct chat keeps every button\'s look while typing', async () => {
    const { container, composer } = await mount(<ConversationPane conversationId={DIRECT.conversationId} highlightId={null} paneVisible />, [DIRECT], `/chats/c/${DIRECT.conversationId}`);
    expect(buttonsChangedOnInput(container, composer)).toEqual([]);
  });

  it('the mirror chat keeps every button\'s look while typing', async () => {
    const { container, composer } = await mount(<ConversationPane conversationId={MIRROR.conversationId} highlightId={null} paneVisible />, [MIRROR], `/chats/c/${CONV}`);
    expect(buttonsChangedOnInput(container, composer)).toEqual([]);
  });
});
