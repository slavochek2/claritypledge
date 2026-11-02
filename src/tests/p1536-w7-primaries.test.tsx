/**
 * @file p1536-w7-primaries.test.tsx
 * @description P1536 §3b W7 (S3b.6): primary buttons, per state, and the one shared secondary look.
 *  - For each row of the W7 table the rendered primaries equal the table's. 3c X9 supersedes W7's Copy prompt row: Copy prompt is the secondary pill
 *    EVERYWHERE, so on an empty new canvas ("Not published yet") there is no primary at all (the spot is a status), and a closed panel or the Canvas tab
 *    shows zero primaries as before. (The header table itself is rewritten by X4 in a later step; these cases only change where Copy prompt was counted.)
 *    "Rendered" means reachable: a pane that is inert / aria-hidden (closed panel, hidden tab) draws nothing a person can press.
 *  - Composer content never changes either button.
 *  - Clone, Share, Discard (same shape, destructive text), Open, Thread and the version picker all wear the ONE constant (Compare's pill), and the
 *    picker carries a chevron and role=combobox.
 * The REAL route element, canvas page, thread panel, owner's bar and composer; only the database and the chat transport are faked. jsdom cannot paint:
 * what a primary LOOKS like (blue fill) is read from its class list, which is what the P955 gate reads too.
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

import { CanvasVersionCard } from '@/app/pages/chat/CanvasVersionCard';
import { ComparePicker } from '@/app/components/canvas/canvas-compare-picker';
import { CANVAS_SECONDARY_PILL } from '@/app/components/canvas/canvas-pill-styles';
import { isFilledBlue, lacksDestructivePill, lacksPillShape, lacksSecondaryPill } from './p1536-pill-assert';

/** What a person can press that is filled blue: not inside an inert or aria-hidden pane, and not the composer's Send. */
const primaries = (): string[] =>
  [...document.querySelectorAll('button, a')]
    .filter(el => isFilledBlue(el) && !el.closest('[inert], [aria-hidden="true"]') && el.getAttribute('aria-label') !== 'Send')
    .map(el => (el.textContent ?? '').trim() || el.getAttribute('aria-label') || '(unlabelled)');

/** The same count by class alone, the way the P955 gate reads a DOM (it knows nothing of inert panes): a hidden pane must not carry a primary either. */
const primariesByClass = (): string[] =>
  [...document.querySelectorAll('button, a')].filter(el => isFilledBlue(el) && el.getAttribute('aria-label') !== 'Send').map(el => (el.textContent ?? '').trim());

/** A brand-new canvas: a draft with no points, nothing published. */
const newCanvas = () => {
  st.openDraft = draftBlock({ baseSeq: null });
  st.draftRow = draftRow();
  getCanvas.mockImplementation(async (_o: string, _t: string, _v: unknown, _k: unknown, version?: string) => readFor(version, { points: [], versions: [draftVersion], publishedNone: true }));
};
/** A draft from v1 with something to publish. */
const publishable = () => {
  st.openDraft = draftBlock({ baseSeq: 1, changedBoxes: ['canvas:problem'] });
  st.draftRow = draftRow({ baseVersionId: 'ver-1' });
};
/** A NEW canvas (no base) with something drafted: the only canvas whose thread carries Copy prompt while it has points (the opener is a new canvas's onboarding only). */
const publishableNew = () => {
  st.openDraft = draftBlock({ baseSeq: null });
  st.draftRow = draftRow();
  getCanvas.mockImplementation(async (_o: string, _t: string, _v: unknown, _k: unknown, version?: string) => readFor(version, { versions: [draftVersion], publishedNone: true }));
};
const spotText = () => screen.getByTestId('publish-spot').textContent;
const ready = async () => { await grid(); await screen.findByTestId('thread-panel'); await waitFor(() => expect(screen.queryByTestId('canvas-loading')).toBeNull()); };

describe('S3b.6: the W7 table, row by row (1440: the panel beside the canvas)', () => {
  it('Not published yet (an empty new canvas): no primary; Copy prompt is secondary (X9 supersedes W7)', async () => {
    newCanvas();
    mount(DRAFT_AT);
    await ready();
    expect(spotText()).toContain('Not published yet');
    expect(screen.queryByTestId('canvas-draft-publish')).toBeNull();
    expect(primaries()).toEqual([]);
    expect(lacksSecondaryPill(screen.getByTestId('canvas-copy-prompt'))).toEqual([]);
    expect(isFilledBlue(screen.getByTestId('canvas-copy-prompt'))).toBe(false);
  });

  it('Updating…: no primary; Copy prompt is secondary', async () => {
    publishableNew();
    st.latestRun = { id: 'run-1', draftId: 'draft-1', state: 'running', createdAt: new Date().toISOString(), startedAt: new Date().toISOString(), finishedAt: null, errorCode: null };
    mount(DRAFT_AT);
    await ready();
    expect(spotText()).toContain('Updating');
    expect(primaries()).toEqual([]);
    expect(lacksSecondaryPill(screen.getByTestId('canvas-copy-prompt'))).toEqual([]);
  });

  it('No changes yet (a draft from v1): no primary, and no Copy prompt (it is the onboarding of a canvas with no base: "only where shown")', async () => {
    st.openDraft = draftBlock({ baseSeq: 1, changedBoxes: [] });
    st.draftRow = draftRow({ baseVersionId: 'ver-1' });
    mount(DRAFT_AT);
    await ready();
    expect(spotText()).toContain('No changes yet');
    expect(primaries()).toEqual([]);
    expect(screen.queryByTestId('canvas-copy-prompt')).toBeNull();
  });

  it('Publish: Publish is the one primary; Copy prompt is secondary', async () => {
    publishableNew();
    mount(DRAFT_AT);
    await ready();
    expect(screen.getByTestId('canvas-draft-publish')).toBeInTheDocument();
    expect(primaries()).toEqual(['Publish']);
    expect(lacksSecondaryPill(screen.getByTestId('canvas-copy-prompt'))).toEqual([]);
  });

  it('Published · vN (the owner on a published version, nothing being edited): no primary at all, and no thread to carry a Copy prompt', async () => {
    mount('/p/ana/canvas/canvas');
    await grid();
    await screen.findByTestId('canvas-clone');
    expect(spotText()).toContain('Published · v1');
    expect(primaries()).toEqual([]);
    expect(screen.queryByTestId('canvas-copy-prompt')).toBeNull();
  });

  it('a Clone pending (nothing written): the spot says No changes yet, and no primary', async () => {
    mount('/p/ana/canvas/canvas?ws=1');
    await grid();
    await screen.findByTestId('workspace-chat-empty');
    expect(spotText()).toContain('No changes yet');
    expect(primaries()).toEqual([]);
  });
});

describe('S3b.6: a closed panel or the Canvas tab shows ZERO primaries, and the open Thread pane none either (Copy prompt is secondary, X9)', () => {
  it('1440: × closes the panel (zero primaries); Thread opens it again (still none)', async () => {
    newCanvas();
    mount(DRAFT_AT);
    await ready();
    expect(primaries()).toEqual([]);
    fireEvent.click(screen.getByLabelText('Close thread'));
    expect(screen.getByTestId('workspace-chat-pane')).toHaveAttribute('inert');
    expect(primaries()).toEqual([]);
    expect(primariesByClass()).toEqual([]); // not even in the hidden pane
    fireEvent.click(screen.getByTestId('workspace-thread-button'));
    expect(primaries()).toEqual([]);
    expect(screen.getByTestId('canvas-copy-prompt')).toBeVisible();
  });

  it('375: the Canvas tab shows zero primaries; the Thread tab shows Copy prompt, as a secondary', async () => {
    stubWidth(false);
    newCanvas();
    mount(DRAFT_AT);
    await grid();
    await screen.findByTestId('canvas-copy-prompt');
    expect(screen.getByTestId('workspace-view-canvas')).toHaveAttribute('data-state', 'active');
    expect(primaries()).toEqual([]);
    expect(primariesByClass()).toEqual([]); // the Thread pane is mounted but hidden: its Copy prompt is not a primary then
    fireEvent.mouseDown(screen.getByTestId('workspace-view-chat'), { button: 0 });
    fireEvent.click(screen.getByTestId('workspace-view-chat'));
    expect(primaries()).toEqual([]);
    expect(lacksSecondaryPill(screen.getByTestId('canvas-copy-prompt'))).toEqual([]);
    fireEvent.mouseDown(screen.getByTestId('workspace-view-canvas'), { button: 0 });
    fireEvent.click(screen.getByTestId('workspace-view-canvas'));
    expect(primaries()).toEqual([]);
    expect(primariesByClass()).toEqual([]);
  });

  it('at no time are there two primaries, in any of the above (Publish state with the panel open, closed, on either tab)', async () => {
    publishable();
    mount(DRAFT_AT);
    await ready();
    expect(primaries()).toEqual(['Publish']);
    fireEvent.click(screen.getByLabelText('Close thread'));
    expect(primaries()).toEqual(['Publish']); // the spot is in the header: closing the panel does not touch it
  });
});

describe('S3b.6: composer content never changes either button', () => {
  it.each([
    ['Not published yet', newCanvas, []],
    ['Publish', publishableNew, ['Publish']],
  ] as const)('%s: typing in the composer leaves the primaries (and Copy prompt\'s look) as they were', async (_n, arrange, expected) => {
    arrange();
    mount(DRAFT_AT);
    await ready();
    const copyLook = screen.getByTestId('canvas-copy-prompt').className;
    const field = within(screen.getByTestId('workspace-chat-pane')).getByRole('textbox');
    fireEvent.change(field, { target: { value: 'Make the problem sharper for cafes' } });
    expect(primaries()).toEqual(expected);
    expect(screen.getByTestId('canvas-copy-prompt').className).toBe(copyLook);
    fireEvent.change(field, { target: { value: '' } });
    expect(primaries()).toEqual(expected);
  });
});

describe('S3b.6: one shared secondary look (Compare\'s pill), named once', () => {
  it('the constant IS Compare\'s look: a blue outline on a pale blue fill', () => {
    for (const token of ['border-blue-600', 'bg-blue-50', 'text-blue-700', 'rounded-full', 'h-10']) expect(CANVAS_SECONDARY_PILL.split(' ')).toContain(token);
  });

  it('Compare itself wears the constant (one definition)', () => {
    const base = { name: 'Ana', hasPledged: false };
    render(<ComparePicker base={base} others={[{ id: 'u2', name: 'Bo', hasPledged: false, count: 1 }]} withPerson={null} onCompare={() => undefined} />);
    expect(lacksSecondaryPill(screen.getByTestId('canvas-compare-picker'))).toEqual([]);
  });

  it('Clone, Share and the version picker (the owner on a published version with two versions) wear it; the picker has a chevron and role=combobox', async () => {
    st.hasV2 = true;
    mount('/p/ana/canvas/canvas');
    await grid();
    await screen.findByTestId('canvas-clone');
    expect(lacksSecondaryPill(screen.getByTestId('canvas-clone'))).toEqual([]);
    expect(lacksSecondaryPill(screen.getByTestId('canvas-share-control'))).toEqual([]);
    const picker = screen.getByTestId('canvas-version-picker');
    expect(lacksSecondaryPill(picker)).toEqual([]);
    expect(within(picker).getByTestId('canvas-version-chevron')).toBeInTheDocument();
    expect(within(picker).getByTestId('canvas-version-select')).toHaveAttribute('role', 'combobox');
    expect(within(picker).getByRole('combobox', { name: 'Version' })).toBeInTheDocument();
    for (const el of [screen.getByTestId('canvas-clone'), screen.getByTestId('canvas-share-control'), picker]) expect(isFilledBlue(el)).toBe(false);
  });

  it('Thread (panel closed) and Discard (panel header) wear it; Discard keeps the shape with destructive text', async () => {
    publishable();
    mount(DRAFT_AT);
    await ready();
    const discard = screen.getByTestId('canvas-discard');
    expect(lacksPillShape(discard)).toEqual([]);
    expect(lacksDestructivePill(discard)).toEqual([]);
    expect(discard.className).toContain('text-destructive');
    fireEvent.click(screen.getByLabelText('Close thread'));
    expect(lacksSecondaryPill(screen.getByTestId('workspace-thread-button'))).toEqual([]);
  });

  it('View / Open draft (the mirror chat\'s card, 3c X10) wears it', () => {
    const data = { title: 'Canvas 4', label: 'v2 · Oct 10, 2026', state: 'published', draft: false, href: '/x', openHref: '/x' } as never;
    render(<MemoryRouter><CanvasVersionCard data={data} /></MemoryRouter>);
    expect(lacksSecondaryPill(screen.getByRole('link', { name: 'View canvas Canvas 4' }))).toEqual([]);
  });

  it('CONTROL (gate 7): a filled Button and an old grey pill are both caught by the same predicate', () => {
    render(<><button type="button" className="inline-flex h-10 rounded-full border border-border bg-muted px-4" data-testid="old">Old</button><button type="button" className="bg-blue-600 text-white" data-testid="filled">Filled</button></>);
    expect(lacksSecondaryPill(screen.getByTestId('old')).length).toBeGreaterThan(0);
    expect(isFilledBlue(screen.getByTestId('filled'))).toBe(true);
  });
});
