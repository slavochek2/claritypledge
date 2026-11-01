/**
 * @file p1536-canvas-thread-ui.test.tsx
 * @description P1536 WP3: the canvas draft in the mirror's chat, with the services mocked.
 *  - AC15: the upload control shows only in a canvas thread, while drafting is on.
 *  - AC16: with drafting off, no draft control (and no opener, upload, publish, new canvas, Canvases tab).
 *  - AC8: after Publish, an owner message gets "This version is published. Start a new version?"; the button opens a
 *    new thread started from that version.
 *  - AC9: the paperclip lists the owner's versions; picking an older one starts a draft from it.
 *  - AC12: one create button ("Create canvas" / "Create new version" / "Update draft"); it drafts straight away, the fast speed only.
 *  - P955: no disabled primary, and one primary at a time, in every state of the bar.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-mappers';
import type { CanvasDraft, CanvasDraftRun, CanvasMaterialItem } from '@/app/data/canvas-draft-service';

const ME = 'user-id-me';
const MIRROR_ID = 'conv-mirror-1';
const ROOT = 'root-1';

const state = vi.hoisted(() => ({
  available: true as boolean | null,
  draft: null as CanvasDraft | null,
  run: null as CanvasDraftRun | null,
  material: [] as CanvasMaterialItem[],
  messages: [] as ChatMessage[],
  /** When the newest finished DRAFT-kind run began (the database's answer), or null. */
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
  getCanvasDraftRevision: vi.fn(),
  openCanvasDraft: vi.fn(),
  discardCanvasDraft: vi.fn(),
  listMyCanvasVersions: vi.fn(),
  getCanvasVersionCard: vi.fn(),
  countDoneCanvasDraftRuns: vi.fn(),
  getLastDoneCanvasDraftRunAt: vi.fn(),
  getCanvasDraftViewPath: vi.fn(),
}));
const chatSvc = vi.hoisted(() => ({ sendMessage: vi.fn() }));
const conv = vi.hoisted(() => ({ send: vi.fn() }));
const helpers = vi.hoisted(() => ({ loadMyShareables: vi.fn() }));
const toastFn = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: toastFn }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), ...svc }));
vi.mock('@/app/data/chat-service', async () => ({ ...(await vi.importActual<object>('@/app/data/chat-service')), ...chatSvc }));
vi.mock('@/app/data/chat-ui-helpers', async () => ({ ...(await vi.importActual<object>('@/app/data/chat-ui-helpers')), ...helpers }));
vi.mock('@/app/pages/chat/MessageList', () => ({
  MessageList: ({ lead, tail, hideId }: { lead?: ReactNode; tail?: ReactNode; hideId?: string | null }) => (
    <div data-testid="message-list" data-hidden-root={hideId ?? ''}>
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
import { Composer } from '@/app/pages/chat/Composer';
import { AttachDialog } from '@/app/pages/chat/ChatDialogs';
import { AttachmentCard } from '@/app/pages/chat/AttachmentCard';
import { ConversationHeader, type HeaderActions } from '@/app/pages/chat/ConversationHeader';
import { CanvasDraftEnd, CanvasThreadBar, type BarProps } from '@/app/pages/chat/canvas-thread';
import { CanvasUploadButton } from '@/app/pages/chat/CanvasUploadButton';
import { CANVAS_OPENER_ASK } from '@/app/pages/chat/canvas-thread-copy';
import { canDiscardDraft, type CanvasItemRow } from '@/app/pages/chat/canvas-items';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { OpenDraftDialog } from '@/app/pages/chat/OpenDraftDialog';
import { RUN_POLL_MS } from '@/app/pages/chat/use-canvas-thread';
import { clearDraftsExcept } from '@/app/pages/chat/chat-hooks';
import { isCanvasThread, resetCanvasThreads } from '@/app/pages/chat/canvas-thread-registry';
import { useCanvasEntry } from '@/app/pages/chat/use-start-canvas';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { GateFixture } from '@/app/tree/_gate/canvas-thread/GateFixture';

/** [state, text] of every row: the state is the icon, the text is the label (and, when failed, the reason). */
const rowsOf = (list: HTMLElement) => within(list).getAllByRole('listitem').map((r) => [r.getAttribute('data-status'), r.textContent]);

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
// A fixed time before the runs the tests use (a clock-time default made some tests depend on the hour they ran).
const note = () => msg({ id: 'note-1', body: 'I sell bookkeeping to cafe owners', createdAt: '2026-10-27T08:30:00.000Z' });

const FILE_ITEMS: CanvasItemRow[] = [{ key: 'file-1', kind: 'file', label: 'offer.pdf', status: 'read' }];

const draftRow = (over: Partial<CanvasDraft> = {}): CanvasDraft => ({
  id: 'draft-1', versionId: 'ver-draft', canvasId: 'cv-1', baseVersionId: null, conversationId: MIRROR_ID, threadRootId: ROOT,
  state: 'open', runCount: 0, revision: 3, closedAt: null, canvasName: null, versionName: null, ...over,
});
const runRow = (over: Partial<CanvasDraftRun> = {}): CanvasDraftRun => ({
  id: 'run-1', kind: 'draft', state: 'running', errorCode: null, createdAt: new Date().toISOString(), startedAt: new Date().toISOString(), ...over,
});

/** The owner's own profile slug, as the chat knows it (null: not known yet). */
let authorSlug: string | null = 'test-user';

function chatValue(): ChatContextValue {
  return {
    userId: ME, status: 'ready', error: null, chats: [mirrorChat], unreadCount: 0, refresh: vi.fn(async () => [mirrorChat]),
    setArchived: vi.fn(), setManualUnread: vi.fn(), markRead: vi.fn(), subscribe: () => () => undefined, setViewing: vi.fn(),
    revision: 0, authors: { [ME]: { id: ME, name: 'Test Owner', slug: authorSlug, avatarUrl: null, avatarColor: null, hasPledged: false } }, missingAuthors: new Set(), ensureAuthors: vi.fn(), outbox: [], sendMessage: vi.fn(), retrySend: vi.fn(),
    discardSend: vi.fn(), block: vi.fn(), unblock: vi.fn(), goToChat: vi.fn(), resync: vi.fn(),
  } as ChatContextValue;
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function wrap(ui: ReactNode, path = `/chats/c/${MIRROR_ID}/t/${ROOT}`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ChatContext.Provider value={chatValue()}>
        {ui}
        <Where />
      </ChatContext.Provider>
    </MemoryRouter>,
  );
}

async function renderThread() {
  const out = wrap(<ThreadPanel summary={mirrorChat} rootId={ROOT} highlightId={null} />);
  await act(async () => {});
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetCanvasAvailability();
  resetCanvasThreads();
  clearDraftsExcept(null);
  authorSlug = 'test-user';
  Object.assign(state, { available: true, draft: draftRow(), run: null, material: [], messages: [canvasRoot()], lastDone: null });
  svc.getCanvasDraftAvailability.mockImplementation(async () => state.available);
  svc.getCanvasDraftByThread.mockImplementation(async (id: string) => (id === ROOT ? state.draft : null));
  svc.getLatestCanvasRun.mockImplementation(async () => state.run);
  svc.listCanvasMaterial.mockImplementation(async () => state.material);
  svc.startQueuedCanvasRun.mockResolvedValue({ ok: true, runId: 'run-9', kind: 'draft' });
  svc.publishCanvasDraft.mockResolvedValue({ ok: true, seq: 1, skippedLinks: 0 });
  svc.uploadCanvasMaterial.mockResolvedValue({ ok: true, label: 'offer.pdf', chars: 900 });
  svc.sendCanvasWorkspaceMessage.mockResolvedValue({ ok: true, runId: 'run-up', revision: 4, draftId: 'draft-1', start: null });
  svc.openCanvasDraft.mockResolvedValue({ status: 'opened', draftId: 'draft-new', revision: 2, canvasId: 'cv-1', conversationId: MIRROR_ID, threadRootId: 'root-new', canvasName: 'canvas', fromSeq: 1 });
  svc.discardCanvasDraft.mockResolvedValue({ ok: true, discarded: true });
  svc.listMyCanvasVersions.mockResolvedValue([]);
  svc.countDoneCanvasDraftRuns.mockResolvedValue(1);
  svc.getLastDoneCanvasDraftRunAt.mockImplementation(async () => state.lastDone);
  svc.getCanvasDraftViewPath.mockResolvedValue(null);
  chatSvc.sendMessage.mockResolvedValue(msg({ id: 'carried' }));
  helpers.loadMyShareables.mockResolvedValue([]);
});

describe('AC15: the upload control', () => {
  it('shows in a canvas thread while drafting is on: a secondary button, plus and "Upload", before the field', async () => {
    await renderThread();
    const upload = await screen.findByTestId('canvas-upload');
    expect(upload).toHaveAccessibleName('Upload');
    expect(upload).toHaveTextContent('Upload');
    expect(upload.querySelector('svg')).not.toBeNull();
    // secondary: the Button outline variant (white, bordered), never the filled primary
    expect(upload.className).toContain('border');
    expect(upload.className).not.toContain('bg-blue-600');
    expect(upload.className).toContain('text-blue-600');
    // it sits in the composer row, before the field
    const composer = screen.getByTestId('composer');
    expect(composer).toContainElement(upload);
    expect(upload.compareDocumentPosition(screen.getByRole('textbox')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the opener is one mirror-style message and a steps card, with the founder-approved words', async () => {
    await renderThread();
    expect(await screen.findByTestId('canvas-opener-ask')).toHaveTextContent(CANVAS_OPENER_ASK);
    expect(CANVAS_OPENER_ASK).toBe(
      "I'll help you get clear on your offer and draft your Clarity Canvas. Send me anything about what you build or sell: your website link, a pitch deck, notes.",
    );
    const steps = screen.getByTestId('canvas-opener-steps');
    expect(steps).toHaveTextContent('Want to save time?');
    expect(steps).toHaveTextContent('Paste it into ChatGPT, Gemini or Claude');
    expect(steps).toHaveTextContent('Upload the answer here');
    expect(within(steps).getByRole('button', { name: 'Copy prompt' })).toBeInTheDocument();
  });

  it('CONTROL: an ordinary mirror thread has no upload, no opener and no bar (and no draft is looked up)', async () => {
    state.messages = [msg({ id: ROOT, body: 'a plain thought', threadRootId: null })];
    await renderThread();
    expect(screen.queryByTestId('canvas-upload')).not.toBeInTheDocument();
    expect(screen.queryByTestId('canvas-opener')).not.toBeInTheDocument();
    expect(screen.queryByTestId('canvas-bar')).not.toBeInTheDocument();
    expect(svc.getCanvasDraftByThread).not.toHaveBeenCalled();
  });

  it('a draft that is no longer open takes no more files', async () => {
    state.draft = draftRow({ state: 'published', runCount: 1 });
    await renderThread();
    await screen.findByTestId('canvas-bar');
    expect(screen.queryByTestId('canvas-upload')).not.toBeInTheDocument();
  });

  it('sends one chosen file to the draft; the checklist shows it reading, then read', async () => {
    let finish: (v: unknown) => void = () => undefined;
    svc.uploadCanvasMaterial.mockReturnValueOnce(new Promise((r) => { finish = r; }));
    await renderThread();
    const input = (await screen.findByTestId('canvas-upload-input')) as HTMLInputElement;
    const file = new File(['x'], 'offer.pdf', { type: 'application/pdf' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    // an upload goes in two steps: canvas_workspace_send announces the file and makes the run, then the file is posted with that run's id
    expect(svc.sendCanvasWorkspaceMessage).toHaveBeenCalledWith(expect.objectContaining({ canvasId: 'cv-1', expectedDraftId: 'draft-1', expectedRevision: 3, attachment: { kind: 'file', label: 'offer.pdf' } }));
    expect(svc.uploadCanvasMaterial).toHaveBeenCalledWith('run-up', file);
    const reading = within(screen.getByTestId('canvas-material')).getByRole('listitem');
    expect(reading).toHaveTextContent('offer.pdf');
    expect(reading).toHaveAttribute('data-status', 'reading');
    // reading: nothing to create from yet, so no create button
    expect(screen.queryByRole('button', { name: 'Create canvas' })).not.toBeInTheDocument();
    state.material = [{ id: 'm1', kind: 'file', label: 'offer.pdf', chars: 900, createdAt: '2026-10-27T08:00:00.000Z' }];
    await act(async () => {
      finish({ ok: true, label: 'offer.pdf', chars: 900 });
    });
    await waitFor(() => expect(within(screen.getByTestId('canvas-material')).getByRole('listitem')).toHaveAttribute('data-status', 'read'));
    // a row that is read says nothing but its name: the check is the state
    expect(screen.getByTestId('canvas-material')).toHaveTextContent(/^offer\.pdf$/);
    expect(screen.getByRole('button', { name: 'Create canvas' })).toBeInTheDocument();
  });

  it('a file the server could not read stays as a failed row with the way out', async () => {
    svc.uploadCanvasMaterial.mockResolvedValueOnce({ ok: false, code: 'UNREADABLE' });
    await renderThread();
    const input = (await screen.findByTestId('canvas-upload-input')) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'scan.pdf')] } });
    });
    expect(screen.getByTestId('canvas-material')).toHaveTextContent("scan.pdf · couldn't read, no text found in it");
    expect(toastFn.error).toHaveBeenCalledWith(expect.stringContaining('could not be read'));
    // a failed file is not something to create from
    expect(screen.queryByRole('button', { name: 'Create canvas' })).not.toBeInTheDocument();
  });

  it('a file over 8 MB is refused before it is sent; a server refusal is named', async () => {
    await renderThread();
    const input = (await screen.findByTestId('canvas-upload-input')) as HTMLInputElement;
    const big = new File(['x'], 'deck.pptx');
    Object.defineProperty(big, 'size', { value: 9 * 1024 * 1024 });
    await act(async () => {
      fireEvent.change(input, { target: { files: [big] } });
    });
    expect(svc.uploadCanvasMaterial).not.toHaveBeenCalled();
    expect(toastFn.error).toHaveBeenCalledWith('That file is over 8 MB.');
    expect(screen.getByTestId('canvas-material')).toHaveTextContent("deck.pptx · couldn't read, over 8 MB");

    svc.uploadCanvasMaterial.mockResolvedValueOnce({ ok: false, code: 'UNREADABLE' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'scan.pdf')] } });
    });
    expect(toastFn.error).toHaveBeenLastCalledWith(expect.stringContaining('could not be read'));
  });
});

describe('P1536: the mirror stays silent in a canvas thread', () => {
  it('the thread panel marks a canvas thread so the mirror provider sends no reply request there', async () => {
    await renderThread();
    await screen.findByTestId('canvas-upload');
    expect(isCanvasThread(ROOT)).toBe(true);
  });

  it('CONTROL: an ordinary mirror thread is not marked, so its messages still ask the mirror', async () => {
    state.messages = [msg({ id: ROOT, body: 'a plain thought', threadRootId: null })];
    await renderThread();
    expect(isCanvasThread(ROOT)).toBe(false);
  });
});

describe('AC16: drafting off', () => {
  it('shows no draft control of any kind in a canvas thread', async () => {
    state.available = false;
    state.messages = [canvasRoot(), note()];
    state.draft = draftRow({ runCount: 1 });
    await renderThread();
    await waitFor(() => expect(svc.getCanvasDraftAvailability).toHaveBeenCalled());
    for (const id of ['canvas-upload', 'canvas-opener', 'canvas-bar']) expect(screen.queryByTestId(id)).not.toBeInTheDocument();
    for (const name of ['Create canvas', 'Create new version', 'Update draft', 'Decide for me', 'Publish', 'Open', 'Start a new version', 'Canvas draft options']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('and not while the answer is still unknown', async () => {
    state.available = null;
    state.messages = [canvasRoot(), note()];
    await renderThread();
    expect(screen.queryByRole('button', { name: 'Create canvas' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('canvas-upload')).not.toBeInTheDocument();
  });

  function Entry({ part }: { part: 'menu' | 'paperclip' }) {
    const entry = useCanvasEntry(true, vi.fn());
    return part === 'menu' ? (
      <ConversationHeader chat={mirrorChat} blocked={false} actions={{ onBack: vi.fn(), onArchive: vi.fn(), onMarkUnread: vi.fn(), onBlock: vi.fn(), onUnblock: vi.fn(), onRename: vi.fn(), onNewCanvas: entry.onNewCanvas } as HeaderActions} />
    ) : (
      <AttachDialog viewerId={ME} onPick={vi.fn()} onClose={vi.fn()} onPickCanvas={entry.onPickCanvas} />
    );
  }

  it('the mirror menu has no New canvas', async () => {
    state.available = false;
    wrap(<Entry part="menu" />, `/chats/c/${MIRROR_ID}`);
    await waitFor(() => expect(svc.getCanvasDraftAvailability).toHaveBeenCalled());
    await act(async () => {});
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More' }), { button: 0, ctrlKey: false, pointerType: 'mouse' });
    expect(within(screen.getByRole('menu')).queryByRole('menuitem', { name: 'New canvas' })).not.toBeInTheDocument();
  });

  it('the paperclip has no Canvases tab', async () => {
    state.available = false;
    wrap(<Entry part="paperclip" />, `/chats/c/${MIRROR_ID}`);
    await waitFor(() => expect(svc.getCanvasDraftAvailability).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.getByRole('tab', { name: 'Points' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Canvases' })).not.toBeInTheDocument();
  });
});

describe('AC12: one create button, the fast speed', () => {
  it('"Create canvas" (a first canvas) drafts straight away: no speed to choose, no "Decide for me"', async () => {
    state.messages = [canvasRoot(), note()];
    await renderThread();
    fireEvent.click(await screen.findByRole('button', { name: 'Create canvas' }));
    await waitFor(() => expect(svc.startQueuedCanvasRun).toHaveBeenCalledWith('draft-1'));
    expect(screen.queryByRole('button', { name: 'Decide for me' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update draft' })).not.toBeInTheDocument();
  });

  it('a draft with a base version offers "Create new version" as the primary, and nothing else to press', async () => {
    state.messages = [canvasRoot(), note()];
    state.draft = draftRow({ baseVersionId: 'ver-base' });
    await renderThread();
    const create = await screen.findByRole('button', { name: 'Create new version' });
    expect(create.className).toContain('bg-blue-600');
    expect(screen.queryByRole('button', { name: 'Create canvas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Decide for me' })).not.toBeInTheDocument();
    fireEvent.click(create);
    await waitFor(() => expect(svc.startQueuedCanvasRun).toHaveBeenLastCalledWith('draft-1'));
  });

  it('after the press the run is read from the database: progress shows and the actions are gone', async () => {
    state.messages = [canvasRoot(), note()];
    svc.startQueuedCanvasRun.mockImplementation(async () => {
      state.run = runRow();
      return { ok: true, runId: 'run-9', kind: 'draft' };
    });
    await renderThread();
    fireEvent.click(await screen.findByRole('button', { name: 'Create canvas' }));
    expect(await screen.findByTestId('canvas-progress')).toHaveTextContent(/Creating your canvas/);
    expect(screen.queryByRole('button', { name: 'Create canvas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Decide for me' })).not.toBeInTheDocument();
    // the tray is only the spinner and the step: no "you can leave" sentence (founder, 2026-10-27)
    expect(screen.getByTestId('canvas-progress').textContent).toBe('Creating your canvas…');
    // the list collapses while the run goes
    expect(screen.queryByTestId('canvas-material')).not.toBeInTheDocument();
  });

  it('a refusal is said in a sentence, and the actions stay', async () => {
    state.messages = [canvasRoot(), note()];
    svc.startQueuedCanvasRun.mockResolvedValue({ ok: false, code: 'REVISION_CAP' });
    await renderThread();
    fireEvent.click(await screen.findByRole('button', { name: 'Create canvas' }));
    expect(await screen.findByTestId('canvas-notice')).toHaveTextContent(/used all its revisions/);
    expect(screen.getByRole('button', { name: 'Create canvas' })).toBeInTheDocument();
  });

  it('a run already going (after a reload) shows progress with no actions, and the poll ends it', async () => {
    vi.useFakeTimers();
    try {
      state.messages = [canvasRoot(), note()];
      state.run = runRow();
      wrap(<ThreadPanel summary={mirrorChat} rootId={ROOT} highlightId={null} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      expect(screen.getByTestId('canvas-progress')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Create canvas' })).not.toBeInTheDocument();
      state.run = runRow({ state: 'done' });
      state.draft = draftRow({ runCount: 1 });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RUN_POLL_MS + 50);
      });
      expect(screen.queryByTestId('canvas-progress')).not.toBeInTheDocument();
      // done: the tray is gone and the draft card (Publish) closes the thread
      expect(screen.queryByTestId('canvas-bar')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a run that died (older than five minutes) does not lock the owner out', async () => {
    state.messages = [canvasRoot(), note()];
    const old = new Date(Date.now() - 6 * 60_000).toISOString();
    state.run = runRow({ createdAt: old, startedAt: old });
    await renderThread();
    expect(await screen.findByRole('button', { name: 'Create canvas' })).toBeInTheDocument();
  });

  it('Publish publishes the draft', async () => {
    state.messages = [canvasRoot(), note()];
    state.draft = draftRow({ runCount: 1 });
    await renderThread();
    fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(svc.publishCanvasDraft).toHaveBeenCalledWith('draft-1', 3));
  });

  it.each(['message', 'focus', 'fork_first'] as const)('after a finished v6 %s run Publish is shown (only that run says there are points: the count of earlier runs is 0)', async (kind) => {
    state.messages = [canvasRoot(), note()];
    state.draft = draftRow({ runCount: 1 });
    state.run = runRow({ kind, state: 'done' });
    svc.countDoneCanvasDraftRuns.mockResolvedValue(0);
    await renderThread();
    expect(await screen.findByRole('button', { name: 'Publish' })).toBeInTheDocument();
  });
});

describe('nothing to draft from', () => {
  it('shows no tray, no action and no draft menu while there is no file and no note', async () => {
    await renderThread();
    await screen.findByTestId('canvas-opener');
    // v2: the tray is hidden while there are no items. V1 (final review): an empty draft has nothing to throw away, so no "…" menu either.
    expect(screen.queryByTestId('canvas-bar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create canvas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Canvas draft options' })).not.toBeInTheDocument();
  });

  it('a file read counts as material', async () => {
    state.material = [{ id: 'm1', kind: 'file', label: 'offer.pdf', chars: 900, createdAt: '2026-10-27T08:00:00.000Z' }];
    await renderThread();
    expect(await screen.findByRole('button', { name: 'Create canvas' })).toBeInTheDocument();
    expect(screen.getByTestId('canvas-material')).toHaveTextContent('offer.pdf');
  });

  it('CONTROL: a note makes the actions appear, an empty message does not', async () => {
    state.messages = [canvasRoot(), msg({ id: 'n0', body: '   ' })];
    await renderThread();
    await screen.findByTestId('canvas-opener');
    expect(screen.queryByTestId('canvas-bar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create canvas' })).not.toBeInTheDocument();
  });
});

describe('AC8: a published version takes no more changes', () => {
  const published = () => {
    state.draft = draftRow({ state: 'published', runCount: 1 });
  };

  it('an owner message after Publish gets "Start a new version?", and the button starts it from that version', async () => {
    published();
    state.messages = [canvasRoot(), note()];
    await renderThread();
    expect(await screen.findByText('This version is published. Start a new version?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start a new version' }));
    await waitFor(() => expect(svc.openCanvasDraft).toHaveBeenCalledWith('ver-draft'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/chats/c/${MIRROR_ID}/t/root-new`));
  });

  it('CONTROL: with no message after Publish nothing is offered and nothing starts', async () => {
    published();
    await renderThread();
    expect(await screen.findByText('This version is published.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start a new version' })).not.toBeInTheDocument();
    expect(svc.openCanvasDraft).not.toHaveBeenCalled();
  });

  it('a canvas that already has an open draft asks: continue there', async () => {
    published();
    state.messages = [canvasRoot(), note()];
    svc.openCanvasDraft.mockResolvedValue({ status: 'open_elsewhere', draftId: 'draft-open', revision: 2, canvasId: 'cv-1', conversationId: MIRROR_ID, threadRootId: 'root-open', canvasName: 'canvas', fromSeq: 1 });
    await renderThread();
    fireEvent.click(await screen.findByRole('button', { name: 'Start a new version' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('You have an open draft (from v1) in another thread. Continue it there, or discard it and start from the version you picked?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue it there' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/chats/c/${MIRROR_ID}/t/root-open`));
    expect(svc.discardCanvasDraft).not.toHaveBeenCalled();
  });

  it('or discard it and start from the version picked, never silently', async () => {
    published();
    state.messages = [canvasRoot(), note()];
    svc.openCanvasDraft
      .mockResolvedValueOnce({ status: 'open_elsewhere', draftId: 'draft-open', revision: 2, canvasId: 'cv-1', conversationId: MIRROR_ID, threadRootId: 'root-open', canvasName: 'canvas', fromSeq: 1 })
      .mockResolvedValueOnce({ status: 'opened', draftId: 'draft-new', revision: 2, canvasId: 'cv-1', conversationId: MIRROR_ID, threadRootId: 'root-new', canvasName: 'canvas', fromSeq: 1 });
    await renderThread();
    fireEvent.click(await screen.findByRole('button', { name: 'Start a new version' }));
    const dialog = await screen.findByRole('dialog');
    expect(svc.discardCanvasDraft).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard it and start here' }));
    await waitFor(() => expect(svc.discardCanvasDraft).toHaveBeenCalledWith('draft-open', 2));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/chats/c/${MIRROR_ID}/t/root-new`));
    expect(svc.openCanvasDraft).toHaveBeenCalledTimes(2);
  });

  it('a draft being written right now cannot be discarded: the dialog says so and stays', async () => {
    published();
    state.messages = [canvasRoot(), note()];
    svc.openCanvasDraft.mockResolvedValueOnce({ status: 'open_elsewhere', draftId: 'draft-open', revision: 2, canvasId: 'cv-1', conversationId: MIRROR_ID, threadRootId: 'root-open', canvasName: 'canvas', fromSeq: null });
    svc.discardCanvasDraft.mockResolvedValueOnce({ ok: false, refused: 'busy', revision: 3 });
    await renderThread();
    fireEvent.click(await screen.findByRole('button', { name: 'Start a new version' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard it and start here' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/being written right now/);
    expect(screen.getByTestId('where')).toHaveTextContent(`/t/${ROOT}`);
  });
});

describe('P1536 S1: a stale discard of the draft found elsewhere takes its revision before the next attempt', () => {
  it('the first Discard is refused (stale_view), the draft\'s revision is read again, and the second attempt sends it', async () => {
    state.draft = draftRow({ state: 'published', runCount: 1, closedAt: '2026-10-26T10:00:00.000Z' });
    state.messages = [canvasRoot(), note()];
    svc.openCanvasDraft
      .mockResolvedValueOnce({ status: 'open_elsewhere', draftId: 'draft-open', revision: 2, canvasId: 'cv-1', conversationId: MIRROR_ID, threadRootId: 'root-open', canvasName: 'canvas', fromSeq: 1 })
      .mockResolvedValueOnce({ status: 'opened', draftId: 'draft-new', revision: 2, canvasId: 'cv-1', conversationId: MIRROR_ID, threadRootId: 'root-new', canvasName: 'canvas', fromSeq: 1 });
    svc.discardCanvasDraft.mockResolvedValueOnce({ ok: false, refused: 'stale_view', revision: 7 });
    svc.getCanvasDraftRevision.mockResolvedValue(7);
    await renderThread();
    fireEvent.click(await screen.findByRole('button', { name: 'Start a new version' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard it and start here' }));
    await waitFor(() => expect(svc.getCanvasDraftRevision).toHaveBeenCalledWith('draft-open'));
    expect(svc.discardCanvasDraft).toHaveBeenLastCalledWith('draft-open', 2);
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Discard it and start here' }));
    await waitFor(() => expect(svc.discardCanvasDraft).toHaveBeenLastCalledWith('draft-open', 7));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/t/root-new')); // the new thread has opened: nothing is left running into the next test
  });
});

describe('P1536 S1: an upload that the send refuses posts no file', () => {
  it('busy: the row fails, the file is not posted, and the draft is read again', async () => {
    svc.sendCanvasWorkspaceMessage.mockResolvedValueOnce({ ok: false, refused: 'busy', revision: 3 });
    await renderThread();
    const input = (await screen.findByTestId('canvas-upload-input')) as HTMLInputElement;
    const reads = svc.getCanvasDraftByThread.mock.calls.length;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'scan.pdf')] } });
    });
    expect(svc.uploadCanvasMaterial).not.toHaveBeenCalled();
    expect(toastFn.error).not.toHaveBeenCalled(); // the tray row says it; no second message in a toast
    const row = within(screen.getByTestId('canvas-material')).getByRole('listitem');
    expect(row).toHaveAttribute('data-status', 'failed');
    expect(row).toHaveTextContent('scan.pdf');
    expect(svc.getCanvasDraftByThread.mock.calls.length).toBeGreaterThan(reads);
  });
});

describe('P1536 S1: a file post that fails after the announcement is tried once more', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  const pick = async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // the shortest pause
    await renderThread();
    const input = (await screen.findByTestId('canvas-upload-input')) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'offer.pdf')] } });
    });
  };
  it('a failed post is tried again with the same run, and the second try can succeed', async () => {
    svc.uploadCanvasMaterial.mockResolvedValueOnce({ ok: false, code: 'FAILED' });
    await pick();
    await waitFor(() => expect(svc.uploadCanvasMaterial).toHaveBeenCalledTimes(2));
    expect(svc.uploadCanvasMaterial.mock.calls.map((c) => c[0])).toEqual(['run-up', 'run-up']);
    expect(toastFn.error).not.toHaveBeenCalled();
  });
  it('two failures say to wait a moment (the announced run is still waiting for its file), and stop at two tries', async () => {
    svc.uploadCanvasMaterial.mockResolvedValue({ ok: false, code: 'FAILED' });
    await pick();
    await waitFor(() => expect(toastFn.error).toHaveBeenCalledWith(expect.stringContaining('Wait a minute')));
    expect(svc.uploadCanvasMaterial).toHaveBeenCalledTimes(2);
  });
  it('a code that is not a network failure (the file could not be read) is not tried again', async () => {
    svc.uploadCanvasMaterial.mockResolvedValueOnce({ ok: false, code: 'UNREADABLE' });
    await pick();
    await waitFor(() => expect(toastFn.error).toHaveBeenCalled());
    expect(svc.uploadCanvasMaterial).toHaveBeenCalledTimes(1);
  });
});

describe('AC9: the paperclip lists canvas versions', () => {
  const versions = [
    { id: 'ver-2', canvasId: 'cv-1', canvasName: 'canvas', name: 'canvas_dbbb22', seq: 2, publishedAt: '2026-10-26T10:00:00Z', hasOpenDraft: false },
    { id: 'ver-1', canvasId: 'cv-1', canvasName: 'canvas', name: 'canvas_daaa11', seq: 1, publishedAt: '2026-10-20T10:00:00Z', hasOpenDraft: false },
  ];

  function Paperclip({ onPicked = vi.fn() }: { onPicked?: () => void }) {
    const entry = useCanvasEntry(true, onPicked);
    return (
      <>
        <AttachDialog viewerId={ME} onPick={vi.fn()} onClose={vi.fn()} onPickCanvas={entry.onPickCanvas} />
        {entry.dialog}
      </>
    );
  }

  it('lists the versions as "v{seq} · date" under a Canvases tab, and picking an older one starts a draft from it', async () => {
    svc.listMyCanvasVersions.mockResolvedValue(versions);
    const onPicked = vi.fn();
    wrap(<Paperclip onPicked={onPicked} />, `/chats/c/${MIRROR_ID}`);
    fireEvent.click(await screen.findByRole('tab', { name: 'Canvases' }));
    const list = await screen.findByTestId('canvas-version-results');
    const rows = within(list).getAllByRole('button');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(/^v2 · /);
    expect(rows[1]).toHaveTextContent(/^v1 · /);
    fireEvent.click(rows[1]!);
    await waitFor(() => expect(svc.openCanvasDraft).toHaveBeenCalledWith('ver-1'));
    expect(onPicked).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/chats/c/${MIRROR_ID}/t/root-new`));
  });

  it('says so when there is no published canvas, and CONTROL: points and stories are still the first tabs', async () => {
    wrap(<Paperclip />, `/chats/c/${MIRROR_ID}`);
    expect(await screen.findByRole('tab', { name: 'Points' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Stories' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Canvases' }));
    expect(await screen.findByText(/no published canvas yet/)).toBeInTheDocument();
  });

  it('a version that has an open draft says so before it is picked', async () => {
    svc.listMyCanvasVersions.mockResolvedValue([{ ...versions[0]!, hasOpenDraft: true }]);
    wrap(<Paperclip />, `/chats/c/${MIRROR_ID}`);
    fireEvent.click(await screen.findByRole('tab', { name: 'Canvases' }));
    expect(await screen.findByText('has an open draft')).toBeInTheDocument();
  });
});

describe('the entry point: New canvas in the mirror\'s menu', () => {
  function Menu() {
    const entry = useCanvasEntry(true, vi.fn());
    return (
      <>
        <ConversationHeader chat={mirrorChat} blocked={false} actions={{ onBack: vi.fn(), onArchive: vi.fn(), onMarkUnread: vi.fn(), onBlock: vi.fn(), onUnblock: vi.fn(), onRename: vi.fn(), onNewCanvas: entry.onNewCanvas } as HeaderActions} />
        {entry.dialog}
      </>
    );
  }

  it('opens a brand-new canvas thread', async () => {
    wrap(<Menu />, `/chats/c/${MIRROR_ID}`);
    // availability is asked once the pane mounts; the item appears when the answer is exactly true
    await waitFor(() => expect(svc.getCanvasDraftAvailability).toHaveBeenCalled());
    await act(async () => {});
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More' }), { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'New canvas' }));
    await waitFor(() => expect(svc.openCanvasDraft).toHaveBeenCalledWith(null));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/chats/c/${MIRROR_ID}/t/root-new`));
  });

  it('a failed start is said in a sentence, and nothing navigates', async () => {
    const { CanvasDraftRefusal } = await import('@/app/data/canvas-draft-service');
    svc.openCanvasDraft.mockRejectedValueOnce(new CanvasDraftRefusal('TOO_MANY_DRAFTS'));
    wrap(<Menu />, `/chats/c/${MIRROR_ID}`);
    await act(async () => {});
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More' }), { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'New canvas' }));
    await waitFor(() => expect(toastFn.error).toHaveBeenCalledWith(expect.stringContaining('too many open canvas drafts')));
    expect(screen.getByTestId('where')).toHaveTextContent(`/chats/c/${MIRROR_ID}`);
    expect(screen.getByTestId('where')).not.toHaveTextContent('/t/');
  });

  it('CONTROL: a channel\'s menu never offers it', () => {
    wrap(<ConversationHeader chat={{ ...mirrorChat, kind: 'group', title: 'Team' }} blocked={false} actions={{ onBack: vi.fn(), onArchive: vi.fn(), onMarkUnread: vi.fn(), onBlock: vi.fn(), onUnblock: vi.fn(), onRename: vi.fn(), onNewCanvas: vi.fn() } as HeaderActions} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More' }), { button: 0, ctrlKey: false, pointerType: 'mouse' });
    expect(within(screen.getByRole('menu')).queryByRole('menuitem', { name: 'New canvas' })).not.toBeInTheDocument();
  });
});

describe('the canvas version in a message', () => {
  const card = (kind: 'canvas_version') => (
    <MemoryRouter>
      <AttachmentCard kind={kind} id="ver-1" viewerId={ME} />
    </MemoryRouter>
  );

  it('a published version is the chat\'s artifact card: icon disc, the canvas title, "v2 · date", and links to its page', async () => {
    svc.getCanvasVersionCard.mockResolvedValue({ title: 'Hiring plan', label: 'v2 · Oct 26, 2026', draft: false, href: '/p/test-user/canvas/canvas?v=canvas_d1a2b3' });
    render(card('canvas_version'));
    const link = await screen.findByTestId('attachment-canvas_version');
    expect(link).toHaveTextContent('Hiring plan');
    expect(link).toHaveTextContent('v2 · Oct 26, 2026');
    expect(link.querySelector('.bg-blue-100')).not.toBeNull();
    expect(link).toHaveAttribute('href', '/p/test-user/canvas/canvas?v=canvas_d1a2b3');
  });

  it('a draft reads "Draft" and has no link', async () => {
    svc.getCanvasVersionCard.mockResolvedValue({ label: 'Draft', draft: true, href: null });
    render(card('canvas_version'));
    const box = await screen.findByTestId('attachment-canvas_version');
    expect(box).toHaveTextContent('Draft');
    expect(box.tagName).not.toBe('A');
  });

  it('a version that is not the reader\'s is "Not available to you"', async () => {
    svc.getCanvasVersionCard.mockResolvedValue(null);
    render(card('canvas_version'));
    expect(await screen.findByText('Not available to you')).toBeInTheDocument();
  });
});

/** The tray and the draft card sit in one thread, so the one-primary rule is judged on both together. */
function Surface(props: BarProps) {
  return (
    <MemoryRouter>
      <CanvasDraftEnd {...props} />
      <CanvasThreadBar {...props} />
    </MemoryRouter>
  );
}
/** Filled-blue controls, buttons and links (Open on the draft card is a link). */
const primaries = () => [...screen.queryAllByRole('button'), ...screen.queryAllByRole('link')].filter((b) => b.className.includes('bg-blue-600')).map((b) => b.textContent);

describe('P955: no disabled primary, one primary at a time', () => {
  const base: BarProps = {
    draft: draftRow(), run: null, running: false, items: [], askedAfterPublish: false, busy: null, notice: null,
    onRun: vi.fn(), onPublish: vi.fn(), onStartNew: vi.fn(),
  };
  // [name, props, the one primary the state has (null: none)]
  const phases: Array<[string, Partial<BarProps>, string | null]> = [
    ['empty', {}, null],
    ['ready to draft', { items: FILE_ITEMS }, 'Create canvas'],
    ['drafted', { items: FILE_ITEMS, draft: draftRow({ runCount: 1 }), viewDraftPath: '/p/test-user/canvas/canvas?v=x' }, 'Open'],
    ['drafted, no new input', { draft: draftRow({ runCount: 1 }), viewDraftPath: '/p/test-user/canvas/canvas?v=x' }, 'Open'],
    ['revising a draft (Update draft is an outline now, and Open stays one: Publish is the filled action)', { items: FILE_ITEMS, newInput: true, draft: draftRow({ runCount: 1 }), viewDraftPath: '/p/test-user/canvas/canvas?v=x' }, null],
    ['drafted, address not readable (Publish stays an outline, so no primary)', { draft: draftRow({ runCount: 1 }) }, null],
    ['running', { items: FILE_ITEMS, running: true, run: runRow() }, null],
    ['starting', { items: FILE_ITEMS, busy: 'run' }, null],
    ['publishing', { items: FILE_ITEMS, busy: 'publish', draft: draftRow({ runCount: 1 }) }, null],
    ['failed last run', { items: FILE_ITEMS, run: runRow({ state: 'failed' }) }, 'Create canvas'],
    ['published', { draft: draftRow({ state: 'published', runCount: 1 }) }, null],
    ['published, asked', { draft: draftRow({ state: 'published', runCount: 1 }), askedAfterPublish: true }, 'Start a new version'],
    ['discarded', { draft: draftRow({ state: 'discarded' }) }, null],
    ['with a notice', { items: FILE_ITEMS, notice: 'That did not go through. Try again.' }, 'Create canvas'],
  ];

  it.each(phases)('%s: no disabled button and the one primary is the right one', (_name, over, primary) => {
    render(<Surface {...base} {...over} />);
    for (const b of screen.queryAllByRole('button')) expect(b).not.toBeDisabled();
    expect(primaries()).toEqual(primary ? [primary] : []);
  });

  it('CONTROL: the check can fail (a bar with two primaries is caught)', () => {
    render(
      <div data-testid="canvas-bar">
        <button className="bg-blue-600">One</button>
        <button className="bg-blue-600">Two</button>
      </div>,
    );
    const buttons = within(screen.getByTestId('canvas-bar')).queryAllByRole('button');
    expect(buttons.filter((b) => b.className.includes('bg-blue-600'))).toHaveLength(2);
  });

  it('the primary is Create until there is a draft, then Open (on the draft card, the tray has gone); Publish is an outline', () => {
    const { rerender } = render(<Surface {...base} items={FILE_ITEMS} />);
    expect(primaries()).toEqual(['Create canvas']);
    rerender(<Surface {...base} items={FILE_ITEMS} draft={draftRow({ runCount: 1 })} viewDraftPath="/p/test-user/canvas/canvas?v=x" />);
    expect(primaries()).toEqual(['Open']);
    expect(screen.queryByTestId('canvas-bar')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('canvas-draft-card')).getByRole('button', { name: 'Publish' }).className).not.toContain('bg-blue-600');
  });

  it.each(['empty', 'reading', 'upload-failed', 'ready', 'links', 'running', 'drafted', 'revising', 'failed', 'failed-no-items', 'failed-nothing-drafted', 'published', 'asked', 'discarded', 'update-empty', 'update', 'update-running', 'update-drafted', 'update-revising'])('the gate fixture phase %s renders the real thread parts with no disabled button and at most one primary', (phase) => {
    render(
      <MemoryRouter initialEntries={[`/tree/_gate/canvas-thread?phase=${phase}`]}>
        <GateFixture />
      </MemoryRouter>,
    );
    for (const b of screen.getAllByRole('button')) expect(b).not.toBeDisabled();
    // the fixture is a whole thread: the header, the opener, the real composer with Upload; a tray only when it has something to show
    expect(screen.getByTestId('canvas-thread-title')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-opener')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-upload')).toBeInTheDocument();
    expect(screen.getByTestId('composer')).toBeInTheDocument();
    // one primary on the whole page, the fixture's composer Send included (it only shows with text)
    expect(primaries().length).toBeLessThanOrEqual(1);
  });

  it('the fixture has at least 14 phases, including an update with its base version card', () => {
    render(<MemoryRouter initialEntries={['/tree/_gate/canvas-thread?phase=update']}><GateFixture /></MemoryRouter>);
    expect(screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/tree/_gate/canvas-thread?phase=')).length).toBeGreaterThanOrEqual(14);
    expect(screen.getByTestId('gate-base-card')).toHaveTextContent('Example canvas');
    expect(screen.getByTestId('canvas-thread-title')).toHaveTextContent('New version · Example canvas');
  });
});


/** Review set B (UI). Each fix has a negative control beside it. */
describe('B1: no polling in a hidden tab', () => {
  const setVisibility = (v: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  afterEach(() => setVisibility('visible'));

  it('stops reading while the tab is hidden, reads once on return, then polls again', async () => {
    vi.useFakeTimers();
    try {
      state.messages = [canvasRoot(), note()];
      state.run = runRow();
      wrap(<ThreadPanel summary={mirrorChat} rootId={ROOT} highlightId={null} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      const reads = () => svc.getLatestCanvasRun.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RUN_POLL_MS + 50);
      });
      const before = reads();
      expect(before).toBeGreaterThanOrEqual(2); // CONTROL: it does poll while visible

      await act(async () => setVisibility('hidden'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RUN_POLL_MS * 5);
      });
      expect(reads()).toBe(before);

      await act(async () => setVisibility('visible'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      expect(reads()).toBe(before + 1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RUN_POLL_MS + 50);
      });
      expect(reads()).toBe(before + 2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a thread opened in a hidden tab reads once and does not poll', async () => {
    vi.useFakeTimers();
    try {
      setVisibility('hidden');
      state.messages = [canvasRoot(), note()];
      state.run = runRow();
      wrap(<ThreadPanel summary={mirrorChat} rootId={ROOT} highlightId={null} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RUN_POLL_MS * 4);
      });
      expect(svc.getLatestCanvasRun).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('B3: copies and forwards are input', () => {
  const snapshot = (over: Record<string, unknown> = {}) => ({
    authorName: 'Test Owner', body: null, createdAt: new Date().toISOString(), conversationKind: 'dm', conversationTitle: 'A chat', thread: [], ...over,
  });
  const copy = (kind: 'clarify' | 'forward', snap: Record<string, unknown>) =>
    msg({ id: `copy-${kind}`, kind, body: null, forwardSnapshot: snapshot(snap) as never });

  it('a Clarify copy that is only a transcript (no note, no file) makes the draft actions appear', async () => {
    state.messages = [canvasRoot(), copy('clarify', { thread: [{ authorName: 'Pia', body: 'We pay 40 a month for the books', createdAt: new Date().toISOString() }] })];
    await renderThread();
    expect(await screen.findByRole('button', { name: 'Create canvas' })).toBeInTheDocument();
  });

  it('a forward with readable text counts too', async () => {
    state.messages = [canvasRoot(), copy('forward', { body: 'My offer is bookkeeping for cafes' })];
    await renderThread();
    expect(await screen.findByRole('button', { name: 'Create canvas' })).toBeInTheDocument();
  });

  it('CONTROL: a copy with nothing readable in it is not input', async () => {
    state.messages = [canvasRoot(), copy('clarify', { body: '   ', thread: [{ authorName: 'Pia', body: null, createdAt: new Date().toISOString() }] })];
    await renderThread();
    await screen.findByTestId('canvas-opener');
    expect(screen.queryByTestId('canvas-bar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create canvas' })).not.toBeInTheDocument();
  });
});

describe('B4: only messages after Publish ask for a new version', () => {
  const at = (iso: string) => ({ createdAt: iso });
  const published = (closedAt: string) => {
    state.draft = draftRow({ state: 'published', runCount: 1, closedAt });
  };

  it('a message written after the publish time gets the question', async () => {
    published('2026-10-26T10:00:00.000Z');
    state.messages = [canvasRoot(), msg({ id: 'before', body: 'my notes', ...at('2026-10-26T09:00:00.000Z') }), msg({ id: 'after', body: 'change the price', ...at('2026-10-26T11:00:00.000Z') })];
    await renderThread();
    expect(await screen.findByRole('button', { name: 'Start a new version' })).toBeInTheDocument();
  });

  it('CONTROL: messages that were all written before the publish do not', async () => {
    published('2026-10-26T10:00:00.000Z');
    state.messages = [canvasRoot(), msg({ id: 'before', body: 'my notes', ...at('2026-10-26T09:00:00.000Z') })];
    await renderThread();
    expect(await screen.findByText('This version is published.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start a new version' })).not.toBeInTheDocument();
  });
});

describe('B5: the change request goes with the new version', () => {
  const asked = () => {
    state.draft = draftRow({ state: 'published', runCount: 1, closedAt: '2026-10-26T10:00:00.000Z' });
    state.messages = [canvasRoot(), msg({ id: 'before', body: 'my notes', createdAt: '2026-10-26T09:00:00.000Z' }), msg({ id: 'ask', body: 'Raise the price to 60', createdAt: '2026-10-26T11:00:00.000Z' })];
  };

  it('is sent as the first owner message of the new thread, before the owner lands there', async () => {
    asked();
    await renderThread();
    fireEvent.click(await screen.findByRole('button', { name: 'Start a new version' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/t/root-new'));
    // v6: a plain chat message has no run and is never engine input, so the change request goes with canvas_workspace_send into the
    // new draft, which starts the run itself (no separate Create step: a queued run nobody starts only locks the owner out)
    expect(svc.sendCanvasWorkspaceMessage).toHaveBeenCalledTimes(1);
    expect(svc.sendCanvasWorkspaceMessage).toHaveBeenCalledWith(expect.objectContaining({
      canvasId: 'cv-1', expectedDraftId: 'draft-new', expectedRevision: 2, body: 'Raise the price to 60', clientId: expect.any(String),
    }));
    expect(chatSvc.sendMessage).not.toHaveBeenCalled();
  });

  it('the same text goes along when the owner discards the draft that was open elsewhere', async () => {
    asked();
    svc.openCanvasDraft
      .mockResolvedValueOnce({ status: 'open_elsewhere', draftId: 'draft-open', revision: 2, canvasId: 'cv-1', conversationId: MIRROR_ID, threadRootId: 'root-open', canvasName: 'canvas', fromSeq: 1 })
      .mockResolvedValueOnce({ status: 'opened', draftId: 'draft-new', revision: 2, canvasId: 'cv-1', conversationId: MIRROR_ID, threadRootId: 'root-new', canvasName: 'canvas', fromSeq: 1 });
    await renderThread();
    fireEvent.click(await screen.findByRole('button', { name: 'Start a new version' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Discard it and start here' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/t/root-new'));
    expect(svc.sendCanvasWorkspaceMessage).toHaveBeenCalledWith(expect.objectContaining({ expectedDraftId: 'draft-new', body: 'Raise the price to 60' }));
  });

  it('CONTROL: continuing the draft open elsewhere sends nothing', async () => {
    asked();
    svc.openCanvasDraft.mockResolvedValue({ status: 'open_elsewhere', draftId: 'draft-open', revision: 2, canvasId: 'cv-1', conversationId: MIRROR_ID, threadRootId: 'root-open', canvasName: 'canvas', fromSeq: 1 });
    await renderThread();
    fireEvent.click(await screen.findByRole('button', { name: 'Start a new version' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Continue it there' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/t/root-open'));
    expect(svc.sendCanvasWorkspaceMessage).not.toHaveBeenCalled();
    expect(chatSvc.sendMessage).not.toHaveBeenCalled();
  });

  it('if the message cannot be carried over, the owner is told and still lands in the new thread', async () => {
    asked();
    svc.sendCanvasWorkspaceMessage.mockRejectedValueOnce(new Error('network'));
    await renderThread();
    fireEvent.click(await screen.findByRole('button', { name: 'Start a new version' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/t/root-new'));
    expect(toastFn.error).toHaveBeenCalledWith(expect.stringContaining('Send it again'));
  });
});

describe('U2: the messages after Publish are carried as ONE message (one message is one run)', () => {
  // v3 sent each message on its own. A run applies one message and only one run is active per owner, so the later sends would be
  // refused as busy: the requests are now joined, oldest first, into one canvas_workspace_send, newest-first up to the 4,000 characters
  // a message may hold. What does not fit is left out and the owner is told. [FOUNDER DECISION: wording]
  const closedAt = '2026-10-26T10:00:00.000Z';
  const publishedWith = (...later: ChatMessage[]) => {
    state.draft = draftRow({ state: 'published', runCount: 1, closedAt });
    state.messages = [canvasRoot(), msg({ id: 'before', body: 'my notes', createdAt: '2026-10-26T09:00:00.000Z' }), ...later];
  };
  const start = async () => {
    await renderThread();
    fireEvent.click(await screen.findByRole('button', { name: 'Start a new version' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/t/root-new'));
  };
  const sent = () => svc.sendCanvasWorkspaceMessage.mock.calls.map((c) => c[0] as { body: string; clientId: string });

  it('two short messages are one send, oldest first, and that send starts its run', async () => {
    publishedWith(msg({ id: 'm1', body: 'one', createdAt: '2026-10-26T11:00:00.000Z' }), msg({ id: 'm2', body: 'two', createdAt: '2026-10-26T12:00:00.000Z' }));
    await start();
    expect(sent()).toHaveLength(1);
    expect(sent()[0]).toMatchObject({ body: 'one\n\ntwo' });
    expect(sent()[0]).not.toHaveProperty('startRun');
    expect(toastFn.error).not.toHaveBeenCalled();
  });

  it('two 3,000-character messages do not fit one: the newest goes, under the limit, and the owner is told the rest was left out', async () => {
    const a = 'a'.repeat(3000);
    const b = 'b'.repeat(3000);
    publishedWith(msg({ id: 'm1', body: a, createdAt: '2026-10-26T11:00:00.000Z' }), msg({ id: 'm2', body: b, createdAt: '2026-10-26T12:00:00.000Z' }));
    await start();
    expect(sent().map((x) => x.body)).toEqual([b]);
    expect(toastFn.error).toHaveBeenCalledWith(expect.stringContaining('Send it again'));
  });

  it('one request longer than the limit is split into pieces under 4,000 characters; the newest piece that fits goes, and the owner is told the rest was left out', async () => {
    const long = `${'x'.repeat(3500)} ${'y'.repeat(3500)}`;
    publishedWith(msg({ id: 'm1', body: long, createdAt: '2026-10-26T11:00:00.000Z' }));
    await start();
    expect(sent()).toHaveLength(1);
    expect(sent()[0]!.body.length).toBeLessThanOrEqual(4000);
    expect(sent()[0]!.body).toContain('y'.repeat(3500)); // the newest words go
    expect(sent()[0]!.body).not.toContain('x');
    expect(toastFn.error).toHaveBeenCalledWith(expect.stringContaining('Send it again'));
  });

  it('the client id is the same when the same carry is run again into the same thread, and differs for another thread', async () => {
    publishedWith(msg({ id: 'm1', body: 'one', createdAt: '2026-10-26T11:00:00.000Z' }));
    await start();
    const first = sent()[0]!.clientId;
    expect(first.length).toBeGreaterThan(0);
    svc.sendCanvasWorkspaceMessage.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Start a new version' }));
    await waitFor(() => expect(svc.sendCanvasWorkspaceMessage).toHaveBeenCalledTimes(1));
    expect(sent()[0]!.clientId).toBe(first);
    svc.sendCanvasWorkspaceMessage.mockClear();
    svc.openCanvasDraft.mockResolvedValue({ status: 'opened', draftId: 'draft-n2', revision: 2, canvasId: 'cv-1', conversationId: MIRROR_ID, threadRootId: 'root-new-2', canvasName: 'canvas', fromSeq: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Start a new version' }));
    await waitFor(() => expect(svc.sendCanvasWorkspaceMessage).toHaveBeenCalledTimes(1));
    expect(sent()[0]!.clientId).not.toBe(first);
  });

  it('a send that is refused or fails is said, and the owner still lands in the new thread', async () => {
    publishedWith(msg({ id: 'm1', body: 'one', createdAt: '2026-10-26T11:00:00.000Z' }));
    svc.sendCanvasWorkspaceMessage.mockResolvedValueOnce({ ok: false, refused: 'busy', revision: 2 });
    await start();
    expect(toastFn.error).toHaveBeenCalledWith(expect.stringContaining('Send it again'));
  });
});

describe('U4: a copy or forward sent after Publish is a change request too', () => {
  const closedAt = '2026-10-26T10:00:00.000Z';
  const afterCopy = (kind: 'clarify' | 'forward', over: Record<string, unknown> = {}) =>
    msg({
      id: `late-${kind}`, kind, body: null, createdAt: '2026-10-26T11:00:00.000Z',
      forwardSnapshot: { authorName: 'Pia', body: 'We pay 40 a month for the books', createdAt: closedAt, conversationKind: 'dm', conversationTitle: null, thread: [], ...over } as never,
    });
  const published = (...later: ChatMessage[]) => {
    state.draft = draftRow({ state: 'published', runCount: 1, closedAt });
    state.messages = [canvasRoot(), msg({ id: 'before', body: 'my notes', createdAt: '2026-10-26T09:00:00.000Z' }), ...later];
  };

  it.each(['clarify', 'forward'] as const)('a %s copy with readable text after the publish gets "Start a new version"', async (kind) => {
    published(afterCopy(kind));
    await renderThread();
    expect(await screen.findByRole('button', { name: 'Start a new version' })).toBeInTheDocument();
  });

  it('CONTROL: a copy with nothing readable in it does not', async () => {
    published(afterCopy('clarify', { body: '  ', thread: [] }));
    await renderThread();
    expect(await screen.findByText('This version is published.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start a new version' })).not.toBeInTheDocument();
  });

  it('CONTROL: a copy written before the publish does not', async () => {
    published({ ...afterCopy('forward'), createdAt: '2026-10-26T09:30:00.000Z' });
    await renderThread();
    expect(screen.queryByRole('button', { name: 'Start a new version' })).not.toBeInTheDocument();
  });

  // Spec §8 + the owner-source rule: a carried message is the OWNER's plain message, so other people's copied
  // words must never ride in it (the engine would read them as the owner's own). Only the owner's note goes.
  it("the owner's note on a copy is carried after the plain message; the other people's copied words are not", async () => {
    published(
      msg({ id: 'm1', body: 'Raise the price', createdAt: '2026-10-26T10:30:00.000Z' }),
      { ...afterCopy('clarify', { thread: [{ authorName: 'Ola', body: 'I would pay 60', createdAt: closedAt }] }), body: 'Pia says this' },
    );
    await renderThread();
    fireEvent.click(await screen.findByRole('button', { name: 'Start a new version' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/t/root-new'));
    const bodies = svc.sendCanvasWorkspaceMessage.mock.calls.map((c) => (c[0] as { body: string }).body);
    expect(bodies).toEqual(['Raise the price\n\nPia says this']);
    for (const b of bodies) {
      expect(b).not.toContain('We pay 40 a month');
      expect(b).not.toContain('I would pay 60');
    }
  });

  it('a copy with no note of the owner carries nothing (it still asks to start a new version)', async () => {
    published(afterCopy('forward'));
    await renderThread();
    fireEvent.click(await screen.findByRole('button', { name: 'Start a new version' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/t/root-new'));
    expect(svc.sendCanvasWorkspaceMessage).not.toHaveBeenCalled();
    expect(chatSvc.sendMessage).not.toHaveBeenCalled();
  });
});

describe('B6: a failed first read is not a blank', () => {
  it('says it could not load, with a Retry that reads again', async () => {
    svc.getCanvasDraftByThread.mockRejectedValueOnce(new Error('offline'));
    await renderThread();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load this draft');
    svc.getCanvasDraftByThread.mockImplementation(async () => state.draft);
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    // the draft is empty, so no tray: the opener is what shows once the read has landed
    expect(await screen.findByTestId('canvas-opener')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a loading state while the first read is out', async () => {
    let release: (d: CanvasDraft | null) => void = () => undefined;
    svc.getCanvasDraftByThread.mockImplementation(() => new Promise<CanvasDraft | null>((r) => { release = r; }));
    await renderThread();
    expect(await screen.findByTestId('canvas-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-opener')).not.toBeInTheDocument();
    await act(async () => release(state.draft));
    expect(await screen.findByTestId('canvas-opener')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-loading')).not.toBeInTheDocument();
  });

  it('CONTROL: with drafting off, a failed read shows nothing at all', async () => {
    state.available = false;
    svc.getCanvasDraftByThread.mockRejectedValue(new Error('offline'));
    await renderThread();
    await waitFor(() => expect(svc.getCanvasDraftAvailability).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByTestId('canvas-loading')).not.toBeInTheDocument();
  });

  it('CONTROL: a later failed re-read keeps what is on screen', async () => {
    state.messages = [canvasRoot(), note()];
    await renderThread();
    await screen.findByRole('button', { name: 'Create canvas' });
    svc.getCanvasDraftByThread.mockRejectedValue(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Create canvas' }));
    await waitFor(() => expect(svc.startQueuedCanvasRun).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole('alert')?.textContent ?? '').not.toContain('Could not load');
    expect(screen.getByTestId('canvas-bar')).toBeInTheDocument();
  });
});

describe('B7: the discard button is busy, not disabled', () => {
  it('stays enabled with aria-busy while it works, and a second press does not send a second request', async () => {
    const onDiscard = vi.fn(() => new Promise<string | null>(() => undefined));
    render(<OpenDraftDialog fromSeq={1} onContinue={vi.fn()} onDiscard={onDiscard} onClose={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Discard it and start here' });
    expect(button).toHaveAttribute('aria-busy', 'false');
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'));
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});

describe('B8: Publish needs a draft that has something in it', () => {
  const base: BarProps = {
    draft: draftRow({ runCount: 1 }), run: null, running: false, items: FILE_ITEMS, askedAfterPublish: false, busy: null, notice: null,
    onRun: vi.fn(), onPublish: vi.fn(), onStartNew: vi.fn(),
  };
  const publishButton = () => screen.queryByRole('button', { name: 'Publish' });

  it('a failed (charged) run with no finished draft before it offers no Publish', () => {
    render(<Surface {...base} run={runRow({ state: 'failed' })} draftHasPoints={false} />);
    expect(publishButton()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create canvas' }).className).toContain('bg-blue-600'); // the one primary is back
  });

  it('CONTROL: the same failed run after an earlier finished draft still offers Publish', () => {
    render(<Surface {...base} run={runRow({ state: 'failed' })} draftHasPoints />);
    expect(publishButton()).toBeInTheDocument();
  });

  it('at thread level the finished runs are counted only when the newest run failed', async () => {
    state.messages = [canvasRoot(), note()];
    state.draft = draftRow({ runCount: 1 });
    state.run = runRow({ state: 'failed' });
    svc.countDoneCanvasDraftRuns.mockResolvedValue(0);
    await renderThread();
    await screen.findByRole('button', { name: 'Create canvas' });
    expect(publishButton()).not.toBeInTheDocument();
    expect(svc.countDoneCanvasDraftRuns).toHaveBeenCalledWith('draft-1');
  });

  it('CONTROL: at thread level a failed newest run over an earlier finished draft keeps Publish; a done run never counts', async () => {
    state.messages = [canvasRoot(), note()];
    state.draft = draftRow({ runCount: 2 });
    state.run = runRow({ state: 'failed' });
    svc.countDoneCanvasDraftRuns.mockResolvedValue(1);
    await renderThread();
    expect(await screen.findByRole('button', { name: 'Publish' })).toBeInTheDocument();
    cleanup();
    svc.countDoneCanvasDraftRuns.mockClear();
    state.run = runRow({ state: 'done' });
    await renderThread();
    expect(await screen.findByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(svc.countDoneCanvasDraftRuns).not.toHaveBeenCalled();
  });
});

describe('U1: Publish follows the draft-kind runs, not the newest run of any kind', () => {
  const publishButton = () => screen.queryByRole('button', { name: 'Publish' });
  const failedFirstDraft = () => {
    state.messages = [canvasRoot(), note()];
    state.draft = draftRow({ runCount: 1 });
    svc.countDoneCanvasDraftRuns.mockResolvedValue(0);
  };

  it('a failed draft run, then a successful file read: no Publish, no "ready" line', async () => {
    failedFirstDraft();
    state.run = runRow({ kind: 'extract', state: 'done' });
    await renderThread();
    await screen.findByRole('button', { name: 'Create canvas' });
    expect(publishButton()).not.toBeInTheDocument();
    expect(screen.queryByTestId('canvas-draft-card')).not.toBeInTheDocument();
    expect(svc.countDoneCanvasDraftRuns).toHaveBeenCalledWith('draft-1');
  });

  it('a failed draft run, then a finished tension run: no Publish', async () => {
    failedFirstDraft();
    state.run = runRow({ kind: 'tensions', state: 'done' });
    await renderThread();
    await screen.findByRole('button', { name: 'Create canvas' });
    expect(publishButton()).not.toBeInTheDocument();
  });

  it.each(['capped', 'cancelled'] as const)('a failed draft run, then a %s run: no Publish', async (st) => {
    failedFirstDraft();
    state.run = runRow({ kind: 'draft', state: st });
    await renderThread();
    await screen.findByRole('button', { name: 'Create canvas' });
    expect(publishButton()).not.toBeInTheDocument();
    expect(screen.queryByTestId('canvas-draft-card')).not.toBeInTheDocument();
  });

  it('CONTROL: a finished draft run earlier keeps Publish after a later file read', async () => {
    state.messages = [canvasRoot(), note()];
    state.draft = draftRow({ runCount: 2 });
    state.run = runRow({ kind: 'extract', state: 'done' });
    svc.countDoneCanvasDraftRuns.mockResolvedValue(1);
    await renderThread();
    expect(await screen.findByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.getByTestId('canvas-draft-card')).toBeInTheDocument();
  });

  it('fails closed: when the finished-run count cannot be read there is no Publish and no "ready" line', async () => {
    state.messages = [canvasRoot(), note()];
    state.draft = draftRow({ runCount: 1 });
    state.run = runRow({ kind: 'extract', state: 'done' });
    svc.countDoneCanvasDraftRuns.mockRejectedValue(new Error('offline'));
    await renderThread();
    await screen.findByRole('button', { name: 'Create canvas' });
    expect(publishButton()).not.toBeInTheDocument();
    expect(screen.queryByTestId('canvas-draft-card')).not.toBeInTheDocument();
  });
});

describe('B9: discard an open draft (v2: from the header "…" menu, never from the tray)', () => {
  beforeEach(() => {
    state.messages = [canvasRoot(), note()];
  });
  const openMenu = async () => {
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Canvas draft options' }), { button: 0, ctrlKey: false, pointerType: 'mouse' });
    return within(await screen.findByRole('menu'));
  };

  it('asks first, then discards, then says so (a first-canvas draft has no base and can still be discarded)', async () => {
    svc.discardCanvasDraft.mockImplementation(async () => {
      state.draft = draftRow({ state: 'discarded', closedAt: new Date().toISOString() });
      return true;
    });
    await renderThread();
    fireEvent.click((await openMenu()).getByRole('menuitem', { name: 'Discard draft' }));
    expect(svc.discardCanvasDraft).not.toHaveBeenCalled();
    expect(await screen.findByText('Discard this draft? This cannot be undone.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, discard' }));
    await waitFor(() => expect(svc.discardCanvasDraft).toHaveBeenCalledWith('draft-1', 3));
    expect(await screen.findByText('This draft was discarded.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Canvas draft options' })).not.toBeInTheDocument();
  });

  it('CONTROL: Keep draft closes the question and discards nothing', async () => {
    await renderThread();
    fireEvent.click((await openMenu()).getByRole('menuitem', { name: 'Discard draft' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Keep draft' }));
    await waitFor(() => expect(screen.queryByText('Discard this draft? This cannot be undone.')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Canvas draft options' })).toBeInTheDocument();
    expect(svc.discardCanvasDraft).not.toHaveBeenCalled();
  });

  it('a refusal while a draft is being written is said in a sentence', async () => {
    svc.discardCanvasDraft.mockResolvedValueOnce({ ok: false, refused: 'busy', revision: 3 });
    await renderThread();
    fireEvent.click((await openMenu()).getByRole('menuitem', { name: 'Discard draft' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, discard' }));
    expect(await screen.findByTestId('canvas-notice')).toHaveTextContent('A draft is being written. Try again when it is done.');
  });

  it('Discard draft is in the header menu only: there is no Discard button in the tray or anywhere else', async () => {
    await renderThread();
    await screen.findByTestId('canvas-bar');
    expect(screen.queryByRole('button', { name: 'Discard draft' })).not.toBeInTheDocument();
    expect(within(screen.getByTestId('canvas-bar')).queryByText('Discard draft')).not.toBeInTheDocument();
    expect((await openMenu()).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Discard draft']);
  });

  it('CONTROL: not offered while a run is going, nor on a published or discarded draft', async () => {
    state.run = runRow();
    await renderThread();
    await screen.findByTestId('canvas-progress');
    expect(screen.queryByRole('button', { name: 'Canvas draft options' })).not.toBeInTheDocument();
    cleanup();
    for (const s of ['published', 'discarded'] as const) {
      state.run = null;
      state.draft = draftRow({ state: s, runCount: 1, closedAt: '2026-10-26T10:00:00.000Z' });
      await renderThread();
      await screen.findByTestId('canvas-bar');
      expect(screen.queryByRole('button', { name: 'Canvas draft options' })).not.toBeInTheDocument();
      cleanup();
    }
  });

  it('CONTROL: an empty draft (no item, no note, no run) has nothing to throw away, so no menu yet (V1)', async () => {
    state.messages = [canvasRoot()];
    await renderThread();
    await screen.findByTestId('canvas-opener');
    expect(screen.queryByRole('button', { name: 'Canvas draft options' })).not.toBeInTheDocument();
  });

  it('a run, a finished draft or an item each make the menu available', async () => {
    for (const setup of [
      () => { state.messages = [canvasRoot()]; state.run = runRow({ state: 'failed' }); },
      () => { state.messages = [canvasRoot()]; state.draft = draftRow({ runCount: 1 }); },
      () => { state.messages = [canvasRoot(), note()]; },
    ]) {
      Object.assign(state, { draft: draftRow(), run: null, messages: [canvasRoot()], material: [] });
      setup();
      await renderThread();
      expect(await screen.findByRole('button', { name: 'Canvas draft options' })).toBeInTheDocument();
      cleanup();
    }
  });

  it('P955: in every open state the tray and card have no disabled button and at most one primary', () => {
    const base: BarProps = {
      draft: draftRow(), run: null, running: false, items: [], askedAfterPublish: false, busy: null, notice: null,
      onRun: vi.fn(), onPublish: vi.fn(), onStartNew: vi.fn(),
    };
    for (const over of [{ items: FILE_ITEMS }, { items: FILE_ITEMS, draft: draftRow({ runCount: 1 }) }, { run: runRow({ state: 'failed' }), items: FILE_ITEMS }] as Array<Partial<BarProps>>) {
      const { unmount } = render(<Surface {...base} {...over} />);
      for (const b of screen.queryAllByRole('button')) expect(b).not.toBeDisabled();
      expect(primaries().length).toBeLessThanOrEqual(1);
      unmount();
    }
  });
});

describe('B2: a finished draft can be opened (v2: the draft card at the end of the thread)', () => {
  it('shows the draft card with Open (the primary link) and Publish (a secondary)', async () => {
    state.messages = [canvasRoot(), note()];
    state.draft = draftRow({ runCount: 1, canvasName: 'canvas', versionName: 'canvas_dabc123' });
    svc.getCanvasDraftViewPath.mockResolvedValue('/p/test-user/canvas/canvas?v=canvas_dabc123');
    await renderThread();
    const card = await screen.findByTestId('canvas-draft-card');
    expect(card).toHaveTextContent('Canvas');
    expect(card).toHaveTextContent('v1 · Draft');
    expect(card).not.toHaveTextContent('Only you can see this');
    const link = within(card).getByRole('link', { name: 'Open' });
    expect(link).toHaveAttribute('href', '/p/test-user/canvas/canvas?v=canvas_dabc123&thread=root-1');
    expect(link.className).toContain('bg-blue-600');
    expect(within(card).getByRole('button', { name: 'Publish' }).className).not.toContain('bg-blue-600');
    expect(svc.getCanvasDraftViewPath).toHaveBeenCalledWith(expect.objectContaining({ canvasName: 'canvas' }), ME);
  });

  it('CONTROL: no draft yet, no card; no address, no Open link (the card still says Your canvas, v1 · Draft)', async () => {
    state.messages = [canvasRoot(), note()];
    await renderThread();
    await screen.findByRole('button', { name: 'Create canvas' });
    expect(screen.queryByTestId('canvas-draft-card')).not.toBeInTheDocument();
    cleanup();
    state.draft = draftRow({ runCount: 1 });
    await renderThread();
    expect(await screen.findByTestId('canvas-draft-card')).toHaveTextContent('Your canvas');
    expect(screen.getByTestId('canvas-draft-card')).toHaveTextContent('v1 · Draft');
    expect(screen.queryByRole('link', { name: 'Open' })).not.toBeInTheDocument();
  });

  it('CONTROL: not while a run is going', async () => {
    state.messages = [canvasRoot(), note()];
    state.draft = draftRow({ runCount: 1 });
    state.run = runRow();
    await renderThread();
    await screen.findByTestId('canvas-progress');
    expect(screen.queryByTestId('canvas-draft-card')).not.toBeInTheDocument();
  });
});

describe('B10 D6: the running state', () => {
  it('has a spinner and the step, nothing else, and is not faded', () => {
    render(<CanvasThreadBar {...{ draft: draftRow(), run: runRow(), running: true, items: FILE_ITEMS, askedAfterPublish: false, busy: null, notice: null, onRun: vi.fn(), onPublish: vi.fn(), onStartNew: vi.fn() } as BarProps} />);
    const progress = screen.getByTestId('canvas-progress');
    expect(progress.querySelector('svg.animate-spin')).not.toBeNull();
    expect(progress.textContent).toBe('Creating your canvas…');
    expect(progress.className).not.toContain('animate-pulse');
    expect(progress.className).not.toMatch(/opacity|text-muted-foreground\/|text-foreground\//);
  });

  it('CONTROL: the publishing state does not promise a draft is going', () => {
    render(<CanvasThreadBar {...{ draft: draftRow({ runCount: 1 }), run: null, running: false, items: FILE_ITEMS, askedAfterPublish: false, busy: 'publish', notice: null, onRun: vi.fn(), onPublish: vi.fn(), onStartNew: vi.fn() } as BarProps} />);
    expect(screen.getByTestId('canvas-progress')).toHaveTextContent('Publishing…');
    expect(screen.getByTestId('canvas-progress')).not.toHaveTextContent('keeps going');
  });
});


describe('the checklist at thread level (rows by status)', () => {
  const link = (id: string, body: string, createdAt: string) => msg({ id, body, createdAt });
  const BEFORE = '2026-10-27T09:00:00.000Z';
  const RUN_AT = '2026-10-27T10:00:00.000Z';
  const AFTER = '2026-10-27T11:00:00.000Z';
  const doneRun = () => runRow({ state: 'done', createdAt: RUN_AT, startedAt: RUN_AT });

  it('a link before any run is a neutral dot with its host; notes are one row with a count', async () => {
    state.messages = [
      canvasRoot(),
      link('l1', 'https://www.example.com/offer', BEFORE),
      link('n1', 'I sell bookkeeping to cafe owners', BEFORE),
      link('n2', 'Mostly one-shop owners. See https://example.org too', BEFORE),
    ];
    await renderThread();
    const list = await screen.findByTestId('canvas-material');
    expect(rowsOf(list)).toEqual([
      ['pending', 'example.com'],
      ['pending', 'example.org'],
      ['pending', '2 messages from you'],
    ]);
    expect(screen.getByRole('button', { name: 'Create canvas' })).toBeInTheDocument();
  });

  it('a message that is only a link is a link, not a note', async () => {
    state.messages = [canvasRoot(), link('l1', 'https://example.com', BEFORE)];
    await renderThread();
    const list = await screen.findByTestId('canvas-material');
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list).not.toHaveTextContent('message from you');
    expect(screen.getByRole('button', { name: 'Create canvas' })).toBeInTheDocument();
  });

  it('after a finished run a link is "read" when the run kept its text and "couldn\'t read" when it did not', async () => {
    state.messages = [canvasRoot(), link('l1', 'https://example.com/a', BEFORE), link('l2', 'https://example.org/b', BEFORE)];
    state.material = [{ id: 'm-link', kind: 'link', label: 'https://example.com/a', chars: 500, createdAt: '2026-10-27T10:00:07.000Z' }];
    state.run = doneRun();
    state.draft = draftRow({ runCount: 1 });
    await renderThread();
    // a finished canvas with nothing new: ready, no list, no create action
    expect(await screen.findByTestId('canvas-draft-card')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-material')).not.toBeInTheDocument();
    // new input after the run brings the list back, with both outcomes
    state.messages = [...state.messages, link('n3', 'One more thing: my price went up', AFTER)];
    state.draft = draftRow({ runCount: 1 });
    cleanup();
    await renderThread();
    const list = await screen.findByTestId('canvas-material');
    expect(rowsOf(list)).toEqual([
      ['read', 'example.com'],
      ['failed', "example.org · couldn't read, the page did not open"],
      ['pending', '1 message from you'],
    ]);
  });

  it('a link written after the last run is still pending; a failed run did not try the links', async () => {
    state.messages = [canvasRoot(), link('l1', 'https://example.com/a', BEFORE), link('l2', 'https://example.org/b', AFTER)];
    state.material = [{ id: 'm-link', kind: 'link', label: 'https://example.com/a', chars: 500, createdAt: '2026-10-27T10:00:07.000Z' }];
    state.run = doneRun();
    state.draft = draftRow({ runCount: 0 });
    await renderThread();
    const list = await screen.findByTestId('canvas-material');
    expect(rowsOf(list)).toEqual([
      ['read', 'example.com'],
      ['pending', 'example.org'],
    ]);

    cleanup();
    state.run = runRow({ state: 'failed', createdAt: RUN_AT, startedAt: RUN_AT });
    state.material = [];
    await renderThread();
    expect(rowsOf(await screen.findByTestId('canvas-material'))[0]).toEqual(['pending', 'example.com']);
  });

  it('a file row is "read"; a long list scrolls inside itself', async () => {
    state.material = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, kind: 'file' as const, label: `file-${i}.pdf`, chars: 10, createdAt: '2026-10-27T08:00:00.000Z' }));
    await renderThread();
    const list = await screen.findByTestId('canvas-material');
    expect(within(list).getAllByRole('listitem')).toHaveLength(12);
    expect(rowsOf(list)[0]).toEqual(['read', 'file-0.pdf']);
    expect(list.className).toContain('max-h-');
    expect(list.className).toContain('overflow-y-auto');
  });

  it('a finished canvas: the draft card with Open and Publish; Update draft shows only once something new was added', async () => {
    state.messages = [canvasRoot(), note()];
    state.draft = draftRow({ runCount: 1, canvasName: 'canvas', versionName: 'canvas_dabc12' });
    state.run = runRow({ state: 'done', createdAt: AFTER, startedAt: AFTER });
    svc.getCanvasDraftViewPath.mockResolvedValue('/p/test-user/canvas/canvas?v=canvas_dabc12');
    await renderThread();
    expect(await screen.findByTestId('canvas-draft-card')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Open' })).toHaveAttribute('href', '/p/test-user/canvas/canvas?v=canvas_dabc12&thread=root-1');
    expect(screen.getByRole('link', { name: 'Open' }).className).toContain('bg-blue-600');
    expect(screen.getByRole('button', { name: 'Publish' }).className).not.toContain('bg-blue-600');
    expect(screen.queryByRole('button', { name: 'Update draft' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create canvas' })).not.toBeInTheDocument();

    cleanup();
    state.messages = [canvasRoot(), note(), link('n9', 'Also: I now offer yearly plans', new Date(Date.parse(AFTER) + 60_000).toISOString())];
    await renderThread();
    const update = await screen.findByRole('button', { name: 'Update draft' });
    expect(update.className).not.toContain('bg-blue-600'); // Update draft is an outline: its look follows its meaning, and Publish is the filled action
    expect(screen.getByRole('link', { name: 'Open' }).className).not.toContain('bg-blue-600');
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
  });
});

describe('the tray by state (bar level)', () => {
  const base: BarProps = {
    draft: draftRow(), run: null, running: false, items: [], newInput: false, askedAfterPublish: false, busy: null, notice: null,
    onRun: vi.fn(), onPublish: vi.fn(), onStartNew: vi.fn(),
  };
  const row = (over: Partial<CanvasItemRow>): CanvasItemRow => ({ key: 'r', kind: 'file', label: 'offer.pdf', status: 'read', ...over });
  const buttons = () => within(screen.getByTestId('canvas-bar')).queryAllByRole('button').map((b) => b.textContent);

  it('an empty draft shows no tray at all: no sheet, no list, no create action', () => {
    const { container } = render(<Surface {...base} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('the tray is a separate sheet above the input: muted background, a border and rounded corners all round, a shadow', () => {
    render(<Surface {...base} items={[row({})]} />);
    const cls = screen.getByTestId('canvas-bar').className;
    expect(cls).toContain('bg-muted');
    expect(cls).toMatch(/\bborder\b/);
    expect(cls).toMatch(/\brounded-xl\b/);
    expect(cls).not.toContain('rounded-t-');
    expect(cls).toMatch(/shadow/);
  });

  // Icon + label only: a row says nothing about "read" or "will be read" (founder, 2026-10-27).
  it.each([
    ['reading', row({ status: 'reading' }), 'offer.pdf', 'Reading'],
    ['read', row({ status: 'read' }), 'offer.pdf', 'Done'],
    ['failed', row({ status: 'failed', reason: 'no text found in it' }), "offer.pdf · couldn't read, no text found in it", 'Problem'],
    ['link pending', row({ kind: 'link', label: 'example.com', status: 'pending' }), 'example.com', 'Waiting'],
    ['link read', row({ kind: 'link', label: 'example.com', status: 'read' }), 'example.com', 'Done'],
    ['link failed', row({ kind: 'link', label: 'example.com', status: 'failed', reason: 'the page did not open' }), "example.com · couldn't read, the page did not open", 'Problem'],
    ['notes', row({ kind: 'notes', label: '3 messages from you', status: 'pending' }), '3 messages from you', 'Waiting'],
  ])('row: %s is an icon and a label', (_n, r, text, icon) => {
    render(<Surface {...base} items={[r, row({ key: 'u', label: 'usable.pdf' })]} />);
    const li = within(screen.getByTestId('canvas-material')).getAllByRole('listitem')[0] as HTMLElement;
    expect(li.textContent).toBe(text);
    expect(li.querySelector(`[role="img"][aria-label="${icon}"]`)).not.toBeNull();
  });

  it('the icons: a spinner while reading, a green check when read, a red problem sign when it failed, a neutral dot otherwise', () => {
    render(
      <Surface
        {...base}
        items={[
          row({ key: 'a', status: 'reading' }),
          row({ key: 'b', status: 'read' }),
          row({ key: 'c', status: 'failed' }),
          row({ key: 'd', kind: 'link', label: 'example.com', status: 'pending' }),
        ]}
      />,
    );
    const icon = (n: number) => within(screen.getByTestId('canvas-material')).getAllByRole('listitem')[n]?.querySelector('[role="img"]') as Element;
    expect(icon(0).getAttribute('class')).toContain('animate-spin');
    expect(icon(1).getAttribute('class')).toContain('text-green-');
    expect(icon(2).getAttribute('class')).toContain('text-destructive');
    expect(icon(3).querySelector('.rounded-full')).not.toBeNull();
    // and no row says "read" or "will be read" in words
    expect(screen.getByTestId('canvas-material').textContent?.replace(/couldn't read/g, '')).not.toMatch(/read/i);
  });

  it('the primary appears only with at least one usable item, and is never disabled', () => {
    const { rerender } = render(<Surface {...base} items={[row({ status: 'reading' }), row({ key: 'x', status: 'failed' })]} />);
    expect(buttons()).not.toContain('Create canvas');
    rerender(<Surface {...base} items={[row({ status: 'read' })]} />);
    const create = screen.getByRole('button', { name: 'Create canvas' });
    expect(create).not.toBeDisabled();
    expect(create).not.toHaveAttribute('aria-disabled', 'true');
    rerender(<Surface {...base} items={[row({ kind: 'notes', label: '1 message from you', status: 'pending' })]} />);
    expect(screen.getByRole('button', { name: 'Create canvas' })).toBeInTheDocument();
  });

  it('Create canvas for a new canvas; Create new version alone for a draft with a base version; either starts the draft with no speed', () => {
    const items = [row({})];
    const onRun = vi.fn();
    const { rerender } = render(<Surface {...base} items={items} onRun={onRun} />);
    expect(buttons()).toEqual(['Create canvas']);
    rerender(<Surface {...base} items={items} onRun={onRun} draft={draftRow({ baseVersionId: 'ver-base' })} />);
    expect(buttons()).toEqual(['Create new version']);
    fireEvent.click(screen.getByRole('button', { name: 'Create new version' }));
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun).toHaveBeenLastCalledWith();
  });

  it('running or creating: the tray is only a spinner and "Creating your canvas…"', () => {
    render(<Surface {...base} items={[row({})]} running run={runRow()} />);
    const p = screen.getByTestId('canvas-progress');
    expect(p.textContent).toBe('Creating your canvas…');
    expect(p.querySelector('svg')).not.toBeNull();
    expect(screen.getByTestId('canvas-bar').textContent).toBe('Creating your canvas…');
    expect(screen.queryByTestId('canvas-material')).not.toBeInTheDocument();
    expect(buttons()).toEqual([]);
  });

  it('done: the tray is gone and the draft card has Open (primary link) and Publish (outline)', () => {
    const onPublish = vi.fn();
    render(<Surface {...base} items={[row({})]} draft={draftRow({ runCount: 1 })} viewDraftPath="/p/test-user/canvas/canvas?v=x" onPublish={onPublish} />);
    expect(screen.queryByTestId('canvas-bar')).not.toBeInTheDocument();
    const card = screen.getByTestId('canvas-draft-card');
    const open = within(card).getByRole('link', { name: 'Open' });
    expect(open).toHaveAttribute('href', '/p/test-user/canvas/canvas?v=x');
    expect(open.className).toContain('bg-blue-600');
    expect(within(card).queryByRole('link', { name: 'View my canvas' })).not.toBeInTheDocument();
    const publish = within(card).getByRole('button', { name: 'Publish' });
    expect(publish.className).not.toContain('bg-blue-600');
    expect(publish.className).toContain('border');
    fireEvent.click(publish);
    expect(onPublish).toHaveBeenCalled();
    expect(primaries()).toEqual(['Open']);
    expect(screen.queryByTestId('canvas-material')).not.toBeInTheDocument();
  });

  it('more material after a finished draft: the tray comes back with "Update draft" (an outline), and Open is an outline too', () => {
    render(<Surface {...base} items={[row({})]} newInput draft={draftRow({ runCount: 1 })} viewDraftPath="/p/test-user/canvas/canvas?v=x" />);
    expect(buttons()).toEqual(['Update draft']);
    expect(primaries()).toEqual([]);
  });

  it('published: the prompt to start a new version stays; there is no discard anywhere on the strip', () => {
    render(<Surface {...base} draft={draftRow({ state: 'published', runCount: 1 })} askedAfterPublish />);
    expect(screen.getByText('This version is published. Start a new version?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start a new version' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Discard draft' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('canvas-draft-card')).not.toBeInTheDocument();
  });
});


/**
 * Final review (round 5). Times: BEFORE 09:00 < RUN_AT 10:00 < MID 10:30 < AFTER 11:00 < LATER 12:00.
 */
const BEFORE = '2026-10-27T09:00:00.000Z';
const RUN_AT = '2026-10-27T10:00:00.000Z';
const MID = '2026-10-27T10:30:00.000Z';
const AFTER = '2026-10-27T11:00:00.000Z';
const typed = (at: string, body: string, id = `m-${at}`) => msg({ id, body, createdAt: at });
const runAt = (at: string, over: Partial<CanvasDraftRun> = {}) => runRow({ createdAt: at, startedAt: at, ...over });
const material = (over: Partial<CanvasMaterialItem> = {}): CanvasMaterialItem => ({ id: 'mat-1', kind: 'file', label: 'offer.pdf', chars: 900, createdAt: MID, ...over });
const bluePrimaries = () => [...screen.queryAllByRole('button'), ...screen.queryAllByRole('link')].filter((b) => b.className.includes('bg-blue-600')).map((b) => b.getAttribute('aria-label') ?? b.textContent);

describe('C1: freshness is judged against the last successful DRAFT run only', () => {
  it('a file read (extract run) after a link was written does not turn the link into "couldn\'t read"', async () => {
    state.messages = [canvasRoot(), typed(BEFORE, 'https://example.com/a', 'l1')];
    state.run = runAt(AFTER, { kind: 'extract', state: 'done' });
    await renderThread();
    const list = await screen.findByTestId('canvas-material');
    expect(rowsOf(list)).toEqual([['pending', 'example.com']]);
    expect(list).not.toHaveTextContent("couldn't read");
  });

  it('nor does a finished tension run', async () => {
    state.messages = [canvasRoot(), typed(BEFORE, 'https://example.com/a', 'l1')];
    state.run = runAt(AFTER, { kind: 'tensions', state: 'done' });
    await renderThread();
    expect(await screen.findByTestId('canvas-material')).not.toHaveTextContent("couldn't read");
  });

  it('a file read after the canvas was made keeps Update offered for notes written between the two', async () => {
    state.messages = [canvasRoot(), typed(MID, 'Raise the price to 60')];
    state.draft = draftRow({ runCount: 1 });
    state.lastDone = RUN_AT;
    state.run = runAt(AFTER, { kind: 'extract', state: 'done' });
    await renderThread();
    expect(await screen.findByRole('button', { name: 'Update draft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
  });

  it('final review: when the last-draft lookup FAILS, newer notes still offer Update (unknown is not "nothing new")', async () => {
    state.messages = [canvasRoot(), typed(MID, 'Raise the price to 60')];
    state.draft = draftRow({ runCount: 1 });
    state.run = runAt(AFTER, { kind: 'extract', state: 'done' });
    svc.countDoneCanvasDraftRuns.mockResolvedValue(1);
    svc.getLastDoneCanvasDraftRunAt.mockRejectedValueOnce(new Error('offline'));
    await renderThread();
    expect(await screen.findByRole('button', { name: 'Update draft' })).toBeInTheDocument();
  });

  it('final review: a file uploaded after the canvas is ready shows its reading row (no newer note needed)', async () => {
    state.messages = [canvasRoot(), typed(BEFORE, 'my notes from before the canvas')];
    state.draft = draftRow({ runCount: 1 });
    state.lastDone = RUN_AT;
    state.run = runAt(RUN_AT, { kind: 'draft', state: 'done' });
    svc.uploadCanvasMaterial.mockReturnValueOnce(new Promise(() => undefined));
    await renderThread();
    await screen.findByTestId('canvas-draft-card');
    const input = (await screen.findByTestId('canvas-upload-input')) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'later.pdf', { type: 'application/pdf' })] } });
    });
    expect(rowsOf(screen.getByTestId('canvas-material'))).toContainEqual(['reading', 'later.pdf']);
    // a file still being read is not new input yet: no Update until it is read (Gemini verification)
    expect(screen.queryByRole('button', { name: 'Update draft' })).not.toBeInTheDocument();
  });

  it.each(['failed', 'capped', 'cancelled'] as const)('a %s Update keeps the Update action offered', async (st) => {
    state.messages = [canvasRoot(), typed(MID, 'Raise the price to 60')];
    state.draft = draftRow({ runCount: 1 });
    state.lastDone = RUN_AT;
    state.run = runAt(AFTER, { kind: 'draft', state: st });
    svc.countDoneCanvasDraftRuns.mockResolvedValue(1);
    await renderThread();
    expect(await screen.findByRole('button', { name: 'Update draft' })).toBeInTheDocument();
    // the run's own note is said too (a cancelled run says nothing)
    // visual QA 2026-10-29: the tray says only what is true of every failure (some post no reply: a dead run, the item limit),
    // so it never contradicts the mirror's reply ("did not finish" beside "could not draft" did)
    // a draft is on screen, so a failed Update says the draft is unchanged, never "no draft" (Gemini, review r9)
    if (st === 'failed') expect(screen.getByText('Your draft was not changed. Try again.')).toBeInTheDocument();
    expect(screen.queryByText('No draft was made. Try again.')).not.toBeInTheDocument();
    if (st === 'capped') expect(screen.getByText("Canvas drafting has reached today's limit. Try again tomorrow.")).toBeInTheDocument();
  });

  it('a failed FIRST draft says no draft was made (CONTROL for the Update wording above)', async () => {
    state.messages = [canvasRoot(), typed(MID, 'We sell bread boxes')];
    state.draft = draftRow({ runCount: 0 });
    state.run = runAt(AFTER, { kind: 'draft', state: 'failed' });
    svc.countDoneCanvasDraftRuns.mockResolvedValue(0);
    await renderThread();
    expect(await screen.findByText('No draft was made. Try again.')).toBeInTheDocument();
    expect(screen.queryByText('Your draft was not changed. Try again.')).not.toBeInTheDocument();
  });

  it('CONTROL: with nothing new since the last canvas, a failed Update offers no Update (Publish stays)', async () => {
    state.messages = [canvasRoot(), typed(BEFORE, 'my first notes')];
    state.draft = draftRow({ runCount: 1 });
    state.lastDone = RUN_AT;
    state.run = runAt(AFTER, { kind: 'draft', state: 'failed' });
    await renderThread();
    expect(await screen.findByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update draft' })).not.toBeInTheDocument();
  });

  it('a link is "couldn\'t read" only after a successful draft run that started after it; a later link is still pending', async () => {
    state.messages = [canvasRoot(), typed(BEFORE, 'https://example.com/a', 'l1'), typed(MID, 'https://example.org/b', 'l2')];
    state.draft = draftRow({ runCount: 1 });
    state.lastDone = RUN_AT;
    state.run = runAt(AFTER, { kind: 'draft', state: 'failed' });
    await renderThread();
    const list = await screen.findByTestId('canvas-material');
    expect(rowsOf(list)).toEqual([
      ['failed', "example.com · couldn't read, the page did not open"],
      ['pending', 'example.org'],
    ]);
  });
});

describe('C2: persisted material counts after a reload', () => {
  const finished = () => {
    state.draft = draftRow({ runCount: 1 });
    state.run = runAt(RUN_AT, { kind: 'draft', state: 'done' });
  };

  it('a file kept after the canvas was made, whose own run did not finish well, offers Update with no tab-local upload at all', async () => {
    // v6 (P1536 B2): a file is kept by its own run, so after a FINISHED newest run no file is new; it is new when that run failed
    state.draft = draftRow({ runCount: 1 });
    state.lastDone = RUN_AT;
    state.run = runAt(AFTER, { kind: 'message', state: 'failed' });
    state.material = [material({ createdAt: MID })];
    await renderThread();
    expect(await screen.findByRole('button', { name: 'Update draft' })).toBeInTheDocument();
    expect(rowsOf(screen.getByTestId('canvas-material'))).toEqual([['read', 'offer.pdf']]);
  });

  it('CONTROL: a file kept before the canvas was made does not', async () => {
    finished();
    state.material = [material({ createdAt: BEFORE })];
    await renderThread();
    await screen.findByTestId('canvas-draft-card');
    expect(screen.queryByRole('button', { name: 'Update draft' })).not.toBeInTheDocument();
  });

  it('CONTROL: a link the run itself kept (stored while it ran) is not new input', async () => {
    finished();
    state.material = [material({ kind: 'link', label: 'https://example.com/a', createdAt: '2026-10-27T10:00:07.000Z' })];
    await renderThread();
    await screen.findByTestId('canvas-draft-card');
    expect(screen.queryByRole('button', { name: 'Update draft' })).not.toBeInTheDocument();
  });
});

describe('C3: typing changes only the send slot (rule 9): no tray or card control changes look', () => {
  const type = (text: string) => fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
  const sorted = (xs: string[]) => [...xs].sort();

  it.each([
    ['Create', () => { state.messages = [canvasRoot(), note()]; }, 'Create canvas'],
    ['Create new version', () => { state.messages = [canvasRoot(), note()]; state.draft = draftRow({ baseVersionId: 'ver-base' }); }, 'Create new version'],
    ['Open', () => { state.messages = [canvasRoot(), note()]; state.draft = draftRow({ runCount: 1, canvasName: 'canvas', versionName: 'canvas_dabc12' }); state.run = runAt(AFTER, { state: 'done' }); svc.getCanvasDraftViewPath.mockResolvedValue('/p/test-user/canvas/canvas?v=canvas_dabc12'); }, 'Open'],
  ])('%s: it keeps its look while text is typed; only Send appears (and goes when the field is cleared)', async (_n, setup, label) => {
    setup();
    await renderThread();
    const role = label === 'Open' ? 'link' : 'button';
    const control = await screen.findByRole(role, { name: label });
    const look = control.className;
    expect(bluePrimaries()).toEqual([label]);
    type('and one more thing');
    expect(sorted(bluePrimaries())).toEqual(sorted([label, 'Send']));
    expect(screen.getByRole(role, { name: label })).toBe(control);
    expect(control.className).toBe(look);
    type('');
    expect(bluePrimaries()).toEqual([label]);
    expect(control.className).toBe(look);
  });

  it('"Start a new version" keeps its look while text is typed; only Send appears', async () => {
    state.draft = draftRow({ state: 'published', runCount: 1, closedAt: '2026-10-26T10:00:00.000Z' });
    state.messages = [canvasRoot(), msg({ id: 'ask', body: 'Raise the price', createdAt: '2026-10-26T11:00:00.000Z' })];
    await renderThread();
    const control = await screen.findByRole('button', { name: 'Start a new version' });
    const look = control.className;
    expect(bluePrimaries()).toEqual(['Start a new version']);
    type('more');
    expect(sorted(bluePrimaries())).toEqual(sorted(['Start a new version', 'Send']));
    expect(control.className).toBe(look);
  });

  it('the gate fixture, with text in its composer, adds exactly Send to the filled controls in every phase (nothing else changes)', () => {
    for (const phase of ['empty', 'ready', 'update', 'drafted', 'revising', 'asked', 'failed', 'links']) {
      const { unmount } = render(<MemoryRouter initialEntries={[`/tree/_gate/canvas-thread?phase=${phase}`]}><GateFixture /></MemoryRouter>);
      const before = bluePrimaries();
      type('a note typed in the composer');
      expect(sorted(bluePrimaries())).toEqual(sorted([...before, 'Send']));
      unmount();
      clearDraftsExcept(null);
    }
  });
});

describe('C4: a draft with a base version has one create button, revisions included', () => {
  const base: BarProps = {
    draft: draftRow({ baseVersionId: 'ver-base', runCount: 1 }), run: null, running: false, items: FILE_ITEMS, newInput: true,
    askedAfterPublish: false, busy: null, notice: null, onRun: vi.fn(), onPublish: vi.fn(), onStartNew: vi.fn(),
  };

  it('a revision of a finished update offers Update draft and nothing else to press', () => {
    const onRun = vi.fn();
    render(<MemoryRouter><CanvasThreadBar {...base} onRun={onRun} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Decide for me' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update draft' }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: a first canvas (no base version) has no Decide for me, revising or not', () => {
    render(<MemoryRouter><CanvasThreadBar {...base} draft={draftRow({ baseVersionId: null, runCount: 1 })} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Decide for me' })).not.toBeInTheDocument();
  });
});

describe('C5: a canvas thread is known to the mirror before its first message is sent', () => {
  it('Start a new version registers the new thread before the carried message goes out', async () => {
    state.draft = draftRow({ state: 'published', runCount: 1, closedAt: '2026-10-26T10:00:00.000Z' });
    state.messages = [canvasRoot(), msg({ id: 'ask', body: 'Raise the price to 60', createdAt: '2026-10-26T11:00:00.000Z' })];
    const seen: boolean[] = [];
    svc.sendCanvasWorkspaceMessage.mockImplementation(async () => {
      seen.push(isCanvasThread('root-new'));
      return { ok: true, runId: 'run-c', revision: 3, draftId: 'draft-new', start: null };
    });
    await renderThread();
    fireEvent.click(await screen.findByRole('button', { name: 'Start a new version' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/t/root-new'));
    expect(seen).toEqual([true]);
  });

  it('continuing a draft that is open elsewhere registers that thread too, and an ordinary one is never registered', async () => {
    state.draft = draftRow({ state: 'published', runCount: 1, closedAt: '2026-10-26T10:00:00.000Z' });
    state.messages = [canvasRoot(), msg({ id: 'ask', body: 'Raise the price', createdAt: '2026-10-26T11:00:00.000Z' })];
    svc.openCanvasDraft.mockResolvedValue({ status: 'open_elsewhere', draftId: 'draft-open', revision: 2, canvasId: 'cv-1', conversationId: MIRROR_ID, threadRootId: 'root-open', canvasName: 'canvas', fromSeq: 1 });
    await renderThread();
    resetCanvasThreads();
    fireEvent.click(await screen.findByRole('button', { name: 'Start a new version' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Continue it there' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/t/root-open'));
    expect(isCanvasThread('root-open')).toBe(true);
    expect(isCanvasThread('some-plain-thread')).toBe(false);
  });
});

describe('V1 to V3, V6, V9: small visual fixes on the tray', () => {
  const base: BarProps = {
    draft: draftRow(), run: null, running: false, items: [], newInput: false, askedAfterPublish: false, busy: null, notice: null,
    onRun: vi.fn(), onPublish: vi.fn(), onStartNew: vi.fn(),
  };

  it('V1: the draft menu waits until the draft has an item, a note or a run (canDiscardDraft)', () => {
    expect(canDiscardDraft(base)).toBe(false);
    expect(canDiscardDraft({ ...base, items: FILE_ITEMS })).toBe(true);
    expect(canDiscardDraft({ ...base, items: [{ key: 'notes', kind: 'notes', label: '1 message from you', status: 'pending' }] })).toBe(true);
    expect(canDiscardDraft({ ...base, run: runRow({ state: 'failed' }) })).toBe(true);
    expect(canDiscardDraft({ ...base, draft: draftRow({ runCount: 1 }) })).toBe(true);
    // never while a run or a request goes, nor on a closed draft
    expect(canDiscardDraft({ ...base, items: FILE_ITEMS, running: true })).toBe(false);
    expect(canDiscardDraft({ ...base, items: FILE_ITEMS, busy: 'publish' })).toBe(false);
    expect(canDiscardDraft({ ...base, items: FILE_ITEMS, draft: draftRow({ state: 'published' }) })).toBe(false);
  });

  it('V2: a link that is waiting is a neutral dot and its host, and says nothing about creating', () => {
    render(<Surface {...base} items={[{ key: 'l', kind: 'link', label: 'example.com', status: 'pending' }]} />);
    expect(screen.getByRole('listitem').textContent).toBe('example.com');
  });

  it('V3: the create button is at least 40px high and the same text size as the other buttons', () => {
    render(<Surface {...base} items={FILE_ITEMS} draft={draftRow({ baseVersionId: 'ver-base' })} />);
    const create = screen.getByRole('button', { name: 'Create new version' });
    expect(create.className).toMatch(/min-h-1[01]/);
    expect(create.className).not.toContain('text-xs');
    expect(create.className).not.toMatch(/\bh-8\b/);
  });

  it('V6: Open is a button-sized link of at least 40px, not a bare text link', () => {
    render(<Surface {...base} items={FILE_ITEMS} draft={draftRow({ runCount: 1 })} viewDraftPath="/p/test-user/canvas/canvas?v=x" />);
    const view = screen.getByRole('link', { name: 'Open' });
    expect(view.className).toMatch(/min-h-1[01]/);
    expect(view.className).not.toContain('hover:underline');
  });

  it('V9: the Upload button keeps a static plus while a file reads; the one spinner is the checklist row, in the same colour as the progress spinner', () => {
    const { unmount } = render(<MemoryRouter><CanvasUploadButton busy onPick={vi.fn()} /></MemoryRouter>);
    const upload = screen.getByTestId('canvas-upload');
    expect(upload.querySelector('.animate-spin')).toBeNull();
    expect(upload.querySelector('svg')).not.toBeNull();
    unmount();
    const row = render(<Surface {...base} items={[{ key: 'u', kind: 'file', label: 'a.pdf', status: 'reading' }]} />);
    const listSpinner = row.container.querySelector('.animate-spin') as Element;
    row.unmount();
    const prog = render(<Surface {...base} items={FILE_ITEMS} running run={runRow()} />);
    const progSpinner = prog.container.querySelector('.animate-spin') as Element;
    const colour = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter((c) => c.startsWith('text-')).join(' ');
    expect(colour(listSpinner)).not.toBe('');
    expect(colour(progSpinner)).toBe(colour(listSpinner));
  });
});

describe('V4: the opener never folds, whatever the owner has sent', () => {
  it('shows the message and the steps card for an empty thread, and still after the first note', async () => {
    await renderThread();
    expect(await screen.findByTestId('canvas-opener-ask')).toHaveTextContent(CANVAS_OPENER_ASK);
    expect(screen.getByTestId('canvas-opener-steps')).toBeInTheDocument();
    cleanup();
    state.messages = [canvasRoot(), note()];
    await renderThread();
    const opener = await screen.findByTestId('canvas-opener');
    expect(opener).toHaveTextContent('your website link');
    expect(opener).toHaveTextContent('Want to save time?');
    expect(screen.getByTestId('canvas-opener-steps')).toBeInTheDocument();
    expect(within(opener).getByRole('button', { name: 'Copy prompt' })).toBeInTheDocument();
  });

  it('a file already kept does not fold it either', async () => {
    state.material = [material()];
    await renderThread();
    expect(await screen.findByTestId('canvas-opener')).toHaveTextContent('Want to save time?');
  });
});

describe('v2: the thread header says what the thread makes', () => {
  it('a new canvas is "New canvas": no link, and the old "Thread" title is gone', async () => {
    await renderThread();
    const title = await screen.findByTestId('canvas-thread-title');
    expect(title.tagName).toBe('H2');
    expect(title.textContent).toBe('New canvas');
    expect(within(title).queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Thread' })).not.toBeInTheDocument();
  });

  it('an update is "New version · <Canvas title>", and the canvas title links to that canvas\'s page', async () => {
    state.draft = draftRow({ baseVersionId: 'ver-base', canvasName: 'hiring_plan_for_q1' });
    await renderThread();
    const title = await screen.findByTestId('canvas-thread-title');
    expect(title.textContent).toBe('New version · Hiring plan for q1');
    expect(within(title).getByRole('link', { name: 'Hiring plan for q1' })).toHaveAttribute('href', '/p/test-user/canvas/hiring_plan_for_q1');
  });

  it('CONTROL: without a known owner slug the title is plain text, never a link; a database name is encoded so the link cannot leave the canvas route', async () => {
    authorSlug = null;
    state.draft = draftRow({ baseVersionId: 'ver-base', canvasName: 'hiring_plan' });
    await renderThread();
    const title = await screen.findByTestId('canvas-thread-title');
    expect(title.textContent).toBe('New version · Hiring plan');
    expect(within(title).queryByRole('link')).not.toBeInTheDocument();
    cleanup();
    authorSlug = 'test-user';
    state.draft = draftRow({ baseVersionId: 'ver-base', canvasName: 'a/b' });
    await renderThread();
    expect(within(await screen.findByTestId('canvas-thread-title')).getByRole('link')).toHaveAttribute('href', '/p/test-user/canvas/a%2Fb');
  });

  it('CONTROL: an ordinary mirror thread keeps its "Thread" header and has no draft menu', async () => {
    state.messages = [msg({ id: ROOT, body: 'a plain thought', threadRootId: null })];
    await renderThread();
    expect(screen.getByRole('heading', { name: 'Thread' })).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-thread-title')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Canvas draft options' })).not.toBeInTheDocument();
  });

  it('while drafting is off the header stays "Thread" (nothing of the draft shows)', async () => {
    state.available = false;
    await renderThread();
    await waitFor(() => expect(svc.getCanvasDraftAvailability).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.getByRole('heading', { name: 'Thread' })).toBeInTheDocument();
  });
});

describe('v2: the top of the thread', () => {
  const hidden = () => screen.getByTestId('message-list').getAttribute('data-hidden-root');

  it('a new canvas has no card at the top: its root (the draft\'s own version) is kept out of the list', async () => {
    await renderThread();
    await screen.findByTestId('canvas-opener');
    expect(hidden()).toBe(ROOT);
  });

  it('an update keeps its root: the base version as a canvas card', async () => {
    state.draft = draftRow({ baseVersionId: 'ver-base' });
    await renderThread();
    await screen.findByTestId('canvas-opener');
    expect(hidden()).toBe('');
  });

  it('CONTROL: with drafting off nothing is hidden, and an ordinary thread hides nothing', async () => {
    state.available = false;
    await renderThread();
    await waitFor(() => expect(svc.getCanvasDraftAvailability).toHaveBeenCalled());
    await act(async () => {});
    expect(hidden()).toBe('');
    cleanup();
    state.available = true;
    state.messages = [msg({ id: ROOT, body: 'a plain thought', threadRootId: null })];
    await renderThread();
    expect(hidden()).toBe('');
  });
});

describe('v2: the tray is hidden until something was added, then a separate sheet', () => {
  it('no items: no tray; one note: the tray appears with "1 message from you" and Create canvas', async () => {
    await renderThread();
    await screen.findByTestId('canvas-opener');
    expect(screen.queryByTestId('canvas-bar')).not.toBeInTheDocument();
    cleanup();
    state.messages = [canvasRoot(), note()];
    await renderThread();
    const tray = await screen.findByTestId('canvas-bar');
    expect(tray.className).toContain('bg-muted');
    expect(within(tray).getByTestId('canvas-material')).toHaveTextContent('1 message from you');
    expect(within(tray).getByRole('button', { name: 'Create canvas' })).toBeInTheDocument();
  });

  it('rows are icon plus label: a file being read spins, a read file is checked, a failed one says why', async () => {
    svc.uploadCanvasMaterial.mockResolvedValueOnce({ ok: false, code: 'UNSUPPORTED' });
    state.material = [{ id: 'm1', kind: 'file', label: 'offer.pdf', chars: 900, createdAt: '2026-10-27T08:00:00.000Z' }];
    await renderThread();
    const list = await screen.findByTestId('canvas-material');
    const first = within(list).getByRole('listitem');
    expect(first.textContent).toBe('offer.pdf');
    expect(first.querySelector('[class*="text-green-"]')).not.toBeNull();
    const input = (await screen.findByTestId('canvas-upload-input')) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'weird.xyz')] } });
    });
    expect(rowsOf(screen.getByTestId('canvas-material'))).toEqual([
      ['read', 'offer.pdf'],
      ['failed', "weird.xyz · couldn't read, this kind of file is not supported"],
    ]);
  });

  it('creating: the tray is only a spinner and "Creating your canvas…", and it survives a reload (the run is read from the database)', async () => {
    state.messages = [canvasRoot(), note()];
    state.run = runRow();
    await renderThread();
    const tray = await screen.findByTestId('canvas-bar');
    expect(tray.textContent).toBe('Creating your canvas…');
    expect(within(tray).queryAllByRole('button')).toEqual([]);
  });
});

describe('v2: the input row order', () => {
  it('paperclip first, then Upload, then the text field', () => {
    render(<Composer draftKey="order" placeholder="Reply" onSend={vi.fn()} onAttach={vi.fn()} leading={<CanvasUploadButton busy={false} onPick={vi.fn()} />} />);
    const clip = screen.getByRole('button', { name: 'Attach a point or story' });
    const upload = screen.getByTestId('canvas-upload');
    const field = screen.getByRole('textbox');
    const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(clip, upload)).toBe(true);
    expect(before(upload, field)).toBe(true);
  });

  it('the gate fixture\'s composer has the same order', () => {
    render(<MemoryRouter initialEntries={['/tree/_gate/canvas-thread?phase=ready']}><GateFixture /></MemoryRouter>);
    const clip = screen.getByRole('button', { name: 'Attach a point or story' });
    expect(clip.compareDocumentPosition(screen.getByTestId('canvas-upload')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('v2: the Copy prompt button keeps one look always (D3: an outline)', () => {
  const copyButton = () => screen.getByRole('button', { name: 'Copy prompt' });

  it('an outline in an empty thread and while the owner writes: it never fills, so typing changes only Send', async () => {
    await renderThread();
    await screen.findByTestId('canvas-opener-steps');
    const look = copyButton().className;
    expect(look).not.toContain('bg-blue-600');
    expect(bluePrimaries()).toEqual([]);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'my first note' } });
    expect(copyButton().className).toBe(look);
    expect(bluePrimaries()).toEqual(['Send']);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    expect(bluePrimaries()).toEqual([]);
  });

  it('says Copied after the click', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(async () => undefined) } });
    try {
      await renderThread();
      await act(async () => {
        fireEvent.click(await screen.findByRole('button', { name: 'Copy prompt' }));
      });
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    } finally {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    }
  });

  it('the gate fixture: Copy prompt is an outline in every phase that shows it, and no phase has two filled controls', () => {
    for (const phase of ['empty', 'update-empty', 'ready', 'update', 'drafted']) {
      const { unmount } = render(<MemoryRouter initialEntries={[`/tree/_gate/canvas-thread?phase=${phase}`]}><GateFixture /></MemoryRouter>);
      expect(screen.getByRole('button', { name: 'Copy prompt' }).className).not.toContain('bg-blue-600');
      expect(bluePrimaries().length).toBeLessThanOrEqual(1);
      unmount();
    }
  });
});

describe('v2: done means the tray is gone and a draft card closes the thread', () => {
  const doneThread = () => {
    state.messages = [canvasRoot(), note()];
    state.draft = draftRow({ runCount: 1, canvasName: 'canvas', versionName: 'canvas_dabc12' });
    state.run = runRow({ state: 'done' });
    svc.getCanvasDraftViewPath.mockResolvedValue('/p/test-user/canvas/canvas?v=canvas_dabc12');
  };

  it('no tray, no create action; the card is after the list with Open (the one primary) and Publish (outline)', async () => {
    doneThread();
    await renderThread();
    const card = await screen.findByTestId('canvas-draft-card');
    expect(screen.queryByTestId('canvas-bar')).not.toBeInTheDocument();
    // it sits at the end of the thread (the list's tail), after the opener
    expect(screen.getByTestId('canvas-opener').compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card).toHaveTextContent('Canvas');
    expect(card).toHaveTextContent('v1 · Draft');
    expect(card).not.toHaveTextContent('Only you can see this');
    const open = await within(card).findByRole('link', { name: 'Open' });
    expect(open.className).toContain('bg-blue-600');
    expect(open).toHaveAttribute('href', '/p/test-user/canvas/canvas?v=canvas_dabc12&thread=root-1');
    expect(within(card).getByRole('button', { name: 'Publish' }).className).not.toContain('bg-blue-600');
    expect(bluePrimaries()).toEqual(['Open']);
  });

  it('more material after the draft: the tray comes back with "Update draft" and Open is an outline too (their looks follow their meaning)', async () => {
    doneThread();
    state.lastDone = RUN_AT;
    state.run = runAt(RUN_AT, { state: 'done' });
    state.messages = [canvasRoot(), typed(BEFORE, 'first notes'), typed(AFTER, 'and a late thought')];
    await renderThread();
    const tray = await screen.findByTestId('canvas-bar');
    const update = within(tray).getByRole('button', { name: 'Update draft' });
    expect(update.className).not.toContain('bg-blue-600');
    expect(screen.getByTestId('canvas-draft-card')).toBeInTheDocument();
    expect(bluePrimaries()).toEqual([]);
  });

  it('Open keeps its look while the owner writes (only Send appears)', async () => {
    doneThread();
    await renderThread();
    await screen.findByTestId('canvas-draft-card');
    const open = await within(screen.getByTestId('canvas-draft-card')).findByRole('link', { name: 'Open' });
    const look = open.className;
    expect(bluePrimaries()).toEqual(['Open']);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'wait, one more thing' } });
    expect([...bluePrimaries()].sort()).toEqual(['Open', 'Send']);
    expect(within(screen.getByTestId('canvas-draft-card')).getByRole('link', { name: 'Open' }).className).toBe(look);
  });

  it('Publish publishes, and the published draft has no card any more', async () => {
    doneThread();
    svc.publishCanvasDraft.mockImplementation(async () => {
      state.draft = draftRow({ state: 'published', runCount: 1, closedAt: new Date().toISOString() });
      return { seq: 1, skippedLinks: 0 };
    });
    await renderThread();
    fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(svc.publishCanvasDraft).toHaveBeenCalledWith('draft-1', 3));
    expect(await screen.findByText('This version is published.')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-draft-card')).not.toBeInTheDocument();
  });
});

describe('C1 (review): no run action while a file is still being read', () => {
  const base: BarProps = {
    draft: draftRow(), run: null, running: false, items: [], askedAfterPublish: false, busy: null, notice: null,
    onRun: vi.fn(), onPublish: vi.fn(), onStartNew: vi.fn(),
  };
  const done = { draft: draftRow({ runCount: 1 }), viewDraftPath: '/p/test-user/canvas/canvas?v=x' };
  const note: CanvasItemRow = { key: 'notes', kind: 'notes', label: '1 message from you', status: 'pending' };
  const reading: CanvasItemRow = { key: 'u1', kind: 'file', label: 'deck.pdf', status: 'reading' };
  const readFile: CanvasItemRow = { ...reading, status: 'read' };
  const actions = () => within(screen.getByTestId('canvas-bar')).queryAllByRole('button').map((b) => b.textContent);

  it('a finished draft with a newer note and a file being read offers no Update draft; the rows stay; once the file is read it returns', () => {
    const { rerender } = render(<Surface {...base} {...done} newInput items={[note, reading]} />);
    expect(actions()).toEqual([]);
    expect(rowsOf(screen.getByTestId('canvas-material'))).toEqual([['pending', '1 message from you'], ['reading', 'deck.pdf']]);
    rerender(<Surface {...base} {...done} newInput items={[note, readFile]} />);
    expect(actions()).toEqual(['Update draft']);
  });

  it.each([
    ['Create canvas', {}],
    ['Create new version', { draft: draftRow({ baseVersionId: 'ver-base' }) }],
  ])('before the first canvas: %s is not offered while a file is being read, and is once it is read', (_name, over) => {
    const { rerender } = render(<Surface {...base} {...over} items={[note, reading]} />);
    expect(actions()).toEqual([]);
    expect(screen.getByTestId('canvas-material')).toBeInTheDocument();
    rerender(<Surface {...base} {...over} items={[note, readFile]} />);
    expect(actions().length).toBeGreaterThan(0);
  });

  it('CONTROL: a failed file is not in progress, so the actions stay', () => {
    render(<Surface {...base} {...done} newInput items={[note, { ...reading, status: 'failed', reason: 'no text found in it' }]} />);
    expect(actions()).toEqual(['Update draft']);
  });
});

describe('V (visual QA): the tray is its own sheet, the actions stack evenly, the card and spinner read right', () => {
  const base: BarProps = {
    draft: draftRow(), run: null, running: false, items: [], askedAfterPublish: false, busy: null, notice: null,
    onRun: vi.fn(), onPublish: vi.fn(), onStartNew: vi.fn(),
  };
  const file: CanvasItemRow = { key: 'f', kind: 'file', label: 'offer.pdf', status: 'read' };
  const classes = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/);

  it('V1: the tray is a separate rounded sheet with a border all round and a gap above the input (nothing flat or open at the bottom)', () => {
    render(<Surface {...base} items={[file]} />);
    const c = classes(screen.getByTestId('canvas-bar'));
    expect(c).toContain('rounded-xl');
    expect(c).not.toContain('rounded-t-xl');
    expect(c).toContain('border');
    expect(c).not.toContain('border-b-0');
    expect(c.some((x) => /^mb-(2|2\.5|3)$/.test(x))).toBe(true);
  });

  it('V1: the running tray is the same sheet', () => {
    render(<Surface {...base} items={[file]} running run={runRow()} />);
    const c = classes(screen.getByTestId('canvas-bar'));
    expect(c).toContain('rounded-xl');
    expect(c).not.toContain('border-b-0');
    expect(c.some((x) => /^mb-(2|2\.5|3)$/.test(x))).toBe(true);
  });

  it('V2: the create button is one flex item, at least 44px high, in a wrapping row with an 8px gap', () => {
    render(<Surface {...base} items={[file]} draft={draftRow({ baseVersionId: 'ver-base' })} />);
    const create = screen.getByRole('button', { name: 'Create new version' });
    expect(classes(create)).toContain('min-h-11');
    const row = create.parentElement as HTMLElement;
    expect(classes(row)).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'gap-2']));
    expect(row.querySelectorAll('button')).toHaveLength(1);
  });

  it('V3: the draft card sits in the message text column (after the avatar), not further in', () => {
    render(<Surface {...base} draft={draftRow({ runCount: 1 })} viewDraftPath="/p/test-user/canvas/canvas?v=x" />);
    const c = classes(screen.getByTestId('canvas-draft-card'));
    // 8px row margin + 8px row padding + 36px avatar + 10px gap = 62px = mx-2 (8) + 54px
    expect(c).toContain('mx-2');
    expect(c).toContain('pl-[3.375rem]');
    expect(c).not.toContain('pl-14');
  });

  it('V7: the spinner is dark enough on the grey tray (the rows, the progress line)', () => {
    const { rerender } = render(<Surface {...base} items={[{ key: 'u', kind: 'file', label: 'a.pdf', status: 'reading' }]} />);
    const rowSpinner = screen.getByRole('img', { name: 'Reading' });
    expect(classes(rowSpinner)).toContain('text-gray-600');
    expect(classes(rowSpinner)).not.toContain('text-muted-foreground');
    rerender(<Surface {...base} items={[file]} running run={runRow()} />);
    const progress = screen.getByTestId('canvas-progress').querySelector('svg') as Element;
    expect(classes(progress)).toContain('text-gray-600');
  });
});

describe('P1536 S1: a run that was made but never started is offered to the owner, not shown as running', () => {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  it('a queued run a moment old is still being claimed: progress shows, no start control', async () => {
    state.messages = [canvasRoot(), note()];
    state.run = runRow({ state: 'queued', startedAt: null, createdAt: ago(2_000) });
    await renderThread();
    expect(await screen.findByTestId('canvas-progress')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start it' })).not.toBeInTheDocument();
  });
  it('a queued run nothing claimed for 30 seconds is waiting: the owner can start it (by id), and no progress is shown', async () => {
    state.messages = [canvasRoot(), note()];
    state.run = runRow({ state: 'queued', startedAt: null, createdAt: ago(30_000) });
    svc.startQueuedCanvasRun.mockResolvedValue({ ok: true, runId: 'run-1', kind: 'message' });
    await renderThread();
    expect(screen.queryByTestId('canvas-progress')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Start it' }));
    await waitFor(() => expect(svc.startQueuedCanvasRun).toHaveBeenCalledWith('draft-1'));
  });
  it('after the server\'s 3 minute lease the run is failed, not waiting: Try again takes over', async () => {
    state.messages = [canvasRoot(), note()];
    state.run = runRow({ state: 'queued', startedAt: null, createdAt: ago(4 * 60_000) });
    await renderThread();
    await screen.findByTestId('canvas-opener');
    expect(screen.queryByRole('button', { name: 'Start it' })).not.toBeInTheDocument();
    // not offered as a start, but the action is there (the run is past waiting): pressing it asks the server, which fails the dead run
    expect(await screen.findByRole('button', { name: 'Create canvas' })).toBeInTheDocument();
  });
  it('and once the server has failed it (abandoned), the same control tries again with a replacement run', async () => {
    state.messages = [canvasRoot(), note()];
    state.run = runRow({ id: 'run-dead', state: 'failed', errorCode: 'abandoned', startedAt: null, createdAt: ago(4 * 60_000) });
    svc.retryCanvasRun.mockResolvedValue({ ok: true, runId: 'run-new', revision: 5, replayed: false, start: { ok: true, runId: 'run-new', kind: 'message' } });
    await renderThread();
    fireEvent.click(await screen.findByRole('button', { name: 'Create canvas' }));
    await waitFor(() => expect(svc.retryCanvasRun).toHaveBeenCalledWith(expect.objectContaining({ failedRunId: 'run-dead' })));
    expect(screen.queryByRole('button', { name: 'Start it' })).not.toBeInTheDocument();
  });
});

describe('P1536 S1: Try again after a failed run makes a replacement run', () => {
  const press = async () => {
    state.messages = [canvasRoot(), note()];
    state.draft = draftRow({ runCount: 0 });
    state.run = runRow({ id: 'run-failed', state: 'failed' });
    await renderThread();
    fireEvent.click(await screen.findByRole('button', { name: 'Create canvas' }));
  };
  it('calls canvas_draft_retry with the failed run, the revision and a fresh client id (not the queued-run start, which finds nothing)', async () => {
    svc.retryCanvasRun.mockResolvedValue({ ok: true, runId: 'run-new', revision: 5, replayed: false, start: { ok: true, runId: 'run-new', kind: 'message' } });
    await press();
    await waitFor(() => expect(svc.retryCanvasRun).toHaveBeenCalledWith({ draftId: 'draft-1', failedRunId: 'run-failed', expectedRevision: 3, clientId: expect.any(String) }));
    expect(svc.startQueuedCanvasRun).not.toHaveBeenCalled();
  });
  it('a refusal is said, not thrown: not_retryable (the file was never kept) has its own sentence', async () => {
    svc.retryCanvasRun.mockResolvedValue({ ok: false, refused: 'not_retryable', revision: 3 });
    await press();
    expect(await screen.findByText('Send it again.')).toBeInTheDocument();
  });
});

describe('P1536 S1: a text message in an open draft\'s thread is sent with canvas_workspace_send', () => {
  const type = (text: string) => fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
  const send = () => fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  it('sends the message and makes its run in one call with the draft\'s id and revision, and not through the chat\'s own send', async () => {
    state.messages = [canvasRoot(), note()];
    await renderThread();
    await screen.findByTestId('canvas-upload');
    type('Raise the price to 60');
    send();
    await waitFor(() => expect(svc.sendCanvasWorkspaceMessage).toHaveBeenCalledTimes(1));
    expect(svc.sendCanvasWorkspaceMessage).toHaveBeenCalledWith(expect.objectContaining({
      canvasId: 'cv-1', expectedDraftId: 'draft-1', expectedRevision: 3, body: 'Raise the price to 60', clientId: expect.any(String),
    }));
    expect(conv.send).not.toHaveBeenCalled();
  });
  it('a refusal hands the text back, re-reads the draft, and the next Send carries the new revision', async () => {
    state.messages = [canvasRoot(), note()];
    svc.sendCanvasWorkspaceMessage.mockResolvedValueOnce({ ok: false, refused: 'stale_view', revision: 9 });
    await renderThread();
    await screen.findByTestId('canvas-upload');
    type('Raise the price to 60');
    state.draft = draftRow({ revision: 9 }); // what the re-read finds
    send();
    await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Raise the price to 60'));
    await waitFor(() => expect(svc.getCanvasDraftByThread.mock.calls.length).toBeGreaterThan(1)); // the draft was read again
    send();
    await waitFor(() => expect(svc.sendCanvasWorkspaceMessage).toHaveBeenCalledTimes(2));
    expect(svc.sendCanvasWorkspaceMessage).toHaveBeenLastCalledWith(expect.objectContaining({ expectedRevision: 9 }));
  });
  it('a published draft\'s thread keeps the chat\'s own send (the next draft is S3\'s)', async () => {
    state.draft = draftRow({ state: 'published', runCount: 1, closedAt: '2026-10-26T10:00:00.000Z' });
    state.messages = [canvasRoot(), note()];
    await renderThread();
    await screen.findByRole('button', { name: 'Start a new version' });
    type('more');
    send();
    await waitFor(() => expect(conv.send).toHaveBeenCalledWith({ body: 'more' }));
    expect(svc.sendCanvasWorkspaceMessage).not.toHaveBeenCalled();
  });
});


describe('review G4: one filled control among the tray, the card and the closed strip, in EVERY state', () => {
  const baseBar: BarProps = {
    draft: draftRow(), run: null, running: false, items: [], newInput: false, askedAfterPublish: false, busy: null, notice: null,
    onRun: vi.fn(), onPublish: vi.fn(), onStartNew: vi.fn(), viewDraftPath: '/p/test-user/canvas/canvas?v=x',
  };
  const read: CanvasItemRow = { key: 'f', kind: 'file', label: 'a.pdf', status: 'read' };
  const reading: CanvasItemRow = { key: 'g', kind: 'file', label: 'b.pdf', status: 'reading' };
  const failed: CanvasItemRow = { key: 'h', kind: 'file', label: 'c.pdf', status: 'failed', reason: 'no text found in it' };

  it('across draft state x run count x items x new input x progress x base x asked-after-publish, at most one control is filled (and Open and Create/Start are never both)', () => {
    let checked = 0;
    for (const state of ['open', 'published', 'discarded'] as const) {
      for (const runCount of [0, 1]) {
        for (const items of [[], [read], [reading], [failed], [read, reading]]) {
          for (const newInput of [false, true]) {
            for (const progress of [{}, { running: true }, { busy: 'run' as const }, { busy: 'publish' as const }]) {
              for (const baseVersionId of [null, 'ver-base']) {
                for (const askedAfterPublish of [false, true]) {
                  for (const draftHasPoints of [true, false]) {
                    const props: BarProps = { ...baseBar, draft: draftRow({ state, runCount, baseVersionId }), items, newInput, askedAfterPublish, draftHasPoints, ...progress };
                    const view = render(<Surface {...props} />);
                    const filled = primaries();
                    expect(filled.length, JSON.stringify({ state, runCount, items: items.map(i => i.status), newInput, progress, baseVersionId, askedAfterPublish, draftHasPoints, filled })).toBeLessThanOrEqual(1);
                    view.unmount();
                    checked += 1;
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(checked).toBe(3 * 2 * 5 * 2 * 4 * 2 * 2 * 2); // the whole grid was walked
  }, 120_000);
});
