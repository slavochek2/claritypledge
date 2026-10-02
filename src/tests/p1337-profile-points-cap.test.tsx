// @vitest-environment jsdom
/**
 * P1337 — the profile Points tab renders 50 at a time ("Show more" reveals the next 50, the tab
 * count stays the full total), and carries "Compare with me" for a signed-in non-owner viewer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProfilePageV2 } from '@/app/pages/profile-page-v2';
import * as auth from '@/auth';
import * as api from '@/app/data/api';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

vi.mock('@/auth');
vi.mock('@/app/data/api', () => ({
  getProfileBySlug: vi.fn(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  createProfile: vi.fn(),
}));

vi.mock('@/app/data/stories-service', () => ({
  storiesService: { getStoriesByAuthorWithPoints: vi.fn().mockResolvedValue([]) },
}));

const TOTAL = 60; // one full page of 50 plus a remainder

// The real card is heavy in jsdom (~14s for 60, past the 30s limit under full-suite load). The
// cap is the page's slicing, not the card, so a stub that prints the statement is enough.
vi.mock('@/app/components/social/point-card-with-links', () => ({
  PointCardWithLinks: ({ point }: { point: { text?: string; statement?: string } }) => (
    <p>{point.text ?? point.statement}</p>
  ),
}));

vi.mock('@/app/data/points-service', () => ({
  pointsService: {
    getPointsForProfileDisplay: vi.fn().mockImplementation(async () =>
      Array.from({ length: TOTAL }, (_, i) => ({
        id: `point-${i}`,
        statement: `Claim number ${i}`,
        createdAt: '2026-01-01T00:00:00Z',
        positionCounts: {
          strongly_agree: 0, agree: 1, somewhat_agree: 0,
          unsure: 0, somewhat_disagree: 0, disagree: 0, strongly_disagree: 0,
        },
        totalPositions: 1,
        tags: [],
        visibility: 'public',
      })),
    ),
    getPointsByValidator: vi.fn().mockResolvedValue([]),
    getPointsWithUserPositions: vi.fn().mockResolvedValue([]),
    getPointWithUserPosition: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('@/app/data/calibration-service', () => ({
  calibrationService: {
    getCalibration: vi.fn().mockResolvedValue({ status: 'insufficient', sessionsCompleted: 0 }),
    getEarsCount: vi.fn().mockResolvedValue(0),
  },
}));
vi.mock('@/app/data/agreements-service', () => ({
  agreementsService: { getAgreementsForProfile: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/app/data/badge-service', () => ({ badgeService: { getBadgeCount: vi.fn().mockResolvedValue(0) } }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));

const PROFILE_ID = 'profile-1';
const mockProfile = {
  id: PROFILE_ID,
  slug: 'test-user',
  name: 'Test User',
  email: 'test@example.com',
  role: 'Engineer',
  isVerified: true,
  hasPledged: true,
  witnesses: [],
  reciprocations: 0,
};

function signInAs(userId: string | null) {
  vi.mocked(auth.useAuth).mockReturnValue({
    user: userId ? ({ id: userId, name: 'Viewer', slug: 'viewer' } as any) : null,
    session: userId ? ({ user: { id: userId, email: 'viewer@example.com' } } as any) : null,
    isLoading: false,
    sessionChecked: true,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  });
}

function renderPointsTab() {
  render(
    <MemoryRouter initialEntries={['/p/test-user?tab=points']}>
      <Routes>
        <Route path="/p/:id" element={<ProfilePageV2 />} />
      </Routes>
    </MemoryRouter>,
  );
}

const renderedClaims = () => screen.queryAllByText(/^Claim number \d+$/).length;

describe('profile Points tab — capped at 50 with "Show more"', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInAs('viewer-1');
    vi.mocked(api.getProfileBySlug).mockResolvedValue(mockProfile as any);
    vi.mocked(api.getProfile).mockResolvedValue(null);
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));
  });

  it('renders 50 of 60, keeps the full count on the tab, and reveals the rest on "Show more"', async () => {
    renderPointsTab();

    await screen.findByRole('button', { name: 'Show more' });
    expect(renderedClaims()).toBe(50);
    expect(screen.getByRole('tab', { name: /^Points \(60\)/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(renderedClaims()).toBe(60));
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  }, 30000);

  it('shows "Compare with me" to a signed-in non-owner, linking to /compare/:slug', async () => {
    renderPointsTab();

    const link = await screen.findByRole('link', { name: /Compare with me/ });
    expect(link).toHaveAttribute('href', '/compare/test-user');
  });

  it('hides "Compare with me" from the profile owner and from signed-out visitors', async () => {
    signInAs(PROFILE_ID);
    const owner = render(
      <MemoryRouter initialEntries={['/p/test-user?tab=points']}>
        <Routes>
          <Route path="/p/:id" element={<ProfilePageV2 />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('button', { name: 'Show more' });
    expect(screen.queryByRole('link', { name: /Compare with me/ })).not.toBeInTheDocument();
    owner.unmount();

    signInAs(null);
    renderPointsTab();
    await screen.findByRole('button', { name: 'Show more' });
    expect(screen.queryByRole('link', { name: /Compare with me/ })).not.toBeInTheDocument();
  }, 30000);
});
