/**
 * @file p1536-x8-agent.test.tsx
 * @description P1536 3c X8 (S3c.5): the mirror agent is visibly there. The panel header is the mirror's face and name with "Your mirror agent" (read from
 * the owner's mirror: this fixture's mirror is called Zed, so a hard-coded "Mira" or any other name fails), plus ×. "New draft from v1" and "Draft · v2"
 * are gone. A thread of a draft with a base opens, before and after the first Send, with a line from the mirror agent in place of the owner-authored
 * base root card and of "Clone v1. Nothing changes for readers until you publish.". The line is drawn on screen from the base's number: it is not a
 * message (no row in the list, nothing posted). The REAL route element, canvas page, thread panel and composer; only the database and the transport are faked.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { cleanup, render, screen, within, waitFor } from '@testing-library/react';
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
const DRAFT_AT = `/p/ana/canvas/canvas?v=${DRAFT_NAME}&ws=1`;


const LINE = (n: number) => `This is a new draft from v${n}. Tell me what to change. Readers keep seeing v${n} until you publish.`;
const ready = async () => { await grid(); await screen.findByTestId('thread-panel'); await waitFor(() => expect(screen.queryByTestId('canvas-loading')).toBeNull()); };
const withBase = () => {
  st.openDraft = draftBlock({ baseSeq: 1, changedBoxes: ['canvas:problem'] });
  st.draftRow = draftRow({ baseVersionId: 'ver-1' });
  st.messages = [msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-1' })];
};

describe('X8: the panel header is the mirror agent', () => {
  it('a draft with a base: the owner\'s mirror\'s name and "Your mirror agent"; not "Draft · v2" or "New draft from v1"', async () => {
    withBase();
    mount(DRAFT_AT);
    await ready();
    const title = screen.getByTestId('canvas-thread-title');
    expect(title).toHaveTextContent('Zed');
    expect(title).toHaveTextContent('Your mirror agent');
    expect(screen.getByTestId('thread-panel')).not.toHaveTextContent(/Draft · v\d|New draft from v\d/);
    expect(within(title).getByTestId('mirror-disc')).toBeInTheDocument();
    expect(screen.getByLabelText('Close thread')).toBeInTheDocument();
  });

  it('a new canvas: the same header, and the opener stays', async () => {
    st.openDraft = draftBlock({ baseSeq: null });
    st.draftRow = draftRow();
    getCanvas.mockImplementation(async (_o: string, _t: string, _v: unknown, _k: unknown, version?: string) => readFor(version, { points: [], versions: [draftVersion], publishedNone: true }));
    mount(DRAFT_AT);
    await ready();
    expect(screen.getByTestId('canvas-thread-title')).toHaveTextContent('Zed');
    expect(screen.getByTestId('canvas-thread-title')).toHaveTextContent('Your mirror agent');
    expect(screen.getByTestId('canvas-copy-prompt')).toBeInTheDocument(); // the opener
    expect(screen.queryByTestId('agent-line')).toBeNull(); // no base, no line
  });

  it('a pending Clone: the same header (not "New draft from v1")', async () => {
    mount('/p/ana/canvas/canvas?ws=1');
    await grid();
    await screen.findByTestId('agent-line');
    const title = screen.getByTestId('canvas-thread-title');
    expect(title).toHaveTextContent('Zed');
    expect(title).toHaveTextContent('Your mirror agent');
    expect(document.body).not.toHaveTextContent(/New draft from v\d/);
  });

  it('CONTROL: the name comes from the mirror. A mirror called Quill shows Quill and no Zed', async () => {
    (chatValue.chats[0] as { title: string }).title = 'Quill';
    try {
      withBase();
      mount(DRAFT_AT);
      await ready();
      expect(screen.getByTestId('canvas-thread-title')).toHaveTextContent('Quill');
      expect(screen.getByTestId('canvas-thread-title')).not.toHaveTextContent('Zed');
    } finally {
      (chatValue.chats[0] as { title: string }).title = 'Zed';
    }
  });
});

describe('X8: the line from the mirror agent', () => {
  it('a draft with a base: the line shows with the agent\'s face and name, and the base root card is not in the thread', async () => {
    withBase();
    mount(DRAFT_AT);
    await ready();
    const line = await screen.findByTestId('agent-line');
    expect(line).toHaveTextContent(LINE(1));
    expect(within(line).getByText('Zed')).toBeInTheDocument();
    expect(within(line).getByTestId('mirror-disc')).toBeInTheDocument();
    expect(document.querySelector(`[data-msg="${ROOT}"]`)).toBeNull(); // the owner-authored "v1 · Published" root card is gone
  });

  it('a pending Clone: the line shows (and the old "Clone v1. Nothing changes..." sentence does not)', async () => {
    mount('/p/ana/canvas/canvas?ws=1');
    await grid();
    const line = await screen.findByTestId('agent-line');
    expect(line).toHaveTextContent(LINE(1));
    expect(document.body).not.toHaveTextContent('Nothing changes for readers until you publish.');
  });

  it('the line is on screen only: it is not a list row and nothing is sent to draw it', async () => {
    withBase();
    mount(DRAFT_AT);
    await ready();
    await screen.findByTestId('agent-line');
    expect(screen.getByTestId('agent-line').closest('li[data-msg]')).toBeNull();
    const writes = rpc.mock.calls.map(c => String(c[0])).filter(n => /send|insert|post|message/i.test(n));
    expect(writes).toEqual([]);
    expect(invoke.mock.calls.filter(c => !(c[1] as { body?: { availability?: boolean } } | undefined)?.body?.availability)).toEqual([]); // the availability question is the only call
  });
});

describe('X8: no mirror name is written in the canvas surfaces', () => {
  const root = `${process.cwd()}/src/app/`;
  const dirs = ['components/canvas', 'pages/canvas'];
  const chatFiles = (): string[] => readdirSync(`${root}pages/chat`).filter(f => /^(Canvas|canvas-|use-canvas-|MirrorReply)/.test(f)).map(f => `pages/chat/${f}`);
  const files = (): string[] => [...dirs.flatMap(d => readdirSync(`${root}${d}`).map(f => `${d}/${f}`)), ...chatFiles()].filter(f => /\.tsx?$/.test(f));
  const code = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const NAME = /\b(Mira|Zed|Quill)\b/;

  it('a grep over the canvas components, the canvas pages and the canvas parts of the chat finds no name in code', () => {
    const found = files().filter(f => NAME.test(code(readFileSync(`${root}${f}`, 'utf8'))));
    expect(files().length).toBeGreaterThan(20); // the scan reached the surfaces
    expect(found).toEqual([]);
  });

  it('CONTROL (gate 7): the same scan catches a name written into code, and ignores one in a comment', () => {
    expect(NAME.test(code('const t = <h2>Mira</h2>;'))).toBe(true);
    expect(NAME.test(code('// e.g. Mira\n/** Mira */ const t = 1;'))).toBe(false);
  });
});
