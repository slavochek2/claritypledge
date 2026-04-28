// @vitest-environment jsdom
/**
 * P824 Canary: "+ Add your story" pill hidden on own profile when viewer has a private story
 *
 * BUG: viewerStoriesForPoint useMemo (profile-page-v2.tsx:202) counts from realStories,
 * which is populated by getStoriesByAuthorWithPoints (visibility='public' filter only).
 * Private stories are excluded, so viewerStoriesForPoint.get(pointId) = 0 for a point
 * with only a private story — causing showInlineAddStoryPill to evaluate true incorrectly.
 *
 * FIX: Populate viewerStoryCountMap from linksByPoint (story_points query, no visibility
 * filter) for own profile. Unify consumption at line 1082-1086 to always use
 * viewerStoryCountMap. Remove now-dead viewerStoriesForPoint useMemo.
 *
 * CANARY RULE: Asserts the pill is ABSENT when viewer has a private story.
 * FAILS before fix (pill is shown, viewerStoryCount=0 from public-only realStories).
 * PASSES after fix (viewerStoryCount=1, counted via linksByPoint which ignores visibility).
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStoryPointsChain(rows: Array<{ point_id: string; story_id: string }>, authorId: string) {
  return {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation((column: string, value: string) =>
      Promise.resolve({
        data: column === 'author_id' && value !== authorId ? [] : rows,
        error: null,
      })
    ),
  };
}

function makeStoriesChain(rows: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const PROFILE_ID = 'user-1';
const POINT_ID = 'point-1';
const PRIVATE_STORY_ID = 'story-private-1';

describe('P824: own-profile CTA pill hidden when viewer has private story', () => {
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

  beforeEach(() => {
    vi.clearAllMocks();

    // Own profile: viewer IS the profile owner (currentUser.id === profile.id)
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

    // Supabase: story_points has one link (private story) — no visibility filter
    // stories: returns the private story record
    mockFrom.mockImplementation((table: string) => {
      if (table === 'story_points') {
        return makeStoryPointsChain([
          { point_id: POINT_ID, story_id: PRIVATE_STORY_ID },
        ], PROFILE_ID);
      }
      if (table === 'stories') {
        return makeStoriesChain([
          {
            id: PRIVATE_STORY_ID,
            visibility: 'private',
            author_id: PROFILE_ID,
            content: 'My private perspective on this claim',
            created_at: '2026-01-01T00:00:00Z',
            understood_count: 0,
            tags: [],
          },
        ]);
      }
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });
  });

  it('"+ Add your story" pill is absent when viewer has a private story linked to the point', async () => {
    // Setup:
    //   - Viewer (user-1) is on their own profile
    //   - They have taken an 'agree' position on point-1 (required for pill to fire)
    //   - They have a PRIVATE story linked to point-1 (story-private-1)
    //   - getStoriesByAuthorWithPoints returns [] (private story excluded by visibility='public' filter)
    //   - story_points returns the private story link (no visibility filter)
    //
    // Before fix: viewerStoriesForPoint.get('point-1') = 0 (private story not in realStories)
    //             → showInlineAddStoryPill = true → pill appears → TEST FAILS (proves bug)
    // After fix:  viewerStoryCountMap.get('point-1') = 1 (counted via linksByPoint)
    //             → showInlineAddStoryPill = false → pill absent → TEST PASSES

    render(
      <MemoryRouter initialEntries={['/p/test-user']}>
        <Routes>
          <Route path="/p/:id" element={<ProfilePageV2 />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    // Wait for the point card to finish loading (async supabase mocks resolve)
    await waitFor(() => {
      expect(screen.getByText('Test claim about the world')).toBeInTheDocument();
    });

    // Brief settle for any pending state updates after point appears
    await new Promise(r => setTimeout(r, 50));

    // CANARY ASSERTION: pill must not be present when viewer has a private story
    // FAILS before fix: pill is shown (viewerStoryCount=0 from public-only realStories)
    // PASSES after fix: pill hidden (viewerStoryCount=1 counted via linksByPoint)
    expect(
      screen.queryByRole('button', { name: /add your story/i })
    ).not.toBeInTheDocument();
  });

  it('"+ Add your story" pill is absent when viewer has a PUBLIC story linked to the point (regression)', async () => {
    // AC 2 regression: same fix path handles public stories too — linksByPoint is visibility-agnostic
    mockFrom.mockImplementation((table: string) => {
      if (table === 'story_points') {
        return makeStoryPointsChain([
          { point_id: POINT_ID, story_id: 'story-public-1' },
        ], PROFILE_ID);
      }
      if (table === 'stories') {
        return makeStoriesChain([
          {
            id: 'story-public-1',
            visibility: 'public',
            author_id: PROFILE_ID,
            content: 'My public perspective on this claim',
            created_at: '2026-01-01T00:00:00Z',
            understood_count: 0,
            tags: [],
          },
        ]);
      }
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });

    render(
      <MemoryRouter initialEntries={['/p/test-user']}>
        <Routes>
          <Route path="/p/:id" element={<ProfilePageV2 />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Test claim about the world')).toBeInTheDocument());
    await new Promise(r => setTimeout(r, 50));

    expect(
      screen.queryByRole('button', { name: /add your story/i })
    ).not.toBeInTheDocument();
  });

  it('no console errors on own-profile page load', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <MemoryRouter initialEntries={['/p/test-user']}>
        <Routes>
          <Route path="/p/:id" element={<ProfilePageV2 />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Test claim about the world')).toBeInTheDocument());
    await new Promise(r => setTimeout(r, 50));

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
