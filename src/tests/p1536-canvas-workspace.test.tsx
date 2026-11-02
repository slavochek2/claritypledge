/**
 * @file p1536-canvas-workspace.test.tsx
 * @description P1536 S3 (Design v6 D3, D4): the owner's workspace, rendered whole: the REAL route element, canvas page, thread panel and
 * composer (only the database and the chat's message transport are faked).
 *  - S3.1/S3.2 the frame: both panes always mounted, the Canvas | Chat switch, BottomNav/strip hidden by the shared predicate, no
 *    pathname change from Send or Publish, ← per §2
 *  - S3.3 the Publish spot: one box in every state, a `<button>` only in Publish, never disabled; typed refusals; stale re-read
 *  - S3.4 typing changes no button except the send slot (rule 9)
 *  - S3.5 the pane starts exactly where the bar ends (the class arithmetic; pixels need a browser)
 * Pixel and scroll criteria are not claimed here: they need a real browser (listed in the S3 report).
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ThreadPanel } from '@/app/pages/chat/ThreadPanel';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
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
  slug: 'ana' as string | null,
  versions: [] as unknown[],
  versionsError: false,
}));
const refreshChats = vi.hoisted(() => vi.fn(async () => null));
const getCanvas = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const upload = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({ supabase: { rpc, functions: { invoke }, from: vi.fn() } }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: toastError, success: vi.fn() }) })); // 3c X15: Publish and a rename now toast success
vi.mock('@/auth', () => ({
  useAuth: () => ({ session: { user: { id: ME } }, user: { id: ME, slug: st.slug }, sessionChecked: true }),
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
  listMyCanvasVersions: async () => { if (st.versionsError) throw new Error('down'); return st.versions; },
  uploadCanvasMaterial: (...a: unknown[]) => upload(...a),
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
import { CanvasPublishSpot } from '@/app/components/canvas/canvas-publish-spot';
import { SPOT_BOX } from '@/app/components/canvas/canvas-publish-spot-state';
import { assertStableVariantsOnInput } from './p955-stable-variants';
import { resetUnresolvedFirstSends } from '@/app/pages/canvas/workspace-next-draft';
import { resetCanvasAvailability as resetAvailability } from '@/app/pages/chat/use-canvas-availability';
import { clearLinkTokens } from '@/lib/canvas-link-token';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { lacksSecondaryPill } from './p1536-pill-assert';

const summary: ChatSummary = {
  conversationId: CONV, kind: 'mirror', title: 'Mira', other: null, org: null, event: null, ownerFirstName: 'Ana',
  lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false,
};
const chatValue = (chats: ChatSummary[] = [summary]) => ({
  userId: ME, status: 'ready', error: null, chats, unreadCount: 0, refresh: refreshChats, setArchived: vi.fn(), setManualUnread: vi.fn(),
  markRead: vi.fn(), subscribe: () => () => undefined, setViewing: vi.fn(), revision: 0,
  authors: { [ME]: { id: ME, name: 'Ana', slug: 'ana', avatarUrl: null, avatarColor: null, hasPledged: false } },
  missingAuthors: new Set(), ensureAuthors: vi.fn(), outbox: [], sendMessage: vi.fn(), retrySend: vi.fn(), discardSend: vi.fn(), block: vi.fn(), unblock: vi.fn(), goToChat: vi.fn(), resync: vi.fn(),
}) as unknown as ChatContextValue;

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
const draftView = (over: Record<string, unknown> = {}) => ({ ...base, points: [point('canvas:problem')], version: DRAFT_NAME, versions: [draftVersion, v1], publishedNone: false, draft: draftBlock, ...over });
const publishedView = (over: Record<string, unknown> = {}) => ({ ...base, points: [point('canvas:problem')], version: v1.name, versions: [v1], publishedNone: false, draft: null, ...over });

function Where() {
  const l = useLocation();
  return (
    <>
      <output data-testid="where">{l.pathname}{l.search}</output>
      <output data-testid="path">{l.pathname}</output>
    </>
  );
}
function mount(at: string | { pathname: string; search: string; state: unknown } = `/p/ana/canvas/canvas?v=${DRAFT_NAME}&ws=1`, chats: ChatSummary[] = [summary]) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <ChatContext.Provider value={chatValue(chats)}>
        <Where />
        <Routes>
          <Route path="/p/:handle/canvas/:projectTag" element={<CanvasWithThread />} />
          <Route path="*" element={<div data-testid="elsewhere" />} />
        </Routes>
      </ChatContext.Provider>
    </MemoryRouter>,
  );
}
async function ready() {
  await screen.findByTestId('canvas-grid');
  await screen.findByTestId('thread-panel');
  await waitFor(() => expect(screen.queryByTestId('canvas-loading')).toBeNull());
  await waitFor(() => expect(screen.getByTestId('publish-spot')).not.toHaveAttribute('data-state', 'loading'));
}
const spotState = () => screen.getByTestId('publish-spot').getAttribute('data-state');
/** The Canvas | Chat tabs (the project's Radix Tabs primitive: they choose on mouse down). */
const chooseView = (id: 'canvas' | 'chat') => fireEvent.mouseDown(screen.getByTestId(`workspace-view-${id}`), { button: 0, ctrlKey: false });
const disabledButtons = () => Array.from(document.querySelectorAll('button')).filter(b => b.disabled);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear(); // the composer keeps unsent text per thread
  resetUnresolvedFirstSends();
  clearLinkTokens();
  clearListReturnCache();
  resetCanvasAvailability();
  resetCanvasThreads();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  st.slug = 'ana';
  st.versions = [];
  st.versionsError = false;
  st.draft = draftRow();
  st.run = doneRun;
  st.messages = [msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-draft' })];
  rpc.mockImplementation(async (name: string) => (name === 'canvas_draft_publish' ? { data: { seq: 2, skipped_links: 0 }, error: null } : { data: null, error: null }));
  invoke.mockResolvedValue({ data: { enabled: true }, error: null });
  upload.mockReset();
  upload.mockResolvedValue({ ok: true, label: 'offer.pdf', chars: 9 });
  getCanvas.mockReset();
  getCanvas.mockResolvedValue(draftView());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('S3.2: BottomNav and the event strip hide through the one shared predicate', () => {
  // the predicate is imported lazily so this file's mocks never touch it
  it('?ws=1 on a canvas page hides them; no marker, ws=0, another marker value and another path do not (controls)', async () => {
    const { isBottomNavHiddenRoute } = await import('@/app/components/layout/bottom-nav-routes');
    expect(isBottomNavHiddenRoute('/p/ana/canvas/canvas', '?ws=1')).toBe(true);
    expect(isBottomNavHiddenRoute('/p/ana/canvas/canvas/', '?v=x&ws=1')).toBe(true);
    expect(isBottomNavHiddenRoute('/p/ana/canvas/canvas', '')).toBe(false);
    expect(isBottomNavHiddenRoute('/p/ana/canvas/canvas', '?v=x')).toBe(false);
    expect(isBottomNavHiddenRoute('/p/ana/canvas/canvas', '?ws=0')).toBe(false);
    expect(isBottomNavHiddenRoute('/p/ana', '?ws=1')).toBe(false);
    expect(isBottomNavHiddenRoute('/feed', '?ws=1')).toBe(false);
  });

  it('the nav (which carries the event-day strip) and the layout\'s bottom padding both read that same predicate, with the full address', () => {
    for (const file of ['src/app/components/layout/bottom-nav.tsx', 'src/app/layouts/clarity-landing-layout.tsx']) {
      const src = readFileSync(`${process.cwd()}/${file}`, 'utf8');
      expect(src, file).toMatch(/isBottomNavHiddenRoute\(location\.pathname, location\.search\)/);
    }
  });
});

describe('S3.1/S3.2: the frame', () => {
  it('the owner on their draft gets the bar and both panes; at 1280px and wider they sit side by side (neither is hidden at xl)', async () => {
    mount();
    await ready();
    const canvas = screen.getByTestId('workspace-canvas-pane');
    const chat = screen.getByTestId('workspace-chat-pane');
    expect(screen.getByTestId('workspace-bar')).toBeInTheDocument();
    expect(canvas.contains(screen.getByTestId('canvas-grid'))).toBe(true);
    expect(chat.contains(screen.getByTestId('thread-panel'))).toBe(true);
    // wide: a row, the chat 440px, the canvas takes the rest; the "away" classes exist only below xl
    expect(canvas.className).toContain('xl:flex-1');
    expect(chat.className).toContain('xl:w-[440px]');
    for (const pane of [canvas, chat]) expect(pane.className.split(/\s+/).filter(c => c.startsWith('invisible') || c === 'hidden')).toEqual([]);
    expect(screen.getByTestId('workspace-view-switch').className).toContain('xl:hidden'); // the switch is a below-1280 control
  });

  it('below 1280px: the switch shows one pane at a time, BOTH stay mounted (the hidden one is invisible, never unmounted), and a switch keeps scroll, caret and unsent text', async () => {
    mount();
    await ready();
    const canvasPane = screen.getByTestId('workspace-canvas-pane');
    const chatPane = screen.getByTestId('workspace-chat-pane');
    // The chat pane is out of reach below 1280px while the canvas shows (inert + aria-hidden): only a hidden-aware query finds its field.
    const field = within(screen.getByTestId('composer')).getByRole('textbox', { hidden: true }) as HTMLTextAreaElement;
    const grid = screen.getByTestId('canvas-grid');
    expect(canvasPane).toHaveAttribute('data-active', 'true');
    expect(chatPane.className).toContain('max-xl:invisible');
    expect(canvasPane.className).not.toContain('max-xl:invisible');
    // G1: the pane out of reach is inert and aria-hidden (no focus, no tab stop, hidden from screen readers); the shown one is neither
    expect(chatPane).toHaveAttribute('inert');
    expect(chatPane).toHaveAttribute('aria-hidden', 'true');
    expect(canvasPane).not.toHaveAttribute('inert');
    expect(canvasPane).not.toHaveAttribute('aria-hidden');

    fireEvent.change(field, { target: { value: 'unsent words' } });
    field.setSelectionRange(3, 3);
    canvasPane.scrollTop = 321;
    chooseView('chat');
    expect(chatPane).toHaveAttribute('data-active', 'true');
    expect(canvasPane.className).toContain('max-xl:invisible');
    expect(chatPane.className).not.toContain('max-xl:invisible');
    expect(canvasPane).toHaveAttribute('inert');
    expect(chatPane).not.toHaveAttribute('inert');
    expect(chatPane).not.toHaveAttribute('aria-hidden');
    expect(document.contains(grid)).toBe(true); // still mounted

    chooseView('canvas');
    expect(screen.getByTestId('canvas-grid')).toBe(grid); // the same node: no remount
    expect(within(screen.getByTestId('composer')).getByRole('textbox', { hidden: true })).toBe(field); // the same node
    expect(field.value).toBe('unsent words');
    expect(field.selectionStart).toBe(3);
    expect(canvasPane.scrollTop).toBe(321);
  });

  it('S3.2: the shared bar holds ←, the switch and the Publish spot; the spot is ONE element across a view switch', async () => {
    mount();
    await ready();
    const bar = screen.getByTestId('workspace-bar');
    const spot = screen.getByTestId('publish-spot');
    expect(bar.contains(screen.getByTestId('workspace-back'))).toBe(true);
    expect(bar.contains(screen.getByTestId('workspace-view-switch'))).toBe(true);
    expect(bar.contains(spot)).toBe(true);
    chooseView('chat');
    expect(screen.getByTestId('publish-spot')).toBe(spot);
    expect(spot.className).toBe(SPOT_BOX);
  });

  it('S3.5/V1/V2 (W8): ONE box under the shell bar holds the owner\'s bar (its own height: one line from 1280px, two rows below; pixels need a browser) and the panes, which take exactly what is left; nothing is positioned from outside', async () => {
    mount();
    await ready();
    const box = screen.getByTestId('canvas-workspace');
    const bar = screen.getByTestId('workspace-bar');
    const panes = screen.getByTestId('workspace-canvas-pane').parentElement!;
    expect(box.className).toContain('sticky');
    expect(box.className).toContain('top-14'); // under the shell's 3.5rem bar
    expect(box.className).toContain('h-[calc(100dvh-3.5rem)]'); // the rest of the screen
    expect(box.className).toContain('flex-col');
    // W8 (supersedes the fixed h-12): the bar is as tall as its rows and never shrinks; the same markup for a draft and a published version
    expect(bar.className).toContain('shrink-0');
    expect(bar.className).not.toMatch(/\bh-\d/);
    expect(bar.className).not.toMatch(/\b(?:sm|md|lg|xl):(?:py|pt|mt)-/); // no band above its content
    expect(bar.nextElementSibling).toBe(panes); // nothing between the bar and the panes
    expect(panes.className).toContain('flex-1'); // they take what is left of the box ...
    expect(panes.className).toContain('min-h-0'); // ... and may shrink to it
    expect(panes.className).not.toMatch(/\b(?:mt|pt|my|py)-/);
    expect(box.firstElementChild).toBe(bar);
  });

  it('the page inside the workspace has no Back of its own and drops the bottom-nav room', async () => {
    mount();
    await ready();
    expect(screen.queryByRole('button', { name: 'Go back' })).toBe(screen.getByTestId('workspace-back')); // the one ←
    expect(screen.getByTestId('canvas-header-row').parentElement!.className).not.toContain('pb-24');
  });

  it('controls: someone else\'s canvas, or an owner with no mirror chat, gets the plain page (no bar, no panes, the page\'s own padding)', async () => {
    mount(`/p/bo/canvas/canvas?ws=1`);
    await screen.findByTestId('canvas-grid');
    expect(screen.queryByTestId('workspace-bar')).toBeNull();
    expect(screen.queryByTestId('workspace-chat-pane')).toBeNull();
    cleanup();
    mount(`/p/ana/canvas/canvas?v=${DRAFT_NAME}&ws=1`, [{ ...summary, kind: 'dm' as ChatSummary['kind'], conversationId: 'conv-dm' }]);
    await screen.findByTestId('canvas-grid');
    expect(screen.queryByTestId('workspace-bar')).toBeNull();
    expect(screen.queryByTestId('thread-panel')).toBeNull();
  });

  it('entering the workspace does not remount the canvas page (the marker is added to the address with replace)', async () => {
    mount(`/p/ana/canvas/canvas?v=${DRAFT_NAME}`);
    const grid = await screen.findByTestId('canvas-grid');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('ws=1'));
    await screen.findByTestId('workspace-bar');
    expect(screen.getByTestId('canvas-grid')).toBe(grid);
  });
});

describe('S3.2: ← follows §2', () => {
  const back = () => fireEvent.click(screen.getByTestId('workspace-back'));
  it('goes to location.state.from when the opener left one', async () => {
    mount({ pathname: '/p/ana/canvas/canvas', search: `?v=${DRAFT_NAME}&ws=1`, state: { from: '/artifacts?tab=drafts' } });
    await ready();
    back();
    expect(await screen.findByTestId('elsewhere')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/artifacts?tab=drafts');
  });

  it('with no `from` (direct entry or a reload): a draft-only canvas goes to Artifacts', async () => {
    getCanvas.mockResolvedValue(draftView({ versions: [draftVersion], publishedNone: true }));
    mount();
    await ready();
    back();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/artifacts?tab=canvases'));
  });

  it('W1: with no `from`, a canvas WITH a published version goes to Artifacts > Canvases too (the fallback no longer depends on what is published)', async () => {
    mount();
    await ready();
    getCanvas.mockResolvedValue(publishedView());
    back();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/artifacts?tab=canvases'));
  });

  it.each(['https://evil.example/x', '//evil.example', 'javascript:alert(1)', 7])('a `from` that is not an in-app path (%s) is ignored', async (from) => {
    getCanvas.mockResolvedValue(draftView({ versions: [draftVersion], publishedNone: true }));
    mount({ pathname: '/p/ana/canvas/canvas', search: `?v=${DRAFT_NAME}&ws=1`, state: { from } });
    await ready();
    back();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/artifacts?tab=canvases'));
  });
});

describe('S3.3: the Publish spot', () => {
  const STATES: Array<[string, () => void, string, string | null]> = [
    ['publish', () => undefined, 'publish', null],
    ['updating', () => { st.run = { ...doneRun, state: 'running', createdAt: new Date().toISOString(), startedAt: new Date().toISOString() }; }, 'updating', 'Updating…'],
    // 3c X7 (premise change): every status with nothing to publish reads "Nothing to publish yet"; the texts "No changes yet" and "Not published yet" are gone.
    ['no-changes', () => { getCanvas.mockResolvedValue(draftView({ draft: { ...draftBlock, changedBoxes: [] } })); }, 'nothing', 'Nothing to publish yet'],
    // W1/§3b item 0: `ws=1` on a published version with no draft IS the pending Clone.
    ['pending-clone', () => { getCanvas.mockResolvedValue(publishedView()); st.draft = null; }, 'nothing', 'Nothing to publish yet'],
    ['not-published', () => { getCanvas.mockResolvedValue(draftView({ points: [], versions: [draftVersion], publishedNone: true, draft: { ...draftBlock, baseSeq: null, runCount: 0 } })); }, 'nothing', 'Nothing to publish yet'],
  ];

  it.each(STATES)('%s: one box, a <button> only in the Publish state, never disabled', async (_name, arrange, state, text) => {
    arrange();
    mount(_name === 'pending-clone' ? '/p/ana/canvas/canvas?ws=1' : undefined);
    await screen.findByTestId('canvas-grid');
    await waitFor(() => expect(spotState()).toBe(state));
    const spot = screen.getByTestId('publish-spot');
    expect(spot.className).toBe(SPOT_BOX);
    if (text === null) {
      expect(within(spot).getByRole('button', { name: 'Publish' })).toBe(screen.getByTestId('canvas-draft-publish'));
      expect(within(spot).queryByRole('status')).toBeNull();
    } else {
      expect(within(spot).queryAllByRole('button')).toEqual([]);
      expect(within(spot).getByRole('status')).toHaveTextContent(text);
    }
    expect(disabledButtons()).toEqual([]); // no disabled control anywhere in the workspace
    expect(Array.from(spot.querySelectorAll('[aria-disabled="true"]'))).toEqual([]);
  });

  it('the spot component alone: every state renders the same footprint, and only Publish is a button (and it has no disabled attribute)', () => {
    const kinds = [
      { kind: 'loading' }, { kind: 'updating' }, { kind: 'publish' }, { kind: 'nothing' },
    ] as const;
    const boxes = kinds.map(state => {
      const view = render(<CanvasPublishSpot state={state} onPublish={() => undefined} />);
      const spot = view.getByTestId('publish-spot');
      const buttons = view.container.querySelectorAll('button');
      expect(buttons.length, state.kind).toBe(state.kind === 'publish' ? 1 : 0);
      buttons.forEach(b => expect(b.hasAttribute('disabled')).toBe(false));
      const box = spot.className;
      view.unmount();
      return box;
    });
    expect(new Set(boxes).size).toBe(1);
    expect(boxes[0]).toBe(SPOT_BOX);
    expect(SPOT_BOX).toMatch(/\bh-11\b/); // 44px: a tap target
    expect(SPOT_BOX).toMatch(/\bw-24\b/); // 3c X13 (premise change): 96px, so the switcher, Discard and the spot fit one row at 320px
  });

  it('Publish calls publishCanvasDraft(draft, revision); W1: the page then REPLACEs to the published version with no ws and the workspace is gone', async () => {
    mount();
    await ready();
    getCanvas.mockResolvedValue(publishedView({ versions: [{ ...v1, name: DRAFT_NAME, seq: 2 }, v1], version: DRAFT_NAME }));
    st.draft = draftRow({ state: 'published', closedAt: '2026-10-28T10:00:00.000Z' });
    fireEvent.click(screen.getByTestId('canvas-draft-publish'));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('canvas_draft_publish', { p_draft: 'draft-1', p_expected_revision: 0 }));
    await waitFor(() => expect(screen.getByTestId('where')).not.toHaveTextContent('ws=1'));
    expect(screen.getByTestId('where')).toHaveTextContent(`?v=${DRAFT_NAME}`);
    await waitFor(() => expect(screen.queryByTestId('canvas-workspace')).toBeNull());
  });

  it('while Publish is in flight a second tap does nothing and the spot is a status', async () => {
    let finish: (v: unknown) => void = () => undefined;
    rpc.mockImplementation((name: string) => (name === 'canvas_draft_publish' ? new Promise(res => { finish = res; }) : Promise.resolve({ data: null, error: null })));
    mount();
    await ready();
    fireEvent.click(screen.getByTestId('canvas-draft-publish'));
    await waitFor(() => expect(spotState()).toBe('publishing'));
    expect(screen.getByTestId('publish-spot-status')).toHaveTextContent('Publishing…');
    expect(screen.queryByTestId('canvas-draft-publish')).toBeNull();
    expect(rpc.mock.calls.filter(c => c[0] === 'canvas_draft_publish')).toHaveLength(1);
    await act(async () => finish({ data: { seq: 2, skipped_links: 0 }, error: null }));
  });

  it.each([
    ['no_changes', 'nothing', 'Nothing to publish yet'],
    ['draft_empty', 'nothing', 'Nothing to publish yet'],
  ])('a %s refusal puts the matching status in the spot (no error text), until the draft moves on', async (code, state, text) => {
    rpc.mockImplementation(async (name: string) => (name === 'canvas_draft_publish' ? { data: { status: 'refused', code, revision: 0 }, error: null } : { data: null, error: null }));
    mount();
    await ready();
    fireEvent.click(screen.getByTestId('canvas-draft-publish'));
    await waitFor(() => expect(spotState()).toBe(state));
    expect(screen.getByTestId('publish-spot-status')).toHaveTextContent(text);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(toastError).not.toHaveBeenCalled();
    expect(disabledButtons()).toEqual([]);
  });

  it('stale_view re-reads the canvas and shows what the new read says (the Publish button comes back)', async () => {
    rpc.mockImplementation(async (name: string) => (name === 'canvas_draft_publish' ? { data: { status: 'refused', code: 'stale_view', revision: 4 }, error: null } : { data: null, error: null }));
    mount();
    await ready();
    const reads = getCanvas.mock.calls.length;
    getCanvas.mockResolvedValue(draftView({ draft: { ...draftBlock, revision: 4 } }));
    fireEvent.click(screen.getByTestId('canvas-draft-publish'));
    await waitFor(() => expect(getCanvas.mock.calls.length).toBeGreaterThan(reads));
    await waitFor(() => expect(spotState()).toBe('publish'));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('an unexpected failure says so once (toast) and the button stays', async () => {
    rpc.mockImplementation(async (name: string) => (name === 'canvas_draft_publish' ? { data: null, error: { code: 'XX000', message: 'boom' } } : { data: null, error: null }));
    mount();
    await ready();
    fireEvent.click(screen.getByTestId('canvas-draft-publish'));
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(spotState()).toBe('publish'));
  });
});

describe('S3.1: Send and Publish never change the pathname', () => {
  it('a Send from the composer calls canvas_workspace_send and stays on the same path; so does Publish', async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === 'canvas_workspace_send') return { data: { status: 'refused', code: 'busy', revision: 0 }, error: null };
      if (name === 'canvas_draft_publish') return { data: { seq: 2, skipped_links: 0 }, error: null };
      return { data: null, error: null };
    });
    mount();
    await ready();
    const path = screen.getByTestId('path').textContent;
    chooseView('chat'); // below 1280px the composer is reachable in the Chat view
    const field = within(screen.getByTestId('composer')).getByRole('textbox');
    fireEvent.change(field, { target: { value: 'sharpen the problem' } });
    fireEvent.click(within(screen.getByTestId('composer')).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('canvas_workspace_send', expect.objectContaining({ p_body: 'sharpen the problem' })));
    expect(screen.getByTestId('path')).toHaveTextContent(path!);
    fireEvent.click(await screen.findByTestId('canvas-draft-publish')); // Publish waits ("Updating…") until the Send and its re-read have settled
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('canvas_draft_publish', expect.anything()));
    expect(screen.getByTestId('path')).toHaveTextContent(path!);
    fireEvent.change(field, { target: { value: '' } }); // a refused Send hands the text back: the composer's drafts outlive a test
  });
});

describe('S3.4: typing changes no button except the send slot (rule 9)', () => {
  it.each(['canvas', 'chat'] as const)('in the %s view of the real workspace: the bar, the switch, the Publish spot and the panes keep every look', async (view) => {
    mount();
    await ready();
    if (view === 'chat') chooseView('chat');
    const composer = screen.getByTestId('composer');
    expect(() => assertStableVariantsOnInput(document.body, composer)).not.toThrow();
    // CONTROL: the assertion looked at the workspace's own buttons (it would fail if one flipped)
    expect(document.querySelectorAll('[data-testid="workspace-bar"] button').length).toBeGreaterThan(2);
  });
});

describe('review G5: the switch is the project\'s Tabs primitive', () => {
  it('two tabs in a tablist, the shown view selected, and choosing one changes it', async () => {
    mount();
    await ready();
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab');
    expect(tabs.map(t => t.textContent)).toEqual(['Canvas', 'Thread']); // W1: the second tab is the Thread
    expect(tabs.map(t => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    chooseView('chat');
    expect(within(screen.getByRole('tablist')).getAllByRole('tab').map(t => t.getAttribute('aria-selected'))).toEqual(['false', 'true']);
  });
});

describe('review G1: the hidden chat pane takes no focus', () => {
  it('below 1280px with the canvas shown the composer is NOT focused; choosing Chat focuses it', async () => {
    // a desktop pointer (autofocus is skipped on touch) in a window narrower than 1280px
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('pointer'), addEventListener: () => undefined, removeEventListener: () => undefined, media: q }));
    mount();
    await ready();
    const field = within(screen.getByTestId('composer')).getByRole('textbox', { hidden: true });
    expect(document.activeElement).not.toBe(field);
    expect(screen.getByTestId('workspace-chat-pane').contains(document.activeElement)).toBe(false);
    chooseView('chat');
    await waitFor(() => expect(document.activeElement).toBe(field));
  });

  it('at 1280px and wider both panes are reachable: nothing is inert, and the composer may take focus', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('1280') || q.includes('pointer'), addEventListener: () => undefined, removeEventListener: () => undefined, media: q }));
    mount();
    await ready();
    expect(screen.getByTestId('workspace-chat-pane')).not.toHaveAttribute('inert');
    expect(screen.getByTestId('workspace-canvas-pane')).not.toHaveAttribute('inert');
    await waitFor(() => expect(document.activeElement).toBe(within(screen.getByTestId('composer')).getByRole('textbox')));
  });
});

describe('review G2: a published canvas with no open draft (J3), now the one pending state (W1)', () => {
  const published = '/p/ana/canvas/canvas?ws=1';
  const sent = { status: 'ok', run_id: 'run-9', revision: 1, draft_id: 'draft-9', canvas_id: 'cv-1', canvas_name: 'canvas', version_name: DRAFT_NAME, thread_root_id: ROOT, conversation_id: CONV, message_id: 'msg-9', replayed: false };
  beforeEach(() => {
    getCanvas.mockResolvedValue(publishedView());
    st.draft = null;
    st.versions = [{ id: 'ver-1', canvasId: 'cv-1', canvasName: 'canvas', name: v1.name, seq: 1, publishedAt: v1.publishedAt, hasOpenDraft: false }];
  });

  it('shows the empty state and a live composer, and writes NOTHING until the first Send', async () => {
    mount(published);
    await screen.findByTestId('canvas-grid');
    // W1/W3: a bare ws=1 here is the pending Clone. 3c X8 (premise change): it opens with the mirror agent's line, not "Clone v1. Nothing changes for readers until you publish."
    expect(await screen.findByTestId('agent-line')).toHaveTextContent('This is a new draft from v1. Tell me what to change. Readers keep seeing v1 until you publish.');
    chooseView('chat');
    expect(await within(screen.getByTestId('workspace-chat-pane')).findByTestId('composer')).toBeInTheDocument();
    expect(rpc.mock.calls.filter(c => c[0] === 'canvas_workspace_send')).toEqual([]);
    expect(spotState()).toBe('nothing');
  });

  it('the first Send opens the next draft from the version on screen in ONE call, then the page moves to that draft and its thread shows', async () => {
    rpc.mockImplementation(async (name: string) => (name === 'canvas_workspace_send' ? { data: sent, error: null } : { data: null, error: null }));
    mount(published);
    await screen.findByTestId('canvas-grid');
    chooseView('chat');
    const field = await within(await screen.findByTestId('composer')).findByRole('textbox');
    fireEvent.change(field, { target: { value: 'sharpen the problem' } });
    st.draft = draftRow(); // what the database holds after the send
    getCanvas.mockResolvedValue(draftView());
    fireEvent.click(within(screen.getByTestId('composer')).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('canvas_workspace_send', expect.objectContaining({
      p_canvas: 'cv-1', p_from_version: 'ver-1', p_expected_draft: null, p_body: 'sharpen the problem', p_replace: false,
    })));
    expect(rpc.mock.calls.filter(c => c[0] === 'canvas_workspace_send')).toHaveLength(1);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`v=${DRAFT_NAME}`));
    expect(screen.getByTestId('where')).toHaveTextContent('ws=1');
    expect(screen.getByTestId('path')).toHaveTextContent('/p/ana/canvas/canvas'); // same path
    expect(await screen.findByTestId('thread-panel')).toBeInTheDocument();
  });

  it('a refused Send keeps the text, says so once, and opens nothing', async () => {
    rpc.mockImplementation(async (name: string) => (name === 'canvas_workspace_send' ? { data: { status: 'refused', code: 'busy_elsewhere', revision: null }, error: null } : { data: null, error: null }));
    mount(published);
    await screen.findByTestId('canvas-grid');
    chooseView('chat');
    const field = await within(await screen.findByTestId('composer')).findByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'try this' } });
    fireEvent.click(within(screen.getByTestId('composer')).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(field.value).toBe('try this'));
    expect(screen.getByTestId('where')).not.toHaveTextContent('v=');
    fireEvent.change(field, { target: { value: '' } });
  });

  it('CONTROL: a canvas with nothing published yet (and no draft) gets the empty frame without a composer', async () => {
    getCanvas.mockResolvedValue(publishedView({ points: [], version: null, versions: [], publishedNone: true, canvasExists: true }));
    mount(published);
    await screen.findByTestId('workspace-chat-empty');
    expect(screen.queryByTestId('composer')).toBeNull();
  });
});

describe('review C2/D15: Publish waits while a file is being added', () => {
  it('the spot reads Updating… from the moment the file is picked until the send settles, then Publish is back', async () => {
    let finish: (v: unknown) => void = () => undefined;
    rpc.mockImplementation((name: string) => (name === 'canvas_workspace_send' ? new Promise(res => { finish = res; }) : Promise.resolve({ data: null, error: null })));
    mount();
    await ready();
    expect(spotState()).toBe('publish');
    chooseView('chat');
    const input = await screen.findByTestId('canvas-upload-input');
    fireEvent.change(input, { target: { files: [new File(['x'], 'offer.pdf', { type: 'application/pdf' })] } });
    await waitFor(() => expect(spotState()).toBe('updating'));
    expect(screen.queryByTestId('canvas-draft-publish')).toBeNull();
    expect(screen.getByTestId('publish-spot-spinner')).toBeInTheDocument();
    await act(async () => finish({ data: { status: 'refused', code: 'busy', revision: 0 }, error: null }));
    await waitFor(() => expect(spotState()).toBe('publish'));
  });
});

describe('review G3: what a thread reported goes with it', () => {
  it('ThreadPanel tells the workspace the run is over when it goes away (so the spot cannot stick on Updating…)', async () => {
    st.run = { ...doneRun, state: 'running', createdAt: new Date().toISOString(), startedAt: new Date().toISOString() };
    const spy = vi.fn();
    const view = render(
      <MemoryRouter initialEntries={[`/chats/c/${CONV}/t/${ROOT}`]}>
        <ChatContext.Provider value={chatValue()}>
          <ThreadPanel summary={summary} rootId={ROOT} highlightId={null} fill onRunActive={spy} />
        </ChatContext.Provider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(spy).toHaveBeenCalledWith(true));
    view.unmount();
    expect(spy.mock.calls.at(-1)).toEqual([false]);
  });
});

describe('review C3: the marker never outlives the workspace', () => {
  it('someone else\'s canvas with ?ws=1: the marker is removed (replace), so BottomNav comes back; the page stays', async () => {
    mount('/p/bo/canvas/canvas?ws=1&v=x');
    await screen.findByTestId('canvas-grid');
    await waitFor(() => expect(screen.getByTestId('where')).not.toHaveTextContent('ws=1'));
    expect(screen.getByTestId('where')).toHaveTextContent('v=x');
    expect(screen.getByTestId('path')).toHaveTextContent('/p/bo/canvas/canvas');
  });

  it('an owner with no mirror chat: the marker is removed too', async () => {
    mount(`/p/ana/canvas/canvas?v=${DRAFT_NAME}&ws=1`, [{ ...summary, kind: 'dm' as ChatSummary['kind'], conversationId: 'conv-dm' }]);
    await screen.findByTestId('canvas-grid');
    await waitFor(() => expect(screen.getByTestId('where')).not.toHaveTextContent('ws=1'));
  });

  it('CONTROLS: the eligible owner keeps it; and while the chat list is still loading nothing is removed', async () => {
    mount();
    await ready();
    expect(screen.getByTestId('where')).toHaveTextContent('ws=1');
    cleanup();
    const loading = { ...chatValue([]), status: 'loading' } as ChatContextValue;
    render(
      <MemoryRouter initialEntries={[`/p/ana/canvas/canvas?v=${DRAFT_NAME}&ws=1`]}>
        <ChatContext.Provider value={loading}>
          <Where />
          <Routes><Route path="/p/:handle/canvas/:projectTag" element={<CanvasWithThread />} /></Routes>
        </ChatContext.Provider>
      </MemoryRouter>,
    );
    await screen.findByTestId('canvas-grid');
    expect(screen.getByTestId('where')).toHaveTextContent('ws=1');
  });
});

describe('review V8/V10: the spot keeps one box in every state, and work shows a spinner', () => {
  it('through the real workspace, every state of the spot has the same box classes and the same wrapper', async () => {
    const seen = new Set<string>();
    for (const arrange of [() => undefined, () => { st.run = { ...doneRun, state: 'running', createdAt: new Date().toISOString(), startedAt: new Date().toISOString() }; }, () => { getCanvas.mockResolvedValue(draftView({ draft: { ...draftBlock, changedBoxes: [] } })); }]) {
      st.run = doneRun;
      getCanvas.mockResolvedValue(draftView());
      arrange();
      mount();
      await ready();
      const spot = screen.getByTestId('publish-spot');
      seen.add(`${spot.className}|${spot.parentElement!.className}`);
      cleanup();
    }
    expect(seen.size).toBe(1);
  });

  it('Updating… and Publishing… carry a spinner; the quiet statuses do not', async () => {
    const view = (state: unknown, publishing = false) => {
      const v = render(<CanvasPublishSpot state={state as never} publishing={publishing} onPublish={() => undefined} />);
      const has = v.queryByTestId('publish-spot-spinner') !== null;
      v.unmount();
      return has;
    };
    expect(view({ kind: 'updating' })).toBe(true);
    expect(view({ kind: 'publish' }, true)).toBe(true);
    for (const kind of ['nothing', 'publish', 'loading']) expect(view({ kind })).toBe(false);
  });
});

const SENT = { status: 'ok', run_id: 'run-9', revision: 1, draft_id: 'draft-9', canvas_id: 'cv-1', canvas_name: 'canvas', version_name: DRAFT_NAME, thread_root_id: ROOT, conversation_id: CONV, message_id: 'msg-9', replayed: false };
const VERSIONS = [{ id: 'ver-1', canvasId: 'cv-1', canvasName: 'canvas', name: v1.name, seq: 1, publishedAt: v1.publishedAt, hasOpenDraft: false }];

describe('round 2 C1: the chat edits the open draft even when the page shows another version', () => {
  const published = '/p/ana/canvas/canvas?ws=1';
  beforeEach(() => {
    // the owner is looking at published v1 while a draft is open: the read carries the draft block on the published view
    getCanvas.mockImplementation(async (_o: string, _t: string, _v: unknown, _k: unknown, version?: string) => (version === DRAFT_NAME ? draftView() : publishedView({ draft: draftBlock })));
  });

  it('says the chat belongs to the draft, with a one-tap "Go to draft"; the spot is the published one until then', async () => {
    mount(published);
    await screen.findByTestId('canvas-grid');
    expect(await screen.findByTestId('workspace-draft-line')).toHaveTextContent('This chat edits your draft.');
    expect(spotState()).toBe('share'); // 3c X4 (premise change): a published version's spot is Share, not "Published · vN"
    expect(screen.getByTestId('thread-panel')).toBeInTheDocument(); // the draft's thread, not an empty box
    fireEvent.click(screen.getByTestId('workspace-go-to-draft'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`v=${DRAFT_NAME}`));
    expect(screen.getByTestId('where')).toHaveTextContent('ws=1');
    await waitFor(() => expect(spotState()).toBe('publish')); // Publish is on screen: the page now shows the draft
    expect(screen.queryByTestId('workspace-draft-line')).toBeNull();
  });

  it('a run that starts in that chat moves the page to the draft, and the spot reads Updating… (it was zero canvas reads before)', async () => {
    st.run = { ...doneRun, state: 'running', createdAt: new Date().toISOString(), startedAt: new Date().toISOString() };
    mount(published);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`v=${DRAFT_NAME}`));
    await waitFor(() => expect(getCanvas.mock.calls.some(c => c[4] === DRAFT_NAME)).toBe(true)); // retried: the URL moves a tick before the read starts
    await waitFor(() => expect(spotState()).toBe('updating'));
  });

  it('choosing another version afterwards is NOT undone while the run goes on (only the START of a run moves the page)', async () => {
    st.run = { ...doneRun, state: 'running', createdAt: new Date().toISOString(), startedAt: new Date().toISOString() };
    mount(published);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`v=${DRAFT_NAME}`));
    await waitFor(() => expect(spotState()).toBe('updating'));
    // the owner picks the published version in the page's own switcher while the run is still going
    fireEvent.change(within(await screen.findByTestId('canvas-version-picker')).getByRole('combobox', { name: 'Version' }), { target: { value: v1.name } });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`v=${v1.name}`));
    await act(async () => { await new Promise(res => setTimeout(res, 150)); });
    expect(screen.getByTestId('where')).toHaveTextContent(`v=${v1.name}`); // not pulled back
    expect(screen.getByTestId('where')).not.toHaveTextContent(`v=${DRAFT_NAME}`);
  });

  it('CONTROL: on the draft itself there is no draft line', async () => {
    mount();
    await ready();
    expect(screen.queryByTestId('workspace-draft-line')).toBeNull();
  });
});

describe('round 2 C2: a first Send keeps its client id until the outcome is known', () => {
  beforeEach(() => {
    getCanvas.mockResolvedValue(publishedView());
    st.draft = null;
    st.versions = VERSIONS;
  });
  const sendTwice = async (first: unknown) => {
    const calls: Array<{ p_client_id: string; p_body: string }> = [];
    let n = 0;
    rpc.mockImplementation(async (name: string, args: { p_client_id: string; p_body: string }) => {
      if (name !== 'canvas_workspace_send') return { data: null, error: null };
      calls.push(args);
      n += 1;
      return n === 1 ? first : { data: SENT, error: null };
    });
    mount('/p/ana/canvas/canvas?ws=1');
    await screen.findByTestId('canvas-grid');
    chooseView('chat');
    const box = await screen.findByTestId('composer');
    const field = within(box).getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'same words' } });
    fireEvent.click(within(box).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    await waitFor(() => expect(field.value).toBe('same words')); // handed back
    fireEvent.click(within(box).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    return calls;
  };

  it('a lost response (the call throws): the retry of the same text carries the SAME id', async () => {
    const calls = await sendTwice({ data: null, error: { code: 'XX000', message: 'network' } });
    expect(calls[1]!.p_client_id).toBe(calls[0]!.p_client_id);
  });

  it('CONTROL: after a DEFINITE refusal the retry is a new attempt with a new id', async () => {
    const calls = await sendTwice({ data: { status: 'refused', code: 'busy', revision: 0 }, error: null });
    expect(calls[1]!.p_client_id).not.toBe(calls[0]!.p_client_id);
  });
});

describe('round 2 C3/G1/G2/G4: the empty chat is a drawn state, with Upload, the voice button (3c X9), and Updating… while it works', () => {
  beforeEach(() => {
    getCanvas.mockResolvedValue(publishedView());
    st.draft = null;
    st.versions = VERSIONS;
  });
  const open = () => mount('/p/ana/canvas/canvas?ws=1');

  it('C3: while drafting availability is being asked the pane waits as a Skeleton (never a bare box)', async () => {
    invoke.mockImplementation(() => new Promise(() => undefined));
    open();
    await screen.findByTestId('canvas-grid');
    await act(async () => { await new Promise(res => setTimeout(res, 50)); }); // the page has been read; only the availability answer is missing
    expect(screen.getByTestId('workspace-chat-loading')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('workspace-chat-empty')).toBeNull();
    expect(screen.queryByTestId('composer')).toBeNull();
  });

  it('C3: drafting off shows an explicit "could not load" with Retry, and Retry asks the server again', async () => {
    invoke.mockResolvedValue({ data: { enabled: false }, error: null });
    open();
    await screen.findByTestId('canvas-grid');
    chooseView('chat');
    const box = await screen.findByTestId('workspace-chat-unavailable');
    expect(box).toHaveTextContent('Canvas drafting is not available right now.');
    expect(within(box).getByRole('alert')).toHaveTextContent('Could not load this chat. Try again.');
    const asked = invoke.mock.calls.length;
    invoke.mockResolvedValue({ data: { enabled: true }, error: null });
    resetAvailability(); // (the session answer is forgotten by Retry itself; this keeps the test independent of module state)
    fireEvent.click(within(box).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('composer')).toBeInTheDocument();
    expect(invoke.mock.calls.length).toBeGreaterThan(asked);
  });

  it('C3: a draft that lives in another chat is "could not load" with Retry, not an empty box', async () => {
    getCanvas.mockResolvedValue(draftView({ draft: { ...draftBlock, conversationId: 'conv-elsewhere' } }));
    mount();
    await screen.findByTestId('canvas-grid');
    chooseView('chat');
    expect(await screen.findByTestId('workspace-chat-unavailable')).toHaveTextContent('This draft is not available.');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  // 3c X9 changes G1's premise: a pending Clone and an open draft's thread both carry the round voice button now (p1536-x9-voice-ui.test.tsx walks the notes).
  const withRecorder = () => {
    Object.defineProperty(globalThis.navigator, 'mediaDevices', { value: { getUserMedia: vi.fn() }, configurable: true });
    vi.stubGlobal('MediaRecorder', vi.fn());
    vi.stubGlobal('AudioContext', vi.fn());
  };
  afterEach(() => { Object.defineProperty(globalThis.navigator, 'mediaDevices', { value: undefined, configurable: true }); });

  it('G1: the composer has Upload and the voice-note button; picking a file opens the next draft through the first-send path and posts the file', async () => {
    withRecorder();
    rpc.mockImplementation(async (name: string) => (name === 'canvas_workspace_send' ? { data: SENT, error: null } : { data: null, error: null }));
    open();
    await screen.findByTestId('canvas-grid');
    chooseView('chat');
    const box = await screen.findByTestId('composer');
    expect(within(box).getByRole('button', { name: 'Record a voice message' })).toBeInTheDocument();
    expect(within(box).getByTestId('canvas-upload')).toBeInTheDocument();
    const file = new File(['x'], 'offer.pdf', { type: 'application/pdf' });
    fireEvent.change(within(box).getByTestId('canvas-upload-input'), { target: { files: [file] } });
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('canvas_workspace_send', expect.objectContaining({
      p_canvas: 'cv-1', p_from_version: 'ver-1', p_expected_draft: null, p_body: null, p_attachment: { kind: 'file', label: 'offer.pdf' },
    })));
    await waitFor(() => expect(upload).toHaveBeenCalledWith('run-9', file));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`v=${DRAFT_NAME}`));
  });

  it('G1 CONTROL: the real canvas thread (an open draft) has the voice-note button too, once its draft is read', async () => {
    withRecorder();
    getCanvas.mockResolvedValue(draftView());
    st.draft = draftRow();
    mount();
    await ready();
    chooseView('chat');
    expect(await within(screen.getByTestId('composer')).findByRole('button', { name: 'Record a voice message' })).toBeInTheDocument();
  });

  it('G1 CONTROL: a browser that cannot record has no voice button in either (the button follows the browser, as in every chat)', async () => {
    getCanvas.mockResolvedValue(draftView());
    st.draft = draftRow();
    mount();
    await ready();
    chooseView('chat');
    expect(within(screen.getByTestId('composer')).queryByRole('button', { name: 'Record a voice message' })).toBeNull();
  });

  it('G2: while the first Send is in flight the spot reads Updating…, and it lets go when it ends', async () => {
    let finish: (v: unknown) => void = () => undefined;
    rpc.mockImplementation((name: string) => (name === 'canvas_workspace_send' ? new Promise(res => { finish = res; }) : Promise.resolve({ data: null, error: null })));
    open();
    await screen.findByTestId('canvas-grid');
    chooseView('chat');
    const box = await screen.findByTestId('composer');
    expect(spotState()).toBe('nothing'); // W1: ws=1 with no draft is the pending Clone
    fireEvent.change(within(box).getByRole('textbox'), { target: { value: 'go' } });
    fireEvent.click(within(box).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(spotState()).toBe('updating'));
    await act(async () => finish({ data: { status: 'refused', code: 'busy', revision: 0 }, error: null }));
    await waitFor(() => expect(spotState()).toBe('nothing'));
    fireEvent.change(within(box).getByRole('textbox'), { target: { value: '' } });
  });

  it('G4: a version this list cannot find says so, in the words the New version button already used', async () => {
    st.versions = [];
    open();
    await screen.findByTestId('canvas-grid');
    chooseView('chat');
    const box = await screen.findByTestId('composer');
    fireEvent.change(within(box).getByRole('textbox'), { target: { value: 'hello' } });
    fireEvent.click(within(box).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Could not find this version to start from.'));
    fireEvent.change(within(box).getByRole('textbox'), { target: { value: '' } });
  });
});

describe('round 2 G5/V8: tab targets and one right edge for the spot', () => {
  it('the Canvas | Chat tabs are at least 40px (min-h-10), the tablist is 44px (h-11) and sits in the bar\'s second row below 1280px (W8)', async () => {
    mount();
    await ready();
    for (const id of ['canvas', 'chat'] as const) expect(screen.getByTestId(`workspace-view-${id}`).className).toMatch(/\bh-10\b.*\bmin-h-10\b|\bmin-h-10\b.*\bh-10\b/);
    expect(screen.getByRole('tablist').className).toContain('h-11');
    const bar = screen.getByTestId('workspace-bar');
    expect(bar.contains(screen.getByRole('tablist'))).toBe(true);
    expect(screen.getByTestId('workspace-view-switch').className).toContain('xl:hidden'); // gone from 1280px, where the panel is beside the canvas
  });

  it('V8: the box is fixed-width with its content right-aligned in EVERY state, so they share one right edge', async () => {
    const { SPOT_BOX } = await import('@/app/components/canvas/canvas-publish-spot-state');
    expect(SPOT_BOX).toContain('w-24');
    expect(SPOT_BOX).toContain('justify-end');
    for (const state of [{ kind: 'updating' }, { kind: 'nothing' }] as const) {
      const v = render(<CanvasPublishSpot state={state} onPublish={() => undefined} />);
      const status = v.getByTestId('publish-spot-status');
      expect(status.className).toContain('justify-end');
      expect(status.className).toContain('w-full');
      v.unmount();
    }
    const b = render(<CanvasPublishSpot state={{ kind: 'publish' }} onPublish={() => undefined} />);
    // 3c X4 / rule 9 (premise change): the main action is AUTO width, right-aligned in the box: its right edge is still the box's
    expect(b.getByTestId('canvas-draft-publish').className).not.toContain('w-full');
  });
});

describe('review round 3: replay delivers bytes, held is per canvas, Retry re-reads, specific copy', () => {
  const pub = '/p/ana/canvas/canvas?ws=1';
  const SENT3 = { status: 'ok', run_id: 'run-9', revision: 1, draft_id: 'draft-9', canvas_id: 'cv-1', canvas_name: 'canvas', version_name: DRAFT_NAME, thread_root_id: ROOT, conversation_id: CONV, message_id: 'msg-9', replayed: false };
  const V3 = [{ id: 'ver-1', canvasId: 'cv-1', canvasName: 'canvas', name: v1.name, seq: 1, publishedAt: v1.publishedAt, hasOpenDraft: false }];
  beforeEach(() => {
    getCanvas.mockResolvedValue(publishedView());
    st.draft = null;
    st.versions = V3;
  });

  it('H1: a REPLAYED first Send (the first response was lost) still posts the file to the run', async () => {
    let n = 0;
    rpc.mockImplementation(async (name: string) => {
      if (name !== 'canvas_workspace_send') return { data: null, error: null };
      n += 1;
      return n === 1 ? { data: null, error: { code: 'XX000', message: 'network' } } : { data: { ...SENT3, replayed: true }, error: null };
    });
    mount(pub);
    await screen.findByTestId('canvas-grid');
    chooseView('chat');
    const box = await screen.findByTestId('composer');
    const file = new File(['x'], 'offer.pdf', { type: 'application/pdf' });
    fireEvent.change(within(box).getByTestId('canvas-upload-input'), { target: { files: [file] } });
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(upload).not.toHaveBeenCalled();
    fireEvent.change(within(box).getByTestId('canvas-upload-input'), { target: { files: [file] } });
    await waitFor(() => expect(upload).toHaveBeenCalledWith('run-9', file));
  });

  it('H2: moving to another canvas never shows the previous canvas\'s thread (also when the new read fails)', async () => {
    st.draft = draftRow();
    getCanvas.mockImplementation(async (_h: string, tag: string) => {
      if (tag === 'other') throw new Error('read failed');
      return draftView();
    });
    function Go() {
      const nav = useNavigate();
      return <button type="button" data-testid="go-other" onClick={() => nav('/p/ana/canvas/other?ws=1')} />;
    }
    render(
      <MemoryRouter initialEntries={[`/p/ana/canvas/canvas?v=${DRAFT_NAME}&ws=1`]}>
        <ChatContext.Provider value={chatValue()}>
          <Go />
          <Routes><Route path="/p/:handle/canvas/:projectTag" element={<CanvasWithThread />} /></Routes>
        </ChatContext.Provider>
      </MemoryRouter>,
    );
    await screen.findByTestId('thread-panel');
    fireEvent.click(screen.getByTestId('go-other'));
    await waitFor(() => expect(screen.queryByTestId('thread-panel')).toBeNull());
  });

  it('H3: "another chat" Retry re-reads the chat list and the canvas, and recovers', async () => {
    getCanvas.mockResolvedValue(draftView({ draft: { ...draftBlock, conversationId: 'conv-elsewhere' } }));
    mount();
    await screen.findByTestId('canvas-grid');
    chooseView('chat');
    await screen.findByTestId('workspace-chat-unavailable');
    const asked = refreshChats.mock.calls.length;
    const reads = getCanvas.mock.calls.length;
    getCanvas.mockResolvedValue(draftView()); // the draft now lives in this chat
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(refreshChats.mock.calls.length).toBeGreaterThan(asked));
    await waitFor(() => expect(getCanvas.mock.calls.length).toBeGreaterThan(reads));
    expect(await screen.findByTestId('thread-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-chat-unavailable')).toBeNull();
  });

  it('L1: a failed versions list says so specifically (not the generic send failure)', async () => {
    st.versionsError = true;
    mount(pub);
    await screen.findByTestId('canvas-grid');
    chooseView('chat');
    const box = await screen.findByTestId('composer');
    fireEvent.change(within(box).getByRole('textbox'), { target: { value: 'hi' } });
    fireEvent.click(within(box).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError.mock.calls[0]![0]).toBe('Could not load your canvas versions. Try again.');
  });

  it('L2: nothing published and no draft: the chat pane says so in words', async () => {
    getCanvas.mockResolvedValue(publishedView({ points: [], version: null, versions: [], publishedNone: true }));
    mount(pub);
    const empty = await screen.findByTestId('workspace-chat-empty');
    expect(empty).toHaveTextContent('Nothing published yet');
  });

  it('V1: the version chip has a hairline border (the border token) and hugs its text', async () => {
    getCanvas.mockResolvedValue(draftView());
    mount();
    await ready();
    const cls = screen.getByTestId('canvas-version-picker').className;
    expect(cls).toMatch(/\bborder\b/);
    expect(lacksSecondaryPill(screen.getByTestId('canvas-version-picker'))).toEqual([]); // W7: Compare's pill, one constant
    expect(cls).toMatch(/\bw-fit\b/);
  });
});
