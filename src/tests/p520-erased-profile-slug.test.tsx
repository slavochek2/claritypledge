// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProfilePageV2 } from '@/app/pages/profile-page-v2';
import * as auth from '@/auth';
import * as api from '@/app/data/api';

/**
 * P520 AC: "Deleted user's profile slug shows a graceful page (not 404, not broken page)".
 *
 * After `erase_my_account()` the `profiles` row is gone, so both accessors the page calls
 * return null — proven at the database in
 * `e2e/integration/p520-account-deletion.spec.ts` ("the erased slug resolves to 'not
 * found', not an error"). This test holds the render half: given that null pair, the page
 * must render its graceful not-found branch and NOT the "Something went wrong" error
 * branch, and must not throw.
 *
 * The exact copy is a [FOUNDER DECISION] (the page currently says "Profile Not Found" /
 * "This profile doesn't exist or has been removed", shared with never-existed slugs), so
 * this asserts the PROPERTY the AC is about — graceful, non-error, offers a way onward —
 * and pins the current copy only as a change-detector, not as the requirement.
 */

vi.mock('@/auth');
vi.mock('@/app/data/api', () => ({
  getProfileBySlug: vi.fn(),
  getProfile: vi.fn(),
  createProfile: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock('@/app/data/stories-service', () => ({
  storiesService: { getStoriesByAuthorWithPoints: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/app/data/points-service', () => ({
  pointsService: {
    getPointsByValidator: vi.fn().mockResolvedValue([]),
    getPointsWithUserPositions: vi.fn().mockResolvedValue([]),
    getPointsForProfileDisplay: vi.fn().mockResolvedValue([]),
    getPointWithUserPosition: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('@/app/data/calibration-service', () => ({
  calibrationService: {
    getCalibration: vi.fn().mockResolvedValue({
      agreementRate: 0.5,
      totalVerifications: 0,
      speakerVerifications: 0,
      listenerVerifications: 0,
    }),
    getEarsCount: vi.fn().mockResolvedValue(0),
  },
}));
vi.mock('@/app/data/badge-service', () => ({
  badgeService: { getBadgeCount: vi.fn().mockResolvedValue(0) },
}));
vi.mock('@/app/data/agreements-service', () => ({
  agreementsService: { getAgreementsForProfile: vi.fn().mockResolvedValue([]) },
}));

const ERASED_SLUG = 'leaver-person-erased';

function renderErasedSlug() {
  return render(
    <MemoryRouter initialEntries={[`/p/${ERASED_SLUG}`]}>
      <Routes>
        <Route path="/p/:id" element={<ProfilePageV2 />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('P520: an erased user\'s profile slug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.useAuth).mockReturnValue({
      user: null,
      session: null,
      isLoading: false,
      sessionChecked: true,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    } as unknown as ReturnType<typeof auth.useAuth>);

    // What the database returns for an erased slug: no row, no error, from both accessors.
    vi.mocked(api.getProfileBySlug).mockResolvedValue(null);
    vi.mocked(api.getProfile).mockResolvedValue(null);
  });

  it('renders a graceful not-found page, not the error page and not a crash', async () => {
    const onError = vi.fn();
    const originalError = console.error;
    console.error = onError;
    try {
      renderErasedSlug();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /profile not found/i })).toBeInTheDocument();
      });

      // Graceful, not the error branch: no "Something went wrong", no "Try Again".
      expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();

      // Current copy — a [FOUNDER DECISION] to keep or reword, pinned so a change is visible.
      expect(screen.getByText(/this profile doesn't exist or has been removed/i)).toBeInTheDocument();

      // A way onward exists, so the page is not a dead end.
      expect(screen.getByRole('link', { name: /go to home/i })).toHaveAttribute('href', '/');
    } finally {
      console.error = originalError;
    }

    // The page did not log a load failure — it took the "no row" path, not the throw path.
    expect(onError.mock.calls.map(String).join('\n')).not.toMatch(/Failed to load profile/);
  });

  it('a live slug still renders the profile — the not-found branch is the erasure, not the page', async () => {
    vi.mocked(api.getProfileBySlug).mockResolvedValue({
      id: 'stayer-1',
      slug: 'stayer-person',
      name: 'Stayer Person',
      isVerified: true,
      hasPledged: true,
      witnesses: [],
      reciprocations: 0,
    } as unknown as Awaited<ReturnType<typeof api.getProfileBySlug>>);

    render(
      <MemoryRouter initialEntries={['/p/stayer-person']}>
        <Routes>
          <Route path="/p/:id" element={<ProfilePageV2 />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Stayer Person')).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: /profile not found/i })).not.toBeInTheDocument();
  });
});
