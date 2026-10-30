/**
 * @file p1536-canvas-thread-v3.test.tsx
 * @description P1536 v3 (founder, 2026-10-28), the canvas draft thread in the mirror's chat, services mocked:
 *  - the opener never folds (the message and the steps card stay after the owner sends anything);
 *  - one create button, and the client only ever asks for the fast speed;
 *  - while "Update draft" is offered it is the one filled primary and the card's Open steps back;
 *  - the owner's own messages are one row, "N messages from you";
 *  - the draft card: the canvas title, then "v3 · Draft" (the next version number), no "Only you can see this";
 *  - Open carries the thread (`thread=<rootId>`) so the canvas page can show it beside the canvas;
 *  - an upload's row stays put while the server's material list replaces the local entry;
 *  - a new thread (Start a new version, Discard and start here) opens in the thread pane.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
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
import { CanvasDraftEnd, CanvasThreadBar, type BarProps } from '@/app/pages/chat/canvas-thread';
import { CanvasThreadOpener } from '@/app/pages/chat/CanvasOpener';
import { buildItems, openerIsPrimary, type CanvasItemRow } from '@/app/pages/chat/canvas-items';
import { draftLabel, ownerMessagesLabel } from '@/app/pages/chat/canvas-thread-copy';
import { withThreadParam } from '@/app/pages/chat/canvas-links';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { clearDraftsExcept } from '@/app/pages/chat/chat-hooks';
import { resetCanvasThreads } from '@/app/pages/chat/canvas-thread-registry';
import { useCanvasEntry } from '@/app/pages/chat/use-start-canvas';
import { RUN_POLL_MS } from '@/app/pages/chat/use-canvas-thread';
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
const doneRun = (): CanvasDraftRun => ({ id: 'run-1', kind: 'draft', state: 'done', errorCode: null, createdAt: AFTER, startedAt: AFTER });
const version = (canvasId: string, seq: number) => ({ id: `v-${canvasId}-${seq}`, canvasId, canvasName: 'canvas', name: `canvas_v${seq}`, seq, publishedAt: '2026-10-20T10:00:00.000Z', hasOpenDraft: false });

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

/** A promise settled from the test, so a step of the hand-over can be held. */
function deferred<T>() {
  let resolve: (v: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

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

/** A finished canvas whose owner wrote something after it was made: Update draft is on offer. */
function finishedWithNewInput() {
  state.messages = [canvasRoot(), note(), msg({ id: 'late', body: 'and I raised my price', createdAt: '2026-10-27T11:00:00.000Z' })];
  state.draft = draftRow({ runCount: 1, canvasName: 'canvas', versionName: 'canvas_dabc12' });
  state.run = doneRun();
  svc.getCanvasDraftViewPath.mockResolvedValue('/p/test-user/canvas/canvas?v=canvas_dabc12');
}

describe('1. the opener never folds', () => {
  it('after the owner sent a note, the message and the steps card are still there, with Copy prompt as an outline', async () => {
    state.messages = [canvasRoot(), note()];
    await renderThread();
    expect(await screen.findByTestId('canvas-opener-ask')).toBeInTheDocument();
    const steps = screen.getByTestId('canvas-opener-steps');
    const copy = within(steps).getByRole('button', { name: 'Copy prompt' });
    // something was added: Create canvas is the one primary, so Copy prompt steps back to an outline (P955)
    expect(copy.className).toContain('border');
    expect(copy.className).not.toContain('bg-blue-600');
    expect(bluePrimaries()).toEqual(['Create canvas']);
  });

  it('a file already kept, or an upload in this tab, does not fold it either', async () => {
    state.material = [{ id: 'm1', kind: 'file', label: 'offer.pdf', chars: 900, createdAt: '2026-10-27T08:00:00.000Z' }];
    await renderThread();
    expect(await screen.findByTestId('canvas-opener-ask')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-opener-steps')).toBeInTheDocument();
  });

  it('CONTROL: with nothing added, Copy prompt is the one filled primary', async () => {
    await renderThread();
    await screen.findByTestId('canvas-opener-steps');
    expect(bluePrimaries()).toEqual(['Copy prompt']);
  });

  it('P955: in a published thread with a question under it, Copy prompt is not a second primary', async () => {
    state.draft = draftRow({ state: 'published', runCount: 1, closedAt: '2026-10-26T10:00:00.000Z' });
    state.messages = [canvasRoot(), msg({ id: 'ask', body: 'Raise the price to 60', createdAt: '2026-10-26T11:00:00.000Z' })];
    await renderThread();
    await screen.findByRole('button', { name: 'Start a new version' });
    expect(screen.getByTestId('canvas-opener-steps')).toBeInTheDocument();
    expect(bluePrimaries()).toEqual(['Start a new version']);
  });

  it('the opener takes no "compact" mode: the component always draws the message and the steps card', () => {
    render(<CanvasThreadOpener title="Mira" {...({ compact: true } as object)} />);
    expect(screen.getByTestId('canvas-opener-ask')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-opener-steps')).toBeInTheDocument();
  });
});

describe('2. one create button, the fast speed only', () => {
  it('a first canvas: "Create canvas" asks for a draft with no speed to choose', async () => {
    state.messages = [canvasRoot(), note()];
    await renderThread();
    fireEvent.click(await screen.findByRole('button', { name: 'Create canvas' }));
    await waitFor(() => expect(svc.startQueuedCanvasRun).toHaveBeenCalledTimes(1));
    expect(svc.startQueuedCanvasRun).toHaveBeenCalledWith('draft-1');
  });

  it('a draft with a base version: "Create new version" is the only create button (no "Decide for me")', async () => {
    state.messages = [canvasRoot(), note()];
    state.draft = draftRow({ baseVersionId: 'ver-base' });
    await renderThread();
    await screen.findByRole('button', { name: 'Create new version' });
    expect(screen.queryByRole('button', { name: 'Decide for me' })).not.toBeInTheDocument();
    expect(within(screen.getByTestId('canvas-bar')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Create new version']);
    fireEvent.click(screen.getByRole('button', { name: 'Create new version' }));
    await waitFor(() => expect(svc.startQueuedCanvasRun).toHaveBeenCalledWith('draft-1'));
  });

  it('a server answer that begins with the old tensions pass is still handled (the run shows its progress)', async () => {
    state.messages = [canvasRoot(), note()];
    svc.startQueuedCanvasRun.mockResolvedValue({ ok: true, runId: 'run-9', kind: 'tensions' });
    await renderThread();
    fireEvent.click(await screen.findByRole('button', { name: 'Create canvas' }));
    await waitFor(() => expect(svc.startQueuedCanvasRun).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('3. Update draft is the primary while it is offered', () => {
  it('Update draft is the filled primary and the card\'s Open is an outline', async () => {
    finishedWithNewInput();
    await renderThread();
    const update = await screen.findByRole('button', { name: 'Update draft' });
    const open = await screen.findByRole('link', { name: 'Open' });
    expect(update.className).toContain('bg-blue-600');
    expect(open.className).not.toContain('bg-blue-600');
    expect(open.className).toContain('border');
    expect(bluePrimaries()).toEqual(['Update draft']);
  });

  it('with text in the composer, Send is the primary and both step back', async () => {
    finishedWithNewInput();
    await renderThread();
    await screen.findByRole('button', { name: 'Update draft' });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'one more thing' } });
    expect(bluePrimaries()).toEqual(['Send']);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    expect(bluePrimaries()).toEqual(['Update draft']);
  });

  it('CONTROL: with nothing new, there is no Update draft and Open is the primary', async () => {
    state.messages = [canvasRoot(), note()];
    state.draft = draftRow({ runCount: 1, canvasName: 'canvas', versionName: 'canvas_dabc12' });
    state.run = { ...doneRun(), createdAt: '2026-10-27T12:00:00.000Z', startedAt: '2026-10-27T12:00:00.000Z' };
    svc.getLastDoneCanvasDraftRunAt.mockResolvedValue('2026-10-27T12:00:00.000Z');
    svc.getCanvasDraftViewPath.mockResolvedValue('/p/test-user/canvas/canvas?v=canvas_dabc12');
    await renderThread();
    const open = await screen.findByRole('link', { name: 'Open' });
    expect(screen.queryByRole('button', { name: 'Update draft' })).not.toBeInTheDocument();
    expect(open.className).toContain('bg-blue-600');
    expect(bluePrimaries()).toEqual(['Open']);
  });

  describe('at the bar level (Update offered while a file is being read: not offered, Open is the primary again)', () => {
    const base: BarProps = {
      draft: draftRow({ runCount: 1, canvasName: 'canvas' }), run: null, running: false, items: [{ key: 'f', kind: 'file', label: 'a.pdf', status: 'read' }], newInput: true,
      askedAfterPublish: false, busy: null, notice: null, onRun: vi.fn(), onPublish: vi.fn(), onStartNew: vi.fn(), viewDraftPath: '/p/x/canvas/c?v=v',
    };
    const Surface = (p: BarProps) => (
      <MemoryRouter>
        <CanvasThreadBar {...p} />
        <CanvasDraftEnd {...p} />
      </MemoryRouter>
    );

    it('the Update draft button reads as the primary; Open does not', () => {
      render(<Surface {...base} />);
      expect(bluePrimaries()).toEqual(['Update draft']);
    });

    it('a file still being read removes the offer, so Open is the primary', () => {
      render(<Surface {...base} items={[...base.items, { key: 'g', kind: 'file', label: 'b.pdf', status: 'reading' }]} />);
      expect(bluePrimaries()).toEqual(['Open']);
    });

    it('composing steps both back', () => {
      render(<Surface {...base} composing />);
      expect(bluePrimaries()).toEqual([]);
    });
  });
});

describe('4. the owner\'s own messages are one row', () => {
  it('labels: "1 message from you", "N messages from you"', () => {
    expect(ownerMessagesLabel(1)).toBe('1 message from you');
    expect(ownerMessagesLabel(3)).toBe('3 messages from you');
  });

  it('buildItems makes the row from the owner\'s messages', () => {
    const rows = (n: number) =>
      buildItems({
        material: [], ownerId: ME, rootId: ROOT, lastDraftAt: null, uploads: [],
        messages: [canvasRoot(), ...Array.from({ length: n }, (_, i) => msg({ id: `n${i}`, body: `note ${i}` }))],
      });
    expect(rows(1).map((r) => r.label)).toEqual(['1 message from you']);
    expect(rows(3).map((r) => r.label)).toEqual(['3 messages from you']);
    expect(rows(2)[0]).toMatchObject({ key: 'notes', kind: 'notes', status: 'pending' });
  });

  it('the tray shows it', async () => {
    state.messages = [canvasRoot(), note(), msg({ id: 'n2', body: 'and more', createdAt: '2026-10-27T08:31:00.000Z' })];
    await renderThread();
    expect(await screen.findByTestId('canvas-material')).toHaveTextContent('2 messages from you');
  });
});

describe('5. the draft card: title, then "v3 · Draft"', () => {
  function drafted(canvasId = 'cv-1') {
    state.messages = [canvasRoot(), note()];
    state.draft = draftRow({ canvasId, runCount: 1, canvasName: 'canvas', versionName: 'canvas_dabc12' });
    state.run = { ...doneRun(), createdAt: '2026-10-27T12:00:00.000Z', startedAt: '2026-10-27T12:00:00.000Z' };
    svc.getLastDoneCanvasDraftRunAt.mockResolvedValue('2026-10-27T12:00:00.000Z');
  }

  it('labels: draftLabel(3) is "v3 · Draft", unknown is "Draft"', () => {
    expect(draftLabel(3)).toBe('v3 · Draft');
    expect(draftLabel(null)).toBe('Draft');
  });

  it('a canvas with two published versions: the next one is v3, from this canvas only', async () => {
    drafted();
    state.versions = [version('cv-1', 2), version('cv-1', 1), version('cv-other', 9)];
    await renderThread();
    const card = await screen.findByTestId('canvas-draft-card');
    await waitFor(() => expect(card).toHaveTextContent('v3 · Draft'));
    expect(card).toHaveTextContent('Canvas');
    expect(card).not.toHaveTextContent('Only you can see this');
    expect(card).not.toHaveTextContent('Canvas · Draft');
  });

  it('a first canvas (nothing published yet) is v1', async () => {
    drafted();
    state.versions = [version('cv-other', 4)];
    await renderThread();
    expect(await screen.findByTestId('canvas-draft-card')).toHaveTextContent('v1 · Draft');
  });

  it('the title is on its own line and the label under it', async () => {
    drafted();
    await renderThread();
    const card = await screen.findByTestId('canvas-draft-card');
    const lines = [...card.querySelectorAll('span.block')].map((s) => s.textContent);
    expect(lines).toEqual(['Canvas', 'v1 · Draft']);
  });

  it('when the lookup fails the card says just "Draft", and everything else still works', async () => {
    drafted();
    svc.listMyCanvasVersions.mockRejectedValue(new Error('down'));
    svc.getCanvasDraftViewPath.mockResolvedValue('/p/test-user/canvas/canvas?v=canvas_dabc12');
    await renderThread();
    const card = await screen.findByTestId('canvas-draft-card');
    expect([...card.querySelectorAll('span.block')].map((s) => s.textContent)).toEqual(['Canvas', 'Draft']);
    expect(await screen.findByRole('link', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
  });
});

describe('6. Open carries the thread', () => {
  it('withThreadParam appends thread=<rootId> and keeps ?v=', () => {
    expect(withThreadParam('/p/test-user/canvas/canvas?v=canvas_dabc12', 'root-1')).toBe('/p/test-user/canvas/canvas?v=canvas_dabc12&thread=root-1');
    expect(withThreadParam('/p/u/canvas/c', 'root-1')).toBe('/p/u/canvas/c?thread=root-1');
  });

  it('encodes the thread id and keeps an encoded path as it is', () => {
    expect(withThreadParam('/p/u/canvas/a%20b?v=x%26y', 'a&b')).toBe('/p/u/canvas/a%20b?v=x%26y&thread=a%26b');
  });

  it('replaces a thread param that is already there instead of adding a second', () => {
    expect(withThreadParam('/p/u/canvas/c?thread=old&v=v1', 'root-1')).toBe('/p/u/canvas/c?thread=root-1&v=v1');
  });

  it('the card\'s Open link goes to the draft version with the thread of this draft', async () => {
    finishedWithNewInput();
    await renderThread();
    expect(await screen.findByRole('link', { name: 'Open' })).toHaveAttribute('href', '/p/test-user/canvas/canvas?v=canvas_dabc12&thread=root-1');
  });

  it('CONTROL: no address yet, no Open link', async () => {
    finishedWithNewInput();
    svc.getCanvasDraftViewPath.mockResolvedValue(null);
    await renderThread();
    await screen.findByTestId('canvas-draft-card');
    expect(screen.queryByRole('link', { name: 'Open' })).not.toBeInTheDocument();
  });
});

describe('7. an upload\'s row stays put through the hand-over', () => {
  const file = () => new File(['x'], 'offer.pdf', { type: 'application/pdf' });
  const rows = () => within(screen.getByTestId('canvas-material')).getAllByRole('listitem').map((r) => [r.getAttribute('data-status'), r.textContent]);

  it('the row is there at every step: while reading, after the server answered but before the list reloaded, and after', async () => {
    const answer = deferred<{ ok: true; label: string; chars: number }>();
    const reload = deferred<CanvasMaterialItem[]>();
    svc.uploadCanvasMaterial.mockReturnValueOnce(answer.promise);
    await renderThread();
    const input = (await screen.findByTestId('canvas-upload-input')) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file()] } });
    });
    // 1. the file goes up
    expect(rows()).toEqual([['reading', 'offer.pdf']]);

    // 2. the server has kept it; the material list that will carry it has not been read again yet
    svc.listCanvasMaterial.mockReturnValueOnce(reload.promise);
    await act(async () => {
      answer.resolve({ ok: true, label: 'offer.pdf', chars: 900 });
    });
    expect(svc.listCanvasMaterial).toHaveBeenCalledTimes(2);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]?.[1]).toBe('offer.pdf');

    // 3. the reloaded list has it: still one row, now from the database
    const kept = { id: 'm1', kind: 'file' as const, label: 'offer.pdf', chars: 900, createdAt: '2026-10-27T08:00:00.000Z' };
    state.material = [kept];
    await act(async () => {
      reload.resolve([kept]);
    });
    await waitFor(() => expect(rows()).toEqual([['read', 'offer.pdf']]));
    expect(screen.getByRole('button', { name: 'Create canvas' })).toBeInTheDocument();
  });

  it('a second file with the same name never shows twice, and the upload button waits until the hand-over is done', async () => {
    state.material = [{ id: 'm0', kind: 'file', label: 'offer.pdf', chars: 10, createdAt: '2026-10-27T07:00:00.000Z' }];
    const reload = deferred<CanvasMaterialItem[]>();
    await renderThread();
    const input = (await screen.findByTestId('canvas-upload-input')) as HTMLInputElement;
    svc.listCanvasMaterial.mockReturnValueOnce(reload.promise);
    await act(async () => {
      fireEvent.change(input, { target: { files: [file()] } });
    });
    expect(rows().map((r) => r[1])).toEqual(['offer.pdf', 'offer.pdf']);
    expect(screen.getByTestId('canvas-upload')).toHaveAttribute('aria-busy', 'true');
    const kept = [
      { id: 'm0', kind: 'file' as const, label: 'offer.pdf', chars: 10, createdAt: '2026-10-27T07:00:00.000Z' },
      { id: 'm1', kind: 'file' as const, label: 'offer.pdf', chars: 900, createdAt: '2026-10-27T08:00:00.000Z' },
    ];
    state.material = kept;
    await act(async () => {
      reload.resolve(kept);
    });
    await waitFor(() => expect(rows().map((r) => r[1])).toEqual(['offer.pdf', 'offer.pdf']));
    expect(rows().every((r) => r[0] === 'read')).toBe(true);
    expect(screen.getByTestId('canvas-upload')).not.toHaveAttribute('aria-busy', 'true');
  });

  it('a file the server refused stays as a failed row (and is not held for a reload)', async () => {
    svc.uploadCanvasMaterial.mockResolvedValueOnce({ ok: false, code: 'UNREADABLE' });
    await renderThread();
    const input = (await screen.findByTestId('canvas-upload-input')) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file()] } });
    });
    expect(rows()).toEqual([['failed', "offer.pdf · couldn't read, no text found in it"]]);
  });
});

describe('8. a new thread opens in the thread pane', () => {
  function PanelFromRoute() {
    const { rid } = useParams();
    return <ThreadPanel summary={mirrorChat} rootId={rid ?? ''} highlightId={null} />;
  }

  function MainChat() {
    const entry = useCanvasEntry(true, vi.fn());
    return (
      <>
        <button type="button" onClick={() => entry.onPickCanvas?.('ver-1')}>
          pick a version
        </button>
        {entry.dialog}
      </>
    );
  }

  function Routed({ at }: { at: string }) {
    return (
      <MemoryRouter initialEntries={[at]}>
        <ChatContext.Provider value={chatValue()}>
          <Routes>
            <Route path="/chats/c/:cid" element={<MainChat />} />
            <Route path="/chats/c/:cid/t/:rid" element={<PanelFromRoute />} />
          </Routes>
        </ChatContext.Provider>
      </MemoryRouter>
    );
  }

  const newDraft = () => draftRow({ id: 'draft-new', threadRootId: 'root-new', baseVersionId: 'ver-1' });

  beforeEach(() => {
    svc.getCanvasDraftByThread.mockImplementation(async (id: string) => (id === ROOT ? state.draft : id === 'root-new' ? newDraft() : null));
  });

  it('"Start a new version" under a published thread: the new thread\'s own opener and tray are on screen', async () => {
    state.draft = draftRow({ state: 'published', runCount: 1, closedAt: '2026-10-26T10:00:00.000Z' });
    state.messages = [canvasRoot(), msg({ id: 'ask', body: 'Raise the price to 60', createdAt: '2026-10-26T11:00:00.000Z' })];
    render(<Routed at={`/chats/c/${MIRROR_ID}/t/${ROOT}`} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start a new version' }));
    await waitFor(() => expect(svc.getCanvasDraftByThread).toHaveBeenCalledWith('root-new'));
    expect(await screen.findByTestId('canvas-upload')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-opener-ask')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start a new version' })).not.toBeInTheDocument();
  });

  it('"Discard it and start here": the discarded draft is gone and the new thread is in the pane', async () => {
    svc.openCanvasDraft
      .mockResolvedValueOnce({ status: 'open_elsewhere', draftId: 'draft-open', revision: 2, canvasId: 'cv-1', conversationId: MIRROR_ID, threadRootId: 'root-open', canvasName: 'canvas', fromSeq: 1 })
      .mockResolvedValueOnce({ status: 'opened', draftId: 'draft-new', revision: 2, canvasId: 'cv-1', conversationId: MIRROR_ID, threadRootId: 'root-new', canvasName: 'canvas', fromSeq: 1 });
    render(<Routed at={`/chats/c/${MIRROR_ID}`} />);
    // the entry is offered once the project's canvas flag has been read
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'pick a version' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Discard it and start here' }));
    await waitFor(() => expect(svc.discardCanvasDraft).toHaveBeenCalledWith('draft-open', 2));
    expect(await screen.findByTestId('canvas-upload')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-opener-ask')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(svc.getCanvasDraftByThread).toHaveBeenCalledWith('root-new');
  });
});

describe('9. the next version number is read once per draft, never in the poll', () => {
  const runningRevision = () => {
    state.messages = [canvasRoot(), note()];
    state.draft = draftRow({ runCount: 1, canvasName: 'canvas', versionName: 'canvas_dabc12' });
    state.run = { ...doneRun(), kind: 'draft', state: 'running', createdAt: new Date().toISOString(), startedAt: new Date().toISOString() };
  };

  it('ten polls while a revision runs read the owner\'s versions at most once', async () => {
    vi.useFakeTimers();
    try {
      runningRevision();
      state.versions = [version('cv-1', 1)];
      wrap(<ThreadPanel summary={mirrorChat} rootId={ROOT} highlightId={null} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      const polled = svc.getLatestCanvasRun.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RUN_POLL_MS * 10 + 50);
      });
      // CONTROL: it did poll
      expect(svc.getLatestCanvasRun.mock.calls.length).toBeGreaterThanOrEqual(polled + 10);
      expect(svc.listMyCanvasVersions.mock.calls.length).toBeLessThanOrEqual(1);
      expect(screen.queryByTestId('canvas-draft-card')).not.toBeInTheDocument(); // (a run is going: the number shows once it is done)
    } finally {
      vi.useRealTimers();
    }
  });

  it('the number read once is the one the card shows when the run ends', async () => {
    vi.useFakeTimers();
    try {
      runningRevision();
      state.versions = [version('cv-1', 2), version('cv-1', 1)];
      wrap(<ThreadPanel summary={mirrorChat} rootId={ROOT} highlightId={null} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RUN_POLL_MS * 3);
      });
      state.run = { ...doneRun(), createdAt: '2026-10-27T12:00:00.000Z', startedAt: '2026-10-27T12:00:00.000Z' };
      svc.getLastDoneCanvasDraftRunAt.mockResolvedValue('2026-10-27T12:00:00.000Z');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RUN_POLL_MS + 50);
      });
      expect(screen.getByTestId('canvas-draft-card')).toHaveTextContent('v3 · Draft');
      expect(svc.listMyCanvasVersions.mock.calls.length).toBeLessThanOrEqual(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failed read is tried again at the next message, not in the poll', async () => {
    vi.useFakeTimers();
    try {
      runningRevision();
      svc.listMyCanvasVersions.mockRejectedValue(new Error('down'));
      const out = wrap(<ThreadPanel summary={mirrorChat} rootId={ROOT} highlightId={null} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      const first = svc.getLatestCanvasRun.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RUN_POLL_MS * 6 + 50);
      });
      expect(svc.getLatestCanvasRun.mock.calls.length).toBeGreaterThanOrEqual(first + 6); // CONTROL: it did poll
      expect(svc.listMyCanvasVersions.mock.calls.length).toBeLessThanOrEqual(1);
      const before = svc.listMyCanvasVersions.mock.calls.length;
      // the mirror's reply (or any message) arrives: a read that is not the poll
      svc.listMyCanvasVersions.mockResolvedValue([version('cv-1', 1)]);
      state.messages = [...state.messages, msg({ id: 'late', body: 'more', createdAt: '2026-10-27T13:00:00.000Z' })];
      out.rerender(
        <MemoryRouter initialEntries={[`/chats/c/${MIRROR_ID}/t/${ROOT}`]}>
          <ChatContext.Provider value={chatValue()}>
            <ThreadPanel summary={mirrorChat} rootId={ROOT} highlightId={null} />
          </ChatContext.Provider>
        </MemoryRouter>,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      expect(svc.listMyCanvasVersions.mock.calls.length).toBe(before + 1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('10. an upload whose reload did not carry the file keeps its row', () => {
  const file = () => new File(['x'], 'offer.pdf', { type: 'application/pdf' });
  const rows = () => within(screen.getByTestId('canvas-material')).getAllByRole('listitem').map((r) => [r.getAttribute('data-status'), r.textContent]);
  const kept = { id: 'm1', kind: 'file' as const, label: 'offer.pdf', chars: 900, createdAt: '2026-10-27T08:00:00.000Z' };
  const treeFor = () => (
    <MemoryRouter initialEntries={[`/chats/c/${MIRROR_ID}/t/${ROOT}`]}>
      <ChatContext.Provider value={chatValue()}>
        <ThreadPanel summary={mirrorChat} rootId={ROOT} highlightId={null} />
      </ChatContext.Provider>
    </MemoryRouter>
  );

  it('the reload comes back without the file: the row is still there, read, and Create is offered; a later reload that has it leaves exactly one row', async () => {
    const out = wrap(<ThreadPanel summary={mirrorChat} rootId={ROOT} highlightId={null} />);
    await act(async () => {});
    const input = (await screen.findByTestId('canvas-upload-input')) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file()] } });
    });
    // the server kept it, but the material read still answers with the old list
    expect(rows()).toEqual([['read', 'offer.pdf']]);
    expect(screen.getByRole('button', { name: 'Create canvas' })).toBeInTheDocument();

    // later the material has it: the database's row replaces the local one, never both
    state.material = [kept];
    state.messages = [...state.messages, msg({ id: 'later', body: 'a note', createdAt: '2026-10-27T09:00:00.000Z' })];
    out.rerender(treeFor());
    await waitFor(() => expect(rows().filter((r) => r[1] === 'offer.pdf')).toEqual([['read', 'offer.pdf']]));
    expect(rows().map((r) => r[1])).toEqual(['offer.pdf', '1 message from you']);
  });

  it('a read that fails outright keeps the row too', async () => {
    await renderThread();
    const input = (await screen.findByTestId('canvas-upload-input')) as HTMLInputElement;
    svc.listCanvasMaterial.mockRejectedValue(new Error('down'));
    await act(async () => {
      fireEvent.change(input, { target: { files: [file()] } });
    });
    expect(rows()).toEqual([['read', 'offer.pdf']]);
  });

  it('two files of one name: each is handed over to its own database row, never both to one', async () => {
    const out = wrap(<ThreadPanel summary={mirrorChat} rootId={ROOT} highlightId={null} />);
    await act(async () => {});
    const input = (await screen.findByTestId('canvas-upload-input')) as HTMLInputElement;
    for (let i = 0; i < 2; i += 1) {
      await act(async () => {
        fireEvent.change(input, { target: { files: [file()] } });
      });
    }
    expect(rows()).toEqual([['read', 'offer.pdf'], ['read', 'offer.pdf']]);
    // only the first has reached the list
    state.material = [kept];
    state.messages = [...state.messages, msg({ id: 'later', body: 'a note', createdAt: '2026-10-27T09:00:00.000Z' })];
    out.rerender(treeFor());
    await waitFor(() => expect(rows().filter((r) => r[1] === 'offer.pdf')).toHaveLength(2));
    state.material = [kept, { ...kept, id: 'm2', createdAt: '2026-10-27T08:01:00.000Z' }];
    state.messages = [...state.messages, msg({ id: 'later2', body: 'another', createdAt: '2026-10-27T09:01:00.000Z' })];
    out.rerender(treeFor());
    await waitFor(() => expect(rows().filter((r) => r[1] === 'offer.pdf')).toHaveLength(2));
    expect(within(screen.getByTestId('canvas-material')).getAllByRole('listitem').map((r) => r.textContent)).toEqual(['offer.pdf', 'offer.pdf', '2 messages from you']);
  });
});

describe('11. Copy prompt is the filled primary exactly when nothing else on the page is', () => {
  const open = { state: 'open', runCount: 0 } as const;
  const failedFile: CanvasItemRow = { key: 'u', kind: 'file', label: 'scan.pdf', status: 'failed', reason: 'no text found in it' };
  const readFile: CanvasItemRow = { key: 'f', kind: 'file', label: 'a.pdf', status: 'read' };
  const readingFile: CanvasItemRow = { key: 'g', kind: 'file', label: 'b.pdf', status: 'reading' };

  it('a fresh draft: with nothing, or only a file that could not be read (no create button shows), Copy prompt leads', () => {
    expect(openerIsPrimary({ draft: open, items: [] }, false)).toBe(true);
    expect(openerIsPrimary({ draft: open, items: [failedFile] }, false)).toBe(true);
  });

  it('a failed first run with nothing drafted and nothing usable: Copy prompt leads', () => {
    expect(openerIsPrimary({ draft: { state: 'open', runCount: 1 }, draftHasPoints: false, items: [failedFile] }, false)).toBe(true);
  });

  it('steps back when the tray\'s create action is on offer, a canvas exists, something is going, or the owner is writing', () => {
    expect(openerIsPrimary({ draft: open, items: [readFile] }, false)).toBe(false); // Create canvas
    expect(openerIsPrimary({ draft: { state: 'open', runCount: 1 }, newInput: true, items: [readFile] }, false)).toBe(false); // Update draft
    expect(openerIsPrimary({ draft: { state: 'open', runCount: 1 }, items: [readFile] }, false)).toBe(false); // Open on the card
    expect(openerIsPrimary({ draft: open, items: [readFile, readingFile] }, false)).toBe(false); // a file is being read
    expect(openerIsPrimary({ draft: open, items: [readFile], running: true }, false)).toBe(false);
    expect(openerIsPrimary({ draft: open, items: [readFile], busy: 'run' }, false)).toBe(false);
    expect(openerIsPrimary({ draft: open, items: [], busy: 'publish' }, false)).toBe(false);
    expect(openerIsPrimary({ draft: open, items: [] }, true)).toBe(false); // Send
    expect(openerIsPrimary({ draft: { state: 'published', runCount: 1 }, items: [] }, false)).toBe(false);
    expect(openerIsPrimary({ draft: { state: 'discarded', runCount: 0 }, items: [] }, false)).toBe(false);
  });

  // Every phase of the P955 fixture, composer empty: [phase, the filled primaries]. A phase with none is one where the page
  // is busy (a run, a file being read, a publish) or closed and quiet; every other open phase has exactly one.
  const PHASES: Array<[string, string[]]> = [
    ['empty', ['Copy prompt']],
    ['reading', []],
    ['upload-failed', ['Copy prompt']],
    ['ready', ['Create canvas']],
    ['links', ['Create canvas']],
    ['running', []],
    ['drafted', ['Open']],
    ['revising', ['Update draft']],
    ['failed', ['Create canvas']],
    ['failed-nothing-drafted', ['Create canvas']],
    ['failed-no-items', ['Copy prompt']],
    ['published', []],
    ['asked', ['Start a new version']],
    ['discarded', []],
    ['update-empty', ['Copy prompt']],
    ['update', ['Create new version']],
    ['update-running', []],
    ['update-drafted', ['Open']],
    ['update-revising', ['Update draft']],
  ];

  it.each(PHASES)('the fixture phase %s has the filled primaries %j', (phase, expected) => {
    render(
      <MemoryRouter initialEntries={[`/tree/_gate/canvas-thread?phase=${phase}`]}>
        <GateFixture />
      </MemoryRouter>,
    );
    expect(bluePrimaries()).toEqual(expected);
  });
});
