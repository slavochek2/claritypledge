/**
 * @file p1536-thread-order.test.tsx
 * @description P1536 review C2: the order of a canvas thread as the REAL ThreadPanel + MessageList + MessageRow draw it.
 * An update thread (a draft with a base version) shows the base-version card first, then the opener, then the owner's
 * messages; a new canvas has no card, so the opener is first.
 */
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-mappers';
import type { CanvasDraft } from '@/app/data/canvas-draft-service';

const ME = 'user-id-me';
const CONV = 'conv-mirror-1';
const ROOT = 'root-1';

const state = vi.hoisted(() => ({ draft: null as CanvasDraft | null, messages: [] as ChatMessage[] }));
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
vi.mock('@/app/pages/chat/MessageRow', () => ({ MessageRow: ({ msg }: { msg: ChatMessage }) => <li data-msg={msg.id}>{msg.body ?? 'base version card'}</li> }));

import { ThreadPanel } from '@/app/pages/chat/ThreadPanel';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { resetCanvasThreads } from '@/app/pages/chat/canvas-thread-registry';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { GateFixture } from '@/app/tree/_gate/canvas-thread/GateFixture';

const summary: ChatSummary = {
  conversationId: CONV, kind: 'mirror', title: 'Mira', other: null, org: null, event: null, ownerFirstName: 'Test',
  lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false,
};
const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: 'm', conversationId: CONV, authorId: ME, body: 'hello', createdAt: '2026-10-27T08:00:00.000Z', editedAt: null, deletedAt: null, isDeleted: false,
  replyToId: null, threadRootId: ROOT, forwardedFromMessageId: null, forwardAuthorId: null, forwardSnapshot: null, kind: 'message', attachmentKind: null,
  attachmentId: null, clientId: null, contextConversationId: null, ...over,
});
const draftRow = (over: Partial<CanvasDraft>): CanvasDraft => ({
  id: 'draft-1', versionId: 'ver-draft', canvasId: 'cv-1', baseVersionId: null, conversationId: CONV, threadRootId: ROOT, state: 'open', runCount: 0, revision: 0,
  closedAt: null, canvasName: null, versionName: null, ...over,
});

function chatValue(): ChatContextValue {
  return {
    userId: ME, status: 'ready', error: null, chats: [summary], unreadCount: 0, refresh: vi.fn(async () => [summary]), setArchived: vi.fn(), setManualUnread: vi.fn(),
    markRead: vi.fn(), subscribe: () => () => undefined, setViewing: vi.fn(), revision: 0,
    authors: { [ME]: { id: ME, name: 'Test Owner', slug: 'test-user', avatarUrl: null, avatarColor: null, hasPledged: false } },
    missingAuthors: new Set(), ensureAuthors: vi.fn(), outbox: [], sendMessage: vi.fn(), retrySend: vi.fn(), discardSend: vi.fn(), block: vi.fn(), unblock: vi.fn(), goToChat: vi.fn(), resync: vi.fn(),
  } as ChatContextValue;
}

async function mount(ui: ReactNode) {
  render(
    <MemoryRouter initialEntries={[`/chats/c/${CONV}/t/${ROOT}`]}>
      <ChatContext.Provider value={chatValue()}>{ui}</ChatContext.Provider>
    </MemoryRouter>,
  );
  await act(async () => {});
}

/** What sits in the message stream, top to bottom: the ids of the rows and the opener. */
const order = () => [...screen.getByTestId('message-scroller').querySelectorAll('[data-msg], [data-testid="canvas-opener"]')].map((n) => n.getAttribute('data-msg') ?? 'OPENER');

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  resetCanvasAvailability();
  resetCanvasThreads();
  state.messages = [msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-1' }), msg({ id: 'note-1', body: 'my note', createdAt: '2026-10-27T08:30:00.000Z' })];
  svc.getCanvasDraftAvailability.mockResolvedValue(true);
  svc.getCanvasDraftByThread.mockImplementation(async () => state.draft);
  svc.getLatestCanvasRun.mockResolvedValue(null);
  svc.listCanvasMaterial.mockResolvedValue([]);
  svc.countDoneCanvasDraftRuns.mockResolvedValue(0);
  svc.getLastDoneCanvasDraftRunAt.mockResolvedValue(null);
  svc.getCanvasDraftViewPath.mockResolvedValue(null);
});

describe('C2: the real thread draws the base-version card before the opener', () => {
  it('an update thread: base card (the root), then the opener, then the owner messages', async () => {
    state.draft = draftRow({ baseVersionId: 'ver-base' });
    await mount(<ThreadPanel summary={summary} rootId={ROOT} highlightId={null} />);
    expect(order()).toEqual([ROOT, 'OPENER', 'note-1']);
  });

  it('CONTROL: a new canvas has no card, so the opener is first and only the owner messages follow', async () => {
    state.draft = draftRow({});
    await mount(<ThreadPanel summary={summary} rootId={ROOT} highlightId={null} />);
    expect(order()).toEqual(['OPENER', 'note-1']);
  });
});

/** The gate fixture's thread, top to bottom, by test id. */
const fixtureOrder = (phase: string) => {
  render(
    <MemoryRouter initialEntries={[`/tree/_gate/canvas-thread?phase=${phase}`]}>
      <GateFixture />
    </MemoryRouter>,
  );
  return [...document.querySelectorAll('[data-testid="gate-base-card"], [data-testid="canvas-opener"], [data-testid="gate-row"], [data-testid="canvas-draft-card"]')].map((n) => n.getAttribute('data-testid'));
};

describe('C2: the gate fixture shows the same order the real thread does (no fixture-only ordering)', () => {
  it('an update: base card, opener, the owner rows, then the draft card', () => {
    expect(fixtureOrder('update-drafted')).toEqual(['gate-base-card', 'canvas-opener', 'gate-row', 'gate-row', 'gate-row', 'canvas-draft-card']);
  });

  it('CONTROL: a new canvas has no base card, so the opener is first', () => {
    expect(fixtureOrder('drafted')).toEqual(['canvas-opener', 'gate-row', 'gate-row', 'gate-row', 'canvas-draft-card']);
  });
});
