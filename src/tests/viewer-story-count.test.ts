/**
 * @file viewer-story-count.test.ts
 * @description Unit tests for P465: getViewerStoryCountsForPoints — the secondary
 * batch query that fetches how many stories the viewer has linked to each point
 * on another person's profile.
 *
 * P465 adds `getViewerStoryCountsForPoints(viewerId, pointIds)` (and a parallel
 * `getViewerStoryIdsForPoints`) to `StoriesService`. This resolves the bug where
 * `viewerStoryCount` was always 0 on other-profile surfaces because the viewer's
 * stories were never fetched (P134/P151 upstream pre-filters to profile-owner stories only).
 *
 * CONTRACT for `getViewerStoryCountsForPoints`:
 *   - Returns a `Map<pointId, count>` where count is the number of stories authored
 *     by `viewerId` that are linked to each pointId.
 *   - For pointIds with no viewer story, returns 0 (key present, value 0) or omits
 *     the key (caller must treat missing key as 0).
 *   - Returns an empty Map when pointIds array is empty.
 *   - Does NOT make a query when viewerId equals profileOwnerId (own profile — not needed).
 *
 * CONTRACT for `getViewerStoryIdsForPoints`:
 *   - Returns a `Map<pointId, storyId>` — the viewer's story ID per point.
 *   - Used for edit-mode navigation on own-profile (edit icon → /chat?...&storyId=Y).
 *   - Returns empty Map when no viewer stories exist for the given points.
 *
 * These tests use a Supabase client mock to avoid DB dependency.
 * For real DB round-trip tests see `stories-service-real.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockSelect = vi.fn();
const _mockEq = vi.fn();
const _mockIn = vi.fn();

const mockFrom = vi.fn(() => ({
  select: mockSelect,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}));

// ─── Service under test ───────────────────────────────────────────────────────
// NOTE: update this import path after implementation if the method lands on a
// different module (e.g. a standalone file, not the existing stories-service-real).

import type { StoriesService } from '@/app/data/stories-service.interface';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeChainMock(resolvedValue: { data: unknown; error: unknown }) {
  // Chainable mock: from().select().eq().in() etc. resolve with given value
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue(resolvedValue),
  };
  return chain;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// TODO P465: remove .skip when implementation lands in StoriesService
describe.skip('getViewerStoryCountsForPoints', () => {
  let storiesService: StoriesService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('@/app/data/stories-service-real');
    storiesService = module.realStoriesService;
  });

  describe('empty inputs', () => {
    it('returns an empty Map when pointIds array is empty', async () => {
      const result = await storiesService.getViewerStoryCountsForPoints('viewer-1', []);
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      // No DB query should be made for empty pointIds
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('returns an empty Map when viewerId is falsy', async () => {
      const result = await storiesService.getViewerStoryCountsForPoints('', ['point-1']);
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
  });

  describe('viewer has no stories on any of the given points', () => {
    it('returns a Map with 0 counts (or empty Map) when query returns empty data', async () => {
      // Mock the Supabase call to return empty result
      const chain = makeChainMock({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await storiesService.getViewerStoryCountsForPoints(
        'viewer-id-1',
        ['point-id-1', 'point-id-2']
      );

      expect(result).toBeInstanceOf(Map);
      // Either 0 entries or entries with value 0 — caller treats missing key as 0
      for (const count of result.values()) {
        expect(count).toBe(0);
      }
    });
  });

  describe('viewer has stories on some points', () => {
    it('returns correct count for a single point with one story', async () => {
      // Simulate DB returning one story_point row for the viewer
      const chain = makeChainMock({
        data: [{ point_id: 'point-A', story_id: 'story-1' }],
        error: null,
      });
      mockFrom.mockReturnValue(chain);

      const result = await storiesService.getViewerStoryCountsForPoints(
        'viewer-id-1',
        ['point-A', 'point-B']
      );

      expect(result.get('point-A')).toBe(1);
      // point-B has no story — either absent or 0
      expect(result.get('point-B') ?? 0).toBe(0);
    });

    it('returns correct counts when viewer has stories on multiple points', async () => {
      // Multiple story-point rows for the same viewer across different points
      const chain = makeChainMock({
        data: [
          { point_id: 'point-A', story_id: 'story-1' },
          { point_id: 'point-B', story_id: 'story-2' },
          { point_id: 'point-C', story_id: 'story-3' },
        ],
        error: null,
      });
      mockFrom.mockReturnValue(chain);

      const result = await storiesService.getViewerStoryCountsForPoints(
        'viewer-id-1',
        ['point-A', 'point-B', 'point-C', 'point-D']
      );

      expect(result.get('point-A')).toBe(1);
      expect(result.get('point-B')).toBe(1);
      expect(result.get('point-C')).toBe(1);
      expect(result.get('point-D') ?? 0).toBe(0);
    });

    it('handles multiple rows for the same point (defensive — constraint prevents this in prod)', async () => {
      // The UNIQUE(author_id, point_id) constraint prevents this in prod,
      // but the Map aggregation must be robust if old data exists.
      const chain = makeChainMock({
        data: [
          { point_id: 'point-A', story_id: 'story-1' },
          { point_id: 'point-A', story_id: 'story-2' },
        ],
        error: null,
      });
      mockFrom.mockReturnValue(chain);

      const result = await storiesService.getViewerStoryCountsForPoints(
        'viewer-id-1',
        ['point-A']
      );

      // If rows exist (pre-migration data), count should be >=1 and not crash
      const count = result.get('point-A') ?? 0;
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('error handling', () => {
    it('returns empty Map (does not throw) when Supabase returns an error', async () => {
      const chain = makeChainMock({
        data: null,
        error: { message: 'connection timeout', code: 'PGRST301' },
      });
      mockFrom.mockReturnValue(chain);

      // Should not throw — graceful degradation shows CTA (treats count as 0)
      const result = await storiesService.getViewerStoryCountsForPoints(
        'viewer-id-1',
        ['point-A']
      );

      expect(result).toBeInstanceOf(Map);
      // On error, treat as empty (CTA shows rather than hiding incorrectly)
      expect(result.get('point-A') ?? 0).toBe(0);
    });
  });
});

// ─── getViewerStoryIdsForPoints ───────────────────────────────────────────────

describe.skip('getViewerStoryIdsForPoints', () => {
  let storiesService: StoriesService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('@/app/data/stories-service-real');
    storiesService = module.realStoriesService;
  });

  describe('empty inputs', () => {
    it('returns an empty Map when pointIds array is empty', async () => {
      const result = await storiesService.getViewerStoryIdsForPoints('viewer-1', []);
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
  });

  describe('viewer has stories on some points', () => {
    it('returns the story ID for a point where the viewer has a story', async () => {
      const chain = makeChainMock({
        data: [{ point_id: 'point-A', story_id: 'story-X' }],
        error: null,
      });
      mockFrom.mockReturnValue(chain);

      const result = await storiesService.getViewerStoryIdsForPoints(
        'viewer-id-1',
        ['point-A']
      );

      expect(result.get('point-A')).toBe('story-X');
    });

    it('returns story IDs for all points where the viewer has a story', async () => {
      const chain = makeChainMock({
        data: [
          { point_id: 'point-A', story_id: 'story-1' },
          { point_id: 'point-B', story_id: 'story-2' },
        ],
        error: null,
      });
      mockFrom.mockReturnValue(chain);

      const result = await storiesService.getViewerStoryIdsForPoints(
        'viewer-id-1',
        ['point-A', 'point-B', 'point-C']
      );

      expect(result.get('point-A')).toBe('story-1');
      expect(result.get('point-B')).toBe('story-2');
      expect(result.has('point-C')).toBe(false); // no story for this point
    });
  });

  describe('error handling', () => {
    it('returns empty Map without throwing when Supabase errors', async () => {
      const chain = makeChainMock({
        data: null,
        error: { message: 'network error' },
      });
      mockFrom.mockReturnValue(chain);

      const result = await storiesService.getViewerStoryIdsForPoints(
        'viewer-id-1',
        ['point-A']
      );

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
  });
});

// ─── getStoryByUserAndPoint ────────────────────────────────────────────────────

describe.skip('getStoryByUserAndPoint', () => {
  let storiesService: StoriesService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('@/app/data/stories-service-real');
    storiesService = module.realStoriesService;
  });

  it('returns the story when the user has one story linked to the given point', async () => {
    const mockStory = {
      id: 'story-123',
      author_id: 'user-1',
      title: 'My take',
      content: 'Story content here.',
      visibility: 'public',
      tags: [],
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-01T00:00:00Z',
    };

    const singleMock = vi.fn().mockResolvedValue({ data: mockStory, error: null });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: singleMock,
    };
    mockFrom.mockReturnValue(chain);

    const result = await storiesService.getStoryByUserAndPoint('user-1', 'point-1');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('story-123');
  });

  it('returns null when the user has no story for the given point', async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: singleMock,
    };
    mockFrom.mockReturnValue(chain);

    const result = await storiesService.getStoryByUserAndPoint('user-1', 'point-1');

    expect(result).toBeNull();
  });

  it('returns null without throwing when Supabase returns an unexpected error', async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: null, error: { message: 'timeout' } });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: singleMock,
    };
    mockFrom.mockReturnValue(chain);

    const result = await storiesService.getStoryByUserAndPoint('user-1', 'point-1');
    expect(result).toBeNull();
  });
});
