/**
 * @file p1536-walk3-route.test.tsx
 * @description P1536 walkthrough 3 (2026-11-01): defects found in a real-browser walk of J-W1..J-W5, one failing test each, on the REAL route element,
 * canvas page, thread panel and composer (only the database and the chat's message transport are faked). Item numbers are the walkthrough list's.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-mappers';
import type { PointWithUserPosition } from '@/app/types';

const ME = 'owner-1';
const CONV = 'conv-mirror-1';
const ROOT = 'root-1';
const DRAFT_NAME = 'canvas_dabc123';

const st = vi.hoisted(() => ({
  draftRow: null as Record<string, unknown> | null,
  openDraft: null as Record<string, unknown> | null,
  hasV2: false,
  latestRun: null as Record<string, unknown> | null,
  messages: [] as unknown[],
  signedIn: true,
  slug: 'ana',
  convStatus: 'ready' as string,
  listeners: new Set<(e: unknown) => void>(),
}));
const getCanvas = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const byThread = vi.hoisted(() => vi.fn());
const convSend = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
const mirrorSvc = vi.hoisted(() => ({
  askMirror: vi.fn(), getMirrorAvailability: vi.fn(), getMirrorProfile: vi.fn(), listMirrorAsks: vi.fn(), listMirrorJobs: vi.fn(),
  newMirrorFace: vi.fn(), requestMirrorReply: vi.fn(), setMirrorGender: vi.fn(),
}));

vi.mock('@/app/data/mirror-service', () => mirrorSvc);
vi.mock('@/lib/supabase', () => ({ supabase: { rpc, functions: { invoke }, from: vi.fn() } }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: toastError, success: toastSuccess }) }));
vi.mock('@/auth', () => ({
  useAuth: () => (st.signedIn
    ? { session: { user: { id: ME } }, user: { id: ME, slug: st.slug }, sessionChecked: true }
    : { session: null, user: null, sessionChecked: true }),
}));
vi.mock('@/app/data/api', () => ({
  getProfileBySlugResult: vi.fn(async () => ({ success: true, data: { id: ME, name: 'Ana', avatarUrl: null, avatarColor: '#3b82f6', hasPledged: false } })),
}));
vi.mock('@/app/data/canvas-service', () => ({ canvasService: { getCanvas, getAudience: vi.fn(async () => []), markCanvasRead: vi.fn(async () => undefined) } }));
vi.mock('@/app/data/calibration-service', () => ({ calibrationService: { getEarsCount: vi.fn(async () => 0) } }));
vi.mock('@/app/contexts/agent-accounts-context', () => ({ useAgentAccountIds: () => ({ isAgentAccountId: () => false, isLoading: false }) }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('@/app/pages/not-found-page', () => ({ NotFoundPage: () => <div data-testid="canvas-not-found" /> }));
vi.mock('@/app/components/feed/feed-point-card', () => ({ FeedPointCard: () => <div data-testid="point-card" /> }));
vi.mock('@/app/components/social/point-positions-block', () => ({ PointPositionsBlock: () => null }));
vi.mock('@/app/components/letters/letter-position-story-dialog', () => ({ LetterPositionStoryDialog: () => null }));
vi.mock('@/app/components/canvas/canvas-add-story-dialog', () => ({ CanvasAddStoryDialog: () => null }));
vi.mock('@/app/components/canvas/canvas-share-control', () => ({ CanvasShareControl: () => <button type="button" data-testid="share-stub">Share</button> }));
vi.mock('@/app/data/canvas-draft-service', async () => ({
  ...(await vi.importActual<object>('@/app/data/canvas-draft-service')),
  getCanvasDraftByThread: byThread,
  getLatestCanvasRun: async () => st.latestRun,
  listCanvasMaterial: async () => [],
  countDoneCanvasDraftRuns: async () => 1,
  getLastDoneCanvasDraftRunAt: async () => '2026-10-28T09:00:00.000Z',
  listMyCanvasVersions: async () => [
    { id: 'ver-2', canvasId: 'cv-1', canvasName: 'canvas', name: 'canvas_d222222', seq: 2, publishedAt: '2026-10-10T10:00:00Z', hasOpenDraft: !!st.openDraft },
    { id: 'ver-1', canvasId: 'cv-1', canvasName: 'canvas', name: 'canvas_d111111', seq: 1, publishedAt: '2026-10-01T10:00:00Z', hasOpenDraft: !!st.openDraft },
  ],
}));
vi.mock('@/app/pages/chat/use-message-actions', () => ({ useMessageActions: () => ({ actions: {}, dialogs: null }) }));
vi.mock('@/app/pages/chat/use-conversation', () => ({
  isLocal: () => false,
  useConversationMessages: () => ({
    server: st.messages, messages: st.messages, status: st.convStatus, send: convSend, stats: new Map(), hasMore: false, loadingEarlier: false,
    loadEarlier: vi.fn(), ensureLoaded: vi.fn(), lookup: vi.fn(), getLoaded: vi.fn(), syncVersion: 0, retrySend: vi.fn(), discard: vi.fn(), edit: vi.fn(), reload: vi.fn(),
  }),
}));
vi.mock('@/app/pages/chat/MessageRow', () => ({ MessageRow: ({ msg }: { msg: ChatMessage }) => <li data-msg={msg.id}>{msg.body ?? 'card'}</li> }));

import { CanvasWithThread } from '@/app/pages/canvas/canvas-with-thread';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { ThreadPanel } from '@/app/pages/chat/ThreadPanel';
import { MirrorProvider } from '@/app/pages/chat/mirror-provider';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { resetCanvasThreads } from '@/app/pages/chat/canvas-thread-registry';
import { resetUnresolvedFirstSends } from '@/app/pages/canvas/workspace-next-draft';
import { clearLinkTokens } from '@/lib/canvas-link-token';
import { clearListReturnCache } from '@/lib/list-return-cache';

const summary: ChatSummary = {
  conversationId: CONV, kind: 'mirror', title: 'Mira', other: null, org: null, event: null, ownerFirstName: 'Ana',
  lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false,
};
const chatValue = {
  userId: ME, status: 'ready', error: null, chats: [summary], unreadCount: 0, refresh: vi.fn(async () => null), setArchived: vi.fn(), setManualUnread: vi.fn(),
  markRead: vi.fn(), subscribe: (l: (e: unknown) => void) => { st.listeners.add(l); return () => { st.listeners.delete(l); }; }, setViewing: vi.fn(), revision: 0,
  authors: { [ME]: { id: ME, name: 'Ana', slug: 'ana', avatarUrl: null, avatarColor: null, hasPledged: false } },
  missingAuthors: new Set(), ensureAuthors: vi.fn(), outbox: [], sendMessage: vi.fn(), retrySend: vi.fn(), discardSend: vi.fn(), block: vi.fn(), unblock: vi.fn(), goToChat: vi.fn(), resync: vi.fn(),
} as unknown as ChatContextValue;

const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: 'm', conversationId: CONV, authorId: ME, body: 'hello', createdAt: '2026-10-28T08:00:00.000Z', editedAt: null, deletedAt: null, isDeleted: false,
  replyToId: null, threadRootId: ROOT, forwardedFromMessageId: null, forwardAuthorId: null, forwardSnapshot: null, kind: 'message', attachmentKind: null,
  attachmentId: null, clientId: null, contextConversationId: null, ...over,
});
const draftRow = (over: Record<string, unknown> = {}) => ({
  id: 'draft-1', versionId: 'ver-draft', canvasId: 'cv-1', baseVersionId: null, conversationId: CONV, threadRootId: ROOT, state: 'open', runCount: 1, revision: 4,
  tensionCount: 0, closedAt: null, canvasName: 'canvas', versionName: DRAFT_NAME, ...over,
});
const point = (box: string) => ({
  id: `p-${box}`, statement: `Bet for ${box}`, tags: [], systemTags: [box], visibility: 'private', userPosition: null,
  totalPositions: 0, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  positionCounts: { agree: 0, strongly_agree: 0, somewhat_agree: 0, unsure: 0, disagree: 0, strongly_disagree: 0, somewhat_disagree: 0 },
}) as unknown as PointWithUserPosition;
const v1 = { name: 'canvas_d111111', createdAt: '2026-10-01T10:00:00Z', seq: 1, publishedAt: '2026-10-01T10:00:00Z', draft: false };
const v2 = { name: 'canvas_d222222', createdAt: '2026-10-10T10:00:00Z', seq: 2, publishedAt: '2026-10-10T10:00:00Z', draft: false };
const draftVersion = { name: DRAFT_NAME, createdAt: '2026-10-20T10:00:00Z', seq: null, publishedAt: null, draft: true };
/** The draft block `get_canvas` gives the owner. `baseSeq` is the version the draft was started from. */
const draftBlock = (over: Record<string, unknown> = {}) => ({ id: 'draft-1', version: DRAFT_NAME, questions: {}, threadRootId: ROOT, conversationId: CONV, baseSeq: 1, runCount: 1, revision: 4, changedBoxes: [] as string[], ...over });
const base = { stories: new Map(), addedStoryIds: [], positions: new Map(), visibility: 'private' as const, isOwner: true, admitted: true, generalAccess: 'restricted' as const, via: null, canvasExists: true };
const published = () => (st.hasV2 ? [v2, v1] : [v1]);
const readFor = (version?: string, over: Record<string, unknown> = {}) => {
  const versions = st.openDraft ? [draftVersion, ...published()] : published();
  const open = version ?? published()[0]!.name;
  return { ...base, points: [point('canvas:problem')], version: open, versions, publishedNone: false, draft: st.openDraft, ...over };
};

function Where() {
  const l = useLocation();
  const p = new URLSearchParams(l.search);
  return (
    <>
      <output data-testid="where">{l.pathname}{l.search}</output>
      <output data-testid="ws">{p.get('ws') ?? 'none'}</output>
      <output data-testid="nav-type">{useNavigationType()}</output>
    </>
  );
}
function mount(at: string) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <ChatContext.Provider value={chatValue}>
        <MirrorProvider enabled>
        <Where />
        <Routes>
          <Route path="/p/:handle/canvas/:projectTag" element={<CanvasWithThread />} />
          <Route path="*" element={<div data-testid="elsewhere" />} />
        </Routes>
        </MirrorProvider>
      </ChatContext.Provider>
    </MemoryRouter>,
  );
}
const stubWidth = (wide: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('pointer') || (wide && q.includes('1280')), addEventListener: () => undefined, removeEventListener: () => undefined, media: q }));

const sends = () => rpc.mock.calls.filter(c => c[0] === 'canvas_workspace_send');
const sentRow = { status: 'ok', run_id: 'run-9', revision: 1, draft_id: 'draft-9', canvas_id: 'cv-1', canvas_name: 'canvas', version_name: DRAFT_NAME, thread_root_id: ROOT, conversation_id: CONV, message_id: 'msg-9', replayed: false };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetUnresolvedFirstSends();
  clearLinkTokens();
  clearListReturnCache();
  resetCanvasAvailability();
  resetCanvasThreads();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  stubWidth(true);
  st.signedIn = true;
  st.slug = 'ana';
  st.openDraft = null;
  st.hasV2 = false;
  st.draftRow = null;
  st.latestRun = null;
  st.convStatus = 'ready';
  st.listeners.clear();
  mirrorSvc.getMirrorAvailability.mockResolvedValue(true);
  mirrorSvc.getMirrorProfile.mockResolvedValue({ conversationId: CONV, portraitUrl: null, credit: null, gender: null });
  mirrorSvc.requestMirrorReply.mockResolvedValue('done');
  mirrorSvc.listMirrorJobs.mockResolvedValue(new Map());
  st.messages = [msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-draft' })];
  byThread.mockReset();
  byThread.mockImplementation(async () => st.draftRow);
  rpc.mockImplementation(async () => ({ data: null, error: null }));
  invoke.mockResolvedValue({ data: { enabled: true }, error: null });
  getCanvas.mockReset();
  getCanvas.mockImplementation(async (_o: string, _t: string, _v: unknown, _k: unknown, version?: string) => readFor(version));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const grid = () => screen.findByTestId('canvas-grid');

const openDraftState = (over: Record<string, unknown> = {}) => {
  st.openDraft = draftBlock(over);
  st.draftRow = draftRow();
};
const composerField = () => within(screen.getByTestId('composer')).findByRole('textbox');
const sendButton = () => within(screen.getByTestId('composer')).getByRole('button', { name: 'Send' });
const DRAFT_AT = `/p/ana/canvas/canvas?v=${DRAFT_NAME}&ws=1`;

// ── helpers for the walkthrough items ────────────────────────────────────────────────────────────────────────────

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const rootMessage = () => msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-draft' });
/** The chat's realtime INSERT of a message, as chat-provider hands it to every subscriber. */
const realtime = (m: ChatMessage) => st.listeners.forEach(l => l({ type: 'message', event: { type: 'INSERT', message: m } }));
const mirrorAsks = () => mirrorSvc.requestMirrorReply.mock.calls.map(c => String(c[0]));

// ── 1: a Send before the thread's first read is never a plain message ────────────────────────────────────────────

describe('1: a Send before the canvas thread has loaded waits, then goes through the engine', () => {
  it('workspace, root message not loaded yet and the draft read still out: nothing is posted yet (no plain message, no canvas send); after the read the same text goes via canvas_workspace_send by itself', async () => {
    openDraftState();
    st.messages = [];
    st.convStatus = 'loading';
    const read = deferred<Record<string, unknown> | null>();
    byThread.mockImplementation(() => read.promise);
    rpc.mockImplementation(async (name: string) => (name === 'canvas_workspace_send' ? { data: sentRow, error: null } : { data: null, error: null }));
    mount(DRAFT_AT);
    await grid();
    await screen.findByTestId('thread-panel');
    fireEvent.change(await composerField(), { target: { value: 'tighten the problem' } });
    fireEvent.click(sendButton());
    await act(async () => {});
    expect(convSend).not.toHaveBeenCalled();
    expect(sends()).toHaveLength(0);
    expect(toastError).not.toHaveBeenCalled(); // waiting is not a failure
    // the thread arrives: the root message and the draft read
    st.messages = [rootMessage()];
    st.convStatus = 'ready';
    await act(async () => { read.resolve(st.draftRow); });
    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(sends()[0]![1]).toMatchObject({ p_body: 'tighten the problem' });
    expect(convSend).not.toHaveBeenCalled();
  });
});

describe('1: the thread route (no workspace) and drafting off', () => {
  const PLAIN = 'plain-root';
  const panel = (canvasThread = false) => (
    <MemoryRouter>
      <ChatContext.Provider value={chatValue}>
        <ThreadPanel summary={summary} rootId={PLAIN} highlightId={null} workspace={canvasThread ? {} : undefined} />
      </ChatContext.Provider>
    </MemoryRouter>
  );
  const plainRoot = () => msg({ id: PLAIN, threadRootId: null, body: 'a plain first message' });
  const type = async (text: string) => {
    fireEvent.change(await composerField(), { target: { value: text } });
    fireEvent.click(sendButton());
    await act(async () => {});
  };

  it('an ordinary mirror thread whose first read is out: the Send waits (nothing posted, no refusal); the moment its root is known the same Send posts normally, by itself', async () => {
    st.messages = [];
    st.convStatus = 'loading';
    const { rerender } = render(panel());
    await type('a reply');
    expect(convSend).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    st.messages = [plainRoot()];
    st.convStatus = 'ready';
    rerender(panel());
    await waitFor(() => expect(convSend).toHaveBeenCalledWith({ body: 'a reply' }));
    expect(sends()).toHaveLength(0);
  });

  it('CONTROL: an ordinary mirror thread with its root loaded posts at once', async () => {
    st.messages = [plainRoot()];
    render(panel());
    await type('hello there');
    expect(convSend).toHaveBeenCalledWith({ body: 'hello there' });
  });

  it('drafting KNOWN off: a thread the workspace says is a canvas thread stays an ordinary readable thread with the chat\'s own composer', async () => {
    invoke.mockResolvedValue({ data: { enabled: false }, error: null });
    st.messages = [plainRoot()];
    render(panel(true));
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    await act(async () => {});
    await type('still readable');
    expect(convSend).toHaveBeenCalledWith({ body: 'still readable' });
  });
});

// ── 2: the mirror is never asked to answer a canvas message ──────────────────────────────────────────────────────

describe('2: a Clone\'s first Send makes no mirror-reply request', () => {
  /** Tap Clone, type, send: `canvas_workspace_send` answers when `answer()` is called (so the realtime copy can come first). */
  async function cloneAndSend() {
    const answer = deferred<{ data: unknown; error: null }>();
    rpc.mockImplementation((name: string) => (name === 'canvas_workspace_send' ? answer.promise : Promise.resolve({ data: null, error: null })));
    mount('/p/ana/canvas/canvas?v=canvas_d111111');
    await grid();
    fireEvent.click(await screen.findByTestId('canvas-clone'));
    await screen.findByTestId('workspace-chat-empty');
    await waitFor(() => expect(mirrorSvc.getMirrorAvailability).toHaveBeenCalled());
    await act(async () => {});
    fireEvent.change(await composerField(), { target: { value: 'sharpen the problem' } });
    openDraftState({ baseSeq: 1 });
    fireEvent.click(sendButton());
    await waitFor(() => expect(sends()).toHaveLength(1));
    return { answer: () => answer.resolve({ data: sentRow, error: null }) };
  }
  const ownCanvasMessage = () => msg({ id: 'msg-9', threadRootId: ROOT, body: 'sharpen the problem' });

  it('the realtime copy of the message arrives BEFORE the send answers: no request, before or after the answer', async () => {
    const { answer } = await cloneAndSend();
    await act(async () => { realtime(ownCanvasMessage()); });
    await act(async () => { answer(); });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`v=${DRAFT_NAME}`));
    await act(async () => {});
    expect(mirrorAsks()).toEqual([]);
  });

  it('the realtime copy arrives AFTER the send answered: no request', async () => {
    const { answer } = await cloneAndSend();
    await act(async () => { answer(); });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`v=${DRAFT_NAME}`));
    await act(async () => { realtime(ownCanvasMessage()); });
    await act(async () => {});
    expect(mirrorAsks()).toEqual([]);
  });

  it('CONTROL (same harness): an ordinary own mirror message outside any thread IS asked for', async () => {
    mount('/p/ana/canvas/canvas');
    await grid();
    await waitFor(() => expect(mirrorSvc.getMirrorAvailability).toHaveBeenCalled());
    await act(async () => {});
    await act(async () => { realtime(msg({ id: 'plain-1', threadRootId: null })); });
    await waitFor(() => expect(mirrorAsks()).toEqual(['plain-1']));
  });
});

// ── 3: the send slot says what is going on ───────────────────────────────────────────────────────────────────────

describe('3: the composer\'s send slot (§2 Composer send slot, D15)', () => {
  const runningRun = () => ({ id: 'run-1', draftId: 'draft-1', kind: 'message', state: 'running', createdAt: new Date().toISOString(), startedAt: new Date().toISOString(), finishedAt: null, scope: [], replyMessageId: null });
  const slot = () => within(screen.getByTestId('composer')).queryByTestId('composer-send-status');

  it('an active run: the slot reads "Updating…" in place of Send; the owner keeps typing and the text stays; Upload waits as a status, not a disabled button; nothing is disabled', async () => {
    openDraftState();
    st.latestRun = runningRun();
    mount(DRAFT_AT);
    await grid();
    await screen.findByTestId('thread-panel');
    fireEvent.change(await composerField(), { target: { value: 'and mention the pilot' } });
    await waitFor(() => expect(slot()).toHaveTextContent('Updating…'));
    const composer = within(screen.getByTestId('composer'));
    expect(composer.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(composer.getByRole('textbox')).toHaveValue('and mention the pilot');
    expect(composer.getByRole('textbox')).not.toBeDisabled();
    expect(composer.queryByTestId('canvas-upload')).toBeNull();
    expect(composer.getByTestId('canvas-upload-waits')).toBeInTheDocument();
    expect(screen.getByTestId('composer').querySelectorAll('[disabled]')).toHaveLength(0);
    // Enter does not send while it waits
    fireEvent.keyDown(composer.getByRole('textbox'), { key: 'Enter' });
    await act(async () => {});
    expect(sends()).toHaveLength(0);
    expect(composer.getByRole('textbox')).toHaveValue('and mention the pilot');
  });

  it('idle: Send is back and there is no status', async () => {
    openDraftState();
    mount(DRAFT_AT);
    await grid();
    await screen.findByTestId('thread-panel');
    fireEvent.change(await composerField(), { target: { value: 'x' } });
    expect(sendButton()).toBeInTheDocument();
    expect(slot()).toBeNull();
    expect(within(screen.getByTestId('composer')).getByTestId('canvas-upload')).toBeInTheDocument();
  });

  it('busy_elsewhere (the server refused: another canvas is updating): the slot reads "Another of your canvases is updating." and the text is kept', async () => {
    openDraftState();
    rpc.mockImplementation(async (name: string) => (name === 'canvas_workspace_send' ? { data: { status: 'refused', code: 'busy_elsewhere', revision: 4 }, error: null } : { data: null, error: null }));
    mount(DRAFT_AT);
    await grid();
    await screen.findByTestId('thread-panel');
    await waitFor(() => expect(screen.queryByTestId('canvas-loading')).toBeNull());
    fireEvent.change(await composerField(), { target: { value: 'sharpen it' } });
    fireEvent.click(sendButton());
    await waitFor(() => expect(slot()).toHaveTextContent('Another of your canvases is updating.'));
    expect(within(screen.getByTestId('composer')).getByRole('textbox')).toHaveValue('sharpen it');
    expect(within(screen.getByTestId('composer')).queryByRole('button', { name: 'Send' })).toBeNull();
  });

  it('at the cap with something to publish: no composer at all, the sentence says to Publish', async () => {
    openDraftState({ runCount: 30, changedBoxes: ['canvas:problem'] });
    st.draftRow = draftRow({ runCount: 30 });
    mount(DRAFT_AT);
    await grid();
    expect(await screen.findByTestId('canvas-cap')).toHaveTextContent('This draft has had 30 updates. Publish it to keep going.');
    expect(screen.queryByTestId('composer')).toBeNull();
    expect(screen.queryByTestId('canvas-start-over')).toBeNull();
  });

  it('at the cap with nothing to publish: the sentence and Start over; Start over discards and returns to the version the draft came from, ready for the next Send (ws=1)', async () => {
    openDraftState({ runCount: 30, changedBoxes: [] });
    st.draftRow = draftRow({ runCount: 30, baseVersionId: 'ver-1' });
    rpc.mockImplementation(async (name: string) => (name === 'canvas_draft_discard' ? { data: { status: 'ok' }, error: null } : { data: null, error: null }));
    mount(DRAFT_AT);
    await grid();
    const cap = await screen.findByTestId('canvas-cap');
    expect(cap).toHaveTextContent('This draft has had 30 updates.');
    expect(cap).not.toHaveTextContent('Publish it to keep going');
    expect(screen.queryByTestId('composer')).toBeNull();
    fireEvent.click(within(cap).getByTestId('canvas-start-over'));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(rpc.mock.calls.some(c => c[0] === 'canvas_draft_discard')).toBe(true));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/ana/canvas/canvas?v=canvas_d111111&ws=1'));
  });

  it('the first Send of a Clone (in flight) reads "Updating…" in the slot too, never a disabled Send', async () => {
    const answer = deferred<{ data: unknown; error: null }>();
    rpc.mockImplementation((name: string) => (name === 'canvas_workspace_send' ? answer.promise : Promise.resolve({ data: null, error: null })));
    mount('/p/ana/canvas/canvas?v=canvas_d111111');
    await grid();
    fireEvent.click(await screen.findByTestId('canvas-clone'));
    await screen.findByTestId('workspace-chat-empty');
    fireEvent.change(await composerField(), { target: { value: 'first words' } });
    fireEvent.click(sendButton());
    await waitFor(() => expect(slot()).toHaveTextContent('Updating…'));
    expect(screen.getByTestId('composer').querySelectorAll('[disabled]')).toHaveLength(0);
    await act(async () => { answer.resolve({ data: sentRow, error: null }); });
  });
});

// ── 4: the spot never shows a wrong state between a run and the read that follows it ─────────────────────────────

describe('4: the Publish spot keeps "Updating…" until the read after the run has answered', () => {
  /** Every state the spot shows, in order, one entry per change. */
  function watchSpot() {
    const seen: string[] = [];
    const note = () => {
      const el = screen.queryByTestId('publish-spot');
      const s = el?.getAttribute('data-state');
      if (s && seen[seen.length - 1] !== s) seen.push(s);
    };
    const mo = new MutationObserver(note);
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] });
    note();
    return { seen, stop: () => mo.disconnect() };
  }
  const run = (state: string) => ({ id: 'run-1', draftId: 'draft-1', kind: 'message', state, createdAt: new Date().toISOString(), startedAt: new Date().toISOString(), finishedAt: null, scope: [], replyMessageId: null });

  it('a run ends before the page has read its points: the spot goes Updating… -> Publish, never through "Not published yet"', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let points = false;
      const afterRun = deferred<null>();
      let waitForRead = false;
      openDraftState({ baseSeq: null });
      st.draftRow = draftRow({ baseVersionId: null });
      st.latestRun = run('running');
      getCanvas.mockImplementation(async (_o: string, _t: string, _v: unknown, _k: unknown, version?: string) => {
        if (waitForRead) await afterRun.promise;
        return readFor(version, { points: points ? [point('canvas:problem')] : [] });
      });
      mount(DRAFT_AT);
      await grid();
      await screen.findByTestId('thread-panel');
      await waitFor(() => expect(screen.getByTestId('publish-spot')).toHaveAttribute('data-state', 'updating'));
      const { seen, stop } = watchSpot();
      // the run finishes: the thread sees it at its next poll; the page's read of the new points is slower
      st.latestRun = { ...run('done'), finishedAt: new Date().toISOString() };
      waitForRead = true;
      points = true;
      await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
      await act(async () => {});
      expect(screen.getByTestId('publish-spot')).toHaveAttribute('data-state', 'updating'); // the page has not answered yet
      await act(async () => { afterRun.resolve(null); });
      await waitFor(() => expect(screen.getByTestId('publish-spot')).toHaveAttribute('data-state', 'publish'));
      stop();
      expect(seen).not.toContain('not-published');
      expect(seen).not.toContain('no-changes');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a Clone\'s first Send: Updating… from the Send on, never "No changes yet" in between', async () => {
    const answer = deferred<{ data: unknown; error: null }>();
    const threadRead = deferred<Record<string, unknown> | null>();
    rpc.mockImplementation((name: string) => (name === 'canvas_workspace_send' ? answer.promise : Promise.resolve({ data: null, error: null })));
    mount('/p/ana/canvas/canvas?v=canvas_d111111');
    await grid();
    fireEvent.click(await screen.findByTestId('canvas-clone'));
    await screen.findByTestId('workspace-chat-empty');
    expect(screen.getByTestId('publish-spot')).toHaveAttribute('data-state', 'no-changes');
    fireEvent.change(await composerField(), { target: { value: 'first words' } });
    const { seen, stop } = watchSpot();
    fireEvent.click(sendButton());
    await waitFor(() => expect(screen.getByTestId('publish-spot')).toHaveAttribute('data-state', 'updating'));
    // the server accepts; the page moves to the draft; the draft's thread has not read its run yet
    byThread.mockImplementation(() => threadRead.promise);
    openDraftState({ baseSeq: 1 });
    byThread.mockImplementation(() => threadRead.promise);
    st.latestRun = run('queued');
    await act(async () => { answer.resolve({ data: sentRow, error: null }); });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`v=${DRAFT_NAME}`));
    await screen.findByTestId('thread-panel');
    await act(async () => {});
    expect(screen.getByTestId('publish-spot')).toHaveAttribute('data-state', 'updating');
    await act(async () => { threadRead.resolve(st.draftRow); });
    await waitFor(() => expect(screen.getByTestId('publish-spot')).toHaveAttribute('data-state', 'updating'));
    stop();
    expect(seen[0]).toBe('no-changes'); // the pending Clone, before the Send
    expect(seen.slice(1).filter(s => s !== 'updating' && s !== 'loading')).toEqual([]);
  });
});

// ── 5, 6, 11: the owner's bar ────────────────────────────────────────────────────────────────────────────────────

describe('5/6/11: the bar\'s first row holds the name usably, never wraps, and the pending state keeps its picker', () => {
  const states: Array<[string, () => Promise<void>]> = [
    ['pending Clone', async () => { mount('/p/ana/canvas/canvas'); await grid(); fireEvent.click(await screen.findByTestId('canvas-clone')); await screen.findByTestId('workspace-chat-empty'); }],
    ['draft', async () => { openDraftState(); mount(DRAFT_AT); await grid(); await screen.findByTestId('thread-panel'); }],
    ['published', async () => { mount('/p/ana/canvas/canvas'); await grid(); await screen.findByTestId('canvas-clone'); }],
  ];

  it.each(states)('%s: row 1 is one non-wrapping row holding the back arrow, the name, the state and the Publish spot (the spot is a fixed box, never wrapped away)', async (_n, open) => {
    await open();
    const bar = screen.getByTestId('workspace-bar');
    const row = within(bar).getByTestId('workspace-bar-row1');
    expect(row.className).not.toMatch(/(^|\s)flex-wrap(\s|$)/);
    for (const id of ['workspace-back', 'canvas-name', 'publish-spot']) expect(row.contains(within(bar).getByTestId(id)), id).toBe(true);
    expect(row.contains(within(bar).getByTestId('canvas-bar-actions'))).toBe(false); // row 2 holds the switcher, Share and Clone
    const spot = within(bar).getByTestId('publish-spot');
    expect(spot.className).toMatch(/\bw-28\b/);
    expect(spot.className).toMatch(/\bshrink-0\b/);
  });

  it.each(states)('%s: the name has a usable minimum (it can show a few letters of "Canvas" and an ellipsis), not a collapsing letter', async (_n, open) => {
    await open();
    const name = within(screen.getByTestId('workspace-bar')).getByTestId('canvas-name');
    expect(name.className).toMatch(/\bmin-w-\[(4\.5|[5-9])\d*(\.\d+)?rem\]/);
    expect(name.querySelector('h1')?.className).toContain('truncate');
  });

  it('a pending Clone names itself "New draft" and drops "from vN" below 640px (the panel header keeps the whole)', async () => {
    await states[0]![1]();
    const tag = screen.getByTestId('canvas-clone-state');
    expect(tag.firstChild?.textContent).toBe('New draft');
    const tail = within(tag).getByTestId('canvas-clone-state-tail');
    expect(tail).toHaveTextContent('from v1');
    expect(tail.className).toContain('max-sm:hidden');
    expect(screen.getByTestId('canvas-thread-title')).toHaveTextContent('New draft from v1');
  });

  it('11: the pending header carries the version: one version reads "v1" (as a draft does), several give the picker with the version on screen selected', async () => {
    await states[0]![1]();
    expect(within(screen.getByTestId('workspace-bar')).getByTestId('canvas-project-slot')).toHaveTextContent('v1');
    expect(within(screen.getByTestId('workspace-bar')).queryByTestId('canvas-version-select')).toBeNull();
    cleanup();
    st.hasV2 = true;
    mount('/p/ana/canvas/canvas?v=canvas_d222222');
    await grid();
    fireEvent.click(await screen.findByTestId('canvas-clone'));
    await screen.findByTestId('workspace-chat-empty');
    const select = within(screen.getByTestId('workspace-bar')).getByTestId('canvas-version-select') as HTMLSelectElement;
    expect(select.value).toBe('canvas_d222222');
    expect(select).toHaveAttribute('role', 'combobox');
    expect(within(screen.getByTestId('workspace-bar')).getByTestId('canvas-version-short')).toHaveTextContent('v2');
    expect(screen.getByTestId('canvas-clone-state')).toHaveTextContent('New draft from v2');
  });
});

// ── 7: one back arrow, not two ───────────────────────────────────────────────────────────────────────────────────

describe('7: below 1280px the panel header has no back arrow of its own (the bar\'s ← is the only one)', () => {
  const hiddenBelowXl = (el: HTMLElement) => /(^|\s)hidden(\s|$)/.test(el.className) && /\bxl:flex\b/.test(el.className);

  it('a draft: no "Back to the conversation" in the panel; the × shows from 1280px only (nothing there closes it below: the switcher does)', async () => {
    stubWidth(false);
    openDraftState();
    mount(DRAFT_AT);
    await grid();
    const panel = await screen.findByTestId('thread-panel');
    expect(within(panel).queryByLabelText('Back to the conversation')).toBeNull();
    expect(hiddenBelowXl(within(panel).getByLabelText('Close thread'))).toBe(true);
    expect(within(screen.getByTestId('workspace-bar')).getAllByLabelText('Go back')).toHaveLength(1);
  });

  it('a pending Clone: no back arrow either, and the × that cancels shows at EVERY width', async () => {
    stubWidth(false);
    mount('/p/ana/canvas/canvas');
    await grid();
    fireEvent.click(await screen.findByTestId('canvas-clone'));
    const pane = await screen.findByTestId('workspace-chat-pane');
    expect(within(pane).queryByLabelText('Back to the conversation')).toBeNull();
    const close = within(pane).getByLabelText('Close thread');
    expect(/(^|\s)hidden(\s|$)/.test(close.className)).toBe(false);
    fireEvent.click(close);
    await waitFor(() => expect(screen.getByTestId('ws')).toHaveTextContent('none'));
  });

  it('CONTROL: the thread route (no workspace) keeps its own Back below 1280px', async () => {
    render(
      <MemoryRouter>
        <ChatContext.Provider value={chatValue}>
          <ThreadPanel summary={summary} rootId="plain-root" highlightId={null} />
        </ChatContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('Back to the conversation')).toBeInTheDocument();
  });
});

// ── 8: the new-canvas onboarding belongs to a canvas with no base ────────────────────────────────────────────────

describe('8: the opener and Copy prompt show only when the draft has no base version', () => {
  it('a draft from v1 (a Clone\'s thread): no opener, no "Copy prompt"', async () => {
    openDraftState({ baseSeq: 1 });
    st.draftRow = draftRow({ baseVersionId: 'ver-1' });
    st.messages = [rootMessage(), msg({ id: 'm1', body: 'make it shorter', createdAt: '2026-10-28T08:01:00.000Z' })];
    mount(DRAFT_AT);
    await grid();
    await screen.findByTestId('thread-panel');
    await waitFor(() => expect(screen.queryByTestId('canvas-loading')).toBeNull());
    expect(screen.queryByTestId('canvas-opener')).toBeNull();
    expect(screen.queryByTestId('canvas-copy-prompt')).toBeNull();
    expect(screen.getByText('make it shorter')).toBeInTheDocument();
  });

  it('CONTROL: a new canvas (no base) keeps the opener and Copy prompt', async () => {
    openDraftState({ baseSeq: null });
    st.draftRow = draftRow({ baseVersionId: null });
    mount(DRAFT_AT);
    await grid();
    expect(await screen.findByTestId('canvas-opener')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-copy-prompt')).toBeInTheDocument();
  });
});

// ── 10: the pending line leaves when the Send is accepted ────────────────────────────────────────────────────────

describe('10: the Clone line does not linger after the Send was accepted', () => {
  it('while the Send is in flight the line stays; once it is accepted it is gone (a Skeleton holds the place) even though the page has not moved to the draft yet', async () => {
    const answer = deferred<{ data: unknown; error: null }>();
    rpc.mockImplementation((name: string) => (name === 'canvas_workspace_send' ? answer.promise : Promise.resolve({ data: null, error: null })));
    getCanvas.mockImplementation(async (_o: string, _t: string, _v: unknown, _k: unknown, version?: string) => (version === DRAFT_NAME ? new Promise(() => undefined) : readFor(version)));
    mount('/p/ana/canvas/canvas?v=canvas_d111111');
    await grid();
    fireEvent.click(await screen.findByTestId('canvas-clone'));
    await screen.findByTestId('workspace-chat-empty');
    fireEvent.change(await composerField(), { target: { value: 'first words' } });
    fireEvent.click(sendButton());
    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(screen.getByTestId('workspace-chat-empty')).toHaveTextContent('Clone v1.'); // in flight: not accepted yet
    await act(async () => { answer.resolve({ data: sentRow, error: null }); });
    await waitFor(() => expect(screen.queryByTestId('workspace-chat-empty')).toBeNull());
    expect(screen.getByTestId('workspace-chat-opening')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('Nothing changes for readers until you publish');
  });
});

// ── 12: the same top spacing on a published view and a draft ─────────────────────────────────────────────────────

describe('12: the page\'s header block adds no band when it has nothing to show', () => {
  const headerBlock = () => screen.getByTestId('canvas-header-row');

  it('published, nobody to compare with: the header block is truly empty (its `empty:hidden` can apply; no hidden child keeps its margin alive)', async () => {
    mount('/p/ana/canvas/canvas');
    await grid();
    await screen.findByTestId('canvas-clone');
    expect(headerBlock().childElementCount).toBe(0);
  });

  it('CONTROL: a draft has the same empty block (so both views start their first heading at the same height)', async () => {
    openDraftState();
    mount(DRAFT_AT);
    await grid();
    await screen.findByTestId('thread-panel');
    expect(headerBlock().childElementCount).toBe(0);
  });
});

// ── 13: touch targets ────────────────────────────────────────────────────────────────────────────────────────────

describe('13: the panel × and the Canvas | Thread switcher are at least 40px', () => {
  /** The 40px floor in Tailwind terms: h-10 / w-10 (2.5rem) or larger. */
  const atLeast40 = (cls: string, axis: 'h' | 'w') => {
    const sizes = [...cls.matchAll(new RegExp(`(?:^|\\s)${axis}-(\\d+)(?=\\s|$)`, 'g'))].map(m => Number(m[1]));
    return sizes.some(n => n >= 10);
  };
  it('the panel × (a draft, and the pending Clone\'s cancel) has a 40px hit area, and so do the two switcher tabs', async () => {
    stubWidth(false);
    openDraftState();
    mount(DRAFT_AT);
    await grid();
    const panel = await screen.findByTestId('thread-panel');
    const close = within(panel).getByLabelText('Close thread');
    expect(atLeast40(close.className, 'h') && atLeast40(close.className, 'w')).toBe(true);
    for (const id of ['workspace-view-canvas', 'workspace-view-chat']) expect(atLeast40(screen.getByTestId(id).className, 'h'), id).toBe(true);
    cleanup();
    openDraftState({ baseSeq: 1 });
    st.openDraft = null; st.draftRow = null;
    mount('/p/ana/canvas/canvas');
    await grid();
    fireEvent.click(await screen.findByTestId('canvas-clone'));
    const cancel = within(await screen.findByTestId('workspace-chat-pane')).getByLabelText('Close thread');
    expect(atLeast40(cancel.className, 'h') && atLeast40(cancel.className, 'w')).toBe(true);
  });
});
