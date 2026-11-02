/**
 * @file p1536-x3-plus-menu.test.tsx
 * @description P1536 3c X3 (S3c.3): + means create, the paperclip means attach. The REAL conversation pane, composer and thread panel:
 *  - the owner's mirror chat's MAIN composer has a + beside the paperclip, while canvas drafting is on; its menu is "New canvas" and "Clone a version"
 *  - no other composer has one: not a thread of the mirror chat, not a direct chat, not a channel; not while drafting is off
 *  - the paperclip's dialog has Points and Stories only, and the "..." menu has no New canvas (drafting ON: the older tests of these two ran with
 *    drafting off, where they hold for the wrong reason)
 *  - New canvas opens a draft with no base; Clone a version picks a published version and NAVIGATES to it (writing nothing) carrying the Clone intent
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-mappers';

const ME = 'user-id-me';
const CONV = 'conv-mirror-1';
const ROOT = 'root-1';

const state = vi.hoisted(() => ({ available: true, messages: [] as unknown[] }));
const svc = vi.hoisted(() => ({
  getCanvasDraftAvailability: vi.fn(),
  getCanvasDraftByThread: vi.fn(),
  getLatestCanvasRun: vi.fn(),
  listCanvasMaterial: vi.fn(),
  getCanvasVersionCard: vi.fn(),
  countDoneCanvasDraftRuns: vi.fn(),
  getLastDoneCanvasDraftRunAt: vi.fn(),
  getCanvasDraftViewPath: vi.fn(),
  listMyCanvasVersions: vi.fn(),
  openCanvasDraft: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: toastError }) }));
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

import { ConversationPane } from '@/app/pages/chat/ConversationPane';
import { ThreadPanel } from '@/app/pages/chat/ThreadPanel';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { resetCanvasThreads } from '@/app/pages/chat/canvas-thread-registry';

const summary = (over: Partial<ChatSummary>): ChatSummary => ({
  conversationId: CONV, kind: 'mirror', title: 'Mira', other: null, org: null, event: null, ownerFirstName: 'Ana',
  lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false, ...over,
});
const MIRROR = summary({});
const DIRECT = summary({ conversationId: 'conv-direct-1', kind: 'direct', title: 'Example Person', other: { id: 'user-id-other', name: 'Example Person', slug: 'example-person', avatarUrl: null, avatarColor: null, hasPledged: false } } as Partial<ChatSummary>);
const CHANNEL = summary({ conversationId: 'conv-channel-1', kind: 'event', title: 'Example Channel' } as Partial<ChatSummary>);
const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: 'm', conversationId: CONV, authorId: ME, body: 'hello', createdAt: '2026-10-27T08:00:00.000Z', editedAt: null, deletedAt: null, isDeleted: false,
  replyToId: null, threadRootId: ROOT, forwardedFromMessageId: null, forwardAuthorId: null, forwardSnapshot: null, kind: 'message', attachmentKind: null,
  attachmentId: null, clientId: null, contextConversationId: null, ...over,
});

const who = { slug: 'ana' as string | null };
function chatValue(chats: ChatSummary[]): ChatContextValue {
  return {
    userId: ME, status: 'ready', error: null, chats, unreadCount: 0, refresh: vi.fn(async () => chats), setArchived: vi.fn(), setManualUnread: vi.fn(),
    markRead: vi.fn(), subscribe: () => () => undefined, setViewing: vi.fn(), revision: 0,
    authors: { [ME]: { id: ME, name: 'Ana', slug: who.slug, avatarUrl: null, avatarColor: null, hasPledged: false } },
    missingAuthors: new Set(), ensureAuthors: vi.fn(), outbox: [], sendMessage: vi.fn(), retrySend: vi.fn(), discardSend: vi.fn(), block: vi.fn(), unblock: vi.fn(), goToChat: vi.fn(), resync: vi.fn(),
  } as ChatContextValue;
}

function Where() {
  const l = useLocation();
  const s = (l.state ?? {}) as { from?: string; cloneThisVersion?: boolean };
  return (
    <>
      <output data-testid="path">{l.pathname}{l.search}</output>
      <output data-testid="intent">{s.cloneThisVersion ? 'clone' : 'none'}</output>
      <output data-testid="from">{s.from ?? ''}</output>
    </>
  );
}
async function mount(ui: ReactNode, chats: ChatSummary[], path: string) {
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <ChatContext.Provider value={chatValue(chats)}>
        <Routes>
          <Route path="/chats/*" element={ui} />
          <Route path="*" element={null} />
        </Routes>
        <Where />
      </ChatContext.Provider>
    </MemoryRouter>,
  );
  await act(async () => {});
  return view;
}
const pane = (c: ChatSummary) => <ConversationPane conversationId={c.conversationId} highlightId={null} paneVisible />;
const plus = () => screen.queryByTestId('composer-plus');

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  resetCanvasAvailability();
  resetCanvasThreads();
  state.available = true;
  who.slug = 'ana';
  state.messages = [msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-1' })];
  svc.getCanvasDraftAvailability.mockImplementation(async () => state.available);
  svc.getCanvasDraftByThread.mockResolvedValue(null);
  svc.getLatestCanvasRun.mockResolvedValue(null);
  svc.listCanvasMaterial.mockResolvedValue([]);
  svc.countDoneCanvasDraftRuns.mockResolvedValue(0);
  svc.getLastDoneCanvasDraftRunAt.mockResolvedValue(null);
  svc.getCanvasDraftViewPath.mockResolvedValue(null);
  svc.listMyCanvasVersions.mockResolvedValue([
    { id: 'ver-2', canvasId: 'cv-1', canvasName: 'canvas', canvasTitle: null, name: 'canvas_d222222', seq: 2, publishedAt: '2026-10-10T10:00:00Z', hasOpenDraft: false },
    { id: 'ver-1', canvasId: 'cv-1', canvasName: 'canvas', canvasTitle: null, name: 'canvas_d111111', seq: 1, publishedAt: '2026-10-01T10:00:00Z', hasOpenDraft: false },
  ]);
  svc.openCanvasDraft.mockResolvedValue({
    status: 'opened', draftId: 'draft-new', revision: 2, canvasId: 'cv-9', conversationId: CONV, threadRootId: 'root-new', canvasName: 'canvas_9', versionName: 'canvas_9_dabc12', fromSeq: null,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('S3c.3 (X3): the + on the owner\'s mirror chat', () => {
  it('shows beside the paperclip on the main composer while drafting is on, after it and before the field', async () => {
    await mount(pane(MIRROR), [MIRROR], `/chats/c/${CONV}`);
    const button = await screen.findByTestId('composer-plus');
    const paperclip = within(screen.getByTestId('composer')).getByRole('button', { name: 'Attach a point or story' });
    expect(paperclip.nextElementSibling).toBe(button);
    expect(button).toHaveAccessibleName('Create');
    expect(button.getAttribute('type')).toBe('button');
  });

  it('its menu reads New canvas, Clone a version', async () => {
    await mount(pane(MIRROR), [MIRROR], `/chats/c/${CONV}`);
    fireEvent.pointerDown(await screen.findByTestId('composer-plus'), { button: 0, ctrlKey: false, pointerType: 'mouse' });
    const items = within(await screen.findByRole('menu')).getAllByRole('menuitem').map(i => i.textContent);
    expect(items).toEqual(['New canvas', 'Clone a version']);
  });

  it('is not there while drafting is off', async () => {
    state.available = false;
    await mount(pane(MIRROR), [MIRROR], `/chats/c/${CONV}`);
    await waitFor(() => expect(svc.getCanvasDraftAvailability).toHaveBeenCalled());
    await act(async () => {});
    expect(plus()).toBeNull();
  });

  it('is not on a direct chat or a channel (CONTROL: the mirror\'s own composer in the same run does have it)', async () => {
    await mount(pane(DIRECT), [DIRECT], `/chats/c/${DIRECT.conversationId}`);
    await act(async () => {});
    expect(plus()).toBeNull();
    cleanup();
    await mount(pane(CHANNEL), [CHANNEL], `/chats/c/${CHANNEL.conversationId}`);
    await act(async () => {});
    expect(plus()).toBeNull();
    cleanup();
    await mount(pane(MIRROR), [MIRROR], `/chats/c/${CONV}`);
    expect(await screen.findByTestId('composer-plus')).toBeInTheDocument();
  });

  it('is not on a thread composer of the mirror chat (plain thread and canvas thread)', async () => {
    await mount(<ThreadPanel summary={MIRROR} rootId={ROOT} highlightId={null} />, [MIRROR], `/chats/c/${CONV}/t/${ROOT}`);
    await act(async () => {});
    expect(screen.getByTestId('composer')).toBeInTheDocument();
    expect(plus()).toBeNull();
  });
});

describe('S3c.3 (X3): the paperclip attaches and the "..." menu opens no canvas', () => {
  it('the paperclip dialog has Points and Stories only, with drafting ON', async () => {
    await mount(pane(MIRROR), [MIRROR], `/chats/c/${CONV}`);
    await screen.findByTestId('composer-plus'); // CONTROL: drafting really is on
    fireEvent.click(screen.getByRole('button', { name: 'Attach a point or story' }));
    const tabs = within(await screen.findByRole('tablist', { name: 'Kind' })).getAllByRole('tab').map(t => t.textContent);
    expect(tabs).toEqual(['Points', 'Stories']);
  });

  it('the "..." menu has no New canvas, with drafting ON', async () => {
    await mount(pane(MIRROR), [MIRROR], `/chats/c/${CONV}`);
    await screen.findByTestId('composer-plus'); // CONTROL: drafting really is on
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More' }), { button: 0, ctrlKey: false, pointerType: 'mouse' });
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').length).toBeGreaterThan(0); // CONTROL: the menu opened and has other entries
    expect(within(menu).queryByRole('menuitem', { name: 'New canvas' })).toBeNull();
  });
});

describe('S3c.3 (X3): what the two items do', () => {
  it('New canvas opens a draft with no base and lands on its workspace', async () => {
    await mount(pane(MIRROR), [MIRROR], `/chats/c/${CONV}`);
    fireEvent.pointerDown(await screen.findByTestId('composer-plus'), { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'New canvas' }));
    await waitFor(() => expect(screen.getByTestId('path').textContent === '/p/ana/canvas/canvas_9?v=canvas_9_dabc12&ws=1').toBe(true));
    expect(svc.openCanvasDraft).toHaveBeenCalledWith(null);
  });

  it('Clone a version lists the published versions, and picking one navigates to it carrying the intent, writing nothing', async () => {
    await mount(pane(MIRROR), [MIRROR], `/chats/c/${CONV}`);
    fireEvent.pointerDown(await screen.findByTestId('composer-plus'), { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Clone a version' }));
    const dialog = await screen.findByRole('dialog', { name: 'Clone a version' });
    expect(within(dialog).queryByRole('tab')).toBeNull();
    fireEvent.click(await within(dialog).findByRole('button', { name: /v1/ }));
    await waitFor(() => expect(screen.getByTestId('path').textContent === '/p/ana/canvas/canvas?v=canvas_d111111').toBe(true));
    expect(screen.getByTestId('intent').textContent === 'clone').toBe(true);
    expect(screen.getByTestId('from').textContent === `/chats/c/${CONV}`).toBe(true);
    expect(svc.openCanvasDraft).not.toHaveBeenCalled();
  });
});

describe('review: Clone a version with no known owner slug', () => {
  it('says so in the start-a-canvas sentence and goes nowhere, instead of closing silently', async () => {
    who.slug = null;
    await mount(pane(MIRROR), [MIRROR], `/chats/c/${CONV}`);
    fireEvent.pointerDown(await screen.findByTestId('composer-plus'), { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Clone a version' }));
    const dialog = await screen.findByRole('dialog', { name: 'Clone a version' });
    fireEvent.click(await within(dialog).findByRole('button', { name: /v1/ }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Could not start a canvas. Try again.'));
    expect(screen.getByTestId('path').textContent).toBe(`/chats/c/${CONV}`);
    expect(screen.getByTestId('intent').textContent).toBe('none');
  });
});

describe('review: the dialog reuses the chat sheet classes', () => {
  it('CanvasPlusMenu holds no copy of the sheet class strings', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/pages/chat/CanvasPlusMenu.tsx'), 'utf8');
    expect(src).not.toMatch(/max-h-\[85dvh\]/);
    expect(src).not.toMatch(/min-h-14 shrink-0/);
    expect(src).toMatch(/\bSHEET\b/);
    expect(src).toMatch(/\bSHEET_HEAD\b/);
  });
});
