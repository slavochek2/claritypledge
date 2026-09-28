/**
 * @file p1364-point-filter.test.tsx
 * @description P1364 scope extension — /point/:id lists its holders under a position filter
 * (All / Agree / Disagree / Unsure), and a holder's row opens their story. The filter lives in
 * `?filter=` (replace; 'all' has no param) so Back from that story returns to the same filter.
 */
import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';

const POINT_ID = '11111111-2222-3333-4444-555555555555';

vi.mock('@/auth', () => ({ useAuth: () => ({ user: null, session: null, isLoading: false }) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('@/app/data/points-service', () => ({
  pointsService: {
    getPointWithCounts: vi.fn(async () => ({
      id: POINT_ID, statement: 'A point', createdAt: '2026-09-01T00:00:00Z', tags: [], systemTags: [],
      visibility: 'public', positionCounts: { agree: 1, disagree: 1 }, totalPositions: 2,
    })),
    getPointWithUserPosition: vi.fn(async () => null),
    getPositionsForPoint: vi.fn(async () => []),
  },
}));
vi.mock('@/app/data/points-service-real', () => ({
  resolvePointSlug: vi.fn(async (id: string) => id),
  getVersionChain: vi.fn(async () => []),
  getChainHead: vi.fn(async () => null),
}));
vi.mock('@/app/data/stories-service', () => ({
  storiesService: { getStoriesForPoints: vi.fn(async () => new Map()), getStoryByUserAndPoint: vi.fn(async () => null) },
}));

import { PointDetailPage } from '@/app/pages/point-detail-page';

let nav: NavigateFunction;
function NavGrab() {
  nav = useNavigate();
  return null;
}
function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}
const where = () => screen.getByTestId('where').textContent;
const go = (to: string | number) => act(() => { if (typeof to === 'number') nav(to); else nav(to); });
/** FilterTabs marks the active tab with an underline element inside its button. */
const isActive = async (label: RegExp) => (await screen.findByRole('button', { name: label })).querySelector('div') !== null;

describe('/point/:id — the holders filter is in the URL', () => {
  it('a filter press REPLACES `?filter=`; Back from a story returns to it; deselecting removes the param', async () => {
    render(
      <MemoryRouter initialEntries={['/start', `/point/${POINT_ID}`]} initialIndex={1}>
        <NavGrab />
        <Where />
        <Routes>
          <Route path="/start" element={<p>start</p>} />
          <Route path="/story/:id" element={<p>a story</p>} />
          <Route path="/point/:id" element={<PointDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    const agree = await screen.findByRole('button', { name: /^Agree \(/ });
    fireEvent.click(agree);
    expect(where()).toBe(`/point/${POINT_ID}?filter=agree`);
    go('/story/s1');
    go(-1);
    expect(await isActive(/^Agree \(/)).toBe(true); // the page remounts and refetches; the filter comes from the URL
    fireEvent.click(screen.getByRole('button', { name: /^Agree \(/ })); // pressing the active filter shows all
    expect(where()).toBe(`/point/${POINT_ID}`);
    go(-1); // the filter presses added no history entries
    expect(where()).toBe('/start');
  });
});
