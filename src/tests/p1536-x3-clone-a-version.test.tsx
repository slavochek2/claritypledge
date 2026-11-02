/**
 * @file p1536-x3-clone-a-version.test.tsx
 * @description P1536 3c X3 (S3c.3): "Clone a version" lands on the published version carrying the Clone intent, and the canvas page runs the SAME
 * clone() decision as the Clone button once that version has loaded. The REAL route element, canvas page, thread panel and composer (only the database
 * and the chat's message transport are faked). One test each, as the spec asks:
 *  - no draft: pending (nothing written)
 *  - same-base draft: opens that draft
 *  - other base touched: the J4 sheet
 *  - other base untouched: pending, replaced only in the first Send's transaction (and a stale revision asks again, the text kept)
 * plus: the intent is consumed once, tap then cancel writes nothing, and a page that is not the viewer's own drops the intent instead of keeping it.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { CLONE_INTENT_KEY } from '@/lib/canvas-hrefs';
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
  const s = (l.state ?? {}) as Record<string, unknown>;
  return (
    <>
      <output data-testid="where">{l.pathname}{l.search}</output>
      <output data-testid="ws">{p.get('ws') ?? 'none'}</output>
      <output data-testid="nav-type">{useNavigationType()}</output>
      <output data-testid="intent">{s[CLONE_INTENT_KEY] === true ? 'set' : 'none'}</output>
      <output data-testid="from">{typeof s.from === 'string' ? s.from : ''}</output>
    </>
  );
}
/** The page as "Clone a version" leaves it: a published version in the address, the intent and the way back in the navigation state. */
function mount(search: string, intent = true) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/p/ana/canvas/canvas', search, state: { from: '/chats/c/conv-mirror-1', ...(intent ? { [CLONE_INTENT_KEY]: true } : {}) } }]}>
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

/** Every rpc / edge call that writes. A Clone that is tapped and cancelled must make none of them. */
const WRITE_RPCS = ['canvas_workspace_send', 'canvas_draft_open', 'canvas_draft_discard', 'canvas_draft_publish', 'canvas_draft_retry', 'canvas_draft_undo'];
const writeRpcs = () => rpc.mock.calls.map(c => String(c[0])).filter(n => WRITE_RPCS.includes(n));
const edgeWrites = () => invoke.mock.calls.filter(c => c[0] === 'canvas-draft' && !(c[1] as { body?: { availability?: boolean } } | undefined)?.body?.availability);
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
const composerBox = () => within(screen.getByTestId('composer'));
const typeAndSend = async (text: string) => {
  const field = await composerBox().findByRole('textbox') as HTMLTextAreaElement;
  fireEvent.change(field, { target: { value: text } });
  fireEvent.click(composerBox().getByRole('button', { name: 'Send' }));
  return field;
};

describe('S3c.3 (X3): Clone a version = navigate, then the Clone button\'s decision', () => {
  it('NO DRAFT: the version loads, then it is pending: the agent line, "New draft", ws=1 by REPLACE; nothing written; the intent is gone', async () => {
    st.hasV2 = true;
    mount('?v=canvas_d111111');
    await screen.findByTestId('workspace-chat-empty');
    expect(screen.getByTestId('agent-line')).toHaveTextContent('This is a new draft from v1.');
    expect(screen.getByTestId('canvas-state')).toHaveTextContent('New draft');
    expect(screen.getByTestId('where')).toHaveTextContent('/p/ana/canvas/canvas?v=canvas_d111111&ws=1');
    expect(screen.getByTestId('nav-type')).toHaveTextContent('REPLACE');
    expect(screen.getByTestId('intent')).toHaveTextContent('none');
    expect(screen.getByTestId('from')).toHaveTextContent('/chats/c/conv-mirror-1'); // the way back survives
    expect(writeRpcs()).toEqual([]);
    expect(edgeWrites()).toEqual([]);
  });

  it('SAME BASE: the draft started from this very version opens, with no sheet and no write', async () => {
    st.openDraft = draftBlock({ baseSeq: 1 });
    st.draftRow = draftRow();
    mount('?v=canvas_d111111');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`v=${DRAFT_NAME}`));
    expect(screen.getByTestId('ws')).toHaveTextContent('1');
    expect(await screen.findByTestId('thread-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('clone-draft-sheet')).toBeNull();
    expect(screen.getByTestId('intent')).toHaveTextContent('none');
    expect(writeRpcs()).toEqual([]);
  });

  it('OTHER BASE, TOUCHED: the J4 sheet in the spec\'s words, and nothing is written until the owner chooses', async () => {
    st.hasV2 = true;
    st.openDraft = draftBlock({ baseSeq: 1 });
    st.draftRow = draftRow();
    mount('?v=canvas_d222222');
    const sheet = await screen.findByTestId('clone-draft-sheet');
    expect(sheet).toHaveTextContent('You have a draft from v1. Add this to it, or start over from v2? Starting over discards that draft.');
    expect(screen.getByTestId('ws')).toHaveTextContent('none');
    await waitFor(() => expect(screen.getByTestId('intent')).toHaveTextContent('none')); // the strip is a navigation: it may land a beat after the sheet
    expect(writeRpcs()).toEqual([]);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add to my draft' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`v=${DRAFT_NAME}`));
    expect(writeRpcs()).toEqual([]);
  });

  it('OTHER BASE, UNTOUCHED: no sheet; pending at once; the draft is replaced only inside the first Send, with its id and revision', async () => {
    st.hasV2 = true;
    st.openDraft = draftBlock({ baseSeq: 1, runCount: 0, revision: 2 });
    st.draftRow = draftRow({ runCount: 0 });
    st.latestRun = null;
    rpc.mockImplementation(async (name: string) => (name === 'canvas_workspace_send' ? { data: sentRow, error: null } : { data: null, error: null }));
    mount('?v=canvas_d222222');
    await screen.findByTestId('workspace-chat-empty');
    expect(screen.queryByTestId('clone-draft-sheet')).toBeNull();
    expect(writeRpcs()).toEqual([]); // nothing is replaced yet
    await typeAndSend('hello');
    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(sends()[0]![1]).toMatchObject({ p_from_version: 'ver-2', p_expected_draft: 'draft-1', p_expected_revision: 2, p_replace: true });
    expect(rpc.mock.calls.filter(c => c[0] === 'canvas_draft_discard')).toEqual([]);
  });

  it('OTHER BASE, UNTOUCHED, stale revision: the first Send is refused stale_view, the text is kept and the sheet asks again with the fresh revision', async () => {
    st.hasV2 = true;
    st.openDraft = draftBlock({ baseSeq: 1, runCount: 0, revision: 2 });
    st.draftRow = draftRow({ runCount: 0, revision: 2 });
    st.latestRun = null;
    rpc.mockImplementation(async (name: string) => (name === 'canvas_workspace_send' ? { data: { status: 'refused', code: 'stale_view', revision: 3 }, error: null } : { data: null, error: null }));
    mount('?v=canvas_d222222');
    await screen.findByTestId('workspace-chat-empty');
    st.draftRow = draftRow({ runCount: 0, revision: 3 }); // what the database says by now
    const field = await typeAndSend('keep this text');
    const sheet = await screen.findByTestId('clone-draft-sheet');
    expect(sheet).toHaveTextContent('You have a draft from v1.');
    await waitFor(() => expect(field.value).toBe('keep this text'));
    expect(toastError).not.toHaveBeenCalled();
    rpc.mockImplementation(async (name: string) => (name === 'canvas_workspace_send' ? { data: sentRow, error: null } : { data: null, error: null }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Start over from v2' }));
    await waitFor(() => expect(screen.queryByTestId('clone-draft-sheet')).toBeNull());
    fireEvent.click(composerBox().getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sends()).toHaveLength(2));
    expect(sends()[1]![1]).toMatchObject({ p_expected_draft: 'draft-1', p_expected_revision: 3, p_replace: true });
  });
});

describe('S3c.3 (X3): tap then cancel writes nothing, and the intent fires once', () => {
  it('Cancel after the landing: back to the published view with nothing written, and the intent does not bring the pending state back', async () => {
    mount('?v=canvas_d111111');
    await screen.findByTestId('workspace-chat-empty');
    fireEvent.click(screen.getByTestId('canvas-cancel-clone'));
    await waitFor(() => expect(screen.getByTestId('ws')).toHaveTextContent('none'));
    expect(await screen.findByTestId('canvas-clone')).toBeInTheDocument();
    await act(async () => {});
    expect(screen.queryByTestId('workspace-chat-pane')).toBeNull();
    expect(screen.getByTestId('where')).toHaveTextContent('/p/ana/canvas/canvas?v=canvas_d111111');
    expect(writeRpcs()).toEqual([]);
    expect(edgeWrites()).toEqual([]);
  });

  it('without the intent a landing on a published version stays a plain published view (CONTROL: the Clone button is what enters)', async () => {
    mount('?v=canvas_d111111', false);
    await grid();
    await screen.findByTestId('canvas-clone');
    await act(async () => {});
    expect(screen.getByTestId('ws')).toHaveTextContent('none');
    expect(screen.queryByTestId('workspace-chat-empty')).toBeNull();
  });

  it('not the viewer\'s own canvas: the intent is dropped, not kept for later, and nothing is entered', async () => {
    st.slug = 'bob';
    getCanvas.mockImplementation(async (_o: string, _t: string, _v: unknown, _k: unknown, version?: string) => readFor(version, { isOwner: false, draft: null }));
    mount('?v=canvas_d111111');
    await grid();
    await waitFor(() => expect(screen.getByTestId('intent')).toHaveTextContent('none'));
    expect(screen.queryByTestId('canvas-clone')).toBeNull();
    expect(screen.getByTestId('ws')).toHaveTextContent('none');
    expect(writeRpcs()).toEqual([]);
  });

  it('drafting off: the intent is dropped and the page stays a published view', async () => {
    invoke.mockResolvedValue({ data: { enabled: false }, error: null });
    mount('?v=canvas_d111111');
    await grid();
    await waitFor(() => expect(screen.getByTestId('intent')).toHaveTextContent('none'));
    expect(screen.getByTestId('ws')).toHaveTextContent('none');
    expect(screen.queryByTestId('workspace-chat-empty')).toBeNull();
  });
});
