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
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
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
import { CanvasUploadButton } from '@/app/pages/chat/CanvasUploadButton';
import { CANVAS_OPENER_ASK } from '@/app/pages/chat/canvas-thread-copy';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { RUN_POLL_MS } from '@/app/pages/chat/use-canvas-thread';
import { clearDraftsExcept } from '@/app/pages/chat/chat-hooks';
import { isCanvasThread, resetCanvasThreads } from '@/app/pages/chat/canvas-thread-registry';
import { useCanvasEntry, useStartCanvas } from '@/app/pages/chat/use-start-canvas';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { GateFixture } from '@/app/tree/_gate/canvas-thread/GateFixture';

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
  const l = useLocation();
  return <p data-testid="where">{l.pathname}{l.search}</p>;
}

function FromProbe() {
  return <output data-testid="from-probe">{(useLocation().state as { from?: string } | null)?.from ?? ''}</output>;
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
  svc.openCanvasDraft.mockResolvedValue({ status: 'opened', draftId: 'draft-new', revision: 2, canvasId: 'cv-1', conversationId: MIRROR_ID, threadRootId: 'root-new', canvasName: 'canvas', versionName: 'canvas_dnew', fromSeq: 1 });
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
    await waitFor(() => expect(svc.getCanvasDraftByThread).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByTestId('canvas-upload')).not.toBeInTheDocument();
  });

  it('sends one chosen file to the draft in two steps (announce, then post with the run\'s id); W0: no checklist rows, the spot is the status', async () => {
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
    expect(screen.queryByTestId('canvas-material')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create canvas' })).not.toBeInTheDocument();
    await act(async () => {
      finish({ ok: true, label: 'offer.pdf', chars: 900 });
    });
    expect(toastFn.error).not.toHaveBeenCalled();
  });

  it('a file the server could not read stays as a failed row with the way out', async () => {
    svc.uploadCanvasMaterial.mockResolvedValueOnce({ ok: false, code: 'UNREADABLE' });
    await renderThread();
    const input = (await screen.findByTestId('canvas-upload-input')) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'scan.pdf')] } });
    });
    expect(toastFn.error).toHaveBeenCalledWith(expect.stringContaining('could not be read'));
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

describe('P1536 S1: an upload that the send refuses posts no file', () => {
  it('busy: the refusal is said, the file is not posted, and the draft is read again', async () => {
    svc.sendCanvasWorkspaceMessage.mockResolvedValueOnce({ ok: false, refused: 'busy', revision: 3 });
    await renderThread();
    const input = (await screen.findByTestId('canvas-upload-input')) as HTMLInputElement;
    const reads = svc.getCanvasDraftByThread.mock.calls.length;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'scan.pdf')] } });
    });
    expect(svc.uploadCanvasMaterial).not.toHaveBeenCalled();
    // W0: the tray row that said why is gone; the refusal is said once, as a toast
    expect(toastFn.error).toHaveBeenCalledWith('A draft is already being written. It will show here when it is done.');
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
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/test-user/canvas/canvas?v=canvas_dnew&ws=1')); // W0: the workspace, not the chat thread
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

  it('opens a brand-new canvas in the workspace (W0)', async () => {
    wrap(<Menu />, `/chats/c/${MIRROR_ID}`);
    // availability is asked once the pane mounts; the item appears when the answer is exactly true
    await waitFor(() => expect(svc.getCanvasDraftAvailability).toHaveBeenCalled());
    await act(async () => {});
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More' }), { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'New canvas' }));
    await waitFor(() => expect(svc.openCanvasDraft).toHaveBeenCalledWith(null));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/test-user/canvas/canvas?v=canvas_dnew&ws=1'));
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

describe('the canvas version in a message (W0/W4: its state and an Open)', () => {
  const card = (kind: 'canvas_version') => (
    <MemoryRouter>
      <AttachmentCard kind={kind} id="ver-1" viewerId={ME} />
    </MemoryRouter>
  );

  it('a published version is the chat\'s artifact card: icon disc, the canvas title, "v2 · date · Published", and a secondary Open to its page', async () => {
    const href = '/p/test-user/canvas/canvas?v=canvas_d1a2b3';
    svc.getCanvasVersionCard.mockResolvedValue({ title: 'Hiring plan', label: 'v2 · Oct 26, 2026', state: 'published', draft: false, href, openHref: href });
    render(card('canvas_version'));
    const box = await screen.findByTestId('attachment-canvas_version');
    expect(box).toHaveTextContent('Hiring plan');
    expect(screen.getByTestId('canvas-version-state')).toHaveTextContent('v2 · Oct 26, 2026 · Published');
    expect(box.querySelector('.bg-blue-100')).not.toBeNull();
    const open = within(box).getByRole('link', { name: 'Open canvas Hiring plan' });
    expect(open).toHaveAttribute('href', href);
    expect(open.className).toContain('bg-secondary'); // secondary, never a filled primary
    expect(open.className).not.toContain('bg-blue-600');
    expect(box.tagName).not.toBe('A'); // the card itself is not a link: Open is
  });

  it('Open carries where the owner is (← in the workspace returns to the chat)', async () => {
    const href = '/p/test-user/canvas/canvas?v=canvas_dabc&ws=1';
    svc.getCanvasVersionCard.mockResolvedValue({ label: 'Draft', state: 'draft', draft: true, href, openHref: href });
    render(
      <MemoryRouter initialEntries={[`/chats/c/${MIRROR_ID}`]}>
        <Routes>
          <Route path="/chats/c/:cid" element={<AttachmentCard kind="canvas_version" id="ver-1" viewerId={ME} />} />
          <Route path="*" element={<FromProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('link', { name: /^Open canvas/ }));
    expect(await screen.findByTestId('from-probe')).toHaveTextContent(`/chats/c/${MIRROR_ID}`);
  });

  it('an open draft reads "Draft" and Open goes to its workspace', async () => {
    const open = '/p/test-user/canvas/canvas?v=canvas_dabc&ws=1';
    svc.getCanvasVersionCard.mockResolvedValue({ label: 'Draft', state: 'draft', draft: true, href: open, openHref: open });
    render(card('canvas_version'));
    const box = await screen.findByTestId('attachment-canvas_version');
    expect(screen.getByTestId('canvas-version-state')).toHaveTextContent('Draft');
    expect(within(box).getByRole('link', { name: /^Open canvas/ })).toHaveAttribute('href', open);
  });

  it('a draft whose address is not readable has no Open', async () => {
    svc.getCanvasVersionCard.mockResolvedValue({ label: 'Draft', state: 'draft', draft: true, href: null, openHref: null });
    render(card('canvas_version'));
    const box = await screen.findByTestId('attachment-canvas_version');
    expect(box).toHaveTextContent('Draft');
    expect(within(box).queryByRole('link')).not.toBeInTheDocument();
  });

  it('inside a quote (compact) it is plain text with no Open: a quote can itself be a button', async () => {
    svc.getCanvasVersionCard.mockResolvedValue({ title: 'Hiring plan', label: 'v2 · Oct 26, 2026', state: 'published', draft: false, href: '/x', openHref: '/x' });
    render(<MemoryRouter><AttachmentCard kind="canvas_version" id="ver-1" viewerId={ME} compact /></MemoryRouter>);
    const box = await screen.findByTestId('attachment-canvas_version');
    expect(within(box).queryByRole('link')).not.toBeInTheDocument();
  });

  it('a version that is not the reader\'s is "Not available to you"', async () => {
    svc.getCanvasVersionCard.mockResolvedValue(null);
    render(card('canvas_version'));
    expect(await screen.findByText('Not available to you')).toBeInTheDocument();
  });
});

/** Filled-blue controls, buttons and links. */
const primaries = () => [...screen.queryAllByRole('button'), ...screen.queryAllByRole('link')].filter((b) => b.className.includes('bg-blue-600')).map((b) => b.textContent);

describe('P955: no disabled primary, one primary at a time', () => {
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

  it.each(['empty', 'messages', 'update-empty', 'update-messages'])('the gate fixture phase %s renders the real thread parts with no disabled button and no primary', (phase) => {
    render(
      <MemoryRouter initialEntries={[`/tree/_gate/canvas-thread?phase=${phase}`]}>
        <GateFixture />
      </MemoryRouter>,
    );
    for (const b of screen.getAllByRole('button')) expect(b).not.toBeDisabled();
    // the fixture is a whole thread: the header, the opener, the real composer with Upload. W0: no tray, no draft card, no header menu.
    expect(screen.getByTestId('canvas-thread-title')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-opener')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-upload')).toBeInTheDocument();
    expect(screen.getByTestId('composer')).toBeInTheDocument();
    for (const gone of ['canvas-bar', 'canvas-draft-card', 'canvas-material', 'canvas-progress']) expect(screen.queryByTestId(gone)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Canvas draft options')).not.toBeInTheDocument();
    expect(primaries().length).toBeLessThanOrEqual(1);
  });

  it('the fixture has its four phases, including an update with its base version card', () => {
    render(<MemoryRouter initialEntries={['/tree/_gate/canvas-thread?phase=update-empty']}><GateFixture /></MemoryRouter>);
    expect(screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/tree/_gate/canvas-thread?phase=')).length).toBe(4);
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

/**
 * W0: the tray's "Start a new version" button is gone (a published thread is no longer an owner surface), but the start itself and
 * the carrying of change requests into the new thread are kept: this harness calls the hook the way the next slice's Clone will.
 */
function CarryHarness({ carry, from = 'ver-draft' }: { carry: string[]; from?: string }) {
  const { start, dialog } = useStartCanvas();
  return (
    <>
      <button type="button" onClick={() => void start(from, carry)}>Start a new version</button>
      {dialog}
    </>
  );
}
const startWith = async (carry: string[]) => {
  wrap(<CarryHarness carry={carry} />, `/chats/c/${MIRROR_ID}`);
  fireEvent.click(await screen.findByRole('button', { name: 'Start a new version' }));
};
const opened = (over: Record<string, unknown> = {}) => ({ status: 'opened', draftId: 'draft-new', revision: 2, canvasId: 'cv-1', conversationId: MIRROR_ID, threadRootId: 'root-new', canvasName: 'canvas', versionName: 'canvas_dnew', fromSeq: 1, ...over });

describe('B5: the change request goes with the new version', () => {
  it('is sent as the first owner message of the new draft, before the owner lands in its workspace', async () => {
    await startWith(['Raise the price to 60']);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/test-user/canvas/canvas?v=canvas_dnew&ws=1'));
    // v6: a plain chat message has no run and is never engine input, so the change request goes with canvas_workspace_send into the
    // new draft, which starts the run itself (no separate Create step: a queued run nobody starts only locks the owner out)
    expect(svc.sendCanvasWorkspaceMessage).toHaveBeenCalledTimes(1);
    expect(svc.sendCanvasWorkspaceMessage).toHaveBeenCalledWith(expect.objectContaining({
      canvasId: 'cv-1', expectedDraftId: 'draft-new', expectedRevision: 2, body: 'Raise the price to 60', clientId: expect.any(String),
    }));
    expect(chatSvc.sendMessage).not.toHaveBeenCalled();
  });

  it('the same text goes along when the owner discards the draft that was open elsewhere', async () => {
    svc.openCanvasDraft
      .mockResolvedValueOnce(opened({ status: 'open_elsewhere', draftId: 'draft-open', threadRootId: 'root-open', versionName: 'canvas_dopen' }))
      .mockResolvedValueOnce(opened());
    await startWith(['Raise the price to 60']);
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Discard it and start here' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('v=canvas_dnew'));
    expect(svc.sendCanvasWorkspaceMessage).toHaveBeenCalledWith(expect.objectContaining({ expectedDraftId: 'draft-new', body: 'Raise the price to 60' }));
  });

  it('CONTROL: continuing the draft open elsewhere sends nothing', async () => {
    svc.openCanvasDraft.mockResolvedValue(opened({ status: 'open_elsewhere', draftId: 'draft-open', threadRootId: 'root-open', versionName: 'canvas_dopen' }));
    await startWith(['Raise the price to 60']);
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Continue it there' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('v=canvas_dopen'));
    expect(svc.sendCanvasWorkspaceMessage).not.toHaveBeenCalled();
    expect(chatSvc.sendMessage).not.toHaveBeenCalled();
  });

  it('if the message cannot be carried over, the owner is told and still lands in the new draft\'s workspace', async () => {
    svc.sendCanvasWorkspaceMessage.mockRejectedValueOnce(new Error('network'));
    await startWith(['Raise the price to 60']);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('v=canvas_dnew'));
    expect(toastFn.error).toHaveBeenCalledWith(expect.stringContaining('Send it again'));
  });
});
describe('U2: the messages after Publish are carried as ONE message (one message is one run)', () => {
  // v3 sent each message on its own. A run applies one message and only one run is active per owner, so the later sends would be
  // refused as busy: the requests are now joined, oldest first, into one canvas_workspace_send, newest-first up to the 4,000 characters
  // a message may hold. What does not fit is left out and the owner is told. [FOUNDER DECISION: wording]
  const start = async (...carry: string[]) => {
    await startWith(carry);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('v=canvas_dnew'));
  };
  const sent = () => svc.sendCanvasWorkspaceMessage.mock.calls.map((c) => c[0] as { body: string; clientId: string });

  it('two short messages are one send, oldest first, and that send starts its run', async () => {
    await start('one', 'two');
    expect(sent()).toHaveLength(1);
    expect(sent()[0]).toMatchObject({ body: 'one\n\ntwo' });
    expect(sent()[0]).not.toHaveProperty('startRun');
    expect(toastFn.error).not.toHaveBeenCalled();
  });

  it('two 3,000-character messages do not fit one: the newest goes, under the limit, and the owner is told the rest was left out', async () => {
    const a = 'a'.repeat(3000);
    const b = 'b'.repeat(3000);
    await start(a, b);
    expect(sent().map((x) => x.body)).toEqual([b]);
    expect(toastFn.error).toHaveBeenCalledWith(expect.stringContaining('Send it again'));
  });

  it('one request longer than the limit is split into pieces under 4,000 characters; the newest piece that fits goes, and the owner is told the rest was left out', async () => {
    const long = `${'x'.repeat(3500)} ${'y'.repeat(3500)}`;
    // the pieces are what the thread hands over: the same split the helper makes
    const { splitText, CARRY_MAX_CHARS } = await import('@/app/pages/chat/use-canvas-thread');
    await start(...splitText(long, CARRY_MAX_CHARS));
    expect(sent()).toHaveLength(1);
    expect(sent()[0]!.body.length).toBeLessThanOrEqual(4000);
    expect(sent()[0]!.body).toContain('y'.repeat(3500)); // the newest words go
    expect(sent()[0]!.body).not.toContain('x');
    expect(toastFn.error).toHaveBeenCalledWith(expect.stringContaining('Send it again'));
  });

  it('the client id is the same when the same carry is run again into the same thread, and differs for another thread', async () => {
    await start('one');
    const first = sent()[0]!.clientId;
    expect(first.length).toBeGreaterThan(0);
    svc.sendCanvasWorkspaceMessage.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Start a new version' }));
    await waitFor(() => expect(svc.sendCanvasWorkspaceMessage).toHaveBeenCalledTimes(1));
    expect(sent()[0]!.clientId).toBe(first);
    svc.sendCanvasWorkspaceMessage.mockClear();
    svc.openCanvasDraft.mockResolvedValue(opened({ draftId: 'draft-n2', threadRootId: 'root-new-2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start a new version' }));
    await waitFor(() => expect(svc.sendCanvasWorkspaceMessage).toHaveBeenCalledTimes(1));
    expect(sent()[0]!.clientId).not.toBe(first);
  });

  it('a send that is refused or fails is said, and the owner still lands in the new draft\'s workspace', async () => {
    svc.sendCanvasWorkspaceMessage.mockResolvedValueOnce({ ok: false, refused: 'busy', revision: 2 });
    await start('one');
    expect(toastFn.error).toHaveBeenCalledWith(expect.stringContaining('Send it again'));
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
    // in the workspace (`fill`): outside it, W0 holds an old canvas-thread address back behind its own skeleton while it resolves
    wrap(<ThreadPanel fill summary={mirrorChat} rootId={ROOT} highlightId={null} />);
    await act(async () => {});
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
    await screen.findByTestId('canvas-opener');
    svc.getCanvasDraftByThread.mockRejectedValue(new Error('offline'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Raise the price to 60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(svc.sendCanvasWorkspaceMessage).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole('alert')?.textContent ?? '').not.toContain('Could not load');
    expect(screen.getByTestId('canvas-opener')).toBeInTheDocument();
  });
});

const bluePrimaries = () => [...screen.queryAllByRole('button'), ...screen.queryAllByRole('link')].filter((b) => b.className.includes('bg-blue-600')).map((b) => b.getAttribute('aria-label') ?? b.textContent);

describe('C5: a canvas thread is known to the mirror before its first message is sent', () => {
  it('starting a new version registers the new thread before the carried message goes out', async () => {
    const seen: boolean[] = [];
    svc.sendCanvasWorkspaceMessage.mockImplementation(async () => {
      seen.push(isCanvasThread('root-new'));
      return { ok: true, runId: 'run-c', revision: 3, draftId: 'draft-new', start: null };
    });
    await startWith(['Raise the price to 60']);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('v=canvas_dnew'));
    expect(seen).toEqual([true]);
  });

  it('continuing a draft that is open elsewhere registers that thread too, and an ordinary one is never registered', async () => {
    svc.openCanvasDraft.mockResolvedValue(opened({ status: 'open_elsewhere', draftId: 'draft-open', threadRootId: 'root-open', versionName: 'canvas_dopen' }));
    await startWith(['Raise the price']);
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Continue it there' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('v=canvas_dopen'));
    expect(isCanvasThread('root-open')).toBe(true);
    expect(isCanvasThread('some-plain-thread')).toBe(false);
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
    render(<MemoryRouter initialEntries={['/tree/_gate/canvas-thread?phase=empty']}><GateFixture /></MemoryRouter>);
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
    for (const phase of ['empty', 'update-empty', 'messages', 'update-messages']) {
      const { unmount } = render(<MemoryRouter initialEntries={[`/tree/_gate/canvas-thread?phase=${phase}`]}><GateFixture /></MemoryRouter>);
      expect(screen.getByRole('button', { name: 'Copy prompt' }).className).not.toContain('bg-blue-600');
      expect(bluePrimaries().length).toBeLessThanOrEqual(1);
      unmount();
    }
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
    await screen.findByTestId('canvas-opener');
    type('more');
    send();
    await waitFor(() => expect(conv.send).toHaveBeenCalledWith({ body: 'more' }));
    expect(svc.sendCanvasWorkspaceMessage).not.toHaveBeenCalled();
  });
});


