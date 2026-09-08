/**
 * @file p1270-feed-nested-stance.test.tsx
 * @description P1270 §4 — expanding the points under a story in the feed shows no stance for
 * the story's author, because `getPointsForStories` deliberately never supplies
 * `profileSubjectPosition` (`stories-service.interface.ts:105`: "deliberately NOT supplied").
 * The fix supplies it — using the story's own author as the subject, the same relationship
 * `getStoriesByAuthorWithPoints` already computes for the profile's mirror-image surface — so
 * `QuotedPointCard`'s EXISTING author-header gate (`point.profileSubjectPosition && (...)`,
 * `quoted-point-card.tsx:132`) renders it. No component change is required for that half.
 *
 * TWO LEVELS OF ASSERTION, on purpose:
 *
 *   1. SERVICE LEVEL (the actual defect, EXPECTED RED). `getPointsForStories` is the ONLY
 *      place §4's fix can land — `feed-story-card.tsx:387-394` forwards `point={point}`
 *      unmodified, so whatever `PointSummary` the service returns is exactly what
 *      `QuotedPointCard` renders from. Mocking `supabase.from` directly (not `pointsService`,
 *      which is left as its REAL implementation) binds the service's OBSERVABLE CONTRACT
 *      rather than a guess about which internal helper the fix calls, or how many times.
 *      `story_points.author_id` already exists as a column (see
 *      `supabase/migrations/20260301120000_story_points_author_unique.sql`), so the minimal
 *      fix is to select it alongside the existing columns and look up each story's author's
 *      position — this test's `story_points` fixture includes `author_id` per row for
 *      exactly that reason.
 *
 *   2. COMPONENT LEVEL (already GREEN today — a contract guard, not the defect). Per the
 *      test-writing brief: `QuotedPointCard` must render the stance row when given
 *      `profileSubjectPosition` and render none when it is null or undefined (both are
 *      "no chip" — `StoryWithAuthor.authorPositionOnPoint`,
 *      `src/app/types/index.ts:1134-1145`, states the same null/undefined distinction for the
 *      sibling field). `QuotedPointCard`'s gate (`point.profileSubjectPosition && (...)`) is
 *      already correct in isolation — the leak is entirely on the DATA side. These tests are
 *      included because the test-writing brief calls for them explicitly and because they
 *      pin the contract the service-level fix must feed correctly; they are not expected to
 *      go red, and this file's report says so rather than mislabelling them.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { StoriesService } from '@/app/data/stories-service.interface';
import { QuotedPointCard } from '@/app/components/shared/quoted-point-card';
import type { PointSummary } from '@/app/types';

// ─── Service-level fixture: supabase mocked directly; pointsService is its REAL
// implementation, run against the same mock, so the test binds behaviour and not a
// particular internal call shape. ─────────────────────────────────────────────────────────

const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

vi.mock('@/app/data/points-service', async () => {
  const real = await import('@/app/data/points-service-real');
  return { pointsService: real.realPointsService };
});

const POINT_ID = 'point-1';
const STORY_AGREES = 'story-agrees';
const STORY_NO_POSITION = 'story-no-position';
const AUTHOR_AGREES = 'author-agrees';
const AUTHOR_NO_POSITION = 'author-no-position';

const POINT_ROW = {
  id: POINT_ID,
  statement: 'Concentration of capability is the governance problem.',
  tags: [],
  system_tags: [],
  created_at: '2026-09-01T00:00:00Z',
  visibility: 'public',
  superseded_by: null,
};

const STORY_POINT_ROWS = [
  { story_id: STORY_AGREES, point_id: POINT_ID, author_id: AUTHOR_AGREES, point: POINT_ROW },
  { story_id: STORY_NO_POSITION, point_id: POINT_ID, author_id: AUTHOR_NO_POSITION, point: POINT_ROW },
];

/** Keyed by the `user_id` a `point_positions` query filters on — drives BOTH possible query
 *  shapes below regardless of how many times, or in what grouping, the fix issues them. */
const POSITIONS_BY_USER: Record<string, Array<{ id: string; point_id: string; user_id: string; position: string; created_at: string; updated_at: string }>> = {
  [AUTHOR_AGREES]: [{
    id: 'pp-1', point_id: POINT_ID, user_id: AUTHOR_AGREES,
    position: 'agree', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
  }],
  [AUTHOR_NO_POSITION]: [],
};

/** The column list `getPointsForStories` actually asked `story_points` for. */
let selectedColumns = '';

function mockSupabaseTables() {
  selectedColumns = '';
  mockFrom.mockImplementation((table: string) => {
    if (table === 'story_points') {
      // stories-service-real.ts getPointsForStories — no further chain after `.in()`.
      //
      // P1270 — `selectedColumns` EXISTS BECAUSE THIS MOCK MASKED A REAL BUG. It returned
      // `author_id` on every row no matter what the SELECT asked for, so the test passed
      // green while the production query never requested the column at all: the fix had been
      // applied to `getStoriesByAuthorWithPoints`, a DIFFERENT function whose SELECT block is
      // byte-identical. A green run proved the mapping logic and said nothing about whether
      // the data would ever arrive (epistemic gate 7b — the fixture cannot emit the failure).
      // Caught by adversarial review of the diff, not by this suite.
      return {
        select: vi.fn((cols: string) => {
          selectedColumns = cols;
          return {
            in: vi.fn().mockResolvedValue({ data: STORY_POINT_ROWS, error: null }),
          };
        }),
      };
    }
    if (table === 'point_positions') {
      // Supports the THREE shapes the real code uses against this table:
      //   getPositionCountsForPoints:  .select(...).in('point_id', ids)                      [awaited directly]
      //   getMyPositionsForPoints:     .select(...).in('point_id', ids).eq('user_id', X)     [awaited via .eq]
      //   fetchAuthorPositions (§4):   .select(...).in('point_id', ids).in('user_id', [...]) [awaited via .in]
      //
      // The third arm was added when §4 landed. The builder previously terminated after ONE
      // `.in()`, so a second one threw "is not a function" — a limit of this stub, not a
      // defect in the query: `.in().in()` is ordinary PostgREST and returns the cross product
      // of both filters, which is exactly what `fetchAuthorPositions` keys on the pair for.
      // Only the harness changed here; no assertion was touched.
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn((_field: string, pointIds: string[]) => {
          const countsShapeResult = pointIds.flatMap((pid) =>
            Object.values(POSITIONS_BY_USER).flat().filter((p) => p.point_id === pid)
              .map((p) => ({ point_id: p.point_id, position: p.position }))
          );
          const chain: PromiseLike<{ data: unknown; error: null }> & {
            eq: (field: string, val: string) => Promise<{ data: unknown; error: null }>;
            in: (field: string, vals: string[]) => Promise<{ data: unknown; error: null }>;
          } = Object.assign(Promise.resolve({ data: countsShapeResult, error: null }), {
            eq: (_f: string, userId: string) =>
              Promise.resolve({ data: POSITIONS_BY_USER[userId] ?? [], error: null }),
            in: (_f: string, userIds: string[]) =>
              Promise.resolve({
                data: userIds.flatMap((uid) =>
                  (POSITIONS_BY_USER[uid] ?? [])
                    .filter((row) => pointIds.includes(row.point_id))
                    .map((row) => ({ point_id: row.point_id, user_id: row.user_id, position: row.position }))
                ),
                error: null,
              }),
          });
          return chain;
        }),
      };
    }
    return {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
  });
}

let realStoriesService: StoriesService;

beforeEach(async () => {
  vi.clearAllMocks();
  mockSupabaseTables();
  const module = await import('@/app/data/stories-service-real');
  realStoriesService = module.realStoriesService;
});

describe('P1270 §4 — getPointsForStories supplies the story author\'s stance', () => {
  it('populates profileSubjectPosition with the story author\'s recorded position', async () => {
    const result = await realStoriesService.getPointsForStories([STORY_AGREES, STORY_NO_POSITION]);

    const pointsForAgreesStory = result.get(STORY_AGREES);
    expect(pointsForAgreesStory?.[0]).toBeTruthy();
    expect(
      pointsForAgreesStory?.[0].profileSubjectPosition,
      'stories-service.interface.ts:105 says this is "deliberately NOT supplied" today — §4 supplies it',
    ).toBe('agree');
  });

  /**
   * THE ASSERTION THAT WOULD HAVE CAUGHT THE REAL BUG, added after adversarial review found
   * it. The mapping test above is necessary and insufficient: it proves the service uses
   * `author_id` correctly once it has it, and is completely silent on whether the query ever
   * requests it. Those are two different failures and only one of them was covered.
   */
  it('actually REQUESTS author_id from story_points — not just uses it', async () => {
    await realStoriesService.getPointsForStories([STORY_AGREES]);
    expect(
      selectedColumns,
      'getPointsForStories must select author_id. The identical SELECT block in ' +
        'getStoriesByAuthorWithPoints is why this needs asserting: a fix applied to the wrong ' +
        'one is invisible to every other test in this file.',
    ).toContain('author_id');
  });

  it('leaves profileSubjectPosition falsy for a story whose author holds no position on the point', async () => {
    const result = await realStoriesService.getPointsForStories([STORY_AGREES, STORY_NO_POSITION]);

    const pointsForNoPositionStory = result.get(STORY_NO_POSITION);
    expect(pointsForNoPositionStory?.[0]).toBeTruthy();
    // null and undefined are BOTH "no chip" (StoryWithAuthor.authorPositionOnPoint,
    // src/app/types/index.ts:1134-1145) — never publish a stance nobody took.
    expect(pointsForNoPositionStory?.[0].profileSubjectPosition).toBeFalsy();
  });
});

// ─── Component-level contract guard — already GREEN, see file header. ─────────────────────

function basePoint(overrides: Partial<PointSummary> = {}): PointSummary {
  return {
    id: POINT_ID,
    statement: 'Concentration of capability is the governance problem.',
    tags: [],
    systemTags: [],
    visibility: 'public',
    ...overrides,
  };
}

function renderCard(point: PointSummary) {
  return render(
    <MemoryRouter>
      <QuotedPointCard
        point={point}
        authorId={AUTHOR_AGREES}
        authorName="Jane Doe"
        authorHasPledged={false}
      />
    </MemoryRouter>
  );
}

beforeEach(() => cleanup());

describe('P1270 §4 — QuotedPointCard author-header contract (already correct in isolation)', () => {
  it('renders the stance row when profileSubjectPosition is set', () => {
    renderCard(basePoint({ profileSubjectPosition: 'agree' }));
    expect(screen.getByText('Jane Doe')).toBeTruthy();
    // PositionBadge's short label for 'agree' — see PositionBadge.tsx POSITION_SHORT_LABELS.
    expect(screen.getByText('Agrees')).toBeTruthy();
  });

  it.each([
    ['a fetched-but-absent position (null)', null],
    ['a never-fetched position (undefined)', undefined],
  ])('renders no stance row for %s', (_label, profileSubjectPosition) => {
    renderCard(basePoint({ profileSubjectPosition }));
    expect(screen.queryByText('Jane Doe')).toBeNull();
    expect(screen.queryByText('Agrees')).toBeNull();
  });
});
