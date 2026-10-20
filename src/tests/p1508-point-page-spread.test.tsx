/**
 * @file p1508-point-page-spread.test.tsx
 * @description P1508 — the /point page's card carries the spread row (founder, fifth round: the
 * spread lives on the point card), counted from the point's own position counts (the tabs' source).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const POINT_ID = '11111111-2222-3333-4444-555555555555';

vi.mock('@/auth', () => ({ useAuth: () => ({ user: null, session: null, isLoading: false }) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('@/app/data/points-service', () => ({
  pointsService: {
    getPointWithCounts: vi.fn(async () => ({
      id: POINT_ID, statement: 'A point', createdAt: '2026-09-01T00:00:00Z', tags: [], systemTags: [],
      visibility: 'public', positionCounts: { agree: 2, strongly_agree: 1, disagree: 1, strongly_disagree: 1 }, totalPositions: 5,
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

describe('/point/:id — the spread on the card (P1508)', () => {
  it('shows the spread from the point\'s counts, "Contested", and the info button on the card, not in the filter block', async () => {
    render(
      <MemoryRouter initialEntries={[`/point/${POINT_ID}`]}>
        <Routes><Route path="/point/:id" element={<PointDetailPage />} /></Routes>
      </MemoryRouter>,
    );
    const header = await screen.findByTestId('point-spread-row');
    expect(header.closest('[data-card="point"]')).not.toBeNull();
    expect(screen.getByTestId('point-positions-block').querySelector('[data-testid="position-spread"]')).toBeNull();
    expect(within(header).getByTestId('position-spread')).toHaveAttribute('aria-label', '1 strongly disagree, 1 disagree, 2 agree, 1 strongly agree');
    expect(within(header).getByText('Contested')).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'How to read the spread' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Agree \(3\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Disagree \(2\)/ })).toBeInTheDocument();
  });
});
