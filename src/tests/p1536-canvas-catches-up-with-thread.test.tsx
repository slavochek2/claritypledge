/**
 * @file p1536-canvas-catches-up-with-thread.test.tsx
 * @description P1536: the canvas beside a draft's thread must not stay behind what the thread read. The REAL page beside the REAL thread (the harness of p1536-canvas-thread-sync.test.tsx;
 * only the database and the message transport are faked), with the answers in a chosen order.
 * The defect, as measured on hosted TEST at 375 (3 of 20 tagged first Sends): the page's read answered at revision 2 with no changed box, the run finished, and the thread's FIRST read saw it already
 * done. A first read only records (p1536-canvas-thread-updated-event.test.tsx), so no event came and the page was never asked again: the thread said "Updated", the spot "Nothing to publish yet", until a reload.
 * The same family: a tap on Add to chat after Publish, before the page's re-read has answered, was decided on the read that still showed the draft open.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-mappers';
import type { PointWithUserPosition } from '@/app/types';

const ME = 'owner-1';
const CONV = 'conv-mirror-1';
const ROOT = 'root-1';
const DRAFT_NAME = 'canvas_dabc123';

const st = vi.hoisted(() => ({
  draft: null as Record<string, unknown> | null,
  /** Answers of the draft read in order, before `draft` takes over: lets a test say what each read saw. */
  draftAnswers: [] as Record<string, unknown>[],
  run: null as Record<string, unknown> | null,
  messages: [] as unknown[],
  canvasCalls: 0,
}));
const getCanvas = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({ supabase: { rpc, functions: { invoke }, from: vi.fn() } }));
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: toastSuccess }) }));
vi.mock('@/auth', () => ({
  useAuth: () => ({ session: { user: { id: ME } }, user: { id: ME, slug: 'ana' }, sessionChecked: true }),
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
  getCanvasDraftByThread: async () => st.draftAnswers.shift() ?? st.draft,
  getLatestCanvasRun: async () => st.run,
  listCanvasMaterial: async () => [],
  countDoneCanvasDraftRuns: async () => 1,
  getLastDoneCanvasDraftRunAt: async () => '2026-10-28T09:00:00.000Z',
  getCanvasDraftViewPath: async () => `/p/ana/canvas/canvas?v=${DRAFT_NAME}`,
  listMyCanvasVersions: async () => [],
}));
vi.mock('@/app/pages/chat/use-message-actions', () => ({ useMessageActions: () => ({ actions: {}, dialogs: null }) }));
vi.mock('@/app/pages/chat/use-conversation', () => ({
  isLocal: () => false,
  useConversationMessages: () => ({
    server: st.messages, messages: st.messages, status: 'ready', send: vi.fn(), stats: new Map(), hasMore: false, loadingEarlier: false,
    loadEarlier: vi.fn(), ensureLoaded: vi.fn(), lookup: vi.fn(), getLoaded: vi.fn(), syncVersion: 0, retrySend: vi.fn(), discard: vi.fn(), edit: vi.fn(), reload: vi.fn(),
  }),
}));
vi.mock('@/app/pages/chat/MessageRow', () => ({ MessageRow: ({ msg }: { msg: ChatMessage }) => <li data-msg={msg.id}>{msg.body ?? 'card'}</li> }));
vi.mock('@/app/pages/chat/chat-hooks', async () => ({ ...(await vi.importActual<object>('@/app/pages/chat/chat-hooks')), useMediaQuery: () => true }));

import { CanvasWithThread } from '@/app/pages/canvas/canvas-with-thread';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { resetCanvasThreads } from '@/app/pages/chat/canvas-thread-registry';
import { RUN_POLL_MS } from '@/app/pages/chat/use-canvas-thread';
import { subscribeCanvasDraftEvents } from '@/app/data/canvas-draft-events';
import { SETTLE_MAX_MS } from '@/app/pages/canvas/use-settled-run';
import { useCanvasCatchesUp } from '@/app/pages/canvas/use-canvas-catches-up';
import { buildReady, type CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { clearLinkTokens } from '@/lib/canvas-link-token';
import { clearListReturnCache } from '@/lib/list-return-cache';

const summary: ChatSummary = {
  conversationId: CONV, kind: 'mirror', title: 'Mira', other: null, org: null, event: null, ownerFirstName: 'Ana',
  lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false,
};
const chatValue = {
  userId: ME, status: 'ready', error: null, chats: [summary], unreadCount: 0, refresh: vi.fn(async () => [summary]), setArchived: vi.fn(), setManualUnread: vi.fn(),
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
  id: 'draft-1', versionId: 'ver-draft', canvasId: 'cv-1', baseVersionId: null, conversationId: CONV, threadRootId: ROOT, state: 'open', runCount: 1, revision: 0,
  tensionCount: 0, closedAt: null, canvasName: 'canvas', versionName: DRAFT_NAME, ...over,
});
const doneRun = { id: 'run-1', kind: 'draft', speed: 'fast', state: 'done', errorCode: null, createdAt: '2026-10-28T09:00:00.000Z', startedAt: '2026-10-28T09:00:00.000Z' };

const point = (box: string) => ({
  id: `p-${box}`, statement: `Bet for ${box}`, tags: [], systemTags: [box], visibility: 'private', userPosition: null,
  totalPositions: 0, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  positionCounts: { agree: 0, strongly_agree: 0, somewhat_agree: 0, unsure: 0, disagree: 0, strongly_disagree: 0, somewhat_disagree: 0 },
}) as unknown as PointWithUserPosition;
const v1 = { name: 'canvas_d111111', createdAt: '2026-10-01T10:00:00Z', seq: 1, publishedAt: '2026-10-01T10:00:00Z', draft: false };
const draftVersion = { name: DRAFT_NAME, createdAt: '2026-10-20T10:00:00Z', seq: null, publishedAt: null, draft: true };
const draftBlock = { id: 'draft-1', version: DRAFT_NAME, questions: {}, threadRootId: ROOT, conversationId: CONV, baseSeq: 1, runCount: 1, revision: 0, changedBoxes: ['canvas:problem'] };
const base = { stories: new Map(), addedStoryIds: [], positions: new Map(), visibility: 'private' as const, isOwner: true, admitted: true, generalAccess: 'restricted' as const, via: null, canvasExists: true };
const draftView = (points: PointWithUserPosition[]) => ({ ...base, points, version: DRAFT_NAME, versions: [draftVersion, v1], publishedNone: false, draft: draftBlock });
const publishedView = () => ({ ...base, points: [point('canvas:problem'), point('canvas:love')], version: 'canvas_d222222', versions: [{ ...v1, name: 'canvas_d222222', seq: 2 }, v1], publishedNone: false, draft: null });

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname}{l.search}</output>;
}
function mount(at = `/p/ana/canvas/canvas?v=${DRAFT_NAME}&ws=1`) {
  render(
    <MemoryRouter initialEntries={[at]}>
      <ChatContext.Provider value={chatValue}>
        <Where />
        <Routes><Route path="/p/:handle/canvas/:projectTag" element={<CanvasWithThread />} /></Routes>
      </ChatContext.Provider>
    </MemoryRouter>,
  );
}
/** Both halves are up: the canvas grid, the draft's boxes, and the thread's pane with its draft read. */
async function ready() {
  await screen.findByTestId('canvas-grid');
  await screen.findByTestId('thread-panel');
  await waitFor(() => expect(screen.queryByTestId('canvas-loading')).toBeNull());
}

beforeEach(() => {
  vi.clearAllMocks();
  clearLinkTokens();
  clearListReturnCache();
  resetCanvasAvailability();
  resetCanvasThreads();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  st.draft = draftRow();
  st.draftAnswers = [];
  st.run = doneRun;
  st.messages = [msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-draft' })];
  rpc.mockImplementation(async (name: string) => (name === 'canvas_draft_publish' ? { data: { seq: 2, skipped_links: 0 }, error: null } : name === 'canvas_draft_discard' ? { data: true, error: null } : { data: null, error: null }));
  invoke.mockResolvedValue({ data: { enabled: true }, error: null });
  getCanvas.mockReset();
  getCanvas.mockResolvedValue(draftView([point('canvas:problem')]));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});


const rev = (revision: number, changedBoxes: string[] = []) => ({ ...draftView([point('canvas:problem')]), draft: { ...draftBlock, revision, changedBoxes } });
const spot = () => screen.getByTestId('publish-spot').getAttribute('data-state');
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 30)); });

describe('a run that finished before the thread first looked', () => {
  it('the page re-reads, the spot holds Updating… until the answer, then Publish shows and the box is marked', async () => {
    const second = deferred<ReturnType<typeof rev>>();
    getCanvas.mockResolvedValueOnce(rev(2)).mockReturnValueOnce(second.promise);
    st.draft = draftRow({ revision: 3 }); // what the thread reads: the run is done (beforeEach)
    const spots: (string | null)[] = [];
    mount();
    await screen.findByTestId('thread-panel');
    await waitFor(() => expect(getCanvas).toHaveBeenCalledTimes(2));
    await settle();
    spots.push(spot());
    expect(spots).toEqual(['updating']); // never "Nothing to publish yet" while the page is known to be behind
    await act(async () => { second.resolve(rev(3, ['canvas:problem'])); });
    await waitFor(() => expect(spot()).toBe('publish'));
    expect(screen.getByTestId('canvas-box-changed')).toBeInTheDocument();
    await settle();
    expect(getCanvas).toHaveBeenCalledTimes(2); // caught up: nothing more is asked
  });

  it('the run finished BETWEEN the thread\'s two reads (the draft read before it, the run read after): the draft is read again, so the page is still caught up', async () => {
    getCanvas.mockResolvedValueOnce(rev(2)).mockResolvedValue(rev(3, ['canvas:problem']));
    st.draftAnswers = [draftRow({ revision: 2 })]; // the draft read answered at revision 2...
    st.draft = draftRow({ revision: 3 }); // ...then the run read says done (beforeEach), and the draft is at 3 from then on
    mount();
    await screen.findByTestId('thread-panel');
    await waitFor(() => expect(spot()).toBe('publish'));
    expect(getCanvas).toHaveBeenCalledTimes(2);
  });

  it('an answer still behind the thread asks NOTHING more (never a loop of metered reads), and the spot lets go at once', async () => {
    getCanvas.mockImplementation(async () => rev(2)); // each answer is a new read, and each is behind
    st.draft = draftRow({ revision: 3 });
    mount();
    await screen.findByTestId('thread-panel');
    await waitFor(() => expect(getCanvas).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(spot()).toBe('nothing'));
    await settle();
    expect(getCanvas).toHaveBeenCalledTimes(2);
  });

  it('CONTROL: a page behind the draft with no finished run (a failed run, or none) is not asked: nothing changed its boxes', async () => {
    getCanvas.mockResolvedValue(rev(2));
    st.draft = draftRow({ revision: 3 });
    st.run = { ...doneRun, state: 'failed' };
    mount();
    await ready();
    await settle();
    expect(getCanvas).toHaveBeenCalledTimes(1);
    expect(spot()).toBe('nothing');
  });

  it('CONTROL: a page read that is already at the thread\'s revision is not read again (no request for nothing)', async () => {
    getCanvas.mockResolvedValue(rev(3, ['canvas:problem']));
    st.draft = draftRow({ revision: 3 });
    mount();
    await ready();
    await settle();
    expect(getCanvas).toHaveBeenCalledTimes(1);
    expect(spot()).toBe('publish');
  });

  it('CONTROL: a run the thread watched going: no read during it, and ONE read when it ends (the event and the catch-up do not both ask)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getCanvas.mockResolvedValue(rev(1));
    st.draft = draftRow({ revision: 2 }); // the claim moved the revision: the page is "behind", and it does not matter while the run is going
    st.run = { ...doneRun, kind: 'message', state: 'running', createdAt: new Date().toISOString(), startedAt: new Date().toISOString() };
    const events: string[] = [];
    const stop = subscribeCanvasDraftEvents(e => events.push(e.kind));
    mount();
    await ready();
    await waitFor(() => expect(spot()).toBe('updating'));
    await act(async () => { await vi.advanceTimersByTimeAsync(RUN_POLL_MS + 200); });
    expect(getCanvas).toHaveBeenCalledTimes(1);
    getCanvas.mockResolvedValue(rev(3, ['canvas:problem']));
    st.draft = draftRow({ revision: 3 });
    st.run = { ...doneRun, kind: 'message', createdAt: '2026-10-28T09:10:00.000Z', startedAt: '2026-10-28T09:10:00.000Z' };
    await act(async () => { await vi.advanceTimersByTimeAsync(RUN_POLL_MS + 200); });
    await waitFor(() => expect(spot()).toBe('publish'));
    expect(events).toEqual(['updated']);
    expect(getCanvas).toHaveBeenCalledTimes(2);
    stop();
  });

  it('a catch-up read that fails asks no more, keeps what is shown, and the spot lets go after the failsafe (never a stuck Updating…)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getCanvas.mockResolvedValueOnce(rev(2)).mockRejectedValue(new Error('down'));
    st.draft = draftRow({ revision: 3 });
    mount();
    await screen.findByTestId('thread-panel');
    await waitFor(() => expect(getCanvas).toHaveBeenCalledTimes(2));
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(spot()).toBe('updating');
    await act(async () => { await vi.advanceTimersByTimeAsync(SETTLE_MAX_MS + 100); });
    expect(spot()).toBe('nothing');
    expect(getCanvas).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('canvas-grid')).toBeInTheDocument();
  });
});

describe('the next draft on the same page (the walk: publish, Add to chat, Send)', () => {
  const readOf = (id: string, revision: number): CanvasReady => buildReady(
    { id: ME, name: 'Ana' },
    { ...rev(revision), version: `v-${id}`, draft: { ...draftBlock, id, version: `v-${id}`, revision } } as unknown as Parameters<typeof buildReady>[1],
    null,
  );

  it('a new draft is asked about at its own revision, whatever revision the draft before it reached', () => {
    const asks: string[] = [];
    const stop = subscribeCanvasDraftEvents(e => asks.push(e.draftId));
    const h = renderHook(({ read }) => useCanvasCatchesUp(read), { initialProps: { read: readOf('A', 2) } });
    act(() => h.result.current.onDraftRead('A', 3));
    expect(asks).toEqual(['A']);
    h.rerender({ read: readOf('A', 3) });
    expect(h.result.current.behind).toBe(false);
    // the next draft starts its revisions again: revision 3 of B is news, though A reached 3
    h.rerender({ read: readOf('B', 2) });
    act(() => h.result.current.onDraftRead('B', 3));
    expect(asks).toEqual(['A', 'B']);
    expect(h.result.current.behind).toBe(true);
    stop();
  });
});

describe('Add to chat after Publish, before the page has read again', () => {
  const publishedAfter = () => ({ ...publishedView(), version: DRAFT_NAME, versions: [{ ...v1, name: DRAFT_NAME, seq: 2 }, v1] });

  it('the tap waits for the read and then enters the pending Clone with the tag (the read on screen still shows the draft open: it must not decide)', async () => {
    getCanvas.mockResolvedValueOnce(rev(0, ['canvas:problem']));
    st.draft = draftRow({ revision: 0 });
    mount();
    await ready();
    const after = deferred<ReturnType<typeof publishedAfter>>();
    getCanvas.mockReturnValue(after.promise);
    st.draft = draftRow({ state: 'published', closedAt: '2026-10-28T10:00:00.000Z' });
    fireEvent.click(screen.getByTestId('canvas-draft-publish'));
    await waitFor(() => expect(screen.getByTestId('where')).not.toHaveTextContent('ws=1'));
    await settle();
    // the panel is gone, the re-read is out, and the boxes are still the draft's: the tap lands here
    fireEvent.click(screen.getByTestId('canvas-add-to-chat-canvas:problem'));
    await settle();
    await act(async () => { after.resolve(publishedAfter()); });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('ws=1'));
    await screen.findByTestId('workspace-chat-empty');
    await waitFor(() => expect(screen.getByTestId('composer').querySelector('textarea')?.value ?? '').toContain('[Problem]'));
  });
});
