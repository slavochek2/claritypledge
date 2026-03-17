import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PointsService } from '@/app/data/points-service.interface';

/**
 * P543: Hide Zero-Position Points from Listings
 *
 * Core invariant: listing methods (getPublicPointsFeed, getPointsForFeedDisplay,
 * getPointsForProfileDisplay) must exclude points with zero positions.
 * Direct access methods (getPoint, getPointWithCounts) must still return them.
 *
 * Tests verify the filter logic, not the mock wiring — the existing
 * points-service-real.test.ts covers Supabase mock patterns thoroughly.
 */

// Mock Supabase client
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockUpsert = vi.fn();
const mockGetUser = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
  upsert: mockUpsert,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    auth: {
      getUser: () => mockGetUser(),
    },
  },
}));

// Helper: create a mock point row
function mockPointRow(id: string, statement: string, creatorId = 'creator-1') {
  return {
    id,
    statement,
    context: null,
    first_validator_id: creatorId,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    tags: [],
    creator: {
      id: creatorId,
      name: 'Creator',
      slug: 'creator',
      avatar_color: '#3B82F6',
      avatar_url: null,
    },
  };
}

describe('P543: Zero-position point filtering', () => {
  let service: PointsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('@/app/data/points-service-real');
    service = module.realPointsService;
  });

  // ===========================================================================
  // getPublicPointsFeed — must exclude zero-position points
  // ===========================================================================

  describe('getPublicPointsFeed — filters zero-position points', () => {
    it('excludes points with zero positions from results', async () => {
      // Points query returns 3 points
      const allPoints = [
        mockPointRow('point-with-positions', 'Has positions'),
        mockPointRow('point-zero', 'No positions'),
        mockPointRow('point-also-has', 'Also has positions'),
      ];

      // Position counts: point-zero has none
      const allPositions = [
        { point_id: 'point-with-positions', position: 'agree' },
        { point_id: 'point-with-positions', position: 'disagree' },
        { point_id: 'point-also-has', position: 'strongly_agree' },
        // point-zero has NO positions
      ];

      // Mock: points query
      mockSelect
        .mockReturnValueOnce({
          order: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: allPoints, error: null }),
          }),
        })
        // Mock: position counts batch
        .mockReturnValueOnce({
          in: vi.fn().mockResolvedValue({ data: allPositions, error: null }),
        });

      const result = await service.getPublicPointsFeed(10, 0);

      // point-zero should be excluded
      expect(result.every(p => p.id !== 'point-zero')).toBe(true);
      // The other two should remain
      const ids = result.map(p => p.id);
      expect(ids).toContain('point-with-positions');
      expect(ids).toContain('point-also-has');
    });

    it('returns empty array when all points have zero positions', async () => {
      const allPoints = [
        mockPointRow('orphan-1', 'Orphan 1'),
        mockPointRow('orphan-2', 'Orphan 2'),
      ];

      mockSelect
        .mockReturnValueOnce({
          order: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: allPoints, error: null }),
          }),
        })
        .mockReturnValueOnce({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        });

      const result = await service.getPublicPointsFeed(10, 0);

      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // getPointsForProfileDisplay — must exclude zero-position points
  // ===========================================================================

  describe('getPointsForProfileDisplay — filters zero-position points', () => {
    it('excludes points where user has a position but point has zero total positions', async () => {
      // This edge case: user's position was removed by another mechanism,
      // but the initial point_positions query still returned the row.
      // After position counts are fetched, if totalPositions === 0, exclude.

      const USER_ID = 'user-1';

      // Step 1: user has positions on 2 points
      mockSelect
        .mockReturnValueOnce({
          eq: vi.fn().mockResolvedValue({
            data: [{ point_id: 'point-A' }, { point_id: 'point-B' }],
            error: null,
          }),
        })
        // Step 2: fetch point rows
        .mockReturnValueOnce({
          in: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                mockPointRow('point-A', 'Point A'),
                mockPointRow('point-B', 'Point B'),
              ],
              error: null,
            }),
          }),
        })
        // Step 3: position counts — point-B has zero
        .mockReturnValueOnce({
          in: vi.fn().mockResolvedValue({
            data: [
              { point_id: 'point-A', position: 'agree' },
              // point-B has NO positions
            ],
            error: null,
          }),
        })
        // Step 4: getMyPositionsForPoints for subject
        .mockReturnValueOnce({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'pos-A',
                  point_id: 'point-A',
                  user_id: USER_ID,
                  position: 'agree',
                  reasoning: null,
                  created_at: '2026-02-01T00:00:00Z',
                  updated_at: '2026-02-01T00:00:00Z',
                },
              ],
              error: null,
            }),
          }),
        });

      const result = await service.getPointsForProfileDisplay(USER_ID);

      // point-B should be excluded (zero total positions)
      expect(result.every(p => p.id !== 'point-B')).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('point-A');
    });
  });

  // ===========================================================================
  // getPointsFeed — must exclude zero-position points
  // ===========================================================================

  describe('getPointsFeed — filters zero-position points', () => {
    it('excludes points with zero positions', async () => {
      const allPoints = [
        mockPointRow('has-pos', 'Has positions'),
        mockPointRow('no-pos', 'No positions'),
      ];

      mockSelect
        .mockReturnValueOnce({
          order: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: allPoints, error: null }),
          }),
        })
        .mockReturnValueOnce({
          in: vi.fn().mockResolvedValue({
            data: [{ point_id: 'has-pos', position: 'agree' }],
            error: null,
          }),
        });

      const result = await service.getPointsFeed(10, 0);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('has-pos');
    });
  });

  // ===========================================================================
  // Direct access — must NOT filter zero-position points
  // ===========================================================================

  describe('getPoint — does NOT filter zero-position points', () => {
    it('returns a point even with zero positions', async () => {
      const mockDbPoint = mockPointRow('zero-pos-point', 'I have no positions');

      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockDbPoint, error: null }),
        }),
      });

      const result = await service.getPoint('zero-pos-point');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('zero-pos-point');
      expect(result?.statement).toBe('I have no positions');
    });
  });

  describe('getPointWithCounts — does NOT filter zero-position points', () => {
    it('returns a point with all-zero position counts', async () => {
      const mockDbPoint = mockPointRow('zero-pos-point', 'Zero positions');

      // getPoint mock
      mockSelect
        .mockReturnValueOnce({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockDbPoint, error: null }),
          }),
        })
        // getPositionCounts mock — returns empty
        .mockReturnValueOnce({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        });

      const result = await service.getPointWithCounts('zero-pos-point');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('zero-pos-point');
      expect(result?.totalPositions).toBe(0);
      // All position counts should be 0
      expect(result?.positionCounts.agree).toBe(0);
      expect(result?.positionCounts.disagree).toBe(0);
    });
  });

  // ===========================================================================
  // Edge case: position removal causes graveyard transition
  // ===========================================================================

  describe('edge case: last position removed → point disappears from feed', () => {
    it('point with 1 position → remove → next feed load excludes it', async () => {
      // After removePosition, the point has 0 positions.
      // The next getPublicPointsFeed call should exclude it.

      const allPoints = [mockPointRow('was-active', 'Was active, now abandoned')];

      mockSelect
        .mockReturnValueOnce({
          order: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: allPoints, error: null }),
          }),
        })
        // Position counts: none left after removal
        .mockReturnValueOnce({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        });

      const result = await service.getPublicPointsFeed(10, 0);

      // Point should be gone from feed
      expect(result).toEqual([]);
    });
  });
});
