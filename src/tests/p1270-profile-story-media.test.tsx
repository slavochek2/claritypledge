/**
 * @file p1270-profile-story-media.test.tsx
 * @description P1270 §1 — the profile drops story media (video, photo, timecoded quotes)
 * for a nested story shown under an expanded point.
 *
 * EXPECTED RED until /dev implements §1. `profile-page-v2.tsx:339`'s SELECT omits
 * `image_url`, `video_url`, `video_quotes`, and the adapter at `:370-384` never maps them
 * onto the `AdaptedStory` it builds — so even a story that HAS media renders none of it in
 * the profile's Points tab. `QuotedStory`/`StoryMedia` already render media correctly given
 * it (spec: "No component change: QuotedStory already renders media when given it"), so this
 * file binds the MAPPING, not the component.
 *
 * WHY A FULL PAGE RENDER AND NOT A UNIT TEST OF THE MAPPER. The mapping is an inline closure
 * inside `ProfilePageV2`'s data-loading effect — it is not an exported, independently
 * callable function. The only externally observable seam is: mock what
 * `supabase.from('stories')` returns, render the page, expand the point, and look at what
 * reaches the DOM. Mocking the DB response to already carry `image_url`/`video_url`/
 * `video_quotes` (regardless of what the real SELECT string asks for — a mock does not
 * enforce that) isolates exactly the adapter step the spec says is broken: if the mapper
 * read these columns, media would render; today it does not.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProfilePageV2 } from '@/app/pages/profile-page-v2';
import * as auth from '@/auth';
import * as api from '@/app/data/api';

// ─── Supabase mock — table-aware, mirroring src/tests/profile-tab-order.test.tsx ──────────
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

// No top-level stories → the profile falls back to the Points tab (profile-tab-order.test.tsx
// already pins this behaviour), which is the surface §1 is about.
vi.mock('@/app/data/stories-service', () => ({
  storiesService: {
    getStoriesByAuthorWithPoints: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/app/data/points-service', () => ({
  pointsService: {
    getPointsForProfileDisplay: vi.fn().mockResolvedValue([
      {
        id: 'point-1',
        statement: 'Concentration of capability is the governance problem.',
        createdAt: '2026-01-01T00:00:00Z',
        userPosition: null,
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
    getCalibration: vi.fn().mockResolvedValue({ status: 'insufficient', sessionsCompleted: 0 }),
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

const POINT_ID = 'point-1';
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

const VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

/** The two DB rows §1's SELECT must return media for. Both carry `image_url`, `video_url`
 *  and `video_quotes` — the three columns the spec says the SELECT omits. */
const STORY_WITH_VIDEO = {
  id: 'story-video',
  content: 'Argument with video evidence.',
  author_id: PROFILE_ID,
  created_at: '2026-01-02T00:00:00Z',
  understood_count: 0,
  tags: [],
  visibility: 'public',
  image_url: null,
  video_url: VIDEO_URL,
  video_quotes: { quotes: [{ text: 'the blocker is not size', seconds: 30 }], durationSeconds: 120 },
};

const STORY_WITH_IMAGE_ONLY = {
  id: 'story-image',
  content: 'Argument with a supporting photo, no video.',
  author_id: PROFILE_ID,
  created_at: '2026-01-01T12:00:00Z',
  understood_count: 0,
  tags: [],
  visibility: 'public',
  image_url: 'https://example.com/photo.jpg',
  video_url: null,
  video_quotes: null,
};

function mockSupabaseTables() {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'story_points') {
      // profile-page-v2.tsx:316 — point → linked story ids, scoped to the profile owner.
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [
            { point_id: POINT_ID, story_id: STORY_WITH_VIDEO.id },
            { point_id: POINT_ID, story_id: STORY_WITH_IMAGE_ONLY.id },
          ],
          error: null,
        }),
      };
    }
    if (table === 'stories') {
      // profile-page-v2.tsx:338-340 — the SELECT under test.
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [STORY_WITH_VIDEO, STORY_WITH_IMAGE_ONLY],
          error: null,
        }),
      };
    }
    return {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
  });
}

function renderProfile() {
  render(
    <MemoryRouter initialEntries={['/p/test-user']}>
      <Routes>
        <Route path="/p/:id" element={<ProfilePageV2 />} />
      </Routes>
    </MemoryRouter>
  );
}

async function expandLinkedStories() {
  const trigger = await screen.findByRole('button', { name: /expand linked stories/i });
  fireEvent.click(trigger);
}

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
  mockSupabaseTables();
});

describe('P1270 §1 — profile Points tab renders nested story media', () => {
  it('renders the video for a nested story that has one', async () => {
    renderProfile();
    await expandLinkedStories();

    // The RED assertion. Today the adapter drops `video_url`, so `QuotedStory` receives a
    // story with no `videoUrl` and `StoryMedia` renders nothing for it.
    await waitFor(() => {
      expect(screen.queryByTestId('video-thumbnail-link')).not.toBeNull();
    });
  });

  it('renders the timecoded quote pills for a nested story with video quotes', async () => {
    renderProfile();
    await expandLinkedStories();

    await waitFor(() => {
      expect(screen.queryByTestId('story-video-quotes')).not.toBeNull();
    });
    expect(screen.getByTestId('story-video-quote-timecode')).toBeTruthy();
  });

  it('renders a photo for a nested story whose only media is an image', async () => {
    renderProfile();
    await expandLinkedStories();

    // `StoryMedia` only falls through to `StoryImage` when no video parses — this story has
    // none, so a fixed adapter renders the photo through the image path.
    await waitFor(() => {
      expect(screen.queryByAltText(/supporting image for/i)).not.toBeNull();
    });
  });

  /**
   * SECOND assertion, never the only one (per test-writing brief): confirms the SELECT
   * string itself was widened, in addition to the render-level proof above. A grep-only
   * test could pass with the columns requested but never mapped — which is exactly what
   * the render assertions above are for.
   */
  it('requests the three media columns in the stories SELECT', async () => {
    renderProfile();
    await expandLinkedStories();

    await waitFor(() => {
      const storiesCall = mockFrom.mock.calls.find(([table]) => table === 'stories');
      expect(storiesCall, 'the stories table must be queried at all').toBeTruthy();
    });

    const storiesReturn = mockFrom.mock.results.find(
      (_, i) => mockFrom.mock.calls[i][0] === 'stories'
    );
    const selectMock = storiesReturn?.value.select as ReturnType<typeof vi.fn>;
    const selectArgs = selectMock.mock.calls[0]?.[0] as string | undefined;
    expect(selectArgs, 'stories SELECT must ask for image_url, video_url, video_quotes').toBeTruthy();
    expect(selectArgs).toContain('image_url');
    expect(selectArgs).toContain('video_url');
    expect(selectArgs).toContain('video_quotes');
  });
});
