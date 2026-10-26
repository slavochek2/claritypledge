/**
 * @file p1545-canvas-back.test.tsx
 * @description P1545 orientation redesign: the canvas page has a Back (the real FocusHeader, not a mock)
 * whose cold-arrival fallback is the canvases in Artifacts; and the shell counts canvas pages as Artifacts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { PointWithUserPosition } from '@/app/types';

const getCanvas = vi.hoisted(() => vi.fn());

vi.mock('@/auth', () => ({
  useAuth: () => ({ session: { user: { id: 'owner-1' } }, user: { id: 'owner-1' }, sessionChecked: true }),
}));
vi.mock('@/app/data/api', () => ({
  getProfileBySlugResult: vi.fn(async () => ({
    success: true,
    data: { id: 'owner-1', name: 'Ana', avatarUrl: null, avatarColor: '#3b82f6', hasPledged: false },
  })),
}));
vi.mock('@/app/data/canvas-service', () => ({
  canvasService: { getCanvas, getAudience: vi.fn(async () => []), setPosition: vi.fn(), markCanvasRead: vi.fn(async () => undefined) },
}));
vi.mock('@/app/data/points-service', () => ({ pointsService: { getCanvasProjectTags: vi.fn(async () => ['sales']) } }));
vi.mock('@/app/data/calibration-service', () => ({ calibrationService: { getEarsCount: vi.fn(async () => 0) } }));
vi.mock('@/app/contexts/agent-accounts-context', () => ({
  useAgentAccountIds: () => ({ isAgentAccountId: () => false, isLoading: false }),
}));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('@/app/pages/not-found-page', () => ({ NotFoundPage: () => <div>not found</div> }));
vi.mock('@/app/components/feed/feed-point-card', () => ({ FeedPointCard: () => <div data-testid="point-card" /> }));
vi.mock('@/app/components/social/point-positions-block', () => ({ PointPositionsBlock: () => null }));
vi.mock('@/app/components/letters/letter-position-story-dialog', () => ({ LetterPositionStoryDialog: () => null }));
vi.mock('@/app/components/canvas/canvas-add-story-dialog', () => ({ CanvasAddStoryDialog: () => null }));
vi.mock('@/app/components/canvas/canvas-share-control', () => ({ CanvasShareControl: () => null }));

import { CanvasPage } from '@/app/pages/canvas-page';
import { isShellEntryActive, ARTIFACTS_PATH } from '@/app/components/layout/app-shell/shell-nav';
import { clearListReturnCache } from '@/lib/list-return-cache';

const point = {
  id: 'p1', statement: 'Point one', tags: [], systemTags: ['canvas:problem'], visibility: 'private', userPosition: null,
  totalPositions: 0, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  positionCounts: { agree: 0, strongly_agree: 0, somewhat_agree: 0, unsure: 0, disagree: 0, strongly_disagree: 0, somewhat_disagree: 0 },
} as unknown as PointWithUserPosition;

function Where() {
  const loc = useLocation();
  return <output data-testid="where">{loc.pathname}{loc.search}</output>;
}

function page(at = '/p/ana/canvas/sales') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Where />
      <Routes>
        <Route path="/p/:handle/canvas/:projectTag" element={<CanvasPage />} />
        <Route path="/artifacts" element={<div>artifacts page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  clearListReturnCache();
  getCanvas.mockReset();
  getCanvas.mockResolvedValue({
    points: [point], stories: new Map(), addedStoryIds: [], positions: new Map(),
    visibility: 'shared', isOwner: true, admitted: true, generalAccess: 'restricted', via: null,
  });
});
afterEach(() => { cleanup(); clearListReturnCache(); });

describe('canvas page Back', () => {
  it('shows a Back control; on a cold arrival it goes to the canvases in Artifacts', async () => {
    page();
    await screen.findByTestId('canvas-grid');
    const back = screen.getByRole('button', { name: 'Go back' });
    expect(back).toBeInTheDocument();
    expect(back.className).toMatch(/min-h-1[01]/); // 40-44px target (FocusHeader)
    fireEvent.click(back);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/artifacts?tab=canvases'));
    expect(screen.getByText('artifacts page')).toBeInTheDocument();
  });

  it('does not change the canvas address', async () => {
    page('/p/ana/canvas/sales');
    await screen.findByTestId('canvas-grid');
    expect(screen.getByTestId('where')).toHaveTextContent('/p/ana/canvas/sales');
  });
});

describe('the shell counts canvas pages as Artifacts', () => {
  const canvas = '/p/ana/canvas/sales';

  it('Artifacts is active on a canvas page and My Profile is not', () => {
    expect(isShellEntryActive('artifacts', canvas, 'ana')).toBe(true);
    expect(isShellEntryActive('profile', canvas, 'ana')).toBe(false);
    expect(isShellEntryActive('partners', canvas, 'ana')).toBe(false);
  });

  it('a letter overview and its results highlight Artifacts, never Chats or Profile', () => {
    for (const path of ['/letter/l1/overview', '/letter/l1/results', '/letter/l1/results/']) {
      expect(isShellEntryActive('artifacts', path, 'ana')).toBe(true);
      expect(isShellEntryActive('profile', path, 'ana')).toBe(false);
    }
  });

  it("CONTROLS: a lookalike path and the recipient's reading page do not light Artifacts", () => {
    expect(isShellEntryActive('artifacts', '/letter/l1/overview/extra', 'ana')).toBe(false);
    expect(isShellEntryActive('artifacts', '/letters-x', 'ana')).toBe(false);
    expect(isShellEntryActive('artifacts', '/letter/d1', 'ana')).toBe(false);
  });

  it("someone else's canvas (a shared one) is Artifacts too, and a trailing slash or an encoded name still counts", () => {
    expect(isShellEntryActive('artifacts', '/p/tom/canvas/q4_plan', 'ana')).toBe(true);
    expect(isShellEntryActive('artifacts', '/p/tom/canvas/q4%20plan/', 'ana')).toBe(true);
    expect(isShellEntryActive('profile', '/p/tom/canvas/q4_plan', 'ana')).toBe(false);
  });

  it('CONTROLS: the profile page and other /p/ pages stay on My Profile; Artifacts keeps its own routes', () => {
    expect(isShellEntryActive('profile', '/p/ana', 'ana')).toBe(true);
    expect(isShellEntryActive('profile', '/p/ana/canvas', 'ana')).toBe(true); // not a canvas address: no name
    expect(isShellEntryActive('artifacts', '/p/ana', 'ana')).toBe(false);
    expect(isShellEntryActive('artifacts', '/p/ana/canvas', 'ana')).toBe(false);
    expect(isShellEntryActive('artifacts', ARTIFACTS_PATH, 'ana')).toBe(true);
    expect(isShellEntryActive('artifacts', '/p/ana/partners', 'ana')).toBe(false);
  });
});
