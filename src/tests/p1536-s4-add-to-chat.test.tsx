/**
 * @file p1536-s4-add-to-chat.test.tsx
 * @description P1536 S4 (D5, J2, J3, J4, W1): Add to chat, inline tags and reply chips. The REAL route element, canvas page, thread panel and composer (only the
 * database and the chat's message transport are faked):
 *  - S4.1 the owner sees Add to chat (44px) on nine boxes, on a draft and on a published version; a reader and a signed-out visitor see none
 *  - S4.2 a tap puts a tag token at the saved caret and focuses the composer inside the tap; two taps, two tags; Backspace removes a whole tag
 *  - S4.3 a Send carries `p_box_refs` and "[Title]" words; a sent message draws its tags as chips
 *  - S4.4 on a published canvas a tap and a leave write nothing; the first Send makes the draft, and carries the tags
 *  - S4.5 J4: another base with a message asks; "Add to my draft" lands the tag in that draft, "Start over" in the pending Clone; dismissing drops it
 *  - W1 / J2 the switcher flips at 375 and a closed panel opens at 1440 on a tap; a reply chip lands on its box at both widths
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
// The real body component (chips); the row around it is a stand-in.
vi.mock('@/app/pages/chat/MessageRow', async () => {
  const { CanvasMessageBody } = await import('@/app/pages/chat/CanvasMessageBody');
  return { MessageRow: ({ msg }: { msg: ChatMessage }) => <li data-msg={msg.id}>{msg.body ? <CanvasMessageBody body={msg.body} boxRefs={msg.boxRefs} agent={msg.kind === 'agent'} /> : 'card'}</li> };
});

import { CanvasWithThread } from '@/app/pages/canvas/canvas-with-thread';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { clearDraftsExcept } from '@/app/pages/chat/chat-hooks';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { resetCanvasThreads } from '@/app/pages/chat/canvas-thread-registry';
import { resetUnresolvedFirstSends } from '@/app/pages/canvas/workspace-next-draft';
import { clearLinkTokens } from '@/lib/canvas-link-token';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { tagToken } from '@/app/pages/chat/composer-tags';
import { CANVAS_CHIP } from '@/app/components/canvas/canvas-pill-styles';

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
  clearDraftsExcept(null); // the composer's unsent text is module state: one test's must not be the next one's
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
const BOXES = ['canvas:segments', 'canvas:problem', 'canvas:solution', 'canvas:channels', 'canvas:revenue', 'canvas:metrics', 'canvas:love', 'canvas:good-at', 'canvas:world-needs'];
const tapAdd = (tag: string) => fireEvent.click(screen.getByTestId(`canvas-add-to-chat-${tag}`));
const field = () => within(screen.getByTestId('composer')).getByRole('textbox', { hidden: true }) as HTMLTextAreaElement;
/** Typing: the value changes and the caret goes to its end, as the browser reports it. */
const typeInto = (value: string) => {
  fireEvent.change(field(), { target: { value } });
  field().setSelectionRange(value.length, value.length);
  fireEvent.select(field());
};
const REVENUE_TOKEN = tagToken('canvas:revenue');
const SEGMENTS_TOKEN = tagToken('canvas:segments');
const DRAFT_AT = `/p/ana/canvas/canvas?v=${DRAFT_NAME}&ws=1`;
const openDraftState = () => { st.openDraft = draftBlock({ baseSeq: 1 }); st.draftRow = draftRow(); };
async function draftReady() {
  await grid();
  await screen.findByTestId('thread-panel');
  await waitFor(() => expect(screen.queryByTestId('canvas-loading')).toBeNull());
}

describe('S4.1 who sees Add to chat', () => {
  it('the owner sees it on all nine boxes, 44px tall, on a draft', async () => {
    openDraftState();
    mount(DRAFT_AT);
    await draftReady();
    for (const tag of BOXES) {
      const b = screen.getByTestId(`canvas-add-to-chat-${tag}`);
      expect(b).toHaveTextContent('Add to chat');
      expect(b.className).toContain('min-h-11');
    }
    expect(screen.getAllByText('Add to chat')).toHaveLength(9);
  });

  it('the owner sees it on all nine boxes of a published version, with nothing being edited', async () => {
    mount('/p/ana/canvas/canvas');
    await grid();
    await waitFor(() => expect(screen.getAllByText('Add to chat')).toHaveLength(9));
  });

  it('a signed-in non-owner and a signed-out visitor see none', async () => {
    st.slug = 'bob';
    getCanvas.mockImplementation(async (_o: string, _t: string, _v: unknown, _k: unknown, version?: string) => readFor(version, { isOwner: false, draft: null }));
    mount('/p/ana/canvas/canvas');
    await grid();
    await act(async () => {});
    expect(screen.queryByText('Add to chat')).toBeNull();
    cleanup();
    st.signedIn = false;
    mount('/p/ana/canvas/canvas');
    await grid();
    await act(async () => {});
    expect(screen.queryByText('Add to chat')).toBeNull();
  });
});

describe('the one chip look', () => {
  it('the Changed marker on a box wears the same chip classes as a box named in a message', async () => {
    st.openDraft = draftBlock({ baseSeq: 1, changedBoxes: ['canvas:problem'] });
    st.draftRow = draftRow();
    mount(DRAFT_AT);
    await draftReady();
    expect((await screen.findByTestId('canvas-box-changed')).className).toContain(CANVAS_CHIP);
  });
});

describe('S4.2 tags in the composer', () => {
  it('a tap puts the token at the saved caret and the composer has focus when the tap handler returns; two taps, two tags', async () => {
    openDraftState();
    mount(DRAFT_AT);
    await draftReady();
    typeInto('hello world');
    field().setSelectionRange(5, 5);
    fireEvent.select(field());
    tapAdd('canvas:revenue');
    expect(field().value).toBe(`hello ${REVENUE_TOKEN}  world`);
    expect(document.activeElement).toBe(field());
    expect(field().selectionStart).toBe(`hello ${REVENUE_TOKEN} `.length);
    tapAdd('canvas:segments');
    expect(field().value).toContain(REVENUE_TOKEN);
    expect(field().value).toContain(SEGMENTS_TOKEN);
  });

  it('Backspace right after a tag removes the whole tag', async () => {
    openDraftState();
    mount(DRAFT_AT);
    await draftReady();
    tapAdd('canvas:revenue'); // the caret is after the space the tap added behind the token
    fireEvent.keyDown(field(), { key: 'Backspace' }); // ONE press right after the tap removes the whole tag (and that space)
    expect(field().value).toBe('');
    typeInto(`${REVENUE_TOKEN} words`);
    field().setSelectionRange(REVENUE_TOKEN.length, REVENUE_TOKEN.length); // directly after a token with no space: still the whole token
    fireEvent.keyDown(field(), { key: 'Backspace' });
    expect(field().value).toBe(' words'); // the whole token went, not one letter of it
  });

  it('a tags-only field shows the voice button, not Send; words bring Send', async () => {
    openDraftState();
    mount(DRAFT_AT);
    await draftReady();
    tapAdd('canvas:revenue');
    expect(screen.queryByRole('button', { name: /^send$/i })).toBeNull();
    typeInto(`${REVENUE_TOKEN} €200`);
    expect(await screen.findByRole('button', { name: /^send$/i })).toBeInTheDocument();
  });
});

describe('S4.3 what Send carries, and the chips of a sent message', () => {
  it('one canvas_workspace_send with the words as "[Title]" and the boxes in p_box_refs', async () => {
    openDraftState();
    rpc.mockImplementation(async (name: string) => (name === 'canvas_workspace_send' ? { data: { ...sentRow, draft_id: 'draft-1' }, error: null } : { data: null, error: null }));
    mount(DRAFT_AT);
    await draftReady();
    tapAdd('canvas:revenue');
    typeInto(`${REVENUE_TOKEN} €200 per pilot `);
    tapAdd('canvas:metrics');
    fireEvent.click(await screen.findByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(sends()).toHaveLength(1));
    const a = sends()[0]![1] as Record<string, unknown>;
    expect(a.p_body).toBe('[Offers & Pricing] €200 per pilot [My next milestone]');
    expect(a.p_box_refs).toEqual(['canvas:metrics', 'canvas:revenue']);
    expect(a.p_expected_draft).toBe('draft-1');
  });

  it('a stored message with box_refs draws the tags as chips; the same words without box_refs stay text', async () => {
    openDraftState();
    st.messages = [
      msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-draft' }),
      msg({ id: 'm1', body: '[Customer Segments] Not HR leads', boxRefs: ['canvas:segments'] }),
      msg({ id: 'm2', body: '[Problem] typed by hand' }),
    ];
    mount(DRAFT_AT);
    await draftReady();
    const row = document.querySelector('[data-msg="m1"]') as HTMLElement;
    expect(within(row).getByTestId('message-box-chip')).toHaveTextContent('Customer Segments');
    expect(row.textContent).toContain('Not HR leads');
    expect(within(document.querySelector('[data-msg="m2"]') as HTMLElement).queryByTestId('message-box-chip')).toBeNull();
  });
});

describe('S4.4 a published canvas', () => {
  it('a tap enters the pending Clone (ws=1), writes nothing, and the tag is in the composer; leaving writes nothing either', async () => {
    mount('/p/ana/canvas/canvas');
    await grid();
    await waitFor(() => expect(screen.getAllByText('Add to chat')).toHaveLength(9));
    tapAdd('canvas:segments');
    await screen.findByTestId('workspace-chat-empty');
    await waitFor(() => expect(field().value).toContain(SEGMENTS_TOKEN));
    expect(screen.getByTestId('ws')).toHaveTextContent('1');
    expect(writeRpcs()).toEqual([]);
    expect(edgeWrites()).toEqual([]);
    fireEvent.click(screen.getByLabelText('Close thread'));
    await waitFor(() => expect(screen.getByTestId('ws')).toHaveTextContent('none'));
    expect(writeRpcs()).toEqual([]);
  });

  it('the first Send is ONE canvas_workspace_send from that version, carrying the tag', async () => {
    rpc.mockImplementation(async (name: string) => (name === 'canvas_workspace_send' ? { data: sentRow, error: null } : { data: null, error: null }));
    mount('/p/ana/canvas/canvas');
    await grid();
    await waitFor(() => expect(screen.getAllByText('Add to chat')).toHaveLength(9));
    tapAdd('canvas:segments');
    await waitFor(() => expect(field().value).toContain(SEGMENTS_TOKEN));
    typeInto(`${SEGMENTS_TOKEN} Not HR leads`);
    fireEvent.click(await screen.findByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(sends()).toHaveLength(1));
    const a = sends()[0]![1] as Record<string, unknown>;
    expect(a.p_from_version).toBe('ver-1');
    expect(a.p_box_refs).toEqual(['canvas:segments']);
    expect(a.p_body).toBe('[Customer Segments] Not HR leads');
  });
});

describe('S4.2 focus after a tap on a published canvas', () => {
  // Not provable here: testing-library flushes everything after a handler. In a real browser the composer is mounted AFTER the handler returns (the router applies `ws=1` in a
  // transition), which the walk records; what is asserted is that it is then mounted, holds the tag and has the focus.
  it('the composer is mounted, holds the tag and has the focus once the pending Clone has rendered', async () => {
    mount('/p/ana/canvas/canvas');
    await grid();
    await waitFor(() => expect(screen.getAllByText('Add to chat')).toHaveLength(9));
    await act(async () => {}); // the page's read and the chat list have answered
    tapAdd('canvas:segments'); // synchronous: fireEvent.click returns when the handler has
    expect(screen.getByTestId('workspace-chat-empty')).toBeInTheDocument();
    expect(field().value).toContain(SEGMENTS_TOKEN);
    expect(document.activeElement).toBe(field());
  });
});

describe('S4.4 a tap before the page has read the canvas', () => {
  it('waits for the read, then does what a tap on a published version does (pending Clone, tag in the composer)', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>(r => { release = r; });
    getCanvas.mockImplementation(async (_o: string, _t: string, _v: unknown, _k: unknown, version?: string) => { await gate; return readFor(version); });
    mount('/p/ana/canvas/canvas');
    await waitFor(() => expect(screen.getAllByText('Add to chat').length).toBeGreaterThan(0));
    tapAdd('canvas:segments');
    expect(screen.getByTestId('ws')).toHaveTextContent('none'); // nothing yet: the version is not known
    await act(async () => { release(); });
    await screen.findByTestId('workspace-chat-empty');
    await waitFor(() => expect(field().value).toContain(SEGMENTS_TOKEN));
    expect(writeRpcs()).toEqual([]);
  });
});

describe('S4.4 a bare ?ws=1 on a canvas with a draft open (it moves to the draft)', () => {
  it('a tap while it moves still lands the tag in the draft\'s composer', async () => {
    st.openDraft = draftBlock({ baseSeq: 1 });
    st.draftRow = draftRow();
    mount('/p/ana/canvas/canvas?ws=1');
    await grid();
    await waitFor(() => expect(screen.getAllByText('Add to chat').length).toBe(9));
    tapAdd('canvas:problem');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`v=${DRAFT_NAME}`));
    await screen.findByTestId('thread-panel');
    await waitFor(() => expect(field().value).toContain(tagToken('canvas:problem')));
  });
});

describe('S4.5 J4: another base is open', () => {
  const otherBase = () => { st.hasV2 = true; st.openDraft = draftBlock({ baseSeq: 1 }); st.draftRow = draftRow(); };

  it('with a message in that draft the sheet asks, and nothing lands until it is answered', async () => {
    otherBase();
    mount('/p/ana/canvas/canvas?v=canvas_d222222');
    await grid();
    await waitFor(() => expect(screen.getAllByText('Add to chat')).toHaveLength(9));
    tapAdd('canvas:segments');
    expect(await screen.findByTestId('clone-draft-sheet')).toBeInTheDocument();
    expect(writeRpcs()).toEqual([]);
    expect(screen.queryByTestId('composer')).toBeNull(); // the thread of a published view with a draft behind it is not mounted
  });

  it('v1 shown inside the workspace while the draft\'s thread is mounted: the sheet is up, and the draft\'s composer stays empty until it is answered', async () => {
    st.hasV2 = true;
    st.openDraft = draftBlock({ baseSeq: 2 }); // a draft from v2; the owner is reading v1 (with the draft's thread still beside it)
    st.draftRow = draftRow();
    mount('/p/ana/canvas/canvas?v=canvas_d111111&ws=1');
    await grid();
    await screen.findByTestId('thread-panel');
    await waitFor(() => expect(screen.getAllByText('Add to chat')).toHaveLength(9));
    tapAdd('canvas:segments');
    expect(await screen.findByTestId('clone-draft-sheet')).toBeInTheDocument();
    expect(field().value).toBe(''); // the tag is held: this draft is not where "Start over" would send it
    fireEvent.click(within(screen.getByTestId('clone-draft-sheet')).getByRole('button', { name: 'Add to my draft' }));
    await waitFor(() => expect(field().value).toContain(SEGMENTS_TOKEN));
  });

  it('"Add to my draft": the tag lands in THAT draft\'s composer', async () => {
    otherBase();
    mount('/p/ana/canvas/canvas?v=canvas_d222222');
    await grid();
    await waitFor(() => expect(screen.getAllByText('Add to chat')).toHaveLength(9));
    tapAdd('canvas:segments');
    fireEvent.click(within(await screen.findByTestId('clone-draft-sheet')).getByRole('button', { name: 'Add to my draft' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`v=${DRAFT_NAME}`));
    await waitFor(() => expect(field().value).toContain(SEGMENTS_TOKEN));
    expect(writeRpcs()).toEqual([]);
  });

  it('"Start over": the tag lands in the pending Clone\'s composer, and the first Send discards that draft and carries the tag', async () => {
    otherBase();
    rpc.mockImplementation(async (name: string) => (name === 'canvas_workspace_send' ? { data: sentRow, error: null } : { data: null, error: null }));
    mount('/p/ana/canvas/canvas?v=canvas_d222222');
    await grid();
    await waitFor(() => expect(screen.getAllByText('Add to chat')).toHaveLength(9));
    tapAdd('canvas:segments');
    fireEvent.click(within(await screen.findByTestId('clone-draft-sheet')).getByRole('button', { name: 'Start over from v2' }));
    await screen.findByTestId('workspace-chat-empty');
    await waitFor(() => expect(field().value).toContain(SEGMENTS_TOKEN));
    typeInto(`${SEGMENTS_TOKEN} Not HR leads`);
    fireEvent.click(await screen.findByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(sends()).toHaveLength(1));
    const a = sends()[0]![1] as Record<string, unknown>;
    expect(a.p_replace).toBe(true);
    expect(a.p_box_refs).toEqual(['canvas:segments']);
  });

  it('dismissing the sheet drops the tag: a later Clone starts with an empty composer', async () => {
    otherBase();
    mount('/p/ana/canvas/canvas?v=canvas_d222222');
    await grid();
    await waitFor(() => expect(screen.getAllByText('Add to chat')).toHaveLength(9));
    tapAdd('canvas:segments');
    fireEvent.keyDown(await screen.findByTestId('clone-draft-sheet'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('clone-draft-sheet')).toBeNull());
    fireEvent.click(screen.getByTestId('canvas-clone'));
    fireEvent.click(within(await screen.findByTestId('clone-draft-sheet')).getByRole('button', { name: 'Start over from v2' }));
    await screen.findByTestId('workspace-chat-empty');
    expect(field().value).toBe('');
  });
});

describe('W1 / J2: the thread comes into view from a tap', () => {
  it('at 375 a tap flips the switcher to Thread and the composer has the tag and focus', async () => {
    stubWidth(false);
    openDraftState();
    mount(DRAFT_AT);
    await draftReady();
    expect(screen.getByTestId('workspace-view-canvas')).toHaveAttribute('aria-selected', 'true');
    tapAdd('canvas:revenue');
    expect(screen.getByTestId('workspace-view-chat')).toHaveAttribute('aria-selected', 'true');
    expect(field().value).toContain(REVENUE_TOKEN);
    expect(document.activeElement).toBe(field());
  });

  it('at 1440 with the panel closed a tap opens it', async () => {
    openDraftState();
    mount(DRAFT_AT);
    await draftReady();
    fireEvent.click(screen.getByLabelText('Close thread'));
    expect(screen.getByTestId('workspace-chat-pane')).toHaveAttribute('inert');
    tapAdd('canvas:revenue');
    expect(screen.getByTestId('workspace-chat-pane')).not.toHaveAttribute('inert');
    expect(field().value).toContain(REVENUE_TOKEN);
    expect(document.activeElement).toBe(field());
  });
});

describe('J2 step 4: reply chips', () => {
  const reply = () => msg({ id: 'agent-1', authorId: null, kind: 'agent', body: 'Updated: Offers & Pricing, My next milestone.' });
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    openDraftState();
    st.messages = [msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-draft' }), reply()];
  });

  it('the agent\'s "Updated:" reply draws one 40px chip per box, and its words stay', async () => {
    mount(DRAFT_AT);
    await draftReady();
    const chips = screen.getAllByTestId('reply-box-chip');
    expect(chips.map(c => c.textContent)).toEqual(['Offers & Pricing', 'My next milestone']);
    expect(chips[0]!.className).toContain('min-h-10');
    expect(chips[0]!.className).toContain(CANVAS_CHIP); // the one chip look: the same as the "Changed" marker on a box
    expect(document.querySelector('[data-msg="agent-1"]')?.textContent).toContain('Updated:');
  });

  it('a person\'s message that looks like a reply (the owner\'s own, or another participant\'s) is not chips: only a message of kind agent is', async () => {
    st.messages = [
      msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-draft' }),
      msg({ id: 'mine', authorId: ME, body: 'Updated: Problem.' }),
      msg({ id: 'other', authorId: 'someone-else', body: 'Updated: Solution.' }),
    ];
    mount(DRAFT_AT);
    await draftReady();
    expect(screen.queryByTestId('reply-box-chip')).toBeNull();
  });

  it('at 1440 a chip scrolls its box to the middle and rings it; the panel stays', async () => {
    mount(DRAFT_AT);
    await draftReady();
    fireEvent.click(screen.getAllByTestId('reply-box-chip')[0]!);
    const box = screen.getByTestId('canvas-box-canvas:revenue');
    expect(box).toHaveAttribute('data-highlight', 'true');
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }));
    expect(screen.getByTestId('workspace-chat-pane')).not.toHaveAttribute('inert');
  });

  it('at 375 a chip switches to Canvas first, then rings the box', async () => {
    stubWidth(false);
    mount(DRAFT_AT);
    await draftReady();
    fireEvent.mouseDown(screen.getByTestId('workspace-view-chat'), { button: 0, ctrlKey: false });
    expect(screen.getByTestId('workspace-view-chat')).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getAllByTestId('reply-box-chip')[1]!);
    expect(screen.getByTestId('workspace-view-canvas')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('canvas-box-canvas:metrics')).toHaveAttribute('data-highlight', 'true');
  });
});
