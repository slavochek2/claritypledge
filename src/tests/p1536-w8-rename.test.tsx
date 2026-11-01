/**
 * @file p1536-w8-rename.test.tsx
 * @description P1536 §3b W8 (S3b.7, Rename): the owner renames the canvas from the header. ✎ makes the name an inline input; Enter or blur saves
 * (optimistic, with rollback and a toast when the database refuses); Escape puts the old name back; an empty name puts the old name back; the field
 * stops at 60 characters; the address does not change; only the owner of a canvas with a record sees ✎. The shown title comes from one helper
 * (canvasDisplayTitle: the rename, else the name's title). The RPC's own refusals (non-owner, empty, over 60) are pinned in
 * p1536-canvas-title-migration.test.ts; the reads that carry the title are in p1536-w8-title-reads.test.ts.
 * The REAL route element, canvas page and owner's bar; only the database and the chat transport are faked.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

import { canvasDisplayTitle, CANVAS_TITLE_MAX } from '@/lib/canvas-boxes';
import { RENAME_FAILED_TEXT } from '@/app/pages/canvas/use-canvas-rename';

const title = () => screen.getByTestId('canvas-title');
const pencil = () => screen.getByTestId('canvas-rename');
const open = async (at = '/p/ana/canvas/canvas') => { mount(at); await grid(); await screen.findByTestId('canvas-rename'); };
const startEdit = () => { fireEvent.click(pencil()); return screen.getByTestId('canvas-title-input') as HTMLInputElement; };
const type = (input: HTMLInputElement, value: string) => fireEvent.change(input, { target: { value } });
const settle = () => act(async () => { await Promise.resolve(); });

describe('Rename: the owner\'s ✎', () => {
  it('shows the name with a ✎; the pencil turns the name into an input holding it, limited to 60 characters', async () => {
    await open();
    expect(title()).toHaveTextContent('Canvas');
    const input = startEdit();
    expect(input.value).toBe('Canvas');
    expect(input.maxLength).toBe(CANVAS_TITLE_MAX);
    expect(CANVAS_TITLE_MAX).toBe(60);
    expect(screen.queryByTestId('canvas-title')).toBeNull();
  });

  it('Enter saves (trimmed), shows the new name AT ONCE (optimistic, before the database answers), and leaves the address alone', async () => {
    let answer: (t: string) => void = () => undefined;
    renameCanvas.mockImplementation(() => new Promise<string>(res => { answer = res; }));
    await open();
    const where = screen.getByTestId('where').textContent;
    const input = startEdit();
    type(input, '  Hiring plan  ');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(renameCanvas).toHaveBeenCalledTimes(1);
    expect(renameCanvas).toHaveBeenCalledWith('cv-1', 'Hiring plan');
    expect(title()).toHaveTextContent('Hiring plan'); // not waiting for the answer
    await act(async () => { answer('Hiring plan'); });
    expect(title()).toHaveTextContent('Hiring plan');
    expect(screen.getByTestId('where').textContent).toBe(where); // the URL (the canvas_N tag) never changes
    expect(screen.queryByTestId('canvas-title-input')).toBeNull();
  });

  it('leaving the field (blur) saves too', async () => {
    renameCanvas.mockResolvedValue('Q1 plan');
    await open();
    const input = startEdit();
    type(input, 'Q1 plan');
    fireEvent.blur(input);
    expect(renameCanvas).toHaveBeenCalledWith('cv-1', 'Q1 plan');
    await settle();
    expect(title()).toHaveTextContent('Q1 plan');
  });

  it('Escape puts the old name back and saves nothing (and the blur that follows does not save it either)', async () => {
    await open();
    const input = startEdit();
    type(input, 'Something else');
    // both in one batch: the field is still mounted when the blur arrives, as in a browser that blurs the field as it goes
    act(() => { fireEvent.keyDown(input, { key: 'Escape' }); fireEvent.blur(input); });
    expect(renameCanvas).not.toHaveBeenCalled();
    expect(title()).toHaveTextContent('Canvas');
  });

  it('Enter followed by the blur it causes saves ONCE', async () => {
    renameCanvas.mockResolvedValue('Q1 plan');
    await open();
    const input = startEdit();
    type(input, 'Q1 plan');
    act(() => { fireEvent.keyDown(input, { key: 'Enter' }); fireEvent.blur(input); });
    expect(renameCanvas).toHaveBeenCalledTimes(1);
  });

  it.each([['empty', ''], ['only spaces', '   ']])('an %s name puts the old name back and saves nothing', async (_n, value) => {
    await open();
    const input = startEdit();
    type(input, value);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(renameCanvas).not.toHaveBeenCalled();
    expect(title()).toHaveTextContent('Canvas');
  });

  it('the same name saves nothing; a name over 60 characters (past the field\'s own limit) is not sent either', async () => {
    await open();
    let input = startEdit();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(renameCanvas).not.toHaveBeenCalled();
    input = startEdit();
    type(input, 'x'.repeat(61));
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(renameCanvas).not.toHaveBeenCalled();
    expect(title()).toHaveTextContent('Canvas');
    input = startEdit();
    type(input, 'x'.repeat(60));
    renameCanvas.mockResolvedValue('x'.repeat(60));
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(renameCanvas).toHaveBeenCalledWith('cv-1', 'x'.repeat(60));
  });

  it('a refusal rolls the old name back and says so in a toast', async () => {
    renameCanvas.mockRejectedValue(new Error('not authorized for this canvas'));
    await open();
    const input = startEdit();
    type(input, 'Hiring plan');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(title()).toHaveTextContent('Hiring plan'); // optimistic first
    await settle();
    await screen.findByText('Canvas', { selector: '[data-testid="canvas-title"]' });
    expect(toastError).toHaveBeenCalledWith(RENAME_FAILED_TEXT);
  });

  it('a refusal after an earlier successful rename goes back to THAT name, not to the original', async () => {
    renameCanvas.mockResolvedValueOnce('First').mockRejectedValueOnce(new Error('no'));
    await open();
    let input = startEdit();
    type(input, 'First');
    fireEvent.keyDown(input, { key: 'Enter' });
    await settle();
    input = startEdit();
    type(input, 'Second');
    fireEvent.keyDown(input, { key: 'Enter' });
    await settle();
    await screen.findByText('First', { selector: '[data-testid="canvas-title"]' });
  });

  it('a title the database already holds is the name shown (the read carries it), over the name\'s own title', async () => {
    getCanvas.mockImplementation(async () => readFor(undefined, { title: 'Series A plan' }));
    await open();
    expect(title()).toHaveTextContent('Series A plan');
    expect(startEdit().value).toBe('Series A plan');
  });

  it('the name is shown ONCE, in the owner bar: the panel header of an update draft reads "Draft · vN" and does not repeat it (wireframe, review fix 11c)', async () => {
    st.openDraft = draftBlock({ baseSeq: 1 });
    st.draftRow = draftRow({ baseVersionId: 'ver-1' });
    getCanvas.mockImplementation(async (_o: string, _t: string, _v: unknown, _k: unknown, version?: string) => readFor(version, { title: 'Series A plan' }));
    mount(DRAFT_AT);
    await grid();
    await screen.findByTestId('thread-panel');
    expect(title()).toHaveTextContent('Series A plan');
    expect(await screen.findByTestId('canvas-thread-title')).toHaveTextContent(/^Draft · v\d+$/);
  });
});

describe('Rename: only the owner, and only where there is a canvas to rename', () => {
  it('a reader sees the name as plain text: no ✎, no input', async () => {
    getCanvas.mockImplementation(async () => readFor(undefined, { isOwner: false, canvasId: null, draft: null }));
    st.slug = 'cy';
    mount('/p/ana/canvas/canvas');
    await screen.findByTestId('canvas-owner');
    expect(screen.queryByTestId('canvas-rename')).toBeNull();
    expect(title()).toHaveTextContent('Canvas');
  });

  it('an owner whose canvas has no record yet (no canvas id) has no ✎: there is nothing for the database to rename', async () => {
    getCanvas.mockImplementation(async () => readFor(undefined, { canvasId: null }));
    mount('/p/ana/canvas/canvas');
    await grid();
    await screen.findByTestId('workspace-bar');
    await screen.findByTestId('canvas-title');
    expect(screen.queryByTestId('canvas-rename')).toBeNull();
  });

  it('a read that carries a canvas id for a NON-owner is ignored (the id reaches the owner only)', async () => {
    getCanvas.mockImplementation(async () => readFor(undefined, { isOwner: false, canvasId: 'cv-1', draft: null }));
    st.slug = 'cy';
    mount('/p/ana/canvas/canvas');
    await screen.findByTestId('canvas-owner');
    expect(screen.queryByTestId('canvas-rename')).toBeNull();
  });
});

describe('canvasDisplayTitle: one helper for the shown title', () => {
  it.each([
    [null, 'hiring_plan_for_q1', 'Hiring plan for q1'],
    [undefined, 'canvas_4', 'Canvas 4'],
    ['', 'canvas_4', 'Canvas 4'],
    ['   ', 'canvas_4', 'Canvas 4'],
    ['Series A plan', 'canvas_4', 'Series A plan'],
  ])('%j over %s shows %s', (given, name, shown) => {
    expect(canvasDisplayTitle(given, name)).toBe(shown);
  });
});
