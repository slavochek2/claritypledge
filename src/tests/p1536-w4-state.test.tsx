/**
 * @file p1536-w4-state.test.tsx
 * @description P1536 §3b W4 (S3b.5) + S3b.9: Draft or Published is always named.
 *  - the canvas header names the state next to the version: `Draft`, `Published`, or (a pending Clone) `New draft from vN`
 *  - the mirror-chat card names the state and carries a secondary Open; the Publish reply in the mirror's own thread view carries
 *    "Open canvas" to the PUBLISHED version
 *  - inside the workspace's thread panel there are NO Open buttons
 *  - S3b.9: a shared reader / attendee on another's canvas / signed-out visitor never sees the Draft state, the panel, Clone, or a
 *    draft in the version picker
 * The REAL route element, canvas page, thread panel and composer; only the database and the chat transport are faked.
 */
import { act, cleanup, render, screen, within } from '@testing-library/react';
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
  card: null as unknown,
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
  getCanvasVersionCard: async () => st.card,
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

import { CanvasVersionCard } from '@/app/pages/chat/CanvasVersionCard';
import { ThreadPanel } from '@/app/pages/chat/ThreadPanel';
import { CanvasWorkspaceContext } from '@/app/components/canvas/canvas-workspace-context';
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
  st.card = { title: 'Canvas', label: 'v2 · Oct 10, 2026', state: 'published', draft: false, href: '/p/ana/canvas/canvas?v=canvas_d222222', openHref: '/p/ana/canvas/canvas?v=canvas_d222222' };
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

const publishReply = (over: Partial<ChatMessage> = {}) =>
  msg({ id: 'reply-1', authorId: null, kind: 'agent', body: 'Published v2. I deleted the text of your uploads; the canvas keeps what I drew from them.', createdAt: '2026-10-28T09:00:00.000Z', ...over });
const rootCard = () => msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-draft' });
const stateTag = () => screen.getByTestId('canvas-state').textContent;

describe('W4: the header names the state next to the version', () => {
  it('a published version says Published (the owner, no workspace)', async () => {
    mount('/p/ana/canvas/canvas');
    await grid();
    await screen.findByTestId('canvas-clone');
    expect(stateTag()).toBe('Published');
    expect(screen.queryByTestId('canvas-clone-state')).toBeNull();
  });

  it('the owner\'s draft says Draft, with the version label unchanged beside it', async () => {
    st.hasV2 = true;
    st.openDraft = draftBlock({ baseSeq: 2 });
    st.draftRow = draftRow();
    mount(`/p/ana/canvas/canvas?v=${DRAFT_NAME}&ws=1`);
    await grid();
    await screen.findByTestId('thread-panel');
    expect(stateTag()).toBe('Draft');
    expect(within(screen.getByTestId('canvas-project-slot')).getByTestId('canvas-version-select')).toHaveValue(DRAFT_NAME);
    expect(screen.queryByTestId('canvas-clone-state')).toBeNull();
  });

  it('a pending Clone says "New draft from v1" and not Published', async () => {
    mount('/p/ana/canvas/canvas?ws=1');
    await grid();
    await screen.findByTestId('workspace-chat-empty');
    expect(screen.getByTestId('canvas-clone-state')).toHaveTextContent('New draft from v1');
    expect(screen.queryByTestId('canvas-state')).toBeNull();
  });

  it('a canvas with nothing published names no state (the "Nothing published yet" line speaks)', async () => {
    getCanvas.mockImplementation(async () => readFor(undefined, { points: [], version: null, versions: [], publishedNone: true }));
    mount('/p/ana/canvas/canvas');
    await screen.findByTestId('canvas-nothing-published');
    expect(screen.queryByTestId('canvas-state')).toBeNull();
  });
});

describe('S3b.9: nobody but the owner sees the Draft state, the panel, Clone, or a draft in the picker', () => {
  const asReader = (over: Record<string, unknown> = {}) =>
    getCanvas.mockImplementation(async (_o: string, _t: string, _v: unknown, _k: unknown, version?: string) => {
      st.hasV2 = true;
      // Worst case for the client: a read that carries the owner's draft block AND its version for a non-owner.
      st.openDraft = draftBlock();
      return readFor(version, { isOwner: false, ...over });
    });
  const audiences: Array<[string, () => void]> = [
    ['a shared reader / an attendee on someone else\'s canvas (signed in, not the owner)', () => { st.slug = 'bob'; }],
    ['a signed-out visitor', () => { st.signedIn = false; }],
  ];

  it.each(audiences)('%s: Published only, no Draft tag, no Clone, no panel, no Thread button, no switcher', async (_n, arrange) => {
    arrange();
    asReader();
    mount('/p/ana/canvas/canvas?ws=1');
    await grid();
    await act(async () => {});
    expect(stateTag()).toBe('Published');
    expect(screen.queryByTestId('canvas-clone')).toBeNull();
    expect(screen.queryByTestId('workspace-chat-pane')).toBeNull();
    expect(screen.queryByTestId('workspace-thread-button')).toBeNull();
    expect(screen.queryByTestId('workspace-view-switch')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\bDraft\b/);
  });

  it.each(audiences)('%s: the version picker lists the published versions only', async (_n, arrange) => {
    arrange();
    asReader();
    mount('/p/ana/canvas/canvas');
    await grid();
    const select = await screen.findByTestId('canvas-version-select') as HTMLSelectElement;
    const options = within(select).getAllByRole('option').map(o => o.textContent ?? '');
    expect(options).toHaveLength(2);
    expect(options.join('|')).not.toMatch(/Draft/);
    expect(select.value).not.toBe(DRAFT_NAME);
  });

  it('CONTROL: the owner\'s picker does list the draft', async () => {
    st.hasV2 = true;
    st.openDraft = draftBlock({ baseSeq: 2 });
    st.draftRow = draftRow();
    mount('/p/ana/canvas/canvas');
    await grid();
    const options = within(await screen.findByTestId('canvas-version-select')).getAllByRole('option').map(o => o.textContent ?? '');
    expect(options).toHaveLength(3);
    expect(options.some(o => /Draft/.test(o))).toBe(true);
  });
});

describe('W4: the mirror-chat card names the state and carries a secondary Open', () => {
  const card = (over: Record<string, unknown>) => ({ title: 'Canvas 4', label: 'v2 · Oct 10, 2026', state: 'published', draft: false, href: '/x', openHref: '/x', ...over }) as never;
  const renderCard = (data: never, inWorkspace = false) =>
    render(
      <MemoryRouter>
        <CanvasWorkspaceContext.Provider value={{ active: inWorkspace, reportReady: () => undefined, reloads: 0, showThread: () => undefined, clone: null, cloneSeq: null }}>
          <CanvasVersionCard data={data} />
        </CanvasWorkspaceContext.Provider>
      </MemoryRouter>,
    );

  it.each([
    ['published', card({}), 'v2 · Oct 10, 2026 · Published'],
    ['draft', card({ state: 'draft', draft: true, label: 'Draft' }), 'Draft'],
  ])('%s: the state line and a secondary Open', (_n, data, line) => {
    renderCard(data);
    expect(screen.getByTestId('canvas-version-state')).toHaveTextContent(line);
    const open = screen.getByRole('link', { name: 'Open canvas Canvas 4' });
    expect(open).toHaveTextContent('Open');
    expect(open.className).toContain('bg-secondary'); // the secondary variant
  });

  it('inside the workspace\'s thread panel (the canvas is the other pane) the card has NO Open', () => {
    renderCard(card({}), true);
    expect(screen.getByTestId('canvas-version-state')).toHaveTextContent('Published');
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('W4: the Publish reply', () => {
  const standalone = () => render(
    <MemoryRouter initialEntries={['/chats/mirror']}>
      <ChatContext.Provider value={chatValue}>
        <ThreadPanel summary={summary} rootId={ROOT} highlightId={null} />
      </ChatContext.Provider>
    </MemoryRouter>,
  );

  it('in the mirror\'s own thread view it carries Open canvas (secondary), to the PUBLISHED version', async () => {
    invoke.mockResolvedValue({ data: { enabled: false }, error: null }); // drafting off: the thread stays readable (W0), the old address is not moved
    st.messages = [rootCard(), publishReply()];
    standalone();
    const open = await screen.findByTestId('publish-reply-open');
    expect(open).toHaveTextContent('Open canvas');
    expect(open.getAttribute('href')).toBe('/p/ana/canvas/canvas?v=canvas_d222222');
    expect(open.className).toContain('bg-secondary');
    // it sits right under the Publish reply
    expect(screen.getByText(/Published v2\./).closest('li')?.nextElementSibling).toContainElement(open);
  });

  it('CONTROL: an ordinary reply in the same thread gets no Open canvas', async () => {
    invoke.mockResolvedValue({ data: { enabled: false }, error: null });
    st.messages = [rootCard(), publishReply({ body: 'Updated: Problem.' })];
    standalone();
    await screen.findByText('Updated: Problem.');
    await act(async () => {});
    expect(screen.queryByTestId('publish-reply-open')).toBeNull();
  });

  it('CONTROL: an owner message that merely starts with "Published v2." is not the reply', async () => {
    invoke.mockResolvedValue({ data: { enabled: false }, error: null });
    st.messages = [rootCard(), publishReply({ authorId: ME, kind: 'message' })];
    standalone();
    await screen.findByText(/Published v2\./);
    await act(async () => {});
    expect(screen.queryByTestId('publish-reply-open')).toBeNull();
  });

  it('inside the workspace\'s thread panel (an open draft whose thread holds that reply) there is no Open of any kind', async () => {
    st.openDraft = draftBlock();
    st.draftRow = draftRow();
    st.messages = [rootCard(), publishReply()];
    mount(`/p/ana/canvas/canvas?v=${DRAFT_NAME}&ws=1`);
    await grid();
    const panel = await screen.findByTestId('thread-panel');
    await screen.findByText(/Published v2\./);
    expect(within(panel).queryByTestId('publish-reply-open')).toBeNull();
    expect(within(panel).queryAllByRole('link')).toEqual([]);
    expect(within(panel).queryByRole('button', { name: /^open/i })).toBeNull();
  });
});
