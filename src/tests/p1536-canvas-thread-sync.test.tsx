/**
 * @file p1536-canvas-thread-sync.test.tsx
 * @description P1536 v3 / S3: the REAL canvas page beside the REAL draft thread in the workspace (the route wrapper, ThreadPanel, the
 * thread's data hook, the page's data loader; only the database and the chat's message transport are faked).
 *  - thread -> canvas: a run that finishes in the thread re-reads the canvas IN PLACE (same grid element, still on the draft's address)
 *  - canvas -> thread: Publish in the workspace bar's spot re-reads the thread's draft (it reads "published"), the pane stays, the page leaves
 *    the draft's address
 *  - thread -> canvas: a discard made in the thread's "…" menu moves the page off the draft's address
 *  - at most one filled primary is on screen in the combined view (Publish, rule 9; the tray's Update draft is an outline; the thread has no draft card)
 * Each direction has a control showing the same event does nothing to an unrelated draft.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  getCanvasDraftByThread: async () => st.draft,
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
import { emitCanvasDraftEvent } from '@/app/data/canvas-draft-events';
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
const filled = () => Array.from(document.querySelectorAll('button, a')).filter(el => el.className.toString().split(/\s+/).includes('bg-blue-600'));

beforeEach(() => {
  vi.clearAllMocks();
  clearLinkTokens();
  clearListReturnCache();
  resetCanvasAvailability();
  resetCanvasThreads();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  st.draft = draftRow();
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

describe('thread -> canvas: a run that finishes in the thread re-reads the canvas in place', () => {
  it('the poll sees the run end, the canvas shows the new point, on the same grid element and the draft\'s address', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    st.run = { ...doneRun, state: 'running', createdAt: new Date().toISOString(), startedAt: new Date().toISOString() };
    mount();
    await ready();
    // the thread is writing: status lives in the spot (W0: no tray progress); the thread reports it from an effect, so wait for it
    await waitFor(() => expect(screen.getByTestId('publish-spot')).toHaveAttribute('data-state', 'updating'));
    const grid = screen.getByTestId('canvas-grid');
    expect(screen.queryByTestId('canvas-point-card-p-canvas:love')).toBeNull();
    const reads = getCanvas.mock.calls.length;

    getCanvas.mockResolvedValue(draftView([point('canvas:problem'), point('canvas:love')]));
    st.run = { ...doneRun, createdAt: '2026-10-28T09:10:00.000Z', startedAt: '2026-10-28T09:10:00.000Z' }; // a newer finished run than the one before
    await act(async () => { await vi.advanceTimersByTimeAsync(RUN_POLL_MS + 200); });

    expect(await screen.findByTestId('canvas-point-card-p-canvas:love')).toBeInTheDocument();
    expect(getCanvas.mock.calls.length).toBeGreaterThan(reads);
    expect(getCanvas.mock.calls.at(-1)![4]).toBe(DRAFT_NAME); // still the draft's version
    expect(screen.getByTestId('where')).toHaveTextContent(`v=${DRAFT_NAME}`);
    expect(screen.getByTestId('canvas-grid')).toBe(grid); // refreshed in place, never remounted
  });

  it('CONTROL: a run that ends well for ANOTHER draft leaves the canvas alone', async () => {
    mount();
    await ready();
    const reads = getCanvas.mock.calls.length;
    act(() => emitCanvasDraftEvent({ kind: 'updated', draftId: 'some-other-draft' }));
    await act(async () => {});
    expect(getCanvas.mock.calls.length).toBe(reads);
  });

  it('a draft discarded elsewhere (its event) moves the page off the draft\'s address (the draft is gone); the "…" menu is gone with W0, Discard returns in W6', async () => {
    mount();
    await ready();
    expect(screen.queryByLabelText('Canvas draft options')).toBeNull();
    getCanvas.mockResolvedValue({ ...publishedView(), version: 'canvas_d111111', versions: [v1], points: [point('canvas:problem')] });
    act(() => emitCanvasDraftEvent({ kind: 'discarded', draftId: 'draft-1' }));
    await waitFor(() => expect(screen.getByTestId('where')).not.toHaveTextContent(DRAFT_NAME));
    expect(screen.getByTestId('where')).toHaveTextContent('ws=1'); // the workspace marker is untouched
    await waitFor(() => expect(getCanvas.mock.calls.at(-1)![4]).toBeUndefined()); // the newest published version opens (the re-read lands after the address moves)
  });
});

describe('canvas -> thread: Publish in the workspace bar (W1: the page REPLACEs to the new version, the panel closes, a toast says it)', () => {
  it('re-reads the draft, REPLACEs to ?v=<the published version> with no ws, closes the panel and toasts "Published v2."', async () => {
    mount();
    await ready();
    st.draft = draftRow({ state: 'published', closedAt: '2026-10-28T10:00:00.000Z' }); // what the database says after the publish
    // the draft's own version row is the one published: the same name, now with a number
    getCanvas.mockResolvedValue({ ...publishedView(), version: DRAFT_NAME, versions: [{ ...v1, name: DRAFT_NAME, seq: 2 }, v1] });

    fireEvent.click(screen.getByTestId('canvas-draft-publish'));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('canvas_draft_publish', { p_draft: 'draft-1', p_expected_revision: 0 }));
    await waitFor(() => expect(screen.getByTestId('where')).not.toHaveTextContent('ws=1'));
    expect(screen.getByTestId('where')).toHaveTextContent(`/p/ana/canvas/canvas?v=${DRAFT_NAME}`);
    expect(screen.getByTestId('where').textContent).not.toContain('thread=');
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Published v2.'));
    await waitFor(() => expect(screen.queryByTestId('workspace-chat-pane')).toBeNull()); // the panel is closed
    expect(screen.queryByTestId('workspace-bar')).toBeNull();
    // and the marker does not come back while the read on screen still shows the draft open
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(screen.getByTestId('where')).not.toHaveTextContent('ws=1');
    // the spot now says what is true: a status, not a button — in the published view's own header there is no Publish at all
    expect(screen.queryByTestId('canvas-draft-publish')).toBeNull();
  });
});

describe('the combined view has at most one filled primary: Publish (rule 9)', () => {
  it('there is no draft card, no "Revise in chat" link, and exactly one filled control on screen: Publish', async () => {
    mount();
    await ready();
    const publish = screen.getByTestId('canvas-draft-publish');
    expect(publish.className).toContain('bg-blue-600');
    expect(screen.queryByTestId('canvas-draft-card')).toBeNull(); // the draft is on screen; Publish lives in the bar
    expect(screen.queryByTestId('canvas-draft-revise')).toBeNull();
    expect(filled()).toEqual([publish]);
  });

  it('W0: with a draft open there is no "Update draft" and no tray anywhere; Publish stays the one filled control', async () => {
    st.messages = [...st.messages, msg({ id: 'note-1', body: 'make the problem sharper', createdAt: '2026-10-28T09:30:00.000Z' })];
    mount();
    await ready();
    expect(screen.queryByRole('button', { name: /update draft/i })).toBeNull();
    expect(screen.queryByTestId('canvas-bar')).toBeNull();
    expect(filled().map(el => el.textContent)).toEqual(['Publish']);
  });

  it('CONTROL: an address with no `ws` marker, on the owner\'s own draft, gains it (replace): the owner on a draft is always in the workspace', async () => {
    mount(`/p/ana/canvas/canvas?v=${DRAFT_NAME}`);
    await screen.findByTestId('canvas-grid');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('ws=1'));
    expect(await screen.findByTestId('workspace-chat-pane')).toBeInTheDocument();
  });

  it('an old `thread=` address is rewritten to `ws=1` and the draft comes from the page\'s own read', async () => {
    mount(`/p/ana/canvas/canvas?v=${DRAFT_NAME}&thread=${ROOT}`);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('ws=1'));
    expect(screen.getByTestId('where')).not.toHaveTextContent('thread=');
    expect(await screen.findByTestId('thread-panel')).toBeInTheDocument();
  });
});
