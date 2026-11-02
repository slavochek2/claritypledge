/**
 * @file p1536-walk8-adoption.test.tsx
 * @description P1536 final walk, a real defect: on a bare canvas address the page adopts the newest version into the address and marks that address
 * "already read". If something moves the page on before that address ever renders (the workspace going to the open draft from a bare `?ws=1`), the mark
 * stayed behind, so picking that version later skipped the read and the page stayed on skeletons until a reload. The mark is for the very next address only,
 * and a read is skipped only when the data for the address is really on screen.
 */
import { useMemo, useRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import type { PointWithUserPosition } from '@/app/types';

const getCanvas = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn(), functions: { invoke: vi.fn() }, from: vi.fn() } }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: { user: { id: 'owner-1' } }, user: { id: 'owner-1' }, sessionChecked: true }) }));
vi.mock('@/app/data/api', () => ({
  getProfileBySlugResult: vi.fn(async () => ({ success: true, data: { id: 'owner-1', name: 'Ana', avatarUrl: null, avatarColor: '#3b82f6', hasPledged: false } })),
}));
vi.mock('@/app/data/canvas-service', () => ({ canvasService: { getCanvas, getAudience: vi.fn(async () => []), markCanvasRead: vi.fn(async () => undefined) } }));
vi.mock('@/app/data/calibration-service', () => ({ calibrationService: { getEarsCount: vi.fn(async () => 0) } }));
vi.mock('@/app/contexts/agent-accounts-context', () => ({ useAgentAccountIds: () => ({ isAgentAccountId: () => false, isLoading: false }) }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('@/app/pages/not-found-page', () => ({ NotFoundPage: () => <div data-testid="canvas-not-found">not found</div> }));
vi.mock('@/app/components/feed/feed-point-card', () => ({ FeedPointCard: ({ canvas }: { canvas?: unknown }) => <div data-testid="point-card" data-canvas={String(!!canvas)} /> }));
vi.mock('@/app/components/social/point-positions-block', () => ({ PointPositionsBlock: () => null }));
vi.mock('@/app/components/letters/letter-position-story-dialog', () => ({ LetterPositionStoryDialog: () => null }));
vi.mock('@/app/components/canvas/canvas-add-story-dialog', () => ({ CanvasAddStoryDialog: () => null }));
vi.mock('@/app/components/canvas/canvas-share-control', () => ({ CanvasShareControl: () => null }));

import { CanvasPage } from '@/app/pages/canvas-page';
import { CanvasWorkspaceContext, type CanvasWorkspaceValue } from '@/app/components/canvas/canvas-workspace-context';
import { clearLinkTokens } from '@/lib/canvas-link-token';
import { clearListReturnCache } from '@/lib/list-return-cache';

const DRAFT = 'canvas_dabc123';
const V1 = 'canvas_d111111';
const V0 = 'canvas_d000000';
const point = { id: 'p1', statement: 'A bet', tags: [], systemTags: ['canvas:problem'], visibility: 'private', userPosition: null, totalPositions: 0, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', positionCounts: { agree: 0, strongly_agree: 0, somewhat_agree: 0, unsure: 0, disagree: 0, strongly_disagree: 0, somewhat_disagree: 0 } } as unknown as PointWithUserPosition;
const versions = [
  { name: V1, createdAt: '2026-10-02T10:00:00Z', seq: 2, publishedAt: '2026-10-02T10:00:00Z', draft: false },
  { name: V0, createdAt: '2026-10-01T10:00:00Z', seq: 1, publishedAt: '2026-10-01T10:00:00Z', draft: false },
  { name: DRAFT, createdAt: '2026-10-20T10:00:00Z', seq: null, publishedAt: null, draft: true },
];
const draft = { id: 'draft-1', version: DRAFT, questions: {}, threadRootId: 'root-1', conversationId: 'conv-1', baseSeq: 2, runCount: 1, revision: 0, changedBoxes: [] };
const view = (version: string) => ({ points: [point], stories: new Map(), addedStoryIds: [], positions: new Map(), visibility: 'private', isOwner: true, admitted: true, generalAccess: 'restricted', via: null, canvasExists: true, version, versions, publishedNone: false, draft });

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.search}</output>;
}

/** What the workspace does on a bare `?ws=1` with a draft open: as soon as the page reports its read, it moves to the draft (before the adopted address renders). */
function Host({ moveToDraft }: { moveToDraft: boolean }) {
  const [, setParams] = useSearchParams();
  const moved = useRef(false);
  const go = (v: string) => setParams((prev) => { const n = new URLSearchParams(prev); n.set('v', v); return n; }, { replace: true });
  const goRef = useRef(go);
  goRef.current = go;
  const value = useMemo<CanvasWorkspaceValue>(() => ({
    active: true, reloads: 0, showThread: () => undefined, clone: null, cloneSeq: null, ownerBar: true,
    reportReady: (ready, forVersion) => {
      if (!moveToDraft || moved.current || !ready || forVersion !== null) return;
      moved.current = true;
      queueMicrotask(() => goRef.current(DRAFT));
    },
  }), [moveToDraft]);
  return (
    <CanvasWorkspaceContext.Provider value={value}>
      <Where />
      <button type="button" onClick={() => go(V1)}>pick-adopted</button>
      <button type="button" onClick={() => go(V0)}>pick-other</button>
      <CanvasPage />
    </CanvasWorkspaceContext.Provider>
  );
}

function mount(moveToDraft: boolean) {
  return render(
    <MemoryRouter initialEntries={['/p/ana/canvas/canvas?ws=1']}>
      <Routes><Route path="/p/:handle/canvas/:projectTag" element={<Host moveToDraft={moveToDraft} />} /></Routes>
    </MemoryRouter>,
  );
}
const askedFor = (v: string | undefined) => getCanvas.mock.calls.filter((c) => c[4] === v).length;

beforeEach(() => {
  vi.clearAllMocks();
  clearLinkTokens();
  clearListReturnCache();
  getCanvas.mockImplementation(async (_o: string, _t: string, _v: string, _k: string, version?: string) => view(version ?? V1));
});
afterEach(() => cleanup());

describe('the adopted address is marked "already read" only for the very next address', () => {
  it('moved on before the adopted address rendered: picking that version later reads it and the page shows it', async () => {
    mount(true);
    await waitFor(() => expect(screen.getByTestId('where').textContent).toContain(`v=${DRAFT}`));
    await waitFor(() => expect(askedFor(DRAFT)).toBe(1));
    await screen.findByTestId('canvas-point-card-p1');
    fireEvent.click(screen.getByText('pick-adopted'));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toContain(`v=${V1}`));
    await waitFor(() => expect(askedFor(V1)).toBe(1));
    expect(await screen.findByTestId('canvas-point-card-p1')).toBeInTheDocument();
  });

  it('CONTROL: the ordinary adoption still does not read twice: the data is on screen and the address follows', async () => {
    mount(false);
    await waitFor(() => expect(screen.getByTestId('where').textContent).toContain(`v=${V1}`));
    await screen.findByTestId('canvas-point-card-p1');
    expect(askedFor(undefined)).toBe(1);
    expect(askedFor(V1)).toBe(0);
  });

  it('CONTROL: after an ordinary adoption, another version and back both read', async () => {
    mount(false);
    await waitFor(() => expect(screen.getByTestId('where').textContent).toContain(`v=${V1}`));
    await screen.findByTestId('canvas-point-card-p1');
    fireEvent.click(screen.getByText('pick-other'));
    await waitFor(() => expect(askedFor(V0)).toBe(1));
    await screen.findByTestId('canvas-point-card-p1');
    fireEvent.click(screen.getByText('pick-adopted'));
    await waitFor(() => expect(askedFor(V1)).toBe(1));
    expect(await screen.findByTestId('canvas-point-card-p1')).toBeInTheDocument();
  });
});
