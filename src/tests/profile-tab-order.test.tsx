/**
 * Profile tab order — Stories lead, unless there are none.
 *
 * The profile opens on Stories (media-carrying, answers "who is this person").
 * A profile with points but NO stories must not open on an empty tab — the same
 * ruling the stake page already carries ("a tab is only visible if stories are
 * there", stake-page.tsx). This pins both halves.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProfilePageV2 } from '@/app/pages/profile-page-v2';
import * as auth from '@/auth';
import * as api from '@/app/data/api';

// ─── Supabase mock ─────────────────────────────────────────────────────────────
const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

// ─── Service mocks ─────────────────────────────────────────────────────────────

vi.mock('@/auth');
vi.mock('@/app/data/api', () => ({
  getProfileBySlug: vi.fn(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  createProfile: vi.fn(),
}));

vi.mock('@/app/data/stories-service', () => ({
  storiesService: {
    // Empty: private story is excluded from public-only visibility filter in
    // getStoriesByAuthorWithPoints (stories-service-real.ts:380). This is the root of the bug.
    getStoriesByAuthorWithPoints: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/app/data/points-service', () => ({
  pointsService: {
    getPointsForProfileDisplay: vi.fn().mockResolvedValue([
      {
        id: 'point-1',
        statement: 'Test claim about the world',
        createdAt: '2026-01-01T00:00:00Z',
        // viewer (user-1) has taken an 'agree' position → userPosition is set → pill can fire
        userPosition: {
          id: 'pos-1',
          pointId: 'point-1',
          userId: 'user-1',
          position: 'agree',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        profileSubjectPosition: {
          id: 'pos-1',
          pointId: 'point-1',
          userId: 'user-1',
          position: 'agree',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        positionCounts: {
          strongly_agree: 0, agree: 1, somewhat_agree: 0,
          unsure: 0, somewhat_disagree: 0, disagree: 0, strongly_disagree: 0,
        },
        totalPositions: 1,
        tags: [],
        visibility: 'public',
      },
    ]),
    getPointsByValidator: vi.fn().mockResolvedValue([]),
    getPointsWithUserPositions: vi.fn().mockResolvedValue([]),
    getPointWithUserPosition: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('@/app/data/calibration-service', () => ({
  calibrationService: {
    getCalibration: vi.fn().mockResolvedValue({
      status: 'insufficient',
      sessionsCompleted: 0,
    }),
    getEarsCount: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('@/app/data/agreements-service', () => ({
  agreementsService: {
    getAgreementsForProfile: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/app/data/badge-service', () => ({
  badgeService: {
    getBadgeCount: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: vi.fn() },
}));

import { storiesService } from '@/app/data/stories-service';

// ─── Tests ────────────────────────────────────────────────────────────────────

const PROFILE_ID = 'user-1';

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

function renderProfile() {
  render(
    <MemoryRouter initialEntries={['/p/test-user']}>
      <Routes>
        <Route path="/p/:id" element={<ProfilePageV2 />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('profile content tabs — Stories lead, unless there are none', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.useAuth).mockReturnValue({
      user: { id: PROFILE_ID, name: 'Test User', slug: 'test-user' } as any,
      session: { user: { id: PROFILE_ID, email: 'test@example.com' } } as any,
      isLoading: false,
      sessionChecked: true,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    });
    vi.mocked(api.getProfileBySlug).mockResolvedValue(mockProfile as any);
    vi.mocked(api.getProfile).mockResolvedValue(null);
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));
  });

  it('Stories is the first tab and is selected when the profile has stories', async () => {
    vi.mocked(storiesService.getStoriesByAuthorWithPoints).mockResolvedValue([
      { id: 'story-1', content: 'A story', authorId: PROFILE_ID, visibility: 'public',
        createdAt: '2026-01-01T00:00:00Z', tags: [], understoodCount: 0, points: [] },
    ] as any);

    renderProfile();

    const tabs = await screen.findAllByRole('tab');
    expect(tabs[0]).toHaveTextContent(/^Stories/);
    expect(tabs[1]).toHaveTextContent(/^Points/);
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /^Stories/ })).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('falls back to Points when the profile has points but no stories', async () => {
    vi.mocked(storiesService.getStoriesByAuthorWithPoints).mockResolvedValue([] as any);

    renderProfile();

    // Stories still leads in ORDER — only the selection falls back.
    const tabs = await screen.findAllByRole('tab');
    expect(tabs[0]).toHaveTextContent(/^Stories/);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /^Points/ })).toHaveAttribute('aria-selected', 'true');
    });
  });
});
