/**
 * @file p1536-w3-clone.test.tsx
 * @description P1536 §3b W3 + J4 (S3b.4, S4.5, S3b.9): Clone replaces "New version". The REAL route element, canvas page, thread panel and
 * composer (only the database and the chat's message transport are faked):
 *  - Clone shows only to the owner on a PUBLISHED version: never on a draft, never to a reader or a signed-out visitor, never with drafting off
 *  - tap, then cancel: NO write call at all (the unit-level proxy for the spec's row-count check: no rpc/edge call that writes was made), the page
 *    returns to the published view by REPLACE, and the pending state reads as specified (3c: the mirror agent's line, the "New draft" tag, "Nothing to publish yet", Cancel and no Discard)
 *  - the first Send creates the draft from THAT version in one call
 *  - a same-base draft: Clone opens it; another base with a run: the J4 sheet; another base untouched: no sheet, the first Send replaces it
 *  - a stale first Send over a replaced draft: the sheet asks again, the text stays
 *  - S4.6: no user-facing "new version" string anywhere in src/app, and the old button file and its importers are gone
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
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
import { lacksSecondaryPill } from './p1536-pill-assert';

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

describe('S3b.4/S3b.9: Clone shows only to the owner, on a published version', () => {
  it('the owner on a published version sees Clone: a secondary pill with a copy icon, and no "New version" anywhere', async () => {
    mount('/p/ana/canvas/canvas');
    await grid();
    const button = await screen.findByTestId('canvas-clone');
    expect(button).toHaveTextContent('Clone');
    expect(button.querySelector('svg.lucide-copy')).not.toBeNull();
    expect(lacksSecondaryPill(button)).toEqual([]); // the one secondary pill (W7: Compare's look)
    expect(screen.queryByTestId('canvas-new-version')).toBeNull();
    expect(document.body.textContent).not.toMatch(/new version/i);
  });

  it('not on a draft (the owner looking at the draft, with the workspace open)', async () => {
    st.openDraft = draftBlock();
    st.draftRow = draftRow();
    mount(`/p/ana/canvas/canvas?v=${DRAFT_NAME}&ws=1`);
    await grid();
    await screen.findByTestId('thread-panel');
    expect(screen.queryByTestId('canvas-clone')).toBeNull();
  });

  it('not to a reader, not to a signed-in non-owner', async () => {
    st.slug = 'bob';
    getCanvas.mockImplementation(async (_o: string, _t: string, _v: unknown, _k: unknown, version?: string) => readFor(version, { isOwner: false, draft: null }));
    mount('/p/ana/canvas/canvas');
    await grid();
    await act(async () => {});
    expect(screen.queryByTestId('canvas-clone')).toBeNull();
  });

  it('not to a signed-out visitor', async () => {
    st.signedIn = false;
    getCanvas.mockImplementation(async (_o: string, _t: string, _v: unknown, _k: unknown, version?: string) => readFor(version, { isOwner: false, draft: null }));
    mount('/p/ana/canvas/canvas');
    await grid();
    await act(async () => {});
    expect(screen.queryByTestId('canvas-clone')).toBeNull();
  });

  it('not while canvas drafting is off', async () => {
    invoke.mockResolvedValue({ data: { enabled: false }, error: null });
    mount('/p/ana/canvas/canvas');
    await grid();
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByTestId('canvas-clone')).toBeNull();
  });
});

describe('S3b.4: tap, then cancel writes nothing', () => {
  it('tap enters the pending state in place (REPLACE, same path, ws=1 added) with the spec\'s words; no Discard; nothing written', async () => {
    mount('/p/ana/canvas/canvas');
    await grid();
    await screen.findByTestId('canvas-clone');
    fireEvent.click(clone());
    await screen.findByTestId('workspace-chat-empty');
    expect(screen.getByTestId('ws')).toHaveTextContent('1');
    expect(screen.getByTestId('where')).toHaveTextContent('/p/ana/canvas/canvas?ws=1');
    expect(screen.getByTestId('nav-type')).toHaveTextContent('REPLACE');
    // 3c X8/X6/X7 (premise change): the mirror agent's line, the "New draft" tag, and the spot's "Nothing to publish yet"
    expect(screen.getByTestId('agent-line')).toHaveTextContent('This is a new draft from v1. Tell me what to change. Readers keep seeing v1 until you publish.');
    expect(screen.getByTestId('canvas-state')).toHaveTextContent('New draft');
    expect(screen.getByTestId('publish-spot')).toHaveTextContent('Nothing to publish yet');
    expect(screen.getByTestId('publish-spot').getAttribute('data-state')).toBe('nothing');
    expect(screen.queryByTestId('canvas-discard')).toBeNull();
    expect(screen.queryByTestId('canvas-clone')).toBeNull(); // already editing: absent, not disabled
    expect(screen.getByTestId('composer')).toBeInTheDocument();
    expect(writeRpcs()).toEqual([]);
    expect(edgeWrites()).toEqual([]);
  });

  it('× cancels: back to the published view by REPLACE (ws gone, panel gone, Clone back), and still nothing was written', async () => {
    mount('/p/ana/canvas/canvas?v=canvas_d111111');
    await grid();
    await screen.findByTestId('canvas-clone');
    fireEvent.click(clone());
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

  it('Cancel (in the page header, rule 3) leaves a pending Clone with nothing written; the picker is not there while pending (3c X6, premise change: it replaced "switching to another version cancels it")', async () => {
    st.hasV2 = true;
    mount('/p/ana/canvas/canvas?v=canvas_d222222');
    await grid();
    await screen.findByTestId('canvas-clone');
    fireEvent.click(clone());
    await screen.findByTestId('workspace-chat-empty');
    expect(screen.getByTestId('agent-line')).toHaveTextContent('This is a new draft from v2.');
    expect(screen.queryByTestId('canvas-version-picker')).toBeNull();
    fireEvent.click(screen.getByTestId('canvas-cancel-clone'));
    await waitFor(() => expect(screen.getByTestId('ws')).toHaveTextContent('none'));
    expect(screen.queryByTestId('workspace-chat-pane')).toBeNull();
    expect(await screen.findByTestId('canvas-version-picker')).toBeInTheDocument(); // the picker is back on the published view
    expect(writeRpcs()).toEqual([]);
  });

  it('at 375px a × on the Thread tab cancels too (it does not just flip to the Canvas tab)', async () => {
    stubWidth(false);
    mount('/p/ana/canvas/canvas');
    await grid();
    await screen.findByTestId('canvas-clone');
    fireEvent.click(clone());
    await screen.findByTestId('workspace-chat-empty');
    fireEvent.mouseDown(screen.getByTestId('workspace-view-chat'), { button: 0, ctrlKey: false });
    // walkthrough 3 item 7: no second ← in the panel; the pending Clone's × (the cancel) shows at every width
    expect(screen.queryByLabelText('Back to the conversation')).toBeNull();
    fireEvent.click(screen.getByLabelText('Close thread'));
    await waitFor(() => expect(screen.getByTestId('ws')).toHaveTextContent('none'));
    expect(writeRpcs()).toEqual([]);
  });
});

describe('S3b.4: the first Send creates the draft from the cloned version', () => {
  it('ONE canvas_workspace_send from THAT version (v1 while v2 exists), expecting no draft; then the page moves to the draft', async () => {
    st.hasV2 = true;
    rpc.mockImplementation(async (name: string) => (name === 'canvas_workspace_send' ? { data: sentRow, error: null } : { data: null, error: null }));
    mount('/p/ana/canvas/canvas?v=canvas_d111111');
    await grid();
    await screen.findByTestId('canvas-clone');
    fireEvent.click(clone());
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
  });
});

describe('S3b.4: a draft is already open', () => {
  it('SAME base (started from this very version): Clone opens that draft, writes nothing, and shows no sheet', async () => {
    st.openDraft = draftBlock({ baseSeq: 1 });
    st.draftRow = draftRow();
    mount('/p/ana/canvas/canvas?v=canvas_d111111');
    await grid();
    await screen.findByTestId('canvas-clone');
    fireEvent.click(clone());
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`v=${DRAFT_NAME}`));
    expect(screen.getByTestId('ws')).toHaveTextContent('1');
    expect(await screen.findByTestId('thread-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('clone-draft-sheet')).toBeNull();
    expect(writeRpcs()).toEqual([]);
  });

  it('OTHER base with a run: the J4 sheet, in the spec\'s words; closing it changes nothing', async () => {
    st.hasV2 = true;
    st.openDraft = draftBlock({ baseSeq: 1 }); // a draft from v1; the owner looks at v2
    st.draftRow = draftRow();
    mount('/p/ana/canvas/canvas?v=canvas_d222222');
    await grid();
    await screen.findByTestId('canvas-clone');
    fireEvent.click(clone());
    const sheet = await screen.findByTestId('clone-draft-sheet');
    expect(sheet).toHaveTextContent('You have a draft from v1. Add this to it, or start over from v2? Starting over discards that draft.');
    expect(within(sheet).getByRole('button', { name: 'Add to my draft' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Start over from v2' })).toBeInTheDocument();
    fireEvent.keyDown(sheet, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('clone-draft-sheet')).toBeNull());
    expect(screen.getByTestId('ws')).toHaveTextContent('none');
    expect(writeRpcs()).toEqual([]);
  });

  it('"Add to my draft" opens that draft (no write)', async () => {
    st.hasV2 = true;
    st.openDraft = draftBlock({ baseSeq: 1 });
    st.draftRow = draftRow();
    mount('/p/ana/canvas/canvas?v=canvas_d222222');
    await grid();
    await screen.findByTestId('canvas-clone');
    fireEvent.click(clone());
    fireEvent.click(within(await screen.findByTestId('clone-draft-sheet')).getByRole('button', { name: 'Add to my draft' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`v=${DRAFT_NAME}`));
    expect(writeRpcs()).toEqual([]);
  });

  it('"Start over from v2" goes pending (the draft is NOT discarded yet); the first Send discards it in the same call, with the draft\'s id and revision', async () => {
    st.hasV2 = true;
    st.openDraft = draftBlock({ baseSeq: 1, revision: 4 });
    st.draftRow = draftRow();
    rpc.mockImplementation(async (name: string) => (name === 'canvas_workspace_send' ? { data: sentRow, error: null } : { data: null, error: null }));
    mount('/p/ana/canvas/canvas?v=canvas_d222222');
    await grid();
    await screen.findByTestId('canvas-clone');
    fireEvent.click(clone());
    fireEvent.click(within(await screen.findByTestId('clone-draft-sheet')).getByRole('button', { name: 'Start over from v2' }));
    await screen.findByTestId('workspace-chat-empty'); // the clone's empty thread, not the open draft's thread
    expect(screen.getByTestId('agent-line')).toHaveTextContent('This is a new draft from v2.');
    expect(screen.queryByTestId('thread-panel')).toBeNull();
    expect(screen.queryByTestId('workspace-go-to-draft')).toBeNull();
    expect(screen.queryByTestId('canvas-discard')).toBeNull();
    expect(writeRpcs()).toEqual([]);
    const field = await within(screen.getByTestId('composer')).findByRole('textbox');
    fireEvent.change(field, { target: { value: 'start fresh' } });
    fireEvent.click(within(screen.getByTestId('composer')).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(sends()[0]![1]).toMatchObject({ p_canvas: 'cv-1', p_from_version: 'ver-2', p_expected_draft: 'draft-1', p_expected_revision: 4, p_replace: true });
    expect(rpc.mock.calls.filter(c => c[0] === 'canvas_draft_discard')).toEqual([]); // the discard happens INSIDE the send
  });

  it('OTHER base, UNTOUCHED (no message, no run): no sheet; pending at once, and the first Send replaces it', async () => {
    st.hasV2 = true;
    st.openDraft = draftBlock({ baseSeq: 1, runCount: 0, revision: 2 });
    st.draftRow = draftRow({ runCount: 0 });
    st.latestRun = null;
    rpc.mockImplementation(async (name: string) => (name === 'canvas_workspace_send' ? { data: sentRow, error: null } : { data: null, error: null }));
    mount('/p/ana/canvas/canvas?v=canvas_d222222');
    await grid();
    await screen.findByTestId('canvas-clone');
    fireEvent.click(clone());
    await screen.findByTestId('workspace-chat-empty');
    expect(screen.queryByTestId('clone-draft-sheet')).toBeNull();
    const field = await within(screen.getByTestId('composer')).findByRole('textbox');
    fireEvent.change(field, { target: { value: 'hello' } });
    fireEvent.click(within(screen.getByTestId('composer')).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(sends()[0]![1]).toMatchObject({ p_expected_draft: 'draft-1', p_expected_revision: 2, p_replace: true });
  });

  it('J4 stale: the draft moved on before the first Send (stale_view): the text is kept and the sheet asks again with the fresh revision', async () => {
    st.hasV2 = true;
    st.openDraft = draftBlock({ baseSeq: 1, revision: 4 });
    st.draftRow = draftRow({ revision: 4 });
    rpc.mockImplementation(async (name: string) => (name === 'canvas_workspace_send' ? { data: { status: 'refused', code: 'stale_view', revision: 5 }, error: null } : { data: null, error: null }));
    mount('/p/ana/canvas/canvas?v=canvas_d222222');
    await grid();
    await screen.findByTestId('canvas-clone');
    fireEvent.click(clone());
    fireEvent.click(within(await screen.findByTestId('clone-draft-sheet')).getByRole('button', { name: 'Start over from v2' }));
    await screen.findByTestId('workspace-chat-empty');
    const field = await within(screen.getByTestId('composer')).findByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'keep this text' } });
    st.draftRow = draftRow({ revision: 5 }); // what the database says now
    fireEvent.click(within(screen.getByTestId('composer')).getByRole('button', { name: 'Send' }));
    const sheet = await screen.findByTestId('clone-draft-sheet');
    expect(sheet).toHaveTextContent('You have a draft from v1.');
    await waitFor(() => expect(field.value).toBe('keep this text'));
    expect(toastError).not.toHaveBeenCalled(); // asked again, not an error
    // choosing again carries the FRESH revision
    rpc.mockImplementation(async (name: string) => (name === 'canvas_workspace_send' ? { data: sentRow, error: null } : { data: null, error: null }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Start over from v2' }));
    await waitFor(() => expect(screen.queryByTestId('clone-draft-sheet')).toBeNull());
    fireEvent.click(within(screen.getByTestId('composer')).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sends()).toHaveLength(2));
    expect(sends()[1]![1]).toMatchObject({ p_expected_draft: 'draft-1', p_expected_revision: 5, p_replace: true });
  });
});

describe('S4.6: "New version" is gone', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap(f => {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) return walk(p);
      return /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
    });
  /** Source with comments removed, so only strings and JSX text are left (comments are not user-facing). */
  const withoutComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
  // The PWA's "a newer build of the app is live" prompt is about the app, not a canvas version: out of S4.6's scope.
  const NOT_CANVAS = ['src/app/components/pwa/app-update-prompt.tsx'];

  it('no rendered string in src/app says "new version" (the app-update prompt aside)', () => {
    const hits = walk(join(process.cwd(), 'src/app'))
      .filter(f => !NOT_CANVAS.some(n => f.endsWith(n)))
      .flatMap(f => (withoutComments(readFileSync(f, 'utf8')).match(/.*new version.*/gi) ?? []).map(l => `${f}: ${l.trim()}`));
    expect(hits).toEqual([]);
  });

  it('CONTROL: the scan does see a string (the app-update prompt is the one hit it is told to skip)', () => {
    const f = join(process.cwd(), 'src/app/components/pwa/app-update-prompt.tsx');
    expect(withoutComments(readFileSync(f, 'utf8'))).toMatch(/new version/i);
  });

  it('canvas-new-version-button.tsx is removed, and nothing imports it or its component', () => {
    expect(existsSync(join(process.cwd(), 'src/app/components/canvas/canvas-new-version-button.tsx'))).toBe(false);
    const hits = walk(join(process.cwd(), 'src/app')).filter(f => /canvas-new-version-button|NewVersionButton/.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});
