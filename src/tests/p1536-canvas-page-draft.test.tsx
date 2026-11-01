/**
 * @file p1536-canvas-page-draft.test.tsx
 * @description P1536 WP4, at page level: a canvas with draft versions.
 *  - labels: the switcher, the byline and the tab title say "v{seq} · {date}" or "v{next} · Draft", never the internal name
 *  - the boxes' questions are the OWNER's, on the draft version only; the page carries no Publish (S3: its one spot is the workspace bar, p1536-canvas-workspace.test.tsx)
 *  - a draft has no Share, no Compare and no positions (spread rows, position buttons); a published version keeps all three
 *  - nothing published: readers read "<Name> hasn't published this canvas yet." (not a 404); the owner reads "Nothing published yet" and has no share control and no "Publish first" text
 *  - (Clone, W3, replaced "New version": its tests are p1536-w3-clone.test.tsx)
 * Each "only" has a control showing the same thing present where it should be.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';
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
  FeedPointCard: ({ canvas, spread }: { canvas?: { noPositions?: boolean; reader?: boolean; readOnly?: boolean }; spread?: React.ReactNode }) => (
    <div data-testid="point-card" data-no-positions={String(!!canvas?.noPositions)} data-reader={String(!!canvas?.reader)} data-read-only={String(!!canvas?.readOnly)}>{spread}</div>
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
const chatValue = { refresh: vi.fn(async () => []), userId: 'owner-1', authors: { 'owner-1': { id: 'owner-1', slug: 'ana' } } } as unknown as ChatContextValue;
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
  startThread.mockResolvedValue({ status: 'opened', draftId: 'd2', conversationId: 'conv-1', threadRootId: 'root-2', canvasName: 'canvas', versionName: 'canvas_dnew', fromSeq: 1 });
});
afterEach(() => cleanup());

describe('labels: a version is a number and a date, or "v{next} · Draft", never an internal name', () => {
  it('the switcher lists "v2" (W8: the state is named once, by the state tag) and "v1 · date"; the tab title still says "v2 · Draft"', async () => {
    getCanvas.mockResolvedValue(draftView({ versions: [draftVersion, v1], publishedNone: false }));
    page(`/p/ana/canvas/canvas?v=${DRAFT_NAME}`);
    await ready();
    const select = within(screen.getByTestId('canvas-version-picker')).getByRole('combobox', { name: 'Version' });
    const labels = within(select).getAllByRole('option').map(o => o.textContent);
    expect(labels[0]).toBe('v2'); // one above the newest published version; "Draft" is the state tag's word, not the picker's
    expect(labels[1]).toMatch(/^v1 · Oct 1, 2026$/);
    expect(seoTitle.value).toBe('Ana · #canvas · v2 · Draft — Clarity Pledge');
    expect(shownText()).not.toContain(DRAFT_NAME);
    expect(shownText()).not.toContain(V1_NAME);
  });

  it('a one-version canvas shows the canvas name as its title and no version label (founder copy, 2026-10-27); the tab title still says which version', async () => {
    getCanvas.mockResolvedValue(view());
    page();
    await ready();
    expect(screen.queryByTestId('canvas-eyebrow')).toBeNull(); // W8: no "Clarity Canvas" label
    expect(screen.getByTestId('canvas-title')).toHaveTextContent(/^Canvas$/);
    expect(screen.queryByTestId('canvas-version-label')).toBeNull(); // no lone "v1 · date" beside the title
    expect(screen.queryByTestId('canvas-project-slot')).toBeNull();
    expect(seoTitle.value).toBe('Ana · #canvas · v1 · Oct 1, 2026 — Clarity Pledge');
    expect(shownText()).not.toContain(V1_NAME);
  });

  it('a lone draft is badged "v1" with the state tag "Draft" beside it (a first canvas, W4)', async () => {
    // a first canvas has no base version (review fix 11b: a draft made from a published version reads "Draft · from vN")
    getCanvas.mockResolvedValue(draftView({ draft: { ...draftBlock, baseSeq: null } }));
    page();
    await ready();
    expect(screen.getByTestId('canvas-version-label')).toHaveTextContent(/^v1$/); // W4: the state is its own tag, so the version label carries only the number
    expect(screen.getByTestId('canvas-state')).toHaveTextContent(/^Draft$/);
    expect(shownText()).not.toContain(DRAFT_NAME);
  });
});

describe('Publish and the questions are the owner\'s, on the draft only', () => {
  it('the owner on the draft sees no Publish in the page header (it lives in the workspace bar), no banner, no way-back link, and the question (no label) inside the empty box', async () => {
    getCanvas.mockResolvedValue(draftView());
    page();
    await ready();
    expect(screen.queryByTestId('canvas-draft-banner')).toBeNull();
    expect(screen.getByTestId('canvas-header-row')).not.toHaveTextContent('Only you can see this');
    expect(screen.queryByTestId('canvas-draft-empty')).toBeNull(); // there are points
    expect(screen.queryByTestId('canvas-draft-thread-link')).toBeNull(); // founder copy: no "Back to the thread" on the page
    // S3 / D3: Publish has ONE spot, the workspace bar. The page's header has no actions row on a draft.
    expect(screen.queryByTestId('canvas-actions')).toBeNull();
    expect(screen.queryByTestId('canvas-draft-publish')).toBeNull();
    expect(screen.queryByTestId('canvas-draft-revise')).toBeNull(); // D4: "Revise in chat" is gone with the pane gate
    const box = screen.getByTestId('canvas-box-canvas:love');
    expect(within(box).getByTestId('canvas-box-question')).toHaveTextContent(/^What do you keep doing even when it costs you\?$/); // the question alone, no "Question for you" label
    // an empty box with no question is a plain empty box
    expect(within(screen.getByTestId('canvas-box-canvas:metrics')).queryByTestId('canvas-box-question')).toBeNull();
    expect(screen.queryByTestId('canvas-clone')).toBeNull(); // not while looking at a draft (W3)
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
    expect(screen.queryByTestId('canvas-actions')).toBeNull();
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
    expect(screen.queryByTestId('canvas-draft-publish')).toBeNull(); // Publish is in the workspace bar, not the page
  });

  it('a draft ignores ?with=: the cards carry no compare columns', async () => {
    getCanvas.mockResolvedValue(draftView(withPositions({ versions: [draftVersion, v1], publishedNone: false })));
    page(`/p/ana/canvas/canvas?v=${DRAFT_NAME}&with=reader-9`);
    await ready();
    expect(screen.queryByTestId('canvas-card-compare')).toBeNull();
  });

  it('D20: the open point of the owner\'s draft has no spread row and no positions block, but the OWNER\'s stance control (the card is told positions are on)', async () => {
    getCanvas.mockResolvedValue(draftView(withPositions()));
    page(`/p/ana/canvas/canvas?v=${DRAFT_NAME}&point=p-canvas:problem`);
    const card = await screen.findByTestId('point-card');
    expect(card).toHaveAttribute('data-no-positions', 'false'); // was 'true' before D20: the owner marks their own stance before Publish
    expect(card).toHaveAttribute('data-reader', 'false'); // the owner's, never a reader's
    expect(card).toHaveAttribute('data-read-only', 'false');
    expect(within(card).queryByTestId('canvas-card-spread-row')).toBeNull();
    expect(card.children).toHaveLength(0); // the spread slot is empty
    expect(screen.queryByTestId('positions-block')).toBeNull();
  });

  it('D20 CONTROL: a signed-out visitor never gets the stance control (the card is told no positions)', async () => {
    auth.viewerId = null;
    getCanvas.mockResolvedValue(view({ isOwner: false, generalAccess: 'link', via: null }));
    page(`/p/ana/canvas/canvas?point=p-canvas:problem`);
    expect(await screen.findByTestId('point-card')).toHaveAttribute('data-no-positions', 'true');
  });

  it('D20 CONTROL: a reader of a published canvas gets a READER\'s card (the owner\'s stance control is the owner\'s only)', async () => {
    auth.viewerId = 'reader-1';
    getCanvas.mockResolvedValue(view({ isOwner: false, via: { kind: 'event', id: 'e1', name: 'Mastermind', slug: 'mastermind' } }));
    page(`/p/ana/canvas/canvas?point=p-canvas:problem`);
    const card = await screen.findByTestId('point-card');
    expect(card).toHaveAttribute('data-reader', 'true');
    expect(card).toHaveAttribute('data-no-positions', 'false'); // readers take positions on a PUBLISHED canvas, as before
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

describe('P955 gate fixture /tree/_gate/canvas-draft', () => {
  const at = (phase: string) => render(<MemoryRouter initialEntries={[`/tree/_gate/canvas-draft?phase=${phase}`]}><GateFixture /></MemoryRouter>);
  const primaries = () => Array.from(document.querySelectorAll('button')).filter(b => b.className.includes('bg-blue-600'));

  it.each([
    ['draft', 'canvas-grid', 0], // Publish is not on this page: its one spot is the workspace bar
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

  it('D4: the draft page has no "Back to the thread" banner link (founder copy) and no actions row at all', async () => {
    getCanvas.mockResolvedValue(draftView());
    page(`/p/ana/canvas/canvas?v=${DRAFT_NAME}`);
    await ready();
    expect(screen.queryByTestId('canvas-draft-thread-link')).toBeNull();
    expect(screen.getByTestId('canvas-header-row')).not.toHaveTextContent(/Back to the thread/);
    expect(screen.queryByTestId('canvas-actions')).toBeNull();
  });

  it('D4: "Revise in chat" is gone (the chat is the workspace\'s other pane); neither a draft nor a published version links to the thread from the page', async () => {
    getCanvas.mockResolvedValue(draftView());
    page(`/p/ana/canvas/canvas?v=${DRAFT_NAME}`);
    await ready();
    expect(screen.queryByRole('link', { name: 'Revise in chat' })).toBeNull();
    cleanup();
    getCanvas.mockResolvedValue(view({ draft: draftBlock }));
    page();
    await ready();
    expect(screen.queryByRole('link', { name: 'Revise in chat' })).toBeNull();
  });

  it('V11: no filled primary in the header row of a draft (Publish is filled in the workspace bar, the one filled action)', async () => {
    getCanvas.mockResolvedValue(draftView());
    page(`/p/ana/canvas/canvas?v=${DRAFT_NAME}`);
    await ready();
    expect(Array.from(screen.getByTestId('canvas-header-row').querySelectorAll('button')).filter(b => b.className.includes('bg-blue-600'))).toEqual([]);
  });

  it('V10: at phone width the owner name wraps or takes the free width instead of truncating to "by Test ...", and a lone "Draft" label keeps its own width', async () => {
    getCanvas.mockResolvedValue(draftView());
    page(`/p/ana/canvas/canvas?v=${DRAFT_NAME}`);
    await ready();
    const name = screen.getByTestId('canvas-owner-name').parentElement as HTMLElement;
    expect(name.className.split(/\s+/)).not.toContain('truncate'); // only from sm up: `sm:truncate`
    expect(name.className).toContain('break-normal'); // S3.6: breaks between words only
    const slot = screen.getByTestId('canvas-project-slot').className.split(/\s+/);
    expect(slot).toContain('max-sm:flex-none'); // not an equal share of the row with the name
    expect(slot).not.toContain('max-sm:flex-1');
  });

  it('D2: the gate fixture shows the Clone pill on the owner\'s published canvas, and not on the reader\'s', async () => {
    render(<MemoryRouter initialEntries={['/tree/_gate/canvas-draft?phase=published-owner']}><GateFixture /></MemoryRouter>);
    expect(await screen.findByTestId('canvas-clone')).toHaveTextContent('Clone');
    cleanup();
    render(<MemoryRouter initialEntries={['/tree/_gate/canvas-draft?phase=published-reader']}><GateFixture /></MemoryRouter>);
    await screen.findByTestId('canvas-header-row');
    expect(screen.queryByTestId('canvas-clone')).toBeNull();
  });
});
