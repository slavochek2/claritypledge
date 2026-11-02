/**
 * @file p1536-x13-tabs.test.tsx
 * @description P1536 3c X13 (S3c.10): which tab a phone lands on. A pending Clone (the Clone tap, a reload of its address, Start over from the J4 sheet) opens on Thread, because typing
 * is next, and the composer does NOT take focus on landing (the phone keyboard would push the mirror agent's line out of view). Anything that opens an EXISTING draft (Open draft, a Clone
 * landing on one, Add to my draft) opens on Canvas, because the owner came to look. A first Send keeps the tab it was typed on. A published version picked from a draft carries Go to
 * draft in row 2, before Share. The REAL route element; only the database and the transport are faked. 375px (matchMedia below 1280).
 */
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
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
const renameCanvas = vi.hoisted(() => vi.fn());
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
vi.mock('@/app/data/canvas-service', () => ({ canvasService: { getCanvas, renameCanvas, getAudience: vi.fn(async () => []), markCanvasRead: vi.fn(async () => undefined) } }));
vi.mock('@/app/data/calibration-service', () => ({ calibrationService: { getEarsCount: vi.fn(async () => 0) } }));
vi.mock('@/app/contexts/agent-accounts-context', () => ({ useAgentAccountIds: () => ({ isAgentAccountId: () => false, isLoading: false }) }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('@/app/pages/not-found-page', () => ({ NotFoundPage: () => <div data-testid="canvas-not-found" /> }));
vi.mock('@/app/components/feed/feed-point-card', () => ({ FeedPointCard: () => <div data-testid="point-card" /> }));
vi.mock('@/app/components/social/point-positions-block', () => ({ PointPositionsBlock: () => null }));
vi.mock('@/app/components/letters/letter-position-story-dialog', () => ({ LetterPositionStoryDialog: () => null }));
vi.mock('@/app/components/canvas/canvas-add-story-dialog', () => ({ CanvasAddStoryDialog: () => null }));
vi.mock('@/app/data/canvas-draft-service', async () => ({
  ...(await vi.importActual<object>('@/app/data/canvas-draft-service')),
  getCanvasDraftByThread: byThread,
  getLatestCanvasRun: async () => st.latestRun,
  getCanvasVersionCard: async () => null,
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
  conversationId: CONV, kind: 'mirror', title: 'Zed', other: null, org: null, event: null, ownerFirstName: 'Ana',
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
const rootCard = () => msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-draft' });
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
/** The draft block `get_canvas` gives the owner. `baseSeq` is the version the draft was started from (null: a new canvas). */
const draftBlock = (over: Record<string, unknown> = {}) => ({ id: 'draft-1', version: DRAFT_NAME, questions: {}, threadRootId: ROOT, conversationId: CONV, baseSeq: 1, runCount: 1, revision: 4, changedBoxes: [] as string[], ...over });
const base = { stories: new Map(), addedStoryIds: [], positions: new Map(), visibility: 'private' as const, isOwner: true, admitted: true, generalAccess: 'restricted' as const, via: null, canvasExists: true, canvasId: 'cv-1', title: null as string | null };
const published = () => (st.hasV2 ? [v2, v1] : [v1]);
const readFor = (version?: string, over: Record<string, unknown> = {}) => {
  const versions = st.openDraft ? [draftVersion, ...published()] : published();
  const open = version ?? published()[0]!.name;
  return { ...base, points: [point('canvas:problem')], version: open, versions, publishedNone: false, draft: st.openDraft, ...over };
};

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname}{l.search}</output>;
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
  st.messages = [rootCard()];
  byThread.mockReset();
  byThread.mockImplementation(async () => st.draftRow);
  rpc.mockImplementation(async () => ({ data: null, error: null }));
  invoke.mockResolvedValue({ data: { enabled: true }, error: null });
  getCanvas.mockReset();
  getCanvas.mockImplementation(async (_o: string, _t: string, _v: unknown, _k: unknown, version?: string) => readFor(version));
  renameCanvas.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const grid = () => screen.findByTestId('canvas-grid');
/** A draft is open on the canvas: at DRAFT_AT the workspace is on. */



const onThread = () => expect(screen.getByTestId('workspace-view-chat')).toHaveAttribute('data-state', 'active');
const onCanvas = () => expect(screen.getByTestId('workspace-view-canvas')).toHaveAttribute('data-state', 'active');
const withBase = (over: Record<string, unknown> = {}) => {
  st.openDraft = draftBlock({ baseSeq: 1, changedBoxes: ['canvas:problem'], ...over });
  st.draftRow = draftRow({ baseVersionId: 'ver-1' });
  st.messages = [msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-1' })];
};

describe('X13: a pending Clone opens on Thread', () => {
  beforeEach(() => stubWidth(false));

  it('the Clone tap: Thread is the active tab, and the composer has not taken focus', async () => {
    mount('/p/ana/canvas/canvas');
    await grid();
    fireEvent.click(await screen.findByTestId('canvas-clone'));
    await screen.findByTestId('agent-line');
    onThread();
    expect(document.activeElement?.tagName).not.toBe('TEXTAREA');
    expect(document.activeElement?.getAttribute('role')).not.toBe('textbox');
    expect(screen.getByTestId('agent-line')).toBeVisible();
  });

  it('a reload of the pending address (a bare ws=1 on a published version): Thread', async () => {
    mount('/p/ana/canvas/canvas?ws=1');
    await grid();
    await screen.findByTestId('agent-line');
    await waitFor(onThread);
  });

  it('Start over from the J4 sheet (another base\'s draft with a message): Thread', async () => {
    st.hasV2 = true;
    withBase({ baseSeq: 1, runCount: 1 });
    mount('/p/ana/canvas/canvas?v=canvas_d222222');
    await grid();
    fireEvent.click(await screen.findByTestId('canvas-clone'));
    fireEvent.click(await screen.findByTestId('clone-start-over'));
    await screen.findByTestId('agent-line');
    await waitFor(onThread);
  });

  it('CONTROL: a plain published view with nothing being edited has no switcher at all', async () => {
    mount('/p/ana/canvas/canvas');
    await grid();
    await screen.findByTestId('canvas-clone');
    expect(screen.queryByTestId('workspace-view-switch')).toBeNull();
  });
});

describe('X13: anything that opens an existing draft opens on Canvas', () => {
  beforeEach(() => stubWidth(false));

  it('Open draft (the card\'s address, the draft\'s own view with ws=1): Canvas', async () => {
    withBase();
    mount(`/p/ana/canvas/canvas?v=${DRAFT_NAME}&ws=1`);
    await grid();
    await screen.findByTestId('thread-panel');
    onCanvas();
  });

  it('Clone landing on the open draft of the SAME base: Canvas, even after the owner was on Thread', async () => {
    withBase({ baseSeq: 1 });
    mount('/p/ana/canvas/canvas?v=canvas_d111111');
    await grid();
    fireEvent.click(await screen.findByTestId('canvas-clone'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`v=${DRAFT_NAME}`));
    await screen.findByTestId('thread-panel');
    onCanvas();
  });

  it('Add to my draft (the J4 sheet): Canvas', async () => {
    st.hasV2 = true;
    withBase({ baseSeq: 1, runCount: 1 });
    mount('/p/ana/canvas/canvas?v=canvas_d222222');
    await grid();
    fireEvent.click(await screen.findByTestId('canvas-clone'));
    fireEvent.click(await screen.findByTestId('clone-add-to-draft'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`v=${DRAFT_NAME}`));
    onCanvas();
  });
});

describe('X13: a published version picked from a draft (ws=1)', () => {
  beforeEach(() => stubWidth(false));

  it('row 2 holds the switcher, Go to draft BEFORE Share; Go to draft lands on the draft on the Canvas tab', async () => {
    withBase({ baseSeq: 1 });
    mount('/p/ana/canvas/canvas?v=canvas_d111111&ws=1');
    await grid();
    const bar = screen.getByTestId('workspace-bar');
    await within(bar).findByTestId('workspace-go-to-draft-bar');
    const ids = [...within(bar).getByTestId('canvas-bar-actions').querySelectorAll('[data-testid]')].map(e => e.getAttribute('data-testid'));
    expect(ids.indexOf('workspace-go-to-draft-bar')).toBeLessThan(ids.indexOf('publish-spot'));
    expect(within(bar).getByTestId('publish-spot')).toHaveAttribute('data-state', 'share');
    fireEvent.mouseDown(screen.getByTestId('workspace-view-chat'), { button: 0 });
    fireEvent.click(screen.getByTestId('workspace-view-chat'));
    onThread();
    expect(screen.getByTestId('workspace-draft-line')).toBeInTheDocument(); // the Thread tab keeps the line above the open draft's thread
    fireEvent.click(within(bar).getByTestId('workspace-go-to-draft-bar'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`v=${DRAFT_NAME}`));
    onCanvas();
  });
});
