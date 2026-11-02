/**
 * @file p1536-pending-unified.test.tsx
 * @description P1536 §3b item 0 (W1 + W3): ONE pending state. W1: "`?ws=1` ... is on exactly while the owner is editing: a draft is open,
 * or a Clone is pending." So `ws=1` on a published version with no open draft IS the pending Clone, whatever entered it: the Clone tap, a
 * reload of that address, or Add to chat. All three render identically (the mirror agent line, the "New draft" tag, the "Nothing to publish yet" spot,
 * no Discard, a live composer) and write nothing. The old J3 words ("Talk about any box...") and the "Published" spot are gone under ws=1.
 * The REAL route element, canvas page, thread panel and composer; only the database and the chat transport are faked.
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
// The canvas page renders SEO inside the workspace: the probe stands in for an "Add to chat" tap (S4), which calls `showThread`.
vi.mock('@/app/components/seo', async () => {
  const { useCanvasWorkspace } = await import('@/app/components/canvas/canvas-workspace-context');
  const Probe = () => {
    const { showThread } = useCanvasWorkspace();
    return <button type="button" data-testid="probe-add-to-chat" onClick={showThread}>probe</button>;
  };
  return { SEO: Probe };
});
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
const clone = () => screen.getByTestId('canvas-clone');

const PUB = '/p/ana/canvas/canvas?ws=1';
// 3c X8 (premise change): the pending Clone opens with the mirror agent's line, not "Clone v1. Nothing changes for readers until you publish."
const CLONE_LINE = 'This is a new draft from v1. Tell me what to change. Readers keep seeing v1 until you publish.';

/** What the owner sees of the pending state, as plain data, so the three entries can be compared for equality. */
function pendingFacts() {
  return {
    line: screen.getByTestId('agent-line').textContent?.replace(/^.*?(This is a new draft)/, '$1'),
    state: screen.getByTestId('canvas-state').textContent,
    spot: screen.getByTestId('publish-spot').textContent,
    spotState: screen.getByTestId('publish-spot').getAttribute('data-state'),
    discard: screen.queryByTestId('canvas-discard') !== null,
    cloneButton: screen.queryByTestId('canvas-clone') !== null,
    composer: screen.queryByTestId('composer') !== null,
    ws: screen.getByTestId('ws').textContent,
  };
}

const ENTRIES: Array<[string, () => Promise<void>]> = [
  ['the Clone tap', async () => {
    mount('/p/ana/canvas/canvas');
    await grid();
    await screen.findByTestId('canvas-clone');
    fireEvent.click(clone());
    await screen.findByTestId('workspace-chat-empty');
  }],
  ['a reload of the pending address (bare ws=1)', async () => {
    mount(PUB);
    await grid();
    await screen.findByTestId('workspace-chat-empty');
  }],
  ['Add to chat on a published box (ws=1, then the tag tap)', async () => {
    mount(PUB);
    await grid();
    fireEvent.click(screen.getByTestId('probe-add-to-chat'));
    await screen.findByTestId('workspace-chat-empty');
  }],
];

describe('item 0: the three entries are one state', () => {
  it.each(ENTRIES)('%s: the mirror agent line, the "New draft" tag, "Nothing to publish yet", no Discard, a live composer, nothing written', async (_name, enter) => {
    await enter();
    expect(pendingFacts()).toEqual({
      line: CLONE_LINE, state: 'New draft', spot: 'Nothing to publish yet', spotState: 'nothing', discard: false, cloneButton: false, composer: true, ws: '1',
    });
    expect(writeRpcs()).toEqual([]);
    expect(edgeWrites()).toEqual([]);
  });

  it('the three entries produce identical facts (one state, however it was entered)', async () => {
    const seen: ReturnType<typeof pendingFacts>[] = [];
    for (const [, enter] of ENTRIES) {
      await enter();
      seen.push(pendingFacts());
      cleanup();
      vi.clearAllMocks();
      rpc.mockImplementation(async () => ({ data: null, error: null }));
      invoke.mockResolvedValue({ data: { enabled: true }, error: null });
    }
    expect(seen[1]).toEqual(seen[0]);
    expect(seen[2]).toEqual(seen[0]);
  });

  it.each(ENTRIES)('%s: the old J3 words and the "Published" spot are gone under ws=1', async (_name, enter) => {
    await enter();
    expect(document.body.textContent).not.toContain('Talk about any box');
    expect(screen.getByTestId('publish-spot').textContent).not.toMatch(/Published/);
  });
});

describe('item 0: leaving the pending state (any entry) writes nothing', () => {
  it('the bare ws=1 entry: × drops ws=1 by REPLACE, back on the published view, nothing written', async () => {
    mount(`${PUB}&v=canvas_d111111`);
    await grid();
    await screen.findByTestId('workspace-chat-empty');
    fireEvent.click(screen.getByLabelText('Close thread'));
    await waitFor(() => expect(screen.getByTestId('ws')).toHaveTextContent('none'));
    expect(screen.getByTestId('where')).toHaveTextContent('/p/ana/canvas/canvas?v=canvas_d111111');
    expect(screen.getByTestId('nav-type')).toHaveTextContent('REPLACE');
    expect(screen.queryByTestId('workspace-chat-pane')).toBeNull();
    expect(await screen.findByTestId('canvas-clone')).toBeInTheDocument();
    expect(writeRpcs()).toEqual([]);
    expect(edgeWrites()).toEqual([]);
  });

  it('the bare ws=1 entry: Cancel leaves it (3c X6, premise change: a pending Clone has no picker, so "Cancel first to read another version"); the picker is back on the published view and reads the other version with no ws=1', async () => {
    st.hasV2 = true;
    mount('/p/ana/canvas/canvas?v=canvas_d222222&ws=1');
    await grid();
    await screen.findByTestId('workspace-chat-empty');
    expect(screen.getByTestId('agent-line')).toHaveTextContent('This is a new draft from v2.');
    expect(screen.queryByTestId('canvas-version-picker')).toBeNull(); // no picker while it is pending
    fireEvent.click(screen.getByTestId('canvas-cancel-clone'));
    await waitFor(() => expect(screen.getByTestId('ws')).toHaveTextContent('none'));
    expect(screen.queryByTestId('workspace-chat-pane')).toBeNull();
    fireEvent.change(await screen.findByTestId('canvas-version-select'), { target: { value: 'canvas_d111111' } });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('v=canvas_d111111'));
    expect(screen.getByTestId('ws')).toHaveTextContent('none');
    expect(writeRpcs()).toEqual([]);
  });

  it('the bare ws=1 entry: the first Send makes the draft in ONE call from the version on screen, then the page moves to it', async () => {
    rpc.mockImplementation(async (name: string) => (name === 'canvas_workspace_send' ? { data: sentRow, error: null } : { data: null, error: null }));
    mount(PUB);
    await grid();
    await screen.findByTestId('workspace-chat-empty');
    const field = await within(screen.getByTestId('composer')).findByRole('textbox');
    fireEvent.change(field, { target: { value: 'sharpen the problem' } });
    st.openDraft = draftBlock({ baseSeq: 1 });
    st.draftRow = draftRow();
    fireEvent.click(within(screen.getByTestId('composer')).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(sends()[0]![1]).toMatchObject({ p_canvas: 'cv-1', p_from_version: 'ver-1', p_expected_draft: null, p_replace: false, p_body: 'sharpen the problem' });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`v=${DRAFT_NAME}`));
    expect(screen.getByTestId('ws')).toHaveTextContent('1');
    expect(await screen.findByTestId('thread-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-clone-state')).toBeNull(); // a draft now: the header says Draft (the pending tag read "New draft")
    expect(screen.getByTestId('canvas-state')).toHaveTextContent('Draft');
  });
});

describe('item 0: CONTROLS', () => {
  it('a published view with nothing being edited (no ws=1) has no pending state, panel or Thread button', async () => {
    mount('/p/ana/canvas/canvas');
    await grid();
    await screen.findByTestId('canvas-clone');
    expect(screen.queryByTestId('workspace-chat-empty')).toBeNull();
    expect(screen.queryByTestId('canvas-state')).toBeNull(); // no tag at all on a published version (3c X5)
    expect(screen.queryByTestId('workspace-chat-pane')).toBeNull();
  });

  it('ws=1 on a published version while ANOTHER base\'s draft is open is NOT the pending Clone: the chat edits the draft', async () => {
    st.hasV2 = true;
    st.openDraft = draftBlock({ baseSeq: 1 });
    st.draftRow = draftRow();
    mount('/p/ana/canvas/canvas?v=canvas_d222222&ws=1');
    await grid();
    expect(await screen.findByTestId('workspace-draft-line')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-chat-empty')).toBeNull();
    expect(screen.queryByTestId('canvas-state')).toBeNull(); // published, not pending
  });
});
