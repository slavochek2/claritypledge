/**
 * @file p1536-w6-discard.test.tsx
 * @description P1536 §3b W6 (S3b.6, Discard bullet): Discard draft in the thread panel's header, beside the draft's state. The REAL route element,
 * canvas page, thread panel and composer (only the database and the chat's message transport are faked):
 *  - a secondary pill with destructive text, in the panel header; absent in the pending (unwritten) Clone state
 *  - behind the confirm dialog; Cancel calls nothing; Discard calls the CHECKED discard with the draft's id and the revision the screen holds
 *  - a draft from vN lands on vN (published view: no ws=1, REPLACE); a never-published canvas lands on Artifacts > Canvases
 *  - stale_view re-reads the revision (the next press carries it); busy says the draft is being written
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
const freshRevision = vi.hoisted(() => ({ value: 9 }));

vi.mock('@/lib/supabase', () => ({ supabase: { rpc, functions: { invoke }, from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { revision: freshRevision.value, canvas_id: 'cv-1', version_name: 'canvas_dabc123' }, error: null }) }) }) })) } }));
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
    loadEarlier: vi.fn(), ensureLoaded: vi.fn(), lookup: vi.fn(), getLoaded: vi.fn(), syncVersion: 0, retrySend: vi.fn(), discard: vi.fn(), edit: vi.fn(), reload: vi.fn(),
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


const OTHER_WRITES = ['canvas_workspace_send', 'canvas_draft_open', 'canvas_draft_publish'];
const discards = () => rpc.mock.calls.filter(c => c[0] === 'canvas_draft_discard');

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
  st.openDraft = draftBlock({ baseSeq: 1, revision: 4 });
  st.hasV2 = false;
  st.draftRow = draftRow({ baseVersionId: 'ver-1' });
  st.latestRun = { id: 'run-1', kind: 'message', state: 'done', errorCode: null, createdAt: '2026-10-28T09:00:00.000Z', startedAt: '2026-10-28T09:00:00.000Z' };
  st.messages = [msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-draft' })];
  freshRevision.value = 9;
  byThread.mockReset();
  byThread.mockImplementation(async () => st.draftRow);
  rpc.mockImplementation(async (name: string) => (name === 'canvas_draft_discard' ? { data: { discarded: true }, error: null } : { data: null, error: null }));
  invoke.mockResolvedValue({ data: { enabled: true }, error: null });
  getCanvas.mockReset();
  getCanvas.mockImplementation(async (_o: string, _t: string, _v: unknown, _k: unknown, version?: string) => (version === DRAFT_NAME ? readFor(DRAFT_NAME) : readFor(version)));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DRAFT_AT = `/p/ana/canvas/canvas?v=${DRAFT_NAME}&ws=1`;
async function draftReady() {
  await screen.findByTestId('canvas-grid');
  await screen.findByTestId('thread-panel');
  await waitFor(() => expect(screen.queryByTestId('canvas-loading')).toBeNull());
}
const discardButton = () => within(screen.getByTestId('thread-panel')).getByTestId('canvas-discard');
const confirm = async () => within(await screen.findByRole('dialog'));

describe('W6: Discard sits in the panel header', () => {
  it('a secondary pill with destructive text, inside the thread panel\'s header, beside the draft title and the close button', async () => {
    mount(DRAFT_AT);
    await draftReady();
    const button = discardButton();
    expect(button).toHaveTextContent('Discard');
    const header = button.closest('header');
    expect(header).not.toBeNull();
    expect(within(header as HTMLElement).getByTestId('canvas-thread-title')).toHaveTextContent('Draft'); // beside the draft's title...
    expect(within(header as HTMLElement).getByLabelText('Close thread')).toBeInTheDocument(); // ...and the close button
    expect(button.className).toContain('bg-muted'); // the one secondary pill
    expect(button.className).toContain('text-destructive');
    expect(screen.queryByText('Discard draft')).toBeNull(); // no dialog until it is asked for
  });

  it('NOT offered in the pending Clone state (nothing is written there; × cancels), nor when no draft is open', async () => {
    st.openDraft = null;
    st.draftRow = null;
    mount('/p/ana/canvas/canvas?v=canvas_d111111');
    await screen.findByTestId('canvas-grid');
    fireEvent.click(await screen.findByTestId('canvas-clone'));
    await screen.findByTestId('workspace-chat-empty');
    expect(screen.queryByTestId('canvas-discard')).toBeNull();
  });
});

describe('W6: the confirm and the checked discard', () => {
  it('Cancel calls nothing and stays on the draft', async () => {
    mount(DRAFT_AT);
    await draftReady();
    fireEvent.click(discardButton());
    const dialog = await confirm();
    expect(dialog.getByText('Discard this draft? Its changes are removed. Published versions stay as they are.')).toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(discards()).toEqual([]);
    expect(screen.getByTestId('ws')).toHaveTextContent('1');
  });

  it('a draft from v1: Discard calls canvas_draft_discard(draft, revision) and returns the page to v1 (published view, no ws=1, REPLACE, panel gone)', async () => {
    mount(DRAFT_AT);
    await draftReady();
    fireEvent.click(discardButton());
    fireEvent.click((await confirm()).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(discards()).toHaveLength(1));
    expect(discards()[0]![1]).toEqual({ p_draft: 'draft-1', p_expected_revision: 4 });
    await waitFor(() => expect(screen.getByTestId('ws')).toHaveTextContent('none'));
    expect(screen.getByTestId('where')).toHaveTextContent('/p/ana/canvas/canvas?v=canvas_d111111');
    expect(screen.getByTestId('where').textContent).not.toContain(DRAFT_NAME);
    expect(screen.getByTestId('nav-type')).toHaveTextContent('REPLACE');
    await waitFor(() => expect(screen.queryByTestId('workspace-chat-pane')).toBeNull());
    expect(OTHER_WRITES.filter(n => rpc.mock.calls.some(c => c[0] === n))).toEqual([]);
  });

  it('a draft from v2 (v1 and v2 published) returns to v2, the version it was started from', async () => {
    st.hasV2 = true;
    st.openDraft = draftBlock({ baseSeq: 2, revision: 1 });
    mount(DRAFT_AT);
    await draftReady();
    fireEvent.click(discardButton());
    fireEvent.click((await confirm()).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/ana/canvas/canvas?v=canvas_d222222'));
    expect(screen.getByTestId('ws')).toHaveTextContent('none');
  });

  it('a NEVER-published canvas lands on Artifacts > Canvases (the canvases path; W5 adds the Drafts tab)', async () => {
    st.openDraft = draftBlock({ baseSeq: null, revision: 2 });
    getCanvas.mockImplementation(async () => ({ ...base, points: [point('canvas:problem')], version: DRAFT_NAME, versions: [draftVersion], publishedNone: true, draft: st.openDraft }));
    mount(DRAFT_AT);
    await draftReady();
    fireEvent.click(discardButton());
    const dialog = await confirm();
    expect(dialog.getByText('Discard this draft? Nothing of this canvas was published.')).toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.getByTestId('elsewhere')).toBeInTheDocument());
    expect(screen.getByTestId('where')).toHaveTextContent('/artifacts?tab=canvases');
    expect(discards()[0]![1]).toEqual({ p_draft: 'draft-1', p_expected_revision: 2 });
  });
});

describe('W6: refusals', () => {
  it('stale_view: the revision is re-read, the dialog stays, and the NEXT press carries the fresh revision', async () => {
    rpc.mockImplementation(async (name: string) => (name === 'canvas_draft_discard' ? { data: { status: 'refused', code: 'stale_view', revision: 9 }, error: null } : { data: null, error: null }));
    mount(DRAFT_AT);
    await draftReady();
    fireEvent.click(discardButton());
    fireEvent.click((await confirm()).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('This draft just changed. Discard it again if you still want to.'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('ws')).toHaveTextContent('1'); // not navigated
    rpc.mockImplementation(async (name: string) => (name === 'canvas_draft_discard' ? { data: { discarded: true }, error: null } : { data: null, error: null }));
    fireEvent.click((await confirm()).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(discards()).toHaveLength(2));
    expect(discards()[0]![1]).toEqual({ p_draft: 'draft-1', p_expected_revision: 4 });
    expect(discards()[1]![1]).toEqual({ p_draft: 'draft-1', p_expected_revision: 9 });
    await waitFor(() => expect(screen.getByTestId('ws')).toHaveTextContent('none'));
  });

  it('busy: the existing sentence, and the owner stays on the draft', async () => {
    rpc.mockImplementation(async (name: string) => (name === 'canvas_draft_discard' ? { data: { status: 'refused', code: 'busy', revision: 4 }, error: null } : { data: null, error: null }));
    mount(DRAFT_AT);
    await draftReady();
    fireEvent.click(discardButton());
    fireEvent.click((await confirm()).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('That draft is being written right now. Try again in a minute.'));
    expect(screen.getByTestId('ws')).toHaveTextContent('1');
    expect(screen.getByTestId('where')).toHaveTextContent(DRAFT_NAME);
  });
});
