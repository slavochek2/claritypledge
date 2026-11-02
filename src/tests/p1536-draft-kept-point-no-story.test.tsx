/**
 * @file p1536-draft-kept-point-no-story.test.tsx
 * @description P1536 security review: in the owner's DRAFT view, a point kept from a published version is the same row in both, and `get_canvas` returns the owner's stories on a version's
 * points with no version condition. So a story added from the draft is read at once by everyone who reads the published version, and Discard does not take it back (S1.7 promises the
 * published read does not change while a draft is open). Decision (flagged for the founder at UAT): the draft view does not offer Add story on a point that also belongs to a published
 * version; a point new to the draft keeps it; the published view keeps it (that is the owner writing into that very version). Absent, not disabled (design rule 9); no new sentence.
 *  - the rule, pure
 *  - the canvas page hands the card `noAddStory` for exactly those points
 *  - the card, real, with `noAddStory`: no "Add a story" link, and with the flag off the same card has one
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PointWithUserPosition } from '@/app/types';
import type { ChatContextValue } from '@/app/pages/chat/chat-state';
import { addStoryBlocked, type CanvasReady } from '@/app/components/canvas/canvas-page-data';

const getCanvas = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({ supabase: { rpc, functions: { invoke }, from: vi.fn() } }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: { user: { id: 'owner-1' } }, user: { id: 'owner-1' }, sessionChecked: true }) }));
vi.mock('@/app/data/api', () => ({
  getProfileBySlugResult: vi.fn(async () => ({ success: true, data: { id: 'owner-1', name: 'Ana', avatarUrl: null, avatarColor: '#3b82f6', hasPledged: false } })),
}));
vi.mock('@/app/data/canvas-service', () => ({ canvasService: { getCanvas, getAudience: vi.fn(async () => []), markCanvasRead: vi.fn(async () => undefined) } }));
vi.mock('@/app/data/calibration-service', () => ({ calibrationService: { getEarsCount: vi.fn(async () => 0) } }));
vi.mock('@/app/contexts/agent-accounts-context', () => ({ useAgentAccountIds: () => ({ isAgentAccountId: () => false, isLoading: false }) }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('@/app/pages/not-found-page', () => ({ NotFoundPage: () => null }));
vi.mock('@/app/components/feed/feed-point-card', () => ({
  FeedPointCard: ({ point, canvas }: { point: { id: string }; canvas?: { noAddStory?: boolean; ownStoryAdded?: boolean } }) => (
    <div data-testid="open-card" data-point={point.id} data-no-add-story={String(!!canvas?.noAddStory)} data-own-story-added={String(!!canvas?.ownStoryAdded)} />
  ),
}));
vi.mock('@/app/components/social/point-positions-block', () => ({ PointPositionsBlock: () => null }));
vi.mock('@/app/components/letters/letter-position-story-dialog', () => ({ LetterPositionStoryDialog: () => null }));
vi.mock('@/app/components/canvas/canvas-add-story-dialog', () => ({ CanvasAddStoryDialog: () => null }));
vi.mock('@/app/components/canvas/canvas-share-control', () => ({ CanvasShareControl: () => null }));

import { CanvasPage } from '@/app/pages/canvas-page';
import { ChatContext } from '@/app/pages/chat/chat-state';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { clearLinkTokens } from '@/lib/canvas-link-token';
import { clearListReturnCache } from '@/lib/list-return-cache';

const DRAFT = 'canvas_dabc123';
const V1 = 'canvas_d111111';
const tagOf = (version: string) => `canvas_${version}`; // what the database puts on a point: 'canvas_' || version name
const point = (id: string, box: string, versions: string[]) => ({
  id, statement: `Bet ${id}`, tags: [], systemTags: [box, ...versions.map(tagOf)], visibility: 'private', userPosition: null, totalPositions: 0,
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  positionCounts: { agree: 0, strongly_agree: 0, somewhat_agree: 0, unsure: 0, disagree: 0, strongly_disagree: 0, somewhat_disagree: 0 },
}) as unknown as PointWithUserPosition;
const v1 = { name: V1, createdAt: '2026-10-01T10:00:00Z', seq: 1, publishedAt: '2026-10-01T10:00:00Z', draft: false };
const draftVersion = { name: DRAFT, createdAt: '2026-10-20T10:00:00Z', seq: null, publishedAt: null, draft: true };
const draftBlock = { id: 'draft-1', version: DRAFT, questions: {}, threadRootId: 'root-1', conversationId: 'conv-1', baseSeq: 1, runCount: 1, revision: 0, changedBoxes: [] as string[] };
const KEPT = point('p-kept', 'canvas:problem', [V1, DRAFT]);
const NEW = point('p-new', 'canvas:solution', [DRAFT]);
const base = { stories: new Map(), addedStoryIds: [], positions: new Map(), visibility: 'private' as const, isOwner: true, admitted: true, generalAccess: 'restricted' as const, via: null, canvasExists: true };
const draftView = { ...base, points: [KEPT, NEW], version: DRAFT, versions: [draftVersion, v1], publishedNone: false, draft: draftBlock };
const publishedView = { ...base, points: [point('p-kept', 'canvas:problem', [V1])], version: V1, versions: [draftVersion, v1], publishedNone: false, draft: null };

const chatValue = { refresh: vi.fn(async () => []), userId: 'owner-1', authors: { 'owner-1': { id: 'owner-1', slug: 'ana' } } } as unknown as ChatContextValue;
function page(at: string) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <ChatContext.Provider value={chatValue}>
        <Routes><Route path="/p/:handle/canvas/:projectTag" element={<CanvasPage />} /></Routes>
      </ChatContext.Provider>
    </MemoryRouter>,
  );
}
const openPoint = async (id: string) => {
  fireEvent.click(await screen.findByTestId(`canvas-point-card-${id}`));
  return screen.findByTestId('open-card');
};

beforeEach(() => {
  clearLinkTokens();
  clearListReturnCache();
  resetCanvasAvailability();
  getCanvas.mockReset();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
  invoke.mockReset();
  invoke.mockResolvedValue({ data: { enabled: true }, error: null });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const read = (over: Partial<CanvasReady>) => ({ isOwner: true, version: DRAFT, draft: { version: DRAFT }, versions: [draftVersion, v1], ...over }) as unknown as CanvasReady;

describe('the rule', () => {
  it('a point that also carries a published version\'s tag is blocked, in the owner\'s draft view only', () => {
    expect(addStoryBlocked(read({}), KEPT)).toBe(true);
    expect(addStoryBlocked(read({}), NEW)).toBe(false); // new to this draft: nobody else reads it yet
  });
  it('the published view keeps it (the owner writing into that very version), and a reader never has a draft', () => {
    expect(addStoryBlocked(read({ version: V1, draft: null }), KEPT)).toBe(false);
    expect(addStoryBlocked(read({ isOwner: false, draft: null }), KEPT)).toBe(false);
  });
  it('any published version counts, not only the newest; the draft\'s own tag does not', () => {
    const v2 = { name: 'canvas_d222222', createdAt: '2026-10-10T10:00:00Z', seq: 2, publishedAt: '2026-10-10T10:00:00Z', draft: false };
    const oldOnly = point('p-old', 'canvas:love', [V1, DRAFT]);
    expect(addStoryBlocked(read({ versions: [draftVersion, v2, v1] }), oldOnly)).toBe(true);
    expect(addStoryBlocked(read({}), point('p-x', 'canvas:love', [DRAFT]))).toBe(false);
  });
});

describe('the canvas page', () => {
  it('draft view: the card of a kept point is told there is no Add story; the card of a point new to the draft is not', async () => {
    getCanvas.mockResolvedValue(draftView);
    page(`/p/ana/canvas/canvas?v=${DRAFT}`);
    expect((await openPoint('p-kept')).getAttribute('data-no-add-story')).toBe('true');
    cleanup();
    getCanvas.mockResolvedValue(draftView);
    page(`/p/ana/canvas/canvas?v=${DRAFT}`);
    expect((await openPoint('p-new')).getAttribute('data-no-add-story')).toBe('false');
  });

  it('the published view of the same point: Add story stays (nothing in this view is a draft)', async () => {
    getCanvas.mockResolvedValue(publishedView);
    page(`/p/ana/canvas/canvas?v=${V1}`);
    expect((await openPoint('p-kept')).getAttribute('data-no-add-story')).toBe('false');
  });

  it('a story already added is still reported (the existing flag is unchanged)', async () => {
    getCanvas.mockResolvedValue(publishedView);
    page(`/p/ana/canvas/canvas?v=${V1}`);
    await waitFor(async () => expect((await openPoint('p-kept')).getAttribute('data-own-story-added')).toBe('false'));
  });
});
