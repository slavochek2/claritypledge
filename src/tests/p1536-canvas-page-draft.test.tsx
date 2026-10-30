/**
 * @file p1536-canvas-page-draft.test.tsx
 * @description P1536 WP4, at page level: a canvas with draft versions.
 *  - labels: the switcher, the byline and the tab title say "v{seq} · {date}" or "v{next} · Draft", never the internal name
 *  - the draft's Publish (in the header, where Share sits on a published version) and the boxes' questions are the OWNER's, on the draft version only
 *  - a draft has no Share, no Compare and no positions (spread rows, position buttons); a published version keeps all three
 *  - Publish calls canvas_draft_publish, then the page reads the published version (no `?v` of the draft)
 *  - nothing published: readers read "<Name> hasn't published this canvas yet." (not a 404); the owner reads "Nothing published yet" and has no share control and no "Publish first" text
 *  - "New version" starts a canvas thread from the version on screen
 * Each "only" has a control showing the same thing present where it should be.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { PointWithUserPosition } from '@/app/types';
import type { ChatContextValue } from '@/app/pages/chat/chat-state';

const auth = vi.hoisted(() => ({ viewerId: 'owner-1' as string | null }));
const getCanvas = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());
const seoTitle = vi.hoisted(() => ({ value: '' }));
const startThread = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({ supabase: { rpc, functions: { invoke }, from: vi.fn() } }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/auth', () => ({
  useAuth: () => (auth.viewerId
    ? { session: { user: { id: auth.viewerId } }, user: { id: auth.viewerId }, sessionChecked: true }
    : { session: null, user: null, sessionChecked: true }),
}));
vi.mock('@/app/data/api', () => ({
  getProfileBySlugResult: vi.fn(async () => ({ success: true, data: { id: 'owner-1', name: 'Ana', avatarUrl: null, avatarColor: '#3b82f6', hasPledged: false } })),
}));
vi.mock('@/app/data/canvas-service', () => ({ canvasService: { getCanvas, getAudience: vi.fn(async () => []), markCanvasRead: vi.fn(async () => undefined) } }));
vi.mock('@/app/data/calibration-service', () => ({ calibrationService: { getEarsCount: vi.fn(async () => 0) } }));
vi.mock('@/app/contexts/agent-accounts-context', () => ({ useAgentAccountIds: () => ({ isAgentAccountId: () => false, isLoading: false }) }));
vi.mock('@/app/components/seo', () => ({ SEO: ({ title }: { title: string }) => { seoTitle.value = title; return null; } }));
vi.mock('@/app/pages/not-found-page', () => ({ NotFoundPage: () => <div data-testid="canvas-not-found">not found</div> }));
vi.mock('@/app/components/feed/feed-point-card', () => ({
  FeedPointCard: ({ canvas, spread }: { canvas?: { noPositions?: boolean }; spread?: React.ReactNode }) => (
    <div data-testid="point-card" data-no-positions={String(!!canvas?.noPositions)}>{spread}</div>
  ),
}));
vi.mock('@/app/components/social/point-positions-block', () => ({ PointPositionsBlock: () => <div data-testid="positions-block" /> }));
vi.mock('@/app/components/letters/letter-position-story-dialog', () => ({ LetterPositionStoryDialog: () => null }));
vi.mock('@/app/components/canvas/canvas-add-story-dialog', () => ({ CanvasAddStoryDialog: () => null }));
vi.mock('@/app/components/canvas/canvas-share-control', () => ({ CanvasShareControl: () => <div data-testid="share-control" /> }));
vi.mock('@/app/pages/chat/canvas-start', async () => ({ ...(await vi.importActual<object>('@/app/pages/chat/canvas-start')), startCanvasThread: startThread }));

import { CanvasPage } from '@/app/pages/canvas-page';
import { ChatContext } from '@/app/pages/chat/chat-state';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { clearLinkTokens } from '@/lib/canvas-link-token';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { GateFixture } from '@/app/tree/_gate/canvas-draft/GateFixture';

const DRAFT_NAME = 'canvas_dabc123';
const V1_NAME = 'canvas_d111111';
const point = (box: string) => ({
  id: `p-${box}`, statement: `Bet for ${box}`, tags: [], systemTags: [box], visibility: 'private', userPosition: null,
  totalPositions: 0, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  positionCounts: { agree: 0, strongly_agree: 0, somewhat_agree: 0, unsure: 0, disagree: 0, strongly_disagree: 0, somewhat_disagree: 0 },
}) as unknown as PointWithUserPosition;

const v1 = { name: V1_NAME, createdAt: '2026-10-01T10:00:00Z', seq: 1, publishedAt: '2026-10-01T10:00:00Z', draft: false };
const draftVersion = { name: DRAFT_NAME, createdAt: '2026-10-20T10:00:00Z', seq: null, publishedAt: null, draft: true };
const draftBlock = {
  id: 'draft-1', version: DRAFT_NAME, questions: { 'canvas:love': 'What do you keep doing even when it costs you?' },
  threadRootId: 'root-1', conversationId: 'conv-1', baseSeq: 1, runCount: 1, revision: 0,
};

/** What `get_canvas` answers, mapped (see canvas-service). */
const view = (over: Record<string, unknown> = {}) => ({
  points: [point('canvas:problem')], stories: new Map(), addedStoryIds: [], positions: new Map(),
  visibility: 'private' as const, isOwner: true, admitted: true, generalAccess: 'restricted' as const, via: null, canvasExists: true,
  version: V1_NAME, versions: [v1], publishedNone: false, draft: null, ...over,
});
const draftView = (over: Record<string, unknown> = {}) => view({ version: DRAFT_NAME, versions: [draftVersion], publishedNone: true, draft: draftBlock, ...over });
const readerNothing = view({ isOwner: false, canvasExists: false, points: [], version: null, versions: [], publishedNone: true, via: { kind: 'event', id: 'e1', name: 'Mastermind', slug: 'mastermind' } });

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname}{l.search}</output>;
}
const chatValue = { refresh: vi.fn(async () => []) } as unknown as ChatContextValue;
function page(at = '/p/ana/canvas/canvas') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <ChatContext.Provider value={chatValue}>
        <Where />
        <Routes><Route path="/p/:handle/canvas/:projectTag" element={<CanvasPage />} /></Routes>
      </ChatContext.Provider>
    </MemoryRouter>,
  );
}
/** What a person reads: the header and the boxes (not the test's own address readout: the address is a key, not a label). */
const shownText = () => (screen.getByTestId('canvas-header-row').textContent ?? '') + (screen.queryByTestId('canvas-grid')?.textContent ?? '');
const ready = async () => {
  const el = await screen.findByTestId('canvas-header-row');
  await waitFor(() => expect(screen.queryByTestId('canvas-grid') ?? screen.queryByTestId('canvas-nothing-published')).not.toBeNull());
  return el;
};

beforeEach(() => {
  clearLinkTokens();
  clearListReturnCache();
  resetCanvasAvailability();
  auth.viewerId = 'owner-1';
  seoTitle.value = '';
  getCanvas.mockReset();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
  invoke.mockReset();
  invoke.mockResolvedValue({ data: { enabled: true }, error: null });
  startThread.mockReset();
  startThread.mockResolvedValue({ status: 'opened', draftId: 'd2', conversationId: 'conv-1', threadRootId: 'root-2', canvasName: 'canvas', fromSeq: 1, path: '/chats/c/conv-1/t/root-2' });
});
afterEach(() => cleanup());

describe('labels: a version is a number and a date, or "v{next} · Draft", never an internal name', () => {
  it('the switcher lists "v2 · Draft" and "v1 · date"; the byline label and the tab title agree', async () => {
    getCanvas.mockResolvedValue(draftView({ versions: [draftVersion, v1], publishedNone: false }));
    page(`/p/ana/canvas/canvas?v=${DRAFT_NAME}`);
    await ready();
    const select = within(screen.getByTestId('canvas-version-picker')).getByRole('combobox', { name: 'Version' });
    const labels = within(select).getAllByRole('option').map(o => o.textContent);
    expect(labels[0]).toBe('v2 · Draft'); // one above the newest published version
    expect(labels[1]).toMatch(/^v1 · Oct 1, 2026$/);
    expect(seoTitle.value).toBe('Ana · #canvas · v2 · Draft — Clarity Pledge');
    expect(shownText()).not.toContain(DRAFT_NAME);
    expect(shownText()).not.toContain(V1_NAME);
  });

  it('a one-version canvas shows the canvas name as its title and no version label (founder copy, 2026-10-27); the tab title still says which version', async () => {
    getCanvas.mockResolvedValue(view());
    page();
    await ready();
    expect(screen.getByTestId('canvas-eyebrow')).toHaveTextContent('Clarity Canvas');
    expect(screen.getByTestId('canvas-title')).toHaveTextContent(/^Canvas$/);
    expect(screen.queryByTestId('canvas-version-label')).toBeNull(); // no lone "v1 · date" beside the title
    expect(screen.queryByTestId('canvas-project-slot')).toBeNull();
    expect(seoTitle.value).toBe('Ana · #canvas · v1 · Oct 1, 2026 — Clarity Pledge');
    expect(shownText()).not.toContain(V1_NAME);
  });

  it('a lone draft is badged "v1 · Draft" (a first canvas) beside the canvas name', async () => {
    getCanvas.mockResolvedValue(draftView());
    page();
    await ready();
    expect(screen.getByTestId('canvas-version-label')).toHaveTextContent(/^v1 · Draft$/);
    expect(shownText()).not.toContain(DRAFT_NAME);
  });
});

describe('Publish and the questions are the owner\'s, on the draft only', () => {
  it('the owner on the draft sees one Publish in the header (no banner, no "Only you can see this"), no way-back link, and the question (no label) inside the empty box', async () => {
    getCanvas.mockResolvedValue(draftView());
    page();
    await ready();
    expect(screen.queryByTestId('canvas-draft-banner')).toBeNull();
    expect(screen.getByTestId('canvas-header-row')).not.toHaveTextContent('Only you can see this');
    expect(screen.queryByTestId('canvas-draft-empty')).toBeNull(); // there are points
    expect(screen.queryByTestId('canvas-draft-thread-link')).toBeNull(); // founder copy: no "Back to the thread" on the page
    const actions = screen.getByTestId('canvas-actions');
    expect(within(actions).getAllByRole('button')).toHaveLength(1); // one primary: Publish, where Share sits on a published version
    expect(within(actions).getByTestId('canvas-draft-publish')).toHaveTextContent('Publish');
    const box = screen.getByTestId('canvas-box-canvas:love');
    expect(within(box).getByTestId('canvas-box-question')).toHaveTextContent(/^What do you keep doing even when it costs you\?$/); // the question alone, no "Question for you" label
    // an empty box with no question is a plain empty box
    expect(within(screen.getByTestId('canvas-box-canvas:metrics')).queryByTestId('canvas-box-question')).toBeNull();
    expect(screen.queryByTestId('canvas-new-version')).toBeNull(); // not while looking at a draft
  });

  it('CONTROLS: a reader gets no Publish and no question, even from an answer that carried the draft block', async () => {
    auth.viewerId = 'reader-1';
    getCanvas.mockResolvedValue(view({ isOwner: false, draft: draftBlock, via: { kind: 'event', id: 'e1', name: 'Mastermind', slug: 'mastermind' } }));
    page();
    await ready();
    expect(screen.queryByTestId('canvas-draft-publish')).toBeNull();
    expect(screen.queryByTestId('canvas-box-question')).toBeNull();
    expect(within(screen.getByTestId('canvas-box-canvas:love')).getByText('Empty')).toBeInTheDocument();
  });

  it('CONTROLS: the owner on a PUBLISHED version (a draft is open elsewhere) gets neither', async () => {
    getCanvas.mockResolvedValue(view({ draft: draftBlock }));
    page();
    await ready();
    expect(screen.queryByTestId('canvas-draft-publish')).toBeNull();
    expect(screen.queryByTestId('canvas-box-question')).toBeNull();
  });

  it('a draft with nothing drafted says so and has no Publish (no dead control), and no way-back link either', async () => {
    getCanvas.mockResolvedValue(draftView({ points: [], draft: { ...draftBlock, runCount: 0, questions: {} } }));
    page();
    await ready();
    expect(screen.getByTestId('canvas-draft-empty')).toHaveTextContent('Nothing is drafted yet.');
    expect(screen.queryByTestId('canvas-draft-thread-link')).toBeNull();
    expect(within(screen.getByTestId('canvas-actions')).queryByRole('button')).toBeNull(); // no Publish (the thread link is a link)
    expect(screen.queryByTestId('canvas-draft-publish')).toBeNull();
  });
});

describe('a draft has no Share, no Compare and no positions; a published version keeps them', () => {
  const withPositions = (over: Record<string, unknown> = {}) => ({
    positions: new Map([['p-canvas:problem', [{ id: 'pos-1', pointId: 'p-canvas:problem', userId: 'reader-9', position: 'agree', userName: 'Bo', userSlug: 'bo', earCount: 0, userHasPledged: false }]]]),
    ...over,
  });

  it('on a draft that has published versions: no Share (not even for the owner), no Compare, no spread row on the cards', async () => {
    getCanvas.mockResolvedValue(draftView(withPositions({ versions: [draftVersion, v1], publishedNone: false })));
    page(`/p/ana/canvas/canvas?v=${DRAFT_NAME}`);
    await ready();
    expect(screen.queryByTestId('share-control')).toBeNull();
    expect(screen.queryByTestId('canvas-compare-picker')).toBeNull();
    expect(screen.getByTestId('canvas-point-card-p-canvas:problem')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-card-spread-row')).toBeNull();
    expect(screen.getByTestId('canvas-draft-publish')).toBeInTheDocument();
  });

  it('a draft ignores ?with=: the cards carry no compare columns', async () => {
    getCanvas.mockResolvedValue(draftView(withPositions({ versions: [draftVersion, v1], publishedNone: false })));
    page(`/p/ana/canvas/canvas?v=${DRAFT_NAME}&with=reader-9`);
    await ready();
    expect(screen.queryByTestId('canvas-card-compare')).toBeNull();
  });

  it('the open point of a draft has no spread row, no positions block and no position buttons (the card is told so)', async () => {
    getCanvas.mockResolvedValue(draftView(withPositions()));
    page(`/p/ana/canvas/canvas?v=${DRAFT_NAME}&point=p-canvas:problem`);
    const card = await screen.findByTestId('point-card');
    expect(card).toHaveAttribute('data-no-positions', 'true');
    expect(within(card).queryByTestId('canvas-card-spread-row')).toBeNull();
    expect(card.children).toHaveLength(0); // the spread slot is empty
    expect(screen.queryByTestId('positions-block')).toBeNull();
  });

  it('CONTROL: the same canvas published keeps Share, Compare, the card spread row, the panel\'s spread and positions block', async () => {
    getCanvas.mockResolvedValue(view(withPositions()));
    page(`/p/ana/canvas/canvas?point=p-canvas:problem`);
    const card = await screen.findByTestId('point-card');
    expect(card).toHaveAttribute('data-no-positions', 'false');
    expect(card.children.length).toBeGreaterThan(0); // the spread row renders in the card's slot
    expect(screen.getByTestId('positions-block')).toBeInTheDocument();
    expect(screen.getByTestId('share-control')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-compare-picker')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-card-spread-row')).toBeInTheDocument();
  });
});

describe('Publish', () => {
  it('calls canvas_draft_publish for the draft, then reads the published version (the draft\'s ?v is dropped)', async () => {
    rpc.mockImplementation(async (name: string) => (name === 'canvas_draft_publish' ? { data: { seq: 1, skipped_links: 0 }, error: null } : { data: null, error: null }));
    getCanvas.mockResolvedValue(draftView());
    page(`/p/ana/canvas/canvas?v=${DRAFT_NAME}`);
    await ready();
    expect(getCanvas.mock.calls.at(-1)![4]).toBe(DRAFT_NAME);
    getCanvas.mockResolvedValue(view());
    fireEvent.click(screen.getByTestId('canvas-draft-publish'));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('canvas_draft_publish', { p_draft: 'draft-1', p_expected_revision: 0 }));
    // the page reads again (a moment of loading: no Publish and no grid), then shows the published version (the tab title names it)
    await waitFor(() => expect(seoTitle.value).toContain('v1 · Oct')); // the published label has a date; the draft's "v1 · Draft" has none
    expect(screen.queryByTestId('canvas-draft-publish')).toBeNull();
    expect(screen.getByTestId('where')).not.toHaveTextContent('canvas_d');
    expect(getCanvas.mock.calls.at(-1)![4]).toBeUndefined(); // no version named: the newest published opens
  });

  it('Publish drops only the draft\'s ?v: the `thread` param stays, so the pane beside the canvas still shows the thread', async () => {
    rpc.mockImplementation(async (name: string) => (name === 'canvas_draft_publish' ? { data: { seq: 1, skipped_links: 0 }, error: null } : { data: null, error: null }));
    getCanvas.mockResolvedValue(draftView());
    page(`/p/ana/canvas/canvas?v=${DRAFT_NAME}&thread=root-1`);
    await ready();
    getCanvas.mockResolvedValue(view());
    fireEvent.click(screen.getByTestId('canvas-draft-publish'));
    await waitFor(() => expect(seoTitle.value).toContain('v1 · Oct'));
    expect(screen.getByTestId('where')).toHaveTextContent('thread=root-1');
    expect(screen.getByTestId('where')).not.toHaveTextContent('canvas_d');
  });

  it('a refusal is said in words and the draft stays', async () => {
    rpc.mockImplementation(async (name: string) => (name === 'canvas_draft_publish'
      ? { data: null, error: { code: '55006', message: 'a run is active' } }
      : { data: null, error: null }));
    getCanvas.mockResolvedValue(draftView());
    page();
    await ready();
    fireEvent.click(screen.getByTestId('canvas-draft-publish'));
    expect(await screen.findByTestId('canvas-draft-error')).toHaveTextContent('being written right now');
    expect(screen.getByTestId('canvas-draft-publish')).toBeInTheDocument();
  });
});

describe('nothing published', () => {
  it('a reader admitted to a canvas with nothing published reads "Nothing published yet", not a 404, and no grid', async () => {
    auth.viewerId = 'reader-1';
    getCanvas.mockResolvedValue(readerNothing);
    page();
    expect(await screen.findByTestId('canvas-nothing-published')).toHaveTextContent("Ana hasn't published this canvas yet.");
    expect(screen.queryByTestId('canvas-not-found')).toBeNull();
    expect(screen.queryByTestId('canvas-grid')).toBeNull();
    expect(screen.queryByTestId('share-control')).toBeNull();
  });

  it('CONTROL: a caller the canvas does not admit still gets not-found', async () => {
    auth.viewerId = 'stranger-1';
    getCanvas.mockResolvedValue({ ...readerNothing, admitted: false, publishedNone: false, via: null, visibility: null });
    page();
    expect(await screen.findByTestId('canvas-not-found')).toBeInTheDocument();
  });

  it('the owner whose canvas has nothing published reads "Nothing published yet": no share control, and no "Publish first" text at all (founder copy, 2026-10-27)', async () => {
    getCanvas.mockResolvedValue(view({ points: [], version: null, versions: [], publishedNone: true }));
    page();
    expect(await screen.findByTestId('canvas-nothing-published')).toHaveTextContent('Nothing published yet');
    expect(screen.queryByTestId('share-control')).toBeNull();
    expect(screen.queryByTestId('canvas-publish-first')).toBeNull();
    expect(screen.queryByText(/Publish first|then share/i)).toBeNull();
  });

  it('CONTROL: the owner with a published version gets the share control and no "Publish first"', async () => {
    getCanvas.mockResolvedValue(view());
    page();
    await ready();
    expect(screen.getByTestId('share-control')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-publish-first')).toBeNull();
  });

  it('the owner\'s open draft with nothing published: no share control and no "Publish first" text, and the draft is shown', async () => {
    getCanvas.mockResolvedValue(draftView());
    page();
    await ready();
    expect(screen.queryByTestId('canvas-publish-first')).toBeNull();
    expect(screen.queryByText(/Publish first|then share/i)).toBeNull();
    expect(screen.queryByTestId('share-control')).toBeNull();
    expect(screen.getByTestId('canvas-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-nothing-published')).toBeNull();
  });
});

describe('New version', () => {
  const versionsRow = { id: 'ver-1', canvas_id: 'cv-1', canvas_name: 'canvas', name: V1_NAME, seq: 1, published_at: '2026-10-01T10:00:00Z', has_open_draft: false };
  beforeEach(() => {
    rpc.mockImplementation(async (name: string) => (name === 'list_my_canvas_versions' ? { data: [versionsRow], error: null } : { data: null, error: null }));
  });

  it('starts a canvas thread from the version on screen, and goes there', async () => {
    getCanvas.mockResolvedValue(view());
    page();
    fireEvent.click(await screen.findByTestId('canvas-new-version'));
    await waitFor(() => expect(startThread).toHaveBeenCalledWith('ver-1'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/chats/c/conv-1/t/root-2'));
    expect(chatValue.refresh).toHaveBeenCalled(); // the chat list knows the thread before the page opens it
  });

  it('CONTROLS: not offered to a reader, not while drafting is off, not on the draft itself', async () => {
    auth.viewerId = 'reader-1';
    getCanvas.mockResolvedValue(view({ isOwner: false, via: { kind: 'event', id: 'e1', name: 'Mastermind', slug: 'mastermind' } }));
    page();
    await ready();
    expect(screen.queryByTestId('canvas-new-version')).toBeNull();
    cleanup();
    auth.viewerId = 'owner-1';
    resetCanvasAvailability();
    invoke.mockResolvedValue({ data: { enabled: false }, error: null });
    getCanvas.mockResolvedValue(view());
    page();
    await ready();
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(screen.queryByTestId('canvas-new-version')).toBeNull();
    expect(startThread).not.toHaveBeenCalled();
  });
});

describe('P955 gate fixture /tree/_gate/canvas-draft', () => {
  const at = (phase: string) => render(<MemoryRouter initialEntries={[`/tree/_gate/canvas-draft?phase=${phase}`]}><GateFixture /></MemoryRouter>);
  const primaries = () => Array.from(document.querySelectorAll('button')).filter(b => b.className.includes('bg-blue-600'));

  it.each([
    ['draft', 'canvas-draft-publish', 1],
    ['draft-empty', 'canvas-draft-empty', 0],
    ['nothing-published-reader', 'canvas-nothing-published', 0],
    ['nothing-published-owner', 'canvas-nothing-published', 0],
    ['published-owner', 'canvas-grid', 0],
    ['published-reader', 'canvas-grid', 0],
  ])('%s renders its state with %i primary action(s), none disabled', (phase, testId, primary) => {
    at(phase);
    expect(screen.getByTestId(testId)).toBeInTheDocument();
    expect(primaries()).toHaveLength(primary);
    expect(Array.from(document.querySelectorAll('button')).filter(b => b.disabled)).toHaveLength(0);
    cleanup();
  });
});


describe('review B10: visual QA fixes', () => {
  it('D7: the reader who was shared the canvas by a person reads the name once, not "Shared with you by" and then the name again', async () => {
    auth.viewerId = 'reader-1';
    getCanvas.mockResolvedValue({ ...readerNothing, via: { kind: 'person', id: 'owner-1', name: 'Ana', slug: 'ana' } });
    page();
    expect(await screen.findByTestId('canvas-nothing-published')).toHaveTextContent("Ana hasn't published this canvas yet.");
    expect(screen.queryByTestId('canvas-shared-with-you')).toBeNull();
    expect(screen.queryByText(/Shared with you by/)).toBeNull();
  });

  it('D7 CONTROL: a reader of a published canvas still reads who shared it, and the owner of an unpublished one still reads "Nothing published yet"', async () => {
    auth.viewerId = 'reader-1';
    getCanvas.mockResolvedValue(view({ isOwner: false, via: { kind: 'person', id: 'owner-1', name: 'Ana', slug: 'ana' } }));
    page();
    await ready();
    expect(screen.getByTestId('canvas-shared-with-you')).toHaveTextContent('Shared with you by');
    cleanup();
    auth.viewerId = 'owner-1';
    getCanvas.mockResolvedValue(view({ points: [], version: null, versions: [], publishedNone: true }));
    page();
    expect(await screen.findByTestId('canvas-nothing-published')).toHaveTextContent('Nothing published yet');
  });

  it('D3: nothing published, the owner has no "Publish first, then share" pill that reads as a disabled button: no such text, no disabled control', async () => {
    getCanvas.mockResolvedValue(view({ points: [], version: null, versions: [], publishedNone: true }));
    page();
    await screen.findByTestId('canvas-nothing-published');
    expect(screen.queryByTestId('canvas-publish-first')).toBeNull();
    expect(screen.queryByText(/Publish first|then share/i)).toBeNull();
    expect(Array.from(document.querySelectorAll('button')).filter(b => b.disabled)).toHaveLength(0);
  });

  it('D4: the draft page has no "Back to the thread" banner link (founder copy); its Publish stays a tap target of at least 44px', async () => {
    getCanvas.mockResolvedValue(draftView());
    page(`/p/ana/canvas/canvas?v=${DRAFT_NAME}`);
    await ready();
    const actions = screen.getByTestId('canvas-actions');
    expect(screen.queryByTestId('canvas-draft-thread-link')).toBeNull();
    expect(screen.getByTestId('canvas-header-row')).not.toHaveTextContent(/Back to the thread/);
    expect(within(actions).getByTestId('canvas-draft-publish').className).toContain('min-h-11');
  });

  it('with the thread not beside the page, the draft page links to the thread: "Revise in chat" (an outline) next to Publish; a published version has no such link', async () => {
    getCanvas.mockResolvedValue(draftView());
    page(`/p/ana/canvas/canvas?v=${DRAFT_NAME}`);
    await ready();
    const actions = screen.getByTestId('canvas-actions');
    const link = within(actions).getByRole('link', { name: 'Revise in chat' });
    expect(link).toHaveAttribute('href', '/chats/c/conv-1/t/root-1'); // the draft's conversation and thread
    expect(link.className).toContain('border-blue-600');
    expect(link.className).not.toContain('bg-blue-600'); // an outline: Publish is the one filled primary
    expect(Array.from(actions.children).map(c => c.getAttribute('data-testid'))).toEqual(['canvas-draft-revise', 'canvas-draft-publish']);
    cleanup();
    getCanvas.mockResolvedValue(view({ draft: draftBlock }));
    page();
    await ready();
    expect(screen.queryByTestId('canvas-draft-revise')).toBeNull();
  });

  it('a draft with nothing drafted still links to its thread (that is where it gets made), without a Publish', async () => {
    getCanvas.mockResolvedValue(draftView({ points: [], draft: { ...draftBlock, runCount: 0, questions: {} } }));
    page();
    await ready();
    expect(screen.getByRole('link', { name: 'Revise in chat' })).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-draft-publish')).toBeNull();
  });

  it('V11: Publish is the one filled primary in the header row (blue, like Share\'s place), and nothing blue-tinted frames it', async () => {
    getCanvas.mockResolvedValue(draftView());
    page(`/p/ana/canvas/canvas?v=${DRAFT_NAME}`);
    await ready();
    const publish = screen.getByTestId('canvas-draft-publish');
    expect(publish.className).toContain('bg-blue-600');
    expect(Array.from(screen.getByTestId('canvas-header-row').querySelectorAll('button')).filter(b => b.className.includes('bg-blue-600'))).toEqual([publish]);
  });

  it('V10: at phone width the owner name wraps or takes the free width instead of truncating to "by Test ...", and a lone "Draft" label keeps its own width', async () => {
    getCanvas.mockResolvedValue(draftView());
    page(`/p/ana/canvas/canvas?v=${DRAFT_NAME}`);
    await ready();
    const name = screen.getByTestId('canvas-owner-name').parentElement as HTMLElement;
    expect(name.className.split(/\s+/)).not.toContain('truncate'); // only from sm up: `sm:truncate`
    expect(name.className).toContain('max-sm:break-words');
    const slot = screen.getByTestId('canvas-project-slot').className.split(/\s+/);
    expect(slot).toContain('max-sm:flex-none'); // not an equal share of the row with the name
    expect(slot).not.toContain('max-sm:flex-1');
  });

  it('D2: the gate fixture shows the "New version" pill on the owner\'s published canvas, and not on the reader\'s', async () => {
    render(<MemoryRouter initialEntries={['/tree/_gate/canvas-draft?phase=published-owner']}><GateFixture /></MemoryRouter>);
    expect(await screen.findByTestId('canvas-new-version')).toHaveTextContent('New version');
    cleanup();
    render(<MemoryRouter initialEntries={['/tree/_gate/canvas-draft?phase=published-reader']}><GateFixture /></MemoryRouter>);
    await screen.findByTestId('canvas-header-row');
    expect(screen.queryByTestId('canvas-new-version')).toBeNull();
  });
});
