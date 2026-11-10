/**
 * @file p1536-review-fixes.test.tsx
 * @description P1536 review fixes (2026-11-01): defects found after the S3b slice, one failing test each, on the REAL route element, canvas page,
 * thread panel and composer (only the database and the chat's message transport are faked). The pure and unit-level items are in
 * p1536-review-fixes-units.test.tsx.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
const convSend = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({ supabase: { rpc, functions: { invoke }, from: vi.fn() } }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: toastError, success: toastSuccess }) }));
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
vi.mock('@/app/components/canvas/canvas-share-control', () => ({ CanvasShareControl: () => <button type="button" data-testid="share-stub">Share</button> }));
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
    server: st.messages, messages: st.messages, status: 'ready', send: convSend, stats: new Map(), hasMore: false, loadingEarlier: false,
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

const WRITE_RPCS = ['canvas_workspace_send', 'canvas_draft_open', 'canvas_draft_discard', 'canvas_draft_publish', 'canvas_draft_retry', 'canvas_draft_undo'];
const writeCalls = () => rpc.mock.calls.map(c => String(c[0])).filter(n => WRITE_RPCS.includes(n));
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

const openDraftState = (over: Record<string, unknown> = {}) => {
  st.openDraft = draftBlock(over);
  st.draftRow = draftRow();
};
const composerField = () => within(screen.getByTestId('composer')).findByRole('textbox');
const sendButton = () => within(screen.getByTestId('composer')).getByRole('button', { name: 'Send' });
const DRAFT_AT = `/p/ana/canvas/canvas?v=${DRAFT_NAME}&ws=1`;

// ── 1: the owner surface on a lookalike slug ─────────────────────────────────────────────────────────────────────

describe('1: ownership is the exact slug, then the server read', () => {
  it('a signed-in reader whose slug differs only by case gets NO owner bar, no panel, no composer, no Share, and ws=1 is removed', async () => {
    st.slug = 'victim';
    getCanvas.mockImplementation(async (_o: string, _t: string, _v: unknown, _k: unknown, version?: string) => readFor(version, { isOwner: false, draft: null }));
    mount('/p/Victim/canvas/canvas?ws=1');
    await grid();
    await waitFor(() => expect(screen.getByTestId('ws')).toHaveTextContent('none'));
    for (const id of ['workspace-bar', 'workspace-chat-pane', 'thread-panel', 'composer', 'share-stub', 'canvas-workspace', 'workspace-chat-empty']) {
      expect(screen.queryByTestId(id), id).toBeNull();
    }
    expect(writeCalls()).toEqual([]);
  });

  it('CONTROL: the true owner (exact slug) has the bar and Share on a published view', async () => {
    mount('/p/ana/canvas/canvas');
    await grid();
    expect(await screen.findByTestId('workspace-bar')).toBeInTheDocument();
    expect(await screen.findByTestId('share-stub')).toBeInTheDocument();
  });

  it('CONTROL: the true owner with ?ws=1 on a draft has the panel and the composer', async () => {
    openDraftState();
    mount(DRAFT_AT);
    await grid();
    expect(await screen.findByTestId('thread-panel')).toBeInTheDocument();
    expect(await screen.findByTestId('composer')).toBeInTheDocument();
  });

  it('an exact-slug page whose read says "not the owner" loses the owner bar once the read has answered (never owner controls for a non-owner)', async () => {
    getCanvas.mockImplementation(async (_o: string, _t: string, _v: unknown, _k: unknown, version?: string) => readFor(version, { isOwner: false, draft: null }));
    mount('/p/ana/canvas/canvas');
    await grid();
    await act(async () => {});
    await waitFor(() => expect(screen.queryByTestId('workspace-bar')).toBeNull());
    expect(screen.queryByTestId('share-stub')).toBeNull();
  });
});

// ── 2: a failed first upload after Clone ─────────────────────────────────────────────────────────────────────────

describe('2: the first upload after Clone says so when the file did not go through', () => {
  const UNREADABLE = 'I found no text in that file. Nothing changed on the canvas. Try another copy, or paste the text here.';
  async function cloneThenPick() {
    mount('/p/ana/canvas/canvas?v=canvas_d111111');
    await grid();
    fireEvent.click(await screen.findByTestId('canvas-clone'));
    await screen.findByTestId('workspace-chat-empty');
    openDraftState({ baseSeq: 1 });
    fireEvent.change(screen.getByTestId('canvas-upload-input'), { target: { files: [new File(['x'], 'plan.pdf', { type: 'application/pdf' })] } });
  }
  beforeEach(() => {
    rpc.mockImplementation(async (name: string) => (name === 'canvas_workspace_send' ? { data: sentRow, error: null } : { data: null, error: null }));
  });

  it('a refused file (the server could not read it): a toast with the refusal, and the page still moves to the draft that now exists', async () => {
    invoke.mockImplementation(async (_n: string, opts?: { body?: unknown }) => (opts?.body instanceof FormData
      ? { data: null, error: { context: new Response(JSON.stringify({ code: 'UNREADABLE' }), { status: 422 }) } }
      : { data: { enabled: true }, error: null }));
    await cloneThenPick();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(UNREADABLE));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`v=${DRAFT_NAME}`));
  });

  it('a file whose post never landed (the network): the "wait a minute" sentence, and the draft is open', async () => {
    invoke.mockImplementation(async (_n: string, opts?: { body?: unknown }) => {
      if (opts?.body instanceof FormData) throw new Error('network');
      return { data: { enabled: true }, error: null };
    });
    await cloneThenPick();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('The file did not go through. Wait a minute, then try again.'), { timeout: 4000 });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`v=${DRAFT_NAME}`));
  });

  it('CONTROL: a file that was read says nothing', async () => {
    invoke.mockImplementation(async (_n: string, opts?: { body?: unknown }) => (opts?.body instanceof FormData ? { data: { label: 'plan.pdf', chars: 10 }, error: null } : { data: { enabled: true }, error: null }));
    await cloneThenPick();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`v=${DRAFT_NAME}`));
    expect(toastError).not.toHaveBeenCalled();
  });
});

// ── 7: Clone with its panel hidden ───────────────────────────────────────────────────────────────────────────────

describe('7: Clone brings the thread panel with it', () => {
  it('close the panel on a draft, publish, tap Clone: the panel is open', async () => {
    openDraftState({ changedBoxes: ['canvas:problem'] });
    rpc.mockImplementation(async (name: string) => (name === 'canvas_draft_publish' ? { data: { status: 'ok', seq: 2, skipped_links: 0 }, error: null } : { data: null, error: null }));
    mount(DRAFT_AT);
    await grid();
    await screen.findByTestId('thread-panel');
    fireEvent.click(screen.getByLabelText('Close thread'));
    await waitFor(() => expect(screen.getByTestId('workspace-chat-pane')).toHaveAttribute('inert'));
    // publish: the draft's own version becomes v2
    const publishedAsV2 = { ...v2, name: DRAFT_NAME };
    getCanvas.mockImplementation(async (_o: string, _t: string, _v: unknown, _k: unknown, version?: string) => ({ ...readFor(version), version: version ?? DRAFT_NAME, versions: [publishedAsV2, v1], draft: null }));
    st.openDraft = null;
    st.draftRow = null;
    fireEvent.click(await screen.findByTestId('canvas-draft-publish'));
    fireEvent.click(await screen.findByTestId('canvas-clone'));
    await screen.findByTestId('workspace-chat-empty');
    expect(screen.getByTestId('workspace-chat-pane')).not.toHaveAttribute('inert');
  });
});

// ── 8: a Send must not skip the engine ───────────────────────────────────────────────────────────────────────────

describe('8: in a canvas thread a Send is never a plain chat message while the draft is unread', () => {
  it('the draft read failed: the text is kept, nothing is posted to the chat, and Retry is on offer', async () => {
    openDraftState();
    byThread.mockRejectedValue(new Error('down'));
    mount(DRAFT_AT);
    await grid();
    await screen.findByTestId('thread-panel');
    const field = await composerField();
    fireEvent.change(field, { target: { value: 'make it shorter' } });
    await screen.findByRole('button', { name: /retry|try again/i });
    fireEvent.click(sendButton());
    await act(async () => {});
    expect(convSend).not.toHaveBeenCalled();
    expect(sends()).toHaveLength(0);
    expect(toastError).toHaveBeenCalled();
    expect(await composerField()).toHaveValue('make it shorter');
  });

  it('the draft is still being read (the first read is out): the Send waits, nothing is posted to the chat and no refusal is shown', async () => {
    openDraftState();
    byThread.mockImplementation(() => new Promise(() => undefined));
    mount(DRAFT_AT);
    await grid();
    await screen.findByTestId('thread-panel');
    fireEvent.change(await composerField(), { target: { value: 'make it shorter' } });
    fireEvent.click(sendButton());
    await act(async () => {});
    expect(convSend).not.toHaveBeenCalled();
    expect(sends()).toHaveLength(0);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('CONTROL: with the draft read, Send is the update (one canvas_workspace_send), not a chat message', async () => {
    openDraftState();
    rpc.mockImplementation(async (name: string) => (name === 'canvas_workspace_send' ? { data: sentRow, error: null } : { data: null, error: null }));
    mount(DRAFT_AT);
    await grid();
    await screen.findByTestId('thread-panel');
    await waitFor(() => expect(screen.queryByTestId('canvas-loading')).toBeNull());
    fireEvent.change(await composerField(), { target: { value: 'make it shorter' } });
    fireEvent.click(sendButton());
    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(convSend).not.toHaveBeenCalled();
  });
});

// ── 11: header and panel text per the wireframes ─────────────────────────────────────────────────────────────────

describe('11: the header and the panel read as drawn', () => {
  it('(a) no stray "·" before the version', async () => {
    openDraftState();
    mount(DRAFT_AT);
    await grid();
    const slot = await screen.findByTestId('canvas-project-slot');
    expect([...slot.querySelectorAll('span')].some(s => s.textContent?.trim() === '·')).toBe(false);
  });

  it('(b) a draft from a base reads "Draft" with the version in the picker beside it, and no "from v1" (3c X6, premise change)', async () => {
    openDraftState({ baseSeq: 1 });
    mount(DRAFT_AT);
    await grid();
    expect(await screen.findByTestId('canvas-state')).toHaveTextContent(/^Draft$/);
    expect(within(screen.getByTestId('workspace-bar')).getByTestId('canvas-version-short')).toHaveTextContent(/^v2$/);
    expect(screen.getByTestId('workspace-bar')).not.toHaveTextContent('from v1');
  });

  it('(b) CONTROL: a new canvas (no base) reads just "Draft"', async () => {
    openDraftState({ baseSeq: null });
    mount(DRAFT_AT);
    await grid();
    expect(await screen.findByTestId('canvas-state')).toHaveTextContent(/^Draft$/);
  });

  it('(c) the panel header is the mirror agent (3c X8, premise change: not "Draft · vN"), and Discard is in the page header, labelled (3c X6)', async () => {
    openDraftState({ baseSeq: 1 });
    mount(DRAFT_AT);
    await grid();
    const title = await screen.findByTestId('canvas-thread-title');
    expect(title).toHaveTextContent('Your mirror agent');
    expect(title.closest('header')!).not.toHaveTextContent(/Draft · v|Discard/);
    expect(within(screen.getByTestId('workspace-bar')).getByTestId('canvas-discard')).toHaveTextContent('Discard');
  });

  it('(c) a pending Clone: the panel header is the mirror agent and the page header carries the "New draft" tag (3c X6/X8, premise change)', async () => {
    mount('/p/ana/canvas/canvas?v=canvas_d111111');
    await grid();
    fireEvent.click(await screen.findByTestId('canvas-clone'));
    const title = await screen.findByTestId('canvas-thread-title');
    expect(title).toHaveTextContent('Your mirror agent');
    expect(title).not.toHaveTextContent('New draft from v1');
    expect(screen.getByTestId('canvas-state')).toHaveTextContent('New draft');
  });
});

// ── 12: a bare ?ws=1 with an open draft ──────────────────────────────────────────────────────────────────────────

describe('12: ?ws=1 with no version lands on the open draft (W0)', () => {
  it('the workspace is on the draft: v= is the draft, and there is no "this chat edits your draft" line', async () => {
    openDraftState();
    mount('/p/ana/canvas/canvas?ws=1');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`v=${DRAFT_NAME}`));
    expect(screen.getByTestId('ws')).toHaveTextContent('1');
    await screen.findByTestId('thread-panel');
    await waitFor(() => expect(screen.queryByTestId('workspace-draft-line')).toBeNull());
  });

  it('CONTROL: an explicit published version with ws=1 keeps the "Go to draft" line (S3/J4)', async () => {
    openDraftState();
    mount('/p/ana/canvas/canvas?v=canvas_d111111&ws=1');
    await screen.findByTestId('workspace-draft-line');
    expect(screen.getByTestId('where')).toHaveTextContent('v=canvas_d111111');
  });
});

// ── 9 / 10: the band above the header, the header's height ───────────────────────────────────────────────────────

describe('9: no empty band above the owner header inside the signed-in shell', () => {
  const SHELL_TOP = '[[data-shell-top-nav=none]_&]:top-[env(safe-area-inset-top)]';
  it('the workspace box sticks at the shell edge (not 56px down) and takes the whole screen there', async () => {
    openDraftState();
    mount(DRAFT_AT);
    await grid();
    const box = await screen.findByTestId('canvas-workspace');
    expect(box.className).toContain(SHELL_TOP);
    expect(box.className).toContain('[[data-shell-top-nav=none]_&]:h-[calc(100dvh-env(safe-area-inset-top))]');
  });

  it('the owner bar of a published view (sticky, no workspace box) too', async () => {
    mount('/p/ana/canvas/canvas');
    await grid();
    expect((await screen.findByTestId('workspace-bar')).className).toContain(SHELL_TOP);
  });
});

describe('10: the header is the same height for a draft and a published version', () => {
  it('row 2 has one minimum height (the switcher\'s 44px) whether or not the switcher is there', async () => {
    mount('/p/ana/canvas/canvas');
    await grid();
    expect((await screen.findByTestId('canvas-bar-actions')).className).toContain('max-xl:min-h-11');
    cleanup();
    openDraftState();
    mount(DRAFT_AT);
    await grid();
    expect((await screen.findByTestId('canvas-bar-actions')).className).toContain('max-xl:min-h-11');
    expect(screen.getByTestId('workspace-view-switch').firstElementChild?.className).toContain('h-11');
  });
});

// ── 8b: "touched" counts the owner's messages in the thread ──────────────────────────────────────────────────────

describe('8b: another base\'s draft with a message in its thread but no run counts as touched (the J4 sheet, never a silent discard)', () => {
  const threadStats = (count: number) => async (name: string) =>
    (name === 'get_thread_stats' ? { data: [{ root_id: ROOT, reply_count: count, recent_author_ids: [ME] }], error: null } : { data: null, error: null });
  async function cloneOverOtherBase() {
    st.hasV2 = true;
    st.openDraft = draftBlock({ baseSeq: 1, runCount: 0 }); // a draft from v1, no run; the owner looks at v2
    st.draftRow = draftRow({ runCount: 0 });
    mount('/p/ana/canvas/canvas?v=canvas_d222222');
    await grid();
    fireEvent.click(await screen.findByTestId('canvas-clone'));
  }

  it('a reply in the thread (no run): the sheet', async () => {
    rpc.mockImplementation(threadStats(2));
    await cloneOverOtherBase();
    expect(await screen.findByTestId('clone-draft-sheet')).toBeInTheDocument();
  });

  it('CONTROL: an empty thread and no run: no sheet, the pending Clone', async () => {
    rpc.mockImplementation(threadStats(0));
    await cloneOverOtherBase();
    await screen.findByTestId('workspace-chat-empty');
    expect(screen.queryByTestId('clone-draft-sheet')).toBeNull();
  });
});
