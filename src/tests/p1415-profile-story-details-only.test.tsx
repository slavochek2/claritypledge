// @vitest-environment jsdom
/**
 * @file p1415-profile-story-details-only.test.tsx
 * @description P1415 — the profile's story card (`StoryCardFull`, private to profile-page-v2.tsx,
 * so rendered through the page) opens only via `Details →`. Tapping the body navigates nowhere;
 * the root is an <article> named "Story by …", with no role="button", tab stop, pointer cursor or
 * whole-card hover border. Harness copied from p1366-profile-story-menu.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProfilePageV2 } from '@/app/pages/profile-page-v2';
import * as auth from '@/auth';
import * as api from '@/app/data/api';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { from: (table: string) => mockFrom(table) } }));

vi.mock('@/auth');
vi.mock('@/app/data/api', () => ({
  getProfileBySlug: vi.fn(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  createProfile: vi.fn(),
}));

const deleteStory = vi.hoisted(() => vi.fn());
vi.mock('@/app/data/stories-service', () => ({
  storiesService: {
    getStoriesByAuthorWithPoints: vi.fn(async () => [
      {
        id: 'story-1',
        authorId: 'owner-1',
        authorName: 'Owner Person',
        authorSlug: 'owner',
        content: 'The owner wrote this story.',
        visibility: 'public',
        currentVersion: 1,
        understoodCount: 0,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
        tags: [],
        systemTags: [],
        points: [],
      },
    ]),
    deleteStory,
    updateStory: vi.fn(),
  },
}));
vi.mock('@/app/data/points-service', () => ({
  pointsService: {
    getPointsForProfileDisplay: vi.fn(async () => []),
    getPointsByValidator: vi.fn(async () => []),
    getPointsWithUserPositions: vi.fn(async () => []),
    getPointWithUserPosition: vi.fn(async () => null),
  },
}));
vi.mock('@/app/data/calibration-service', () => ({
  calibrationService: {
    getCalibration: vi.fn(async () => ({ status: 'insufficient', sessionsCompleted: 0 })),
    getEarsCount: vi.fn(async () => 0),
  },
}));
vi.mock('@/app/data/agreements-service', () => ({ agreementsService: { getAgreementsForProfile: vi.fn(async () => []) } }));
vi.mock('@/app/data/badge-service', () => ({ badgeService: { getBadgeCount: vi.fn(async () => 0) } }));

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/mixpanel', () => ({ analytics: { track } }));

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const OWNER = {
  id: 'owner-1', slug: 'owner', name: 'Owner Person', email: 'owner@example.com', role: 'Engineer',
  isVerified: true, hasPledged: true, witnesses: [], reciprocations: 0,
};

function signInAs(userId: string | null) {
  vi.mocked(auth.useAuth).mockReturnValue({
    user: userId ? ({ id: userId, name: 'Someone', slug: userId } as never) : null,
    session: userId ? ({ user: { id: userId, email: `${userId}@example.com` }, access_token: 't' } as never) : null,
    isLoading: false,
    sessionChecked: true,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  } as never);
}

async function renderProfile() {
  render(
    <MemoryRouter initialEntries={['/p/owner']}>
      <Routes>
        <Route path="/p/:id" element={<ProfilePageV2 />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByText('The owner wrote this story.');
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(api.getProfileBySlug).mockResolvedValue(OWNER as never);
  vi.mocked(api.getProfile).mockResolvedValue(null as never);
  mockFrom.mockImplementation(() => ({
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
    eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
  }));
  signInAs('viewer-1');
});

describe('P1415 — profile story card opens only via Details', () => {
  it('tapping the story body does not navigate; Details → does', async () => {
    await renderProfile();
    fireEvent.click(screen.getByText('The owner wrote this story.'));
    fireEvent.click(screen.getByTestId('profile-story-card-story-1'));
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Details for this story', exact: true }));
    expect(navigate).toHaveBeenCalledWith(expect.stringMatching(/^\/story\/story-1/));
  });

  it('Details → is described by its card ("Story by …")', async () => {
    await renderProfile();
    expect(screen.getByRole('button', { name: 'Details for this story', exact: true })).toHaveAccessibleDescription('Story by Owner Person');
  });

  it('Enter / Space on the card root does not navigate', async () => {
    await renderProfile();
    const root = screen.getByTestId('profile-story-card-story-1');
    fireEvent.keyDown(root, { key: 'Enter' });
    fireEvent.keyDown(root, { key: ' ' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('the root is an <article> named "Story by …": no role="button", no tab stop, no pointer, no hover border', async () => {
    await renderProfile();
    const root = screen.getByTestId('profile-story-card-story-1');
    expect(root.tagName).toBe('ARTICLE');
    expect(root.getAttribute('role')).toBeNull();
    // Never a Tab stop — but a programmatic focus target (tabindex="-1"): the profile groups
    // stories by source, and SourceGroup's "Show N more" hands focus to the first revealed card.
    // (`root.tabIndex` alone is blind here: an element with NO tabindex also reports -1.)
    expect(root.getAttribute('tabindex')).toBe('-1');
    root.focus();
    expect(document.activeElement).toBe(root);
    expect(screen.getByRole('article', { name: 'Story by Owner Person' })).toBe(root);
    const tokens = root.className.split(/\s+/);
    expect(tokens).not.toContain('cursor-pointer');
    expect(tokens.filter((t) => /^(hover|focus-within):(border|shadow)/.test(t))).toEqual([]);
  });
});
