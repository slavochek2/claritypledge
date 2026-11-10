/**
 * @file p1536-retry.test.tsx
 * @description P1536 §2 `canvas_draft_retry` (S1.6, S1.14, S3b.6 secondary): a FAILED newest run puts "Try again" (secondary) under the owner
 * message it belongs to, in the workspace thread. The REAL route element, thread panel and message list (only the database and the chat's
 * message transport are faked):
 *  - only for the draft's newest run, only while it is `failed`
 *  - the call carries the draft, the failed run, the revision the screen holds and a client id; the new run is then started by id
 *  - refusals use the existing sentences; `not_retryable` turns the button into "Send the file again." with no button
 *  - the owner message it sits under is the newest of the owner's own (pure helper)
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



import { retryTargetId } from '@/app/pages/chat/canvas-retry-target';
import { lacksSecondaryPill } from './p1536-pill-assert';

const failedRun = { id: 'run-failed', kind: 'message', state: 'failed', errorCode: 'model', createdAt: '2026-10-28T09:00:00.000Z', startedAt: '2026-10-28T09:00:00.000Z' };
const retries = () => rpc.mock.calls.filter(c => c[0] === 'canvas_draft_retry');
const retryOk = { status: 'ok', run_id: 'run-new', revision: 5, draft_id: 'draft-1', replayed: false };
const refused = (code: string) => ({ data: { status: 'refused', code, revision: 4 }, error: null });

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
  st.latestRun = failedRun;
  st.messages = [
    msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-draft', createdAt: '2026-10-28T07:00:00.000Z' }),
    msg({ id: 'm1', body: 'make the problem sharper', createdAt: '2026-10-28T08:00:00.000Z' }),
    msg({ id: 'm2', authorId: 'mirror-agent', body: 'I could not draft your canvas just now.', createdAt: '2026-10-28T08:01:00.000Z' }),
  ];
  byThread.mockReset();
  byThread.mockImplementation(async () => st.draftRow);
  rpc.mockImplementation(async (name: string) => (name === 'canvas_draft_retry' ? { data: retryOk, error: null } : { data: null, error: null }));
  invoke.mockImplementation(async (_name: string, opts?: { body?: { availability?: boolean; run_id?: string } }) => (opts?.body?.run_id ? { data: { run_id: opts.body.run_id, kind: 'message' }, error: null } : { data: { enabled: true }, error: null }));
  getCanvas.mockReset();
  getCanvas.mockImplementation(async (_o: string, _t: string, _v: unknown, _k: unknown, version?: string) => readFor(version ?? DRAFT_NAME));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DRAFT_AT = `/p/ana/canvas/canvas?v=${DRAFT_NAME}&ws=1`;
async function threadReady() {
  await screen.findByTestId('canvas-grid');
  await screen.findByTestId('thread-panel');
  await waitFor(() => expect(screen.queryByTestId('canvas-loading')).toBeNull());
}

describe('Try again: where it shows', () => {
  it('a failed newest run: a secondary "Try again" right under the owner message it belongs to (not under the mirror\'s reply)', async () => {
    mount(DRAFT_AT);
    await threadReady();
    const button = await screen.findByTestId('canvas-retry-button');
    expect(button).toHaveTextContent('Try again');
    expect(lacksSecondaryPill(button)).toEqual([]); // the one secondary pill (W7: Compare's look)
    const trailing = screen.getByTestId('message-trailing');
    expect(trailing.previousElementSibling).toHaveAttribute('data-msg', 'm1');
    expect(trailing.nextElementSibling).toHaveAttribute('data-msg', 'm2');
  });

  it.each(['done', 'running', 'queued', 'capped', 'undone'])('CONTROL: a newest run that is %s shows none', async (state) => {
    st.latestRun = { ...failedRun, state, createdAt: new Date().toISOString(), startedAt: new Date().toISOString() };
    mount(DRAFT_AT);
    await threadReady();
    await act(async () => {});
    expect(screen.queryByTestId('canvas-retry-button')).toBeNull();
  });

  it('CONTROL: a draft with no run at all shows none', async () => {
    st.latestRun = null;
    mount(DRAFT_AT);
    await threadReady();
    expect(screen.queryByTestId('canvas-retry-button')).toBeNull();
  });
});

describe('Try again: the call', () => {
  it('calls canvas_draft_retry with the draft, the failed run, the revision on screen and a client id, then starts the new run by its id; the button goes when the run is under way', async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name !== 'canvas_draft_retry') return { data: null, error: null };
      st.latestRun = { id: 'run-new', kind: 'message', state: 'queued', errorCode: null, createdAt: new Date().toISOString(), startedAt: null };
      return { data: retryOk, error: null };
    });
    mount(DRAFT_AT);
    await threadReady();
    fireEvent.click(await screen.findByTestId('canvas-retry-button'));
    await waitFor(() => expect(retries()).toHaveLength(1));
    expect(retries()[0]![1]).toEqual({ p_draft: 'draft-1', p_failed_run: 'run-failed', p_expected_revision: 4, p_client_id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('canvas-draft', { body: { run_id: 'run-new' } }));
    await waitFor(() => expect(screen.queryByTestId('canvas-retry-button')).toBeNull());
    expect(toastError).not.toHaveBeenCalled();
  });

  it('a failed FILE run shows no Try again at all (its file is not kept; the thread reply says to send it again)', async () => {
    st.latestRun = { ...failedRun, inputKind: 'file' };
    mount(DRAFT_AT);
    await threadReady();
    expect(screen.queryByTestId('canvas-retry-button')).toBeNull();
  });

  it.each([
    ['voice', 'Record it again or type it.'],
    ['text', 'That cannot be tried again. Send your message again.'],
    [null, 'That cannot be tried again. Send your message again.'],
  ])('not_retryable (P1653, one sentence per run kind): a %s run reads its own words and there is no button', async (inputKind, words) => {
    st.latestRun = { ...failedRun, inputKind };
    rpc.mockImplementation(async (name: string) => (name === 'canvas_draft_retry' ? refused('not_retryable') : { data: null, error: null }));
    mount(DRAFT_AT);
    await threadReady();
    fireEvent.click(await screen.findByTestId('canvas-retry-button'));
    expect(await screen.findByText(words)).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-retry-button')).toBeNull();
    expect(toastError).not.toHaveBeenCalled();
    expect(invoke.mock.calls.some(c => (c[1] as { body?: { run_id?: string } } | undefined)?.body?.run_id)).toBe(false); // nothing was started
  });

  it.each([
    ['busy', 'A draft is already being written. It will show here when it is done.'],
    ['busy_elsewhere', 'A draft is already being written. It will show here when it is done.'],
    ['cap_reached', 'This draft has used all its revisions. Publish it, or discard it and start a new draft.'],
    ['stale_view', 'This draft changed since you last looked. Check it, then try again.'],
  ])('%s: the existing sentence, once, and the button stays', async (code, sentence) => {
    rpc.mockImplementation(async (name: string) => (name === 'canvas_draft_retry' ? refused(code) : { data: null, error: null }));
    mount(DRAFT_AT);
    await threadReady();
    fireEvent.click(await screen.findByTestId('canvas-retry-button'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(sentence));
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('canvas-retry-button')).toBeInTheDocument();
  });
});

describe('Try again: the owner message it sits under', () => {
  const m = (over: Partial<ChatMessage>) => msg(over);
  it('is the newest message of the owner\'s own: not the root, not the mirror\'s, not a deleted one', () => {
    const list = [
      m({ id: ROOT, createdAt: '2026-10-28T07:00:00.000Z' }),
      m({ id: 'a', createdAt: '2026-10-28T08:00:00.000Z' }),
      m({ id: 'b', createdAt: '2026-10-28T09:00:00.000Z' }),
      m({ id: 'c', authorId: 'mirror-agent', createdAt: '2026-10-28T10:00:00.000Z' }),
      m({ id: 'd', isDeleted: true, createdAt: '2026-10-28T11:00:00.000Z' }),
    ];
    expect(retryTargetId(list, ME, ROOT)).toBe('b');
    expect(retryTargetId([list[0]!, list[3]!], ME, ROOT)).toBeNull();
  });
});
