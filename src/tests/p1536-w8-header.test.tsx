/**
 * @file p1536-w8-header.test.tsx
 * @description P1536 §3b W8 (S3b.7) and S3b.9: the owner's ONE header for a draft, a pending Clone and a published version, and the reader header.
 *  - ≥1280, one line: ← · name ✎ · [vN ▾] · state · Share · Clone (published) · Thread (panel closed) · Publish spot.
 *    <1280, row 1: ← · name ✎ · [vN ▾] · state · Publish spot; row 2: the Canvas | Thread switcher · Share · Clone.
 *  - no "Clarity Canvas" label; Share is labelled at every width (B4); the name truncates first; the Publish spot is one box in all five states.
 *  - the same markup for a draft and a published version (height equal), and a published owner view HAS the bar (spot "Published · vN", Clone, no panel).
 *  - S3b.9: a shared reader, an attendee on another's canvas and a signed-out visitor get the reader header: no ✎, Clone, Discard, Thread, switcher, Draft
 *    state or Publish spot, and their picker lists published versions only.
 * jsdom has no layout: the pixel checks (no horizontal overflow at 1440 / 375 / 320, header height equal ±1px, the spot's bounding box ±1px) belong to the browser walkthrough.
 * What it CAN pin is the structure that makes them true, and this file reads the visual order the classes produce at each width.
 * The REAL route element, canvas page, owner's bar and thread panel; only the database and the chat transport are faked.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
const DRAFT_AT = `/p/ana/canvas/canvas?v=${DRAFT_NAME}&ws=1`;

import { CanvasPublishSpot } from '@/app/components/canvas/canvas-publish-spot';
import { SPOT_BOX, type PublishSpotState } from '@/app/components/canvas/canvas-publish-spot-state';
import { isBottomNavHiddenRoute } from '@/app/components/layout/bottom-nav-routes';
import { ARTIFACTS_CANVASES_MINE } from '@/app/pages/artifacts/legacy-redirect-targets';
import { lacksSecondaryPill } from './p1536-pill-assert';

const bar = () => screen.getByTestId('workspace-bar');
/** The bar's direct children by what they hold. */
const part = (testid: string) => {
  const el = within(bar()).queryByTestId(testid);
  let node: Element | null = el;
  while (node && node.parentElement !== bar()) node = node.parentElement;
  return node;
};
const PARTS: Array<[string, string]> = [
  ['back', 'workspace-back'], ['name', 'canvas-name'], ['version', 'canvas-project-slot'], ['state', 'canvas-state'], ['spot', 'publish-spot'],
  ['switcher', 'workspace-view-switch'], ['actions', 'canvas-bar-actions'],
];
/** `order-N` at a width: 'xl' reads `xl:order-*` first. last = Infinity. */
function orderOf(el: Element, width: 'xl' | 'base'): number {
  const cls = el.className.split(/\s+/);
  const read = (prefix: string): number | null => {
    for (const c of cls) {
      if (!c.startsWith(prefix + 'order-')) continue;
      if (prefix === '' && c.includes(':')) continue;
      const v = c.slice((prefix + 'order-').length);
      return v === 'last' ? Infinity : v === 'first' || v === 'none' ? 0 : Number(v);
    }
    return null;
  };
  return (width === 'xl' ? read('xl:') : null) ?? read('') ?? 0;
}
/** The visual sequence of the bar's parts at a width, split into rows below 1280px (the break element is order-5). */
function layout(width: 'xl' | 'base'): string[][] {
  const present = PARTS.map(([name, id]) => [name, part(id)] as const).filter((p): p is readonly [string, Element] => !!p[1]);
  const shown = present.filter(([, el]) => !(width === 'xl' && el.className.split(/\s+/).includes('xl:hidden')));
  const sorted = [...shown].sort((a, b) => orderOf(a[1], width) - orderOf(b[1], width));
  if (width === 'xl') return [sorted.map(([n]) => n)];
  const breakAt = orderOf(bar().querySelector('[aria-hidden="true"].basis-full')!, 'base');
  return [sorted.filter(([, el]) => orderOf(el, 'base') < breakAt).map(([n]) => n), sorted.filter(([, el]) => orderOf(el, 'base') > breakAt).map(([n]) => n)];
}
const draftOpen = () => { st.hasV2 = false; st.openDraft = draftBlock({ baseSeq: 1, changedBoxes: ['canvas:problem'] }); st.draftRow = draftRow({ baseVersionId: 'ver-1' }); };
const ready = async () => { await grid(); await screen.findByTestId('thread-panel'); };

describe('S3b.7: the owner\'s header, draft and published', () => {
  it('a draft at 1280+: ← · name ✎ · [v2 ▾] · Draft · Share · the Publish spot, on one line; no Clone, no Thread button (the panel is open)', async () => {
    draftOpen();
    mount(DRAFT_AT);
    await ready();
    expect(layout('xl')).toEqual([['back', 'name', 'version', 'state', 'actions', 'spot']]);
    expect(screen.getByTestId('canvas-title')).toHaveTextContent('Canvas');
    expect(screen.getByTestId('canvas-rename')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-state')).toHaveTextContent('Draft');
    expect(within(bar()).getByTestId('canvas-version-select')).toHaveValue(DRAFT_NAME);
    expect(within(bar()).getByTestId('canvas-share-control')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-clone')).toBeNull();
    expect(screen.queryByTestId('workspace-thread-button')).toBeNull();
  });

  it('a draft below 1280: row 1 ← · name ✎ · [v2 ▾] · Draft · spot; row 2 the Canvas | Thread switcher · Share', async () => {
    stubWidth(false);
    draftOpen();
    mount(DRAFT_AT);
    await grid();
    await screen.findByTestId('canvas-title');
    expect(layout('base')).toEqual([['back', 'name', 'version', 'state', 'spot'], ['switcher', 'actions']]);
    expect(within(bar()).getByTestId('canvas-share-control')).toBeInTheDocument();
  });

  it('a published version at 1280+: ← · name ✎ · Published · Share · Clone · the spot "Published · v1"; no switcher, no Thread button, no panel', async () => {
    mount('/p/ana/canvas/canvas');
    await grid();
    await screen.findByTestId('canvas-clone');
    expect(layout('xl')).toEqual([['back', 'name', 'state', 'actions', 'spot']]);
    expect(screen.getByTestId('canvas-state')).toHaveTextContent('Published');
    expect(screen.getByTestId('publish-spot-status')).toHaveTextContent('Published · v1');
    expect(within(bar()).getByTestId('canvas-clone')).toBeInTheDocument();
    for (const id of ['workspace-view-switch', 'workspace-thread-button', 'workspace-chat-pane', 'canvas-workspace']) expect(screen.queryByTestId(id), id).toBeNull();
    expect(screen.queryByText('Clarity Canvas')).toBeNull();
  });

  it('a published version below 1280: row 1 ← · name ✎ · spot; row 2 Share · Clone (no switcher outside the workspace)', async () => {
    stubWidth(false);
    mount('/p/ana/canvas/canvas');
    await grid();
    await screen.findByTestId('canvas-clone');
    expect(layout('base')).toEqual([['back', 'name', 'state', 'spot'], ['actions']]);
  });

  it('the panel closed (1280+): the Thread button sits between Clone/Share and the spot, in the header, and only there', async () => {
    draftOpen();
    mount(DRAFT_AT);
    await ready();
    fireEvent.click(screen.getByLabelText('Close thread'));
    const thread = screen.getByTestId('workspace-thread-button');
    expect(bar().contains(thread)).toBe(true);
    expect(part('canvas-bar-actions')!.contains(thread)).toBe(true);
    expect(thread.className).toContain('xl:inline-flex'); // gone below 1280, where the switcher is
    expect(thread.className).toContain('hidden');
    expect(layout('xl')).toEqual([['back', 'name', 'version', 'state', 'actions', 'spot']]);
  });

  it('no "Clarity Canvas" label anywhere, on a draft or a published version', async () => {
    draftOpen();
    mount(DRAFT_AT);
    await ready();
    // (the mirror's opener, in the thread, says "your Clarity Canvas" in a sentence: that is copy, not the header's label)
    const headerText = () => (bar().textContent ?? '') + (screen.getByTestId('canvas-header-row').textContent ?? '');
    expect(screen.queryByTestId('canvas-eyebrow')).toBeNull();
    expect(headerText()).not.toContain('Clarity Canvas');
    cleanup();
    mount('/p/ana/canvas/canvas');
    await grid();
    await screen.findByTestId('canvas-clone');
    expect(screen.queryByTestId('canvas-eyebrow')).toBeNull();
    expect(headerText()).not.toContain('Clarity Canvas');
  });

  it('B4: Share keeps its word at every width (a visible label, not an unlabelled lock icon)', async () => {
    mount('/p/ana/canvas/canvas');
    await grid();
    const share = await screen.findByTestId('canvas-share-control');
    const word = within(share).getByText('Share');
    for (let el: Element | null = word; el && el !== share.parentElement; el = el.parentElement) {
      expect(el.className, el.tagName).not.toMatch(/\bhidden\b|max-sm:hidden|sm:hidden|sr-only/);
    }
    expect(lacksSecondaryPill(share)).toEqual([]);
  });

  it('the name truncates first: it takes the free width and shrinks; every other part keeps its size', async () => {
    draftOpen();
    mount(DRAFT_AT);
    await ready();
    const name = part('canvas-name')!;
    expect(name.className).toMatch(/\bmin-w-0\b/);
    expect(name.className).toMatch(/\bflex-1\b/);
    expect(screen.getByTestId('canvas-title').className).toContain('truncate');
    for (const id of ['canvas-project-slot', 'publish-spot', 'workspace-back']) expect(part(id)!.className, id).toMatch(/\bshrink-0\b/);
    expect(screen.getByTestId('canvas-state').className).toContain('shrink-0');
  });

  it('a draft and a published version have the same header markup (so the same height); only the sticky placement differs', async () => {
    draftOpen();
    mount(DRAFT_AT);
    await ready();
    const draftClass = bar().className;
    cleanup();
    st.openDraft = null; st.draftRow = null;
    mount('/p/ana/canvas/canvas');
    await grid();
    await screen.findByTestId('canvas-clone');
    // the placement is the sticky offset and its inside-the-shell variant (review fix 9: no empty band above the header there)
    const strip = (c: string) => c.split(/\s+/).filter(t => !['sticky', 'top-14'].includes(t) && !t.startsWith('[[data-shell-top-nav=none]_&]:top-')).sort().join(' ');
    expect(strip(bar().className)).toBe(strip(draftClass));
    expect(bar().className).toContain('sticky'); // sticky as the workspace is: under the shell's top bar
    expect(bar().className).toContain('top-14');
  });

  it('there is one ← and one h1 on a published owner view (the page\'s own Back is not drawn twice)', async () => {
    mount('/p/ana/canvas/canvas');
    await grid();
    await screen.findByTestId('canvas-clone');
    expect(screen.getAllByRole('button', { name: 'Go back' })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('← goes to Artifacts > Canvases when nobody sent the owner here', async () => {
    mount('/p/ana/canvas/canvas');
    await grid();
    fireEvent.click(await screen.findByTestId('workspace-back'));
    await screen.findByTestId('elsewhere');
    expect(screen.getByTestId('where')).toHaveTextContent(ARTIFACTS_CANVASES_MINE);
  });

  it('BottomNav: still visible on the plain published owner view (no ws=1), hidden inside the workspace', () => {
    expect(isBottomNavHiddenRoute('/p/ana/canvas/canvas', '')).toBe(false);
    expect(isBottomNavHiddenRoute('/p/ana/canvas/canvas', '?v=canvas_d111111')).toBe(false);
    expect(isBottomNavHiddenRoute('/p/ana/canvas/canvas', '?ws=1')).toBe(true);
  });
});

describe('S3.3 / S3b.7: the Publish spot is one box in all five states, and a button only in Publish (never disabled)', () => {
  const STATES: Array<[string, PublishSpotState, boolean]> = [
    ['Updating…', { kind: 'updating' }, false],
    ['Publish', { kind: 'publish' }, true],
    ['No changes yet', { kind: 'no-changes' }, false],
    ['Published · v3', { kind: 'published', seq: 3 }, false],
    ['Not published yet', { kind: 'not-published' }, false],
  ];
  it.each(STATES)('%s: the same footprint (SPOT_BOX), a <button> only in Publish, never disabled', (text, state, isButton) => {
    render(<CanvasPublishSpot state={state} onPublish={() => undefined} />);
    expect(screen.getByTestId('publish-spot').className).toBe(SPOT_BOX);
    expect(screen.queryAllByRole('button')).toHaveLength(isButton ? 1 : 0);
    expect(document.querySelectorAll('button[disabled], [aria-disabled="true"]')).toHaveLength(0);
    expect(screen.getByTestId('publish-spot')).toHaveTextContent(text);
  });
  it('and the route puts the same box in the header for a draft (Publish) and a published version (Published · v1)', async () => {
    draftOpen();
    mount(DRAFT_AT);
    await ready();
    expect(screen.getByTestId('publish-spot').className).toBe(SPOT_BOX);
    cleanup();
    st.openDraft = null; st.draftRow = null;
    mount('/p/ana/canvas/canvas');
    await grid();
    await screen.findByTestId('canvas-clone');
    expect(screen.getByTestId('publish-spot').className).toBe(SPOT_BOX);
    expect(part('publish-spot')).toBe(bar().querySelector(':scope > .shrink-0.order-4'));
  });
});

describe('S3b.9: anyone but the owner gets the reader header', () => {
  const assertReader = async () => {
    await grid();
    await screen.findByTestId('canvas-owner'); // the read has landed (the skeleton has no byline)
    for (const id of ['workspace-bar', 'canvas-rename', 'canvas-clone', 'canvas-discard', 'workspace-thread-button', 'workspace-view-switch', 'workspace-chat-pane', 'publish-spot', 'canvas-state-draft']) {
      expect(screen.queryByTestId(id), id).toBeNull();
    }
    expect(screen.getByTestId('canvas-title').tagName).toBe('H1');
    expect(screen.queryByText('Draft')).toBeNull();
    expect(screen.getByTestId('canvas-header-row')).not.toHaveTextContent('Clarity Canvas');
  };
  const asReader = () => getCanvas.mockImplementation(async () => readFor(undefined, { isOwner: false, canvasId: null, draft: null, versions: [v2, v1], via: { kind: 'person', id: 'o', name: 'Bo', slug: 'bo' } }));

  it('a shared reader (signed in, another person\'s canvas): the reader header, published versions only in the picker', async () => {
    st.slug = 'cy';
    asReader();
    mount('/p/ana/canvas/canvas');
    await assertReader();
    const options = within(await screen.findByTestId('canvas-version-select')).getAllByRole('option').map(o => o.textContent ?? '');
    expect(options).toHaveLength(2);
    expect(options.every(o => /^v\d · /.test(o))).toBe(true);
    expect(screen.getByTestId('canvas-byline')).toBeInTheDocument();
  });

  it('an attendee on ANOTHER\'s canvas (the route handle is not theirs): the reader header', async () => {
    st.slug = 'ana';
    asReader();
    mount('/p/bo/canvas/canvas');
    await assertReader();
  });

  it('a signed-out visitor: the reader header, and the draft is not in the picker even if the answer carried one', async () => {
    st.signedIn = false;
    getCanvas.mockImplementation(async () => readFor(undefined, { isOwner: false, canvasId: null, draft: null, versions: [draftVersion, v2, v1] }));
    mount('/p/ana/canvas/canvas');
    await assertReader();
    const options = within(await screen.findByTestId('canvas-version-select')).getAllByRole('option').map(o => o.textContent ?? '');
    expect(options).toHaveLength(2);
    expect(options.join('|')).not.toContain('Draft');
  });

  it('CONTROL: an owner-attendee on their OWN canvas gets everything above (bar, ✎, Clone, switcher below 1280)', async () => {
    stubWidth(false);
    mount('/p/ana/canvas/canvas');
    await grid();
    await screen.findByTestId('canvas-clone');
    expect(bar()).toBeInTheDocument();
    expect(screen.getByTestId('canvas-rename')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-view-switch')).toBeNull(); // nothing is being edited
    fireEvent.click(screen.getByTestId('canvas-clone'));
    await screen.findByTestId('workspace-view-switch');
  });
});
