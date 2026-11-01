/**
 * @file p1536-w1-workspace.test.tsx
 * @description P1536 §3b W1 (S3b.2, S3b.3, S3b.9): the canvas is home, the thread is a panel. The REAL route element, canvas page, thread
 * panel and composer (only the database and the chat's message transport are faked):
 *  - `?ws=1` is on exactly while the owner is editing; a published view with nothing being edited has no marker, panel, Thread button or switcher
 *  - entries: a Drafts row / Open draft lands on ws=1 on the draft's version; Mine (the published view) has none; a card's Open with a draft is
 *    ws=1 on the draft (see the card tests); an old `thread=` address becomes ws=1
 *  - 1440: the panel is open, closes with ×, a Thread button reopens it, unsent text and the pane survive
 *  - 375: the `Canvas | Thread` switcher; a new canvas opens on Thread, everything else on Canvas; switching pushes no history
 *  - Add to chat / chips (`showThread`): flip the switcher at 375, open a closed panel at 1440, focus inside the call
 *  - access by ownership: a non-owner and a signed-out visitor get none of it
 *  - the no-tray render test: none of the old tray strings render on the workspace, nor exist anywhere in the app source
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
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
  signedIn: true,
  slug: 'ana',
}));
const getCanvas = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({ supabase: { rpc, functions: { invoke }, from: vi.fn() } }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
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
// The canvas page renders SEO inside the workspace: the probe stands in for an S4 "Add to chat" / reply chip, which calls `showThread` from a tap.
vi.mock('@/app/components/seo', async () => {
  const { useCanvasWorkspace } = await import('@/app/components/canvas/canvas-workspace-context');
  const Probe = () => {
    const { showThread } = useCanvasWorkspace();
    return <button type="button" data-testid="probe-show-thread" onClick={showThread}>probe</button>;
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
  getCanvasDraftByThread: async () => st.draft,
  getLatestCanvasRun: async () => st.run,
  listCanvasMaterial: async () => [],
  countDoneCanvasDraftRuns: async () => 1,
  getLastDoneCanvasDraftRunAt: async () => '2026-10-28T09:00:00.000Z',
  listMyCanvasVersions: async () => [],
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
const draftView = () => ({ ...base, points: [point('canvas:problem')], version: DRAFT_NAME, versions: [draftVersion, v1], publishedNone: false, draft: draftBlock });
const publishedView = (over: Record<string, unknown> = {}) => ({ ...base, points: [point('canvas:problem')], version: v1.name, versions: [v1], publishedNone: false, draft: null, ...over });

function Where() {
  const l = useLocation();
  const p = new URLSearchParams(l.search);
  return (
    <>
      <output data-testid="where">{l.pathname}{l.search}</output>
      <output data-testid="ws">{p.get('ws') ?? 'none'}</output>
      <output data-testid="loc-key">{l.key}</output>
      <output data-testid="nav-type">{useNavigationType()}</output>
    </>
  );
}
function mount(at: string | { pathname: string; search: string; state: unknown }) {
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
const chatPane = () => screen.getByTestId('workspace-chat-pane');
const tabs = () => within(screen.getByRole('tablist')).getAllByRole('tab');
const selectedTab = () => tabs().find((t) => t.getAttribute('aria-selected') === 'true')?.textContent;
const chooseView = (id: 'canvas' | 'chat') => fireEvent.mouseDown(screen.getByTestId(`workspace-view-${id}`), { button: 0, ctrlKey: false });
async function draftReady() {
  await screen.findByTestId('canvas-grid');
  await screen.findByTestId('thread-panel');
  await waitFor(() => expect(screen.queryByTestId('canvas-loading')).toBeNull());
}
const DRAFT_AT = `/p/ana/canvas/canvas?v=${DRAFT_NAME}&ws=1`;

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
  st.draft = draftRow();
  st.run = doneRun;
  st.messages = [msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-draft' })];
  rpc.mockImplementation(async () => ({ data: null, error: null }));
  invoke.mockResolvedValue({ data: { enabled: true }, error: null });
  getCanvas.mockReset();
  getCanvas.mockImplementation(async (_o: string, _t: string, _v: unknown, _k: unknown, version?: string) => (version === DRAFT_NAME ? draftView() : publishedView()));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('S3b.3: ws=1 is on exactly while the owner is editing', () => {
  it('Mine / a published version with nothing being edited: no ws, no panel, no Thread button, no switcher, and the thread is not even mounted', async () => {
    mount('/p/ana/canvas/canvas');
    await screen.findByTestId('canvas-grid');
    await act(async () => {});
    expect(screen.getByTestId('ws')).toHaveTextContent('none');
    for (const id of ['canvas-workspace', 'workspace-chat-pane', 'workspace-view-switch', 'workspace-thread-button', 'thread-panel']) {
      expect(screen.queryByTestId(id), id).toBeNull();
    }
    // W8 (supersedes "no bar"): the owner's header IS drawn on a published view, with no workspace parts in it
    expect(screen.getByTestId('workspace-bar')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('the same for a published version named in the address (?v=), even while a draft is open elsewhere', async () => {
    getCanvas.mockImplementation(async (_o: string, _t: string, _v: unknown, _k: unknown, version?: string) => (version === DRAFT_NAME ? draftView() : publishedView({ draft: draftBlock })));
    mount(`/p/ana/canvas/canvas?v=${v1.name}`);
    await screen.findByTestId('canvas-grid');
    await act(async () => {});
    expect(screen.getByTestId('ws')).toHaveTextContent('none');
    expect(screen.queryByTestId('workspace-chat-pane')).toBeNull();
  });

  it('a Drafts row / Open draft: ws=1 on the draft\'s version, the draft selected, the panel open at 1440 with no Thread button', async () => {
    mount(DRAFT_AT);
    await draftReady();
    expect(screen.getByTestId('ws')).toHaveTextContent('1');
    expect(getCanvas.mock.calls.at(-1)![4]).toBe(DRAFT_NAME);
    expect(screen.getByTestId('where')).toHaveTextContent(`/p/ana/canvas/canvas?v=${DRAFT_NAME}&ws=1`);
    expect(chatPane()).not.toHaveAttribute('inert');
    expect(screen.queryByTestId('workspace-thread-button')).toBeNull();
    expect(screen.getByTestId('workspace-canvas-pane')).toHaveAttribute('data-active', 'true'); // everything but a new canvas opens on Canvas
  });

  it('an old `thread=` address becomes ws=1 (the marker is rewritten, the draft comes from the page\'s read)', async () => {
    mount(`/p/ana/canvas/canvas?v=${DRAFT_NAME}&thread=${ROOT}`);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('ws=1'));
    expect(screen.getByTestId('where').textContent).not.toContain('thread=');
    expect(await screen.findByTestId('thread-panel')).toBeInTheDocument();
  });

  it('a pending Clone (ws=1 on a published version with no draft) keeps the workspace: the empty thread and a live composer, nothing written', async () => {
    mount('/p/ana/canvas/canvas?ws=1');
    await screen.findByTestId('canvas-grid');
    await screen.findByTestId('workspace-chat-empty');
    expect(screen.getByTestId('ws')).toHaveTextContent('1');
    expect(screen.getByTestId('composer')).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('S3b.3: the panel at 1440', () => {
  it('is open; × closes it (kept mounted, out of reach) and the header shows a Thread button; Thread reopens it; unsent text survives both', async () => {
    mount(DRAFT_AT);
    await draftReady();
    const field = () => within(screen.getByTestId('composer')).getByRole('textbox', { hidden: true }) as HTMLTextAreaElement;
    fireEvent.change(field(), { target: { value: 'Make the problem sharper' } });
    const pane = chatPane();
    fireEvent.click(screen.getByLabelText('Close thread'));
    expect(chatPane()).toBe(pane); // still the same element: closed, not unmounted
    expect(pane).toHaveAttribute('inert');
    expect(pane.className).toContain('xl:invisible');
    expect(pane.className).toContain('xl:absolute'); // out of the flow: the canvas takes the room
    expect(screen.getByTestId('where')).toHaveTextContent('ws=1'); // open/closed is local state, not the address
    const thread = screen.getByTestId('workspace-thread-button');
    expect(thread).toHaveTextContent('Thread');
    expect(lacksSecondaryPill(thread)).toEqual([]); // the one secondary pill (W7)
    fireEvent.click(thread);
    expect(pane).not.toHaveAttribute('inert');
    expect(screen.queryByTestId('workspace-thread-button')).toBeNull();
    expect(field().value).toBe('Make the problem sharper');
  });

  it('closing and reopening pushes no history entry and changes no address', async () => {
    mount(DRAFT_AT);
    await draftReady();
    const key = screen.getByTestId('loc-key').textContent;
    fireEvent.click(screen.getByLabelText('Close thread'));
    fireEvent.click(screen.getByTestId('workspace-thread-button'));
    expect(screen.getByTestId('loc-key').textContent).toBe(key);
  });
});

describe('S3b.3: the switcher at 375', () => {
  beforeEach(() => stubWidth(false));

  it('reads `Canvas | Thread`, opens on Canvas, and switching changes local state only (no history entry)', async () => {
    mount(DRAFT_AT);
    await draftReady();
    expect(tabs().map((t) => t.textContent)).toEqual(['Canvas', 'Thread']);
    expect(selectedTab()).toBe('Canvas');
    const key = screen.getByTestId('loc-key').textContent;
    chooseView('chat');
    expect(selectedTab()).toBe('Thread');
    chooseView('canvas');
    expect(selectedTab()).toBe('Canvas');
    expect(screen.getByTestId('loc-key').textContent).toBe(key);
    expect(screen.getByTestId('nav-type')).not.toHaveTextContent('PUSH');
    expect(screen.queryByTestId('workspace-thread-button')).toBeNull(); // the Thread button is a 1280px control
  });

  it('a NEW canvas (the start entries mark it) opens on Thread; the Canvas tab is one tap away', async () => {
    mount({ pathname: '/p/ana/canvas/canvas', search: `?v=${DRAFT_NAME}&ws=1`, state: { from: '/artifacts?tab=canvases', tab: 'thread' } });
    await draftReady();
    expect(selectedTab()).toBe('Thread');
    expect(chatPane()).toHaveAttribute('data-active', 'true');
    chooseView('canvas');
    expect(selectedTab()).toBe('Canvas');
  });

  it('showThread (Add to chat, a box chip) flips the switcher to Thread and focuses the composer inside the call', async () => {
    mount(DRAFT_AT);
    await draftReady();
    expect(selectedTab()).toBe('Canvas');
    fireEvent.click(screen.getByTestId('probe-show-thread'));
    expect(selectedTab()).toBe('Thread'); // synchronous: the tap handler's own call stack, so a phone's keyboard opens
    expect(document.activeElement).toBe(within(screen.getByTestId('composer')).getByRole('textbox'));
  });
});

describe('S3b.3: showThread at 1440', () => {
  it('opens a closed panel (and focuses the composer); with the panel already open it only focuses', async () => {
    mount(DRAFT_AT);
    await draftReady();
    fireEvent.click(screen.getByLabelText('Close thread'));
    expect(chatPane()).toHaveAttribute('inert');
    fireEvent.click(screen.getByTestId('probe-show-thread'));
    expect(chatPane()).not.toHaveAttribute('inert');
    expect(screen.queryByTestId('workspace-thread-button')).toBeNull();
    expect(document.activeElement).toBe(within(screen.getByTestId('composer')).getByRole('textbox'));
  });
});

describe('S3b.9: access is by ownership', () => {
  it('a signed-out visitor never gets the panel, the Thread button, the switcher or ws=1 (even if the address asks for it)', async () => {
    st.signedIn = false;
    getCanvas.mockResolvedValue(publishedView({ isOwner: false }));
    mount(`/p/ana/canvas/canvas?v=${v1.name}&ws=1`);
    await screen.findByTestId('canvas-grid');
    await waitFor(() => expect(screen.getByTestId('ws')).toHaveTextContent('none'));
    for (const id of ['canvas-workspace', 'workspace-chat-pane', 'workspace-view-switch', 'workspace-thread-button', 'thread-panel']) expect(screen.queryByTestId(id), id).toBeNull();
  });

  it('someone else\'s canvas (a signed-in non-owner) gets none of it, and the marker is removed', async () => {
    st.slug = 'bob';
    getCanvas.mockResolvedValue(publishedView({ isOwner: false }));
    mount(`/p/ana/canvas/canvas?v=${v1.name}&ws=1`);
    await screen.findByTestId('canvas-grid');
    await waitFor(() => expect(screen.getByTestId('ws')).toHaveTextContent('none'));
    for (const id of ['canvas-workspace', 'workspace-chat-pane', 'workspace-view-switch', 'workspace-thread-button', 'thread-panel']) expect(screen.queryByTestId(id), id).toBeNull();
  });
});

/** The strings of the old tray, the draft card, the closed strip and the header menu. */
const TRAY_STRINGS = ['Create canvas', 'Create new version', 'Update draft', 'Creating your canvas…', 'messages from you', 'message from you', 'Start a new version', 'Canvas draft options', 'Discard draft'];

describe('S3b.2: no owner route renders the old tray controls', () => {
  const stateOf = (label: string, setup: () => void) => [label, setup] as const;
  it.each([
    stateOf('a finished canvas with new notes', () => {
      st.messages = [...st.messages, msg({ id: 'n1', body: 'I sell bookkeeping to cafe owners', createdAt: '2026-10-28T08:30:00.000Z' }), msg({ id: 'n2', body: 'and I raised my price', createdAt: '2026-10-28T11:00:00.000Z' })];
    }),
    stateOf('a run going', () => {
      st.run = { ...doneRun, state: 'running', createdAt: new Date().toISOString(), startedAt: new Date().toISOString() };
    }),
    stateOf('a failed last run', () => {
      st.run = { ...doneRun, state: 'failed', errorCode: 'model' };
    }),
    stateOf('a capped run', () => {
      st.run = { ...doneRun, state: 'capped' };
    }),
    stateOf('an empty new draft', () => {
      st.draft = draftRow({ runCount: 0 });
      st.run = null;
    }),
  ])('the workspace, %s: none of the tray strings, buttons or the draft card', async (_label, setup) => {
    setup();
    mount(DRAFT_AT);
    await draftReady();
    await act(async () => {});
    const text = document.body.textContent ?? '';
    for (const s of TRAY_STRINGS) expect(text, s).not.toContain(s);
    for (const id of ['canvas-bar', 'canvas-draft-card', 'canvas-material', 'canvas-progress']) expect(screen.queryByTestId(id), id).toBeNull();
    expect(screen.queryByLabelText('Canvas draft options')).toBeNull();
  });

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) return f === 'tests' ? [] : walk(p);
      return /\.(tsx?|css)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
    });

  it('and no app source defines them any more (a guard against the tray coming back through another door)', () => {
    const gone = ['Create canvas', 'Create new version', 'Update draft', 'Creating your canvas', 'messages from you', 'Canvas draft options'];
    const hits = walk(join(process.cwd(), 'src/app')).flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return gone.filter((s) => text.includes(`'${s}`) || text.includes(`"${s}`) || text.includes(`>${s}<`)).map((s) => `${file}: ${s}`);
    });
    expect(hits).toEqual([]);
  });
});
