/**
 * @file p1364-profile-return.test.tsx
 * @description P1364 scope extension — "if i go from point or story back to profile … should i
 * not land back where i was, in the right tab at the right place?" (founder).
 *
 * /p/:id keeps its tab in `?tab=` (replace; the default tab has no param) and joins the
 * list-return cache on the feed's terms: served on POP only, keyed on viewer + path, no list
 * refetch on POP (the header above the lists revalidates silently), a PUSH fetches fresh, and
 * any own write (which clears the cache) makes the next Back refetch.
 *
 * Mocks are the profile-tab-order.test.tsx harness.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { ProfilePageV2 } from '@/app/pages/profile-page-v2';
import { clearListReturnCache, listReturnCacheKey, readListReturnCache } from '@/lib/list-return-cache';
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
import { pointsService } from '@/app/data/points-service';
import { calibrationService } from '@/app/data/calibration-service';

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

function renderAt(entries: string[]) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <NavGrab />
      <Where />
      <Routes>
        <Route path="/start" element={<p>start</p>} />
        <Route path="/story/:id" element={<p>a story page</p>} />
        <Route path="/p/:id" element={<ProfilePageV2 />} />
      </Routes>
    </MemoryRouter>
  );
}
const selected = (name: RegExp) => screen.getByRole('tab', { name }).getAttribute('aria-selected');
const listCalls = () => vi.mocked(pointsService.getPointsForProfileDisplay).mock.calls.length;

describe('P1364 — /p/:id returns to the same tab and the same lists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.useAuth).mockReturnValue({
      user: { id: 'viewer-1', name: 'Viewer', slug: 'viewer' } as any,
      session: { user: { id: 'viewer-1', email: 'v@example.com' } } as any,
      isLoading: false,
      sessionChecked: true,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    });
    vi.mocked(api.getProfileBySlug).mockResolvedValue(mockProfile as any);
    vi.mocked(api.getProfile).mockResolvedValue(null);
    vi.mocked(storiesService.getStoriesByAuthorWithPoints).mockResolvedValue([
      { id: 'story-1', content: 'A story', authorId: PROFILE_ID, visibility: 'public',
        createdAt: '2026-01-01T00:00:00Z', tags: [], understoodCount: 0, points: [] },
    ] as any);
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));
  });

  it('a tab click writes ?tab= with REPLACE (Back leaves the profile); the default tab has no param', async () => {
    renderAt(['/start', '/p/test-user']);
    await waitFor(() => expect(selected(/^Stories/)).toBe('true'));
    fireEvent.click(screen.getByRole('tab', { name: /^Points/ }));
    expect(where()).toBe('/p/test-user?tab=points');
    expect(selected(/^Points/)).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: /^Stories/ }));
    expect(where()).toBe('/p/test-user');
    go(-1);
    expect(where()).toBe('/start');
  });

  it('open a story from the Points tab → Back: same tab, lists on the first frame, no list refetch', async () => {
    renderAt(['/p/test-user?tab=points']);
    await waitFor(() => expect(listCalls()).toBe(1));
    await screen.findByText('Test claim about the world');
    go('/story/story-1');
    go(-1);
    // Synchronously after the POP: the tab and the point are there, no loader.
    expect(selected(/^Points/)).toBe('true');
    expect(screen.getByText('Test claim about the world')).toBeTruthy();
    await act(async () => {});
    expect(listCalls()).toBe(1);
    expect(vi.mocked(storiesService.getStoriesByAuthorWithPoints).mock.calls.length).toBe(1);
  });

  it('the header above the lists revalidates silently on POP (no spinner, lists untouched)', async () => {
    renderAt(['/p/test-user']);
    await waitFor(() => expect(listCalls()).toBe(1));
    await waitFor(() => expect(vi.mocked(calibrationService.getCalibration).mock.calls.length).toBe(1));
    go('/story/story-1');
    go(-1);
    await waitFor(() => expect(vi.mocked(calibrationService.getCalibration).mock.calls.length).toBe(2));
    expect(listCalls()).toBe(1);
  });

  it('an own write (which clears the cache) → Back refetches the lists', async () => {
    renderAt(['/p/test-user']);
    await waitFor(() => expect(listCalls()).toBe(1));
    await screen.findAllByRole('tab');
    go('/story/story-1');
    clearListReturnCache(); // what every wrapped / guarded write does
    go(-1);
    await waitFor(() => expect(listCalls()).toBe(2));
  });

  it('a PUSH to the same profile fetches fresh', async () => {
    renderAt(['/p/test-user']);
    await waitFor(() => expect(listCalls()).toBe(1));
    go('/p/test-user');
    await waitFor(() => expect(listCalls()).toBe(2));
  });

  it("another viewer never gets this viewer's cached profile lists", async () => {
    renderAt(['/p/test-user']);
    await waitFor(() => expect(listCalls()).toBe(1));
    await screen.findAllByRole('tab');
    go('/story/story-1');
    vi.mocked(auth.useAuth).mockReturnValue({
      user: { id: 'viewer-2', name: 'Other', slug: 'other' } as any,
      session: { user: { id: 'viewer-2', email: 'o@example.com' } } as any,
      isLoading: false,
      sessionChecked: true,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    });
    go(-1);
    await waitFor(() => expect(listCalls()).toBe(2));
  });

  it('review: a slow load for profile A that resolves AFTER switching to B never lands on B (screen or cache)', async () => {
    const profileA = { ...mockProfile, id: 'pa', slug: 'a', name: 'Profile A' };
    const profileB = { ...mockProfile, id: 'pb', slug: 'b', name: 'Profile B' };
    vi.mocked(api.getProfileBySlug).mockImplementation(async (slug: string) =>
      (slug === 'a' ? profileA : slug === 'b' ? profileB : null) as any);
    vi.mocked(pointsService.getPointsForProfileDisplay).mockResolvedValue([] as any);
    let resolveA!: (v: unknown) => void;
    const storyA = { id: 'story-a', content: 'Story by A', authorId: 'pa', visibility: 'public',
      createdAt: '2026-01-01T00:00:00Z', tags: [], understoodCount: 0, points: [] };
    const storyB = { id: 'story-b', content: 'Story by B', authorId: 'pb', visibility: 'public',
      createdAt: '2026-01-01T00:00:00Z', tags: [], understoodCount: 0, points: [] };
    vi.mocked(storiesService.getStoriesByAuthorWithPoints).mockImplementation(((authorId: string) =>
      authorId === 'pa' ? new Promise(r => { resolveA = r; }) : Promise.resolve([storyB])) as any);

    renderAt(['/p/a']);
    await waitFor(() => expect(storiesService.getStoriesByAuthorWithPoints).toHaveBeenCalledWith('pa', 'viewer-1'));
    go('/p/b');
    await screen.findByText('Story by B');
    await act(async () => { resolveA([storyA]); await new Promise(r => setTimeout(r, 20)); });

    expect(screen.queryByText('Story by A')).toBeNull();
    expect(screen.getByText('Story by B')).toBeTruthy();
    const cached = readListReturnCache<{ profile: { id: string }; stories: Array<{ id: string }> }>(
      listReturnCacheKey('viewer-1', '/p/b'), 'profile');
    expect(cached?.profile.id).toBe('pb');
    expect(cached?.stories.map(x => x.id)).toEqual(['story-b']);
  });
});
