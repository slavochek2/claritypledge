/**
 * @file p1536-undo-ui.test.tsx
 * @description P1536 D7, J6, S1.8 (client), D15: Undo in the workspace thread. The REAL route element, canvas page, thread panel and message list (only the database and the
 * chat's message transport are faked; the server's answers are modelled by `srv`, which is what `get_canvas_draft_state` and `canvas_draft_undo` read and write):
 *  - Undo is a ghost button under the mirror's reply of the run the SERVER names (`undo_run_id`), and nowhere else
 *  - a tap sends the run and the revision the screen holds; the boxes, Changed and the Publish spot follow, the reply reads "Undone.", the owner message is marked, and Undo moves
 *    to the previous applied run's reply; a second Undo walks back once more; there is no redo
 *  - each refusal the server can give (busy, busy_elsewhere, stale_view) and an authorization failure are said, change nothing here, and the screen re-reads
 *  - two tabs: the loser gets stale_view and its tap undoes nothing
 *  - D15: while a run is going the Undo spot is a status, never a disabled button
 *  - reads: one per change of the draft, none while the tab is hidden
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
}));
const getCanvas = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const byThread = vi.hoisted(() => vi.fn());
const reloadMsgs = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@/lib/supabase', () => ({ supabase: { rpc, functions: { invoke }, from: vi.fn() } }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: toastError, success: vi.fn() }) }));
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
vi.mock('@/app/components/canvas/canvas-share-control', () => ({ CanvasShareControl: () => null }));
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
    server: st.messages, messages: st.messages, status: 'ready', send: vi.fn(), stats: new Map(), hasMore: false, loadingEarlier: false,
    loadEarlier: vi.fn(), ensureLoaded: vi.fn(), lookup: vi.fn(), getLoaded: vi.fn(), syncVersion: 0, retrySend: vi.fn(), discard: vi.fn(), edit: vi.fn(), reload: reloadMsgs,
  }),
}));
vi.mock('@/app/pages/chat/MessageRow', () => ({ MessageRow: ({ msg }: { msg: ChatMessage }) => <li data-msg={msg.id}>{msg.body ?? 'card'}</li> }));

import { CanvasWithThread } from '@/app/pages/canvas/canvas-with-thread';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
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
  markRead: vi.fn(), subscribe: () => () => undefined, setViewing: vi.fn(), revision: 0,
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
        <Where />
        <Routes>
          <Route path="/p/:handle/canvas/:projectTag" element={<CanvasWithThread />} />
          <Route path="*" element={<div data-testid="elsewhere" />} />
        </Routes>
      </ChatContext.Provider>
    </MemoryRouter>,
  );
}
const stubWidth = (wide: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('pointer') || (wide && q.includes('1280')), addEventListener: () => undefined, removeEventListener: () => undefined, media: q }));


const grid = () => screen.findByTestId('canvas-grid');
const undoCalls = () => rpc.mock.calls.filter(c => c[0] === 'canvas_draft_undo');
const stateReads = () => rpc.mock.calls.filter(c => c[0] === 'get_canvas_draft_state');

const agent = (over: Partial<ChatMessage>) => msg({ authorId: null, kind: 'agent', ...over });
const mkRun = (id: string, over: Record<string, unknown> = {}) => ({ id, kind: 'message', state: 'done', input_kind: 'text', error_code: null, trigger_message_id: `m-${id}`, reply_message_id: `a-${id}`, scope: [], target_offer_id: null, created_at: '2026-10-28T08:00:00Z', finished_at: '2026-10-28T08:00:05Z', ...over });

/** What the server knows: the runs of the open draft (oldest first), the revision, and which boxes differ from the base. */
const srv = { revision: 7, runs: [] as Array<Record<string, unknown>>, changed: [] as string[] };
const undoRunId = () => [...srv.runs].reverse().find(r => r.state === 'done' && r.hasStep !== false)?.id ?? null;
const serverState = () => ({
  canvas_id: 'cv-1', canvas_name: 'canvas', closed_draft: null,
  draft: { id: 'draft-1', revision: srv.revision, undo_run_id: undoRunId(), runs: srv.runs.map(({ hasStep: _h, ...r }) => r) },
});
const syncDraft = () => {
  st.openDraft = draftBlock({ baseSeq: 1, revision: srv.revision, changedBoxes: srv.changed });
  st.draftRow = draftRow({ baseVersionId: 'ver-1', revision: srv.revision });
  st.latestRun = (() => {
    const r = srv.runs[srv.runs.length - 1];
    return r ? { id: r.id, kind: 'message', state: r.state, errorCode: null, createdAt: '2026-10-28T08:00:00.000Z', startedAt: '2026-10-28T08:00:00.000Z', inputKind: 'text', readyAt: null } : null;
  })();
};
/** The server's own Undo: restores the boxes of the run before, rewrites the reply, marks the run undone, bumps the revision. */
function serverUndo(expectedRun: string, expectedRevision: number) {
  if (srv.runs.some(r => r.state === 'running' || r.state === 'queued')) return { status: 'refused', code: 'busy', revision: srv.revision };
  if (expectedRun !== undoRunId() || expectedRevision !== srv.revision) return { status: 'refused', code: 'stale_view', revision: srv.revision };
  const run = srv.runs.find(r => r.id === expectedRun)!;
  run.state = 'undone';
  srv.revision += 1;
  srv.changed = run.changedBefore as string[];
  const reply = st.messages.find(m => (m as ChatMessage).id === run.reply_message_id) as ChatMessage;
  reply.body = 'Undone.';
  syncDraft();
  return { status: 'ok', revision: srv.revision, undone_run_id: expectedRun, next_undo_run_id: undoRunId() };
}

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
  st.hasV2 = false;
  // two applied runs: r1 changed Solution, r2 changed Problem too. The base (v1) differs in neither, so undoing both reaches "no difference".
  srv.revision = 7;
  srv.runs = [mkRun('r1', { changedBefore: [] }), mkRun('r2', { changedBefore: ['canvas:solution'] })];
  srv.changed = ['canvas:solution', 'canvas:problem'];
  syncDraft();
  st.messages = [
    msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-draft', createdAt: '2026-10-28T07:00:00.000Z' }),
    msg({ id: 'm-r1', body: 'sharpen the solution', createdAt: '2026-10-28T08:00:00.000Z' }),
    agent({ id: 'a-r1', body: 'Updated: Solution', createdAt: '2026-10-28T08:00:10.000Z' }),
    msg({ id: 'm-r2', body: 'and the problem', createdAt: '2026-10-28T08:01:00.000Z' }),
    agent({ id: 'a-r2', body: 'Updated: Problem', createdAt: '2026-10-28T08:01:10.000Z' }),
  ];
  byThread.mockReset();
  byThread.mockImplementation(async () => st.draftRow);
  rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'get_canvas_draft_state') return { data: serverState(), error: null };
    if (name === 'canvas_draft_undo') return { data: serverUndo(String(args.p_expected_run), Number(args.p_expected_revision)), error: null };
    return { data: null, error: null };
  });
  invoke.mockResolvedValue({ data: { enabled: true }, error: null });
  getCanvas.mockReset();
  getCanvas.mockImplementation(async (_o: string, _t: string, _v: unknown, _k: unknown, version?: string) => readFor(version ?? DRAFT_NAME));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

const DRAFT_AT = `/p/ana/canvas/canvas?v=${DRAFT_NAME}&ws=1`;
async function threadReady() {
  await grid();
  await screen.findByTestId('thread-panel');
  await waitFor(() => expect(screen.queryByTestId('canvas-loading')).toBeNull());
}
/** The message a trailing node sits right under. */
const under = (testId: string) => screen.getByTestId(testId).closest('li')!.previousElementSibling?.getAttribute('data-msg');

describe('D7/J6: where Undo is', () => {
  it('a ghost "Undo" under the mirror\'s reply of the run the server names (the newest applied), and under no other message', async () => {
    mount(DRAFT_AT);
    await threadReady();
    const undo = await screen.findByTestId('canvas-undo');
    expect(undo).toHaveTextContent('Undo');
    expect(screen.getAllByTestId('canvas-undo')).toHaveLength(1);
    expect(under('canvas-undo')).toBe('a-r2');
    expect(undo.className).not.toContain('bg-blue-600'); // ghost: rule 3, never a filled or boxed button
    expect(undo.className).not.toContain('border');
    expect(stateReads()).toHaveLength(1);
    expect(stateReads()[0]![1]).toEqual({ p_canvas: 'cv-1' });
  });

  it('CONTROL: a run that changed no box has no step: the server names an earlier run and Undo sits under THAT reply', async () => {
    srv.runs.push(mkRun('r3', { hasStep: false, reply_message_id: 'a-r3' }));
    st.messages.push(msg({ id: 'm-r3', body: 'what is a segment?' }), agent({ id: 'a-r3', body: 'No box changed.' }));
    syncDraft();
    mount(DRAFT_AT);
    await threadReady();
    await screen.findByTestId('canvas-undo');
    expect(under('canvas-undo')).toBe('a-r2');
  });

  it('CONTROL: nothing undoable (no run has a step): no Undo anywhere', async () => {
    srv.runs = srv.runs.map(r => ({ ...r, hasStep: false }));
    mount(DRAFT_AT);
    await threadReady();
    await waitFor(() => expect(stateReads()).toHaveLength(1));
    await act(async () => {});
    expect(screen.queryByTestId('canvas-undo')).toBeNull();
  });

  it('CONTROL: a draft with no run at all asks nothing and shows nothing', async () => {
    srv.runs = [];
    syncDraft();
    mount(DRAFT_AT);
    await threadReady();
    await act(async () => {});
    expect(screen.queryByTestId('canvas-undo')).toBeNull();
    expect(stateReads()).toHaveLength(0);
  });
});

describe('D7/J6/S1.8: a tap restores the draft', () => {
  it('sends the run and the revision the screen holds; the boxes, Changed and Publish follow; the reply reads "Undone."; Undo moves to the previous reply; the owner message is marked', async () => {
    mount(DRAFT_AT);
    await threadReady();
    expect(await screen.findAllByTestId('canvas-box-changed')).toHaveLength(1); // the page marks the boxes it holds as changed (the mock grid holds one point)
    expect(screen.getByTestId('publish-spot').getAttribute('data-state')).toBe('publish');
    fireEvent.click(await screen.findByTestId('canvas-undo'));
    await waitFor(() => expect(undoCalls()).toHaveLength(1));
    expect(undoCalls()[0]![1]).toEqual({ p_draft: 'draft-1', p_expected_run: 'r2', p_expected_revision: 7 });
    // the screen follows the server: the reply is "Undone.", Undo is under the previous applied run's reply, the owner's message is marked
    await waitFor(() => expect(under('canvas-undo')).toBe('a-r1'));
    expect(screen.getAllByTestId('canvas-undo')).toHaveLength(1);
    expect(st.messages.find(m => (m as ChatMessage).id === 'a-r2')).toMatchObject({ body: 'Undone.' });
    expect(reloadMsgs).not.toHaveBeenCalled(); // the rewrite arrives as a live edit; a reload would blank the thread's list while it loads
    expect(under('canvas-undone-mark')).toBe('m-r2');
    expect(screen.getAllByTestId('canvas-undone-mark')).toHaveLength(1);
  });

  it('the boxes: the page re-reads in place after Undo (Changed leaves, Publish gives way to "Nothing to publish yet" once nothing differs)', async () => {
    mount(DRAFT_AT);
    await threadReady();
    expect(await screen.findAllByTestId('canvas-box-changed')).toHaveLength(1);
    const reads = getCanvas.mock.calls.length;
    fireEvent.click(await screen.findByTestId('canvas-undo'));
    await waitFor(() => expect(undoCalls()).toHaveLength(1));
    await waitFor(() => expect(getCanvas.mock.calls.length).toBeGreaterThan(reads)); // the canvas page re-read
    await waitFor(() => expect(screen.getByTestId('publish-spot').getAttribute('data-state')).toBe('publish')); // r1's Solution change is still there: still something to publish
    // the second Undo walks back to the base: no difference
    fireEvent.click(await screen.findByTestId('canvas-undo'));
    await waitFor(() => expect(undoCalls()).toHaveLength(2));
    await waitFor(() => expect(screen.queryAllByTestId('canvas-box-changed')).toHaveLength(0));
    await waitFor(() => expect(screen.getByTestId('publish-spot').getAttribute('data-state')).toBe('nothing'));
    expect(screen.getByTestId('publish-spot')).toHaveTextContent('Nothing to publish yet');
  });

  it('a second Undo undoes the run BEFORE (r1) with the new revision; after it there is no Undo at all, and no redo', async () => {
    mount(DRAFT_AT);
    await threadReady();
    byThread.mockImplementation(async () => { await new Promise(r => setTimeout(r, 40)); return st.draftRow; }); // a real round trip: the thread's re-read does not land in the same render as the tap's own state
    fireEvent.click(await screen.findByTestId('canvas-undo'));
    await waitFor(() => expect(under('canvas-undo')).toBe('a-r1'));
    fireEvent.click(screen.getByTestId('canvas-undo'));
    await waitFor(() => expect(undoCalls()).toHaveLength(2));
    expect(undoCalls()[1]![1]).toEqual({ p_draft: 'draft-1', p_expected_run: 'r1', p_expected_revision: 8 });
    await waitFor(() => expect(screen.getAllByTestId('canvas-undone-mark')).toHaveLength(2));
    expect(screen.queryByTestId('canvas-undo')).toBeNull();
    expect(screen.queryByText(/redo/i)).toBeNull();
    expect(undoCalls()).toHaveLength(2);
    await waitFor(() => expect(stateReads().length).toBeGreaterThanOrEqual(2)); // the first look, and a confirming read after the Undos (one per DISTINCT revision seen: two quick taps may share one)
    await act(async () => { await new Promise(r => setTimeout(r, 200)); });
    expect(stateReads().length).toBeLessThanOrEqual(3); // never more than one read per change of the draft
  });

  it('a double tap sends one call', async () => {
    mount(DRAFT_AT);
    await threadReady();
    const button = await screen.findByTestId('canvas-undo');
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(under('canvas-undo')).toBe('a-r1'));
    expect(undoCalls()).toHaveLength(1);
  });
});

describe('D7: every refusal the server can give, and the two-tab case', () => {
  const refuse = (code: string) => rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'get_canvas_draft_state') return { data: serverState(), error: null };
    if (name === 'canvas_draft_undo') return { data: { status: 'refused', code, revision: srv.revision }, error: null };
    void args;
    return { data: null, error: null };
  });

  it.each(['busy', 'busy_elsewhere'])('%s: said in the existing sentence, nothing changed (the reply is still the reply), Undo stays', async code => {
    mount(DRAFT_AT);
    await threadReady();
    const button = await screen.findByTestId('canvas-undo');
    refuse(code);
    fireEvent.click(button);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('A draft is already being written. It will show here when it is done.'));
    expect(st.messages.find(m => (m as ChatMessage).id === 'a-r2')).toMatchObject({ body: 'Updated: Problem' });
    expect(screen.queryByTestId('canvas-undone-mark')).toBeNull();
    expect(await screen.findByTestId('canvas-undo')).toBeInTheDocument();
    expect(undoCalls()).toHaveLength(1);
  });

  it('TWO TABS: another tab already undid r2. This tab\'s tap is refused stale_view, undoes nothing more, says so, re-reads, and Undo now sits under the previous reply', async () => {
    mount(DRAFT_AT);
    await threadReady();
    const button = await screen.findByTestId('canvas-undo');
    expect(under('canvas-undo')).toBe('a-r2');
    serverUndo('r2', 7); // the other tab, behind this tab's back
    const reads = stateReads().length;
    fireEvent.click(button); // this tab still holds run r2 at revision 7
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('This draft changed since you last looked. Check it, then try Undo again.'));
    expect(undoCalls()).toHaveLength(1); // the loser's one call; nothing was retried on its own
    await waitFor(() => expect(under('canvas-undo')).toBe('a-r1'));
    expect(stateReads().length).toBeGreaterThan(reads);
    expect(srv.runs.map(r => r.state)).toEqual(['done', 'undone']); // r1 was NOT undone by the loser
    expect(screen.getAllByTestId('canvas-undone-mark')).toHaveLength(1);
  });

  it('an authorization failure (42501) is a failure, said once, nothing changes', async () => {
    mount(DRAFT_AT);
    await threadReady();
    const button = await screen.findByTestId('canvas-undo');
    rpc.mockImplementation(async (name: string) => (name === 'canvas_draft_undo'
      ? { data: null, error: { code: '42501', message: 'not authorized for this canvas' } }
      : { data: name === 'get_canvas_draft_state' ? serverState() : null, error: null }));
    fireEvent.click(button);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('That did not go through. Try again.'));
    expect(st.messages.find(m => (m as ChatMessage).id === 'a-r2')).toMatchObject({ body: 'Updated: Problem' });
    expect(await screen.findByTestId('canvas-undo')).toBeInTheDocument(); // the button is back: the person may try again
  });
});

describe('D15: while an update runs, the Undo spot is a status', () => {
  it('a run is going: where Undo was there is a status, not a disabled button, and no Undo to tap', async () => {
    srv.runs.push(mkRun('r3', { state: 'running', reply_message_id: null }));
    st.messages.push(msg({ id: 'm-r3', body: 'and the price' }));
    syncDraft();
    st.latestRun = { id: 'r3', kind: 'message', state: 'running', errorCode: null, createdAt: new Date().toISOString(), startedAt: new Date().toISOString(), inputKind: 'text', readyAt: null };
    mount(DRAFT_AT);
    await threadReady();
    const status = await screen.findByTestId('canvas-undo-waits');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveTextContent('Undo waits for the update');
    expect(under('canvas-undo-waits')).toBe('a-r2');
    expect(screen.queryByTestId('canvas-undo')).toBeNull();
    expect(screen.getByTestId('thread-panel').querySelectorAll('[disabled]')).toHaveLength(0);
    expect(undoCalls()).toHaveLength(0);
  });
});

describe('metered reads: one per change of the draft, none while the tab is hidden', () => {
  it('a hidden tab reads nothing; coming back reads once', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    mount(DRAFT_AT);
    await threadReady();
    await act(async () => {});
    expect(stateReads()).toHaveLength(0);
    expect(screen.queryByTestId('canvas-undo')).toBeNull();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(await screen.findByTestId('canvas-undo')).toBeInTheDocument();
    expect(stateReads()).toHaveLength(1);
  });

  it('re-reading the thread with the draft unchanged does not read again', async () => {
    mount(DRAFT_AT);
    await threadReady();
    await screen.findByTestId('canvas-undo');
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await act(async () => {});
    expect(stateReads()).toHaveLength(1);
  });
});

describe('review: a failed read shows its recovery, and Undo does not blink while the next read is in flight', () => {
  const failOnce = () => {
    let failed = false;
    rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === 'get_canvas_draft_state') {
        if (!failed) { failed = true; return { data: null, error: { code: 'XX000', message: 'boom' } }; }
        return { data: serverState(), error: null };
      }
      if (name === 'canvas_draft_undo') return { data: serverUndo(String(args.p_expected_run), Number(args.p_expected_revision)), error: null };
      return { data: null, error: null };
    });
  };

  it('a failed read: no Undo, but a visible "Undo did not load." with Try again under the newest reply; Try again reads once more and Undo appears', async () => {
    failOnce();
    mount(DRAFT_AT);
    await threadReady();
    const retry = await screen.findByTestId('canvas-undo-retry');
    expect(retry).toHaveTextContent('Undo did not load.');
    expect(under('canvas-undo-retry')).toBe('a-r2');
    expect(screen.queryByTestId('canvas-undo')).toBeNull();
    expect(stateReads()).toHaveLength(1);
    fireEvent.click(screen.getByTestId('canvas-undo-retry-button'));
    expect(await screen.findByTestId('canvas-undo')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-undo-retry')).toBeNull();
    expect(stateReads()).toHaveLength(2);
  });

  it('a failed read is not retried on a timer (no loop), and is retried once when the tab comes back', async () => {
    failOnce();
    mount(DRAFT_AT);
    await threadReady();
    await screen.findByTestId('canvas-undo-retry');
    await act(async () => { await new Promise(r => setTimeout(r, 400)); });
    expect(stateReads()).toHaveLength(1); // nothing on its own
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(await screen.findByTestId('canvas-undo')).toBeInTheDocument();
    expect(stateReads()).toHaveLength(2);
  });

  it('after a successful Undo the next Undo shows at once, from what the undo call and the last read already told: no blink while the read for the new revision is in flight', async () => {
    mount(DRAFT_AT);
    await threadReady();
    const button = await screen.findByTestId('canvas-undo');
    let release: () => void = () => undefined;
    const gate = new Promise<void>(r => { release = r; });
    rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === 'get_canvas_draft_state') { await gate; return { data: serverState(), error: null }; }
      if (name === 'canvas_draft_undo') return { data: serverUndo(String(args.p_expected_run), Number(args.p_expected_revision)), error: null };
      return { data: null, error: null };
    });
    fireEvent.click(button);
    await waitFor(() => expect(undoCalls()).toHaveLength(1));
    await waitFor(() => expect(stateReads()).toHaveLength(2)); // the read for the new revision is out and held
    expect(under('canvas-undo')).toBe('a-r1'); // ...and Undo is already under the previous reply
    expect(under('canvas-undone-mark')).toBe('m-r2'); // ...and the undone message is already marked
    release();
    await waitFor(() => expect(stateReads()).toHaveLength(2));
    await act(async () => {});
    expect(under('canvas-undo')).toBe('a-r1');
  });
});
