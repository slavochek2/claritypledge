import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PointsService } from '@/app/data/points-service.interface';

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

describe('realPointsService', () => {
  let realPointsService: PointsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('@/app/data/points-service-real');
    realPointsService = module.realPointsService;
  });

  // ===========================================================================
  // CREATE
  // ===========================================================================

  describe('createPoint', () => {
    it('creates point using authenticated user', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'point-1',
              statement: 'AI will replace most jobs',
              context: 'In the next 10 years',
              first_validator_id: 'user-1',
              created_at: '2026-02-01T00:00:00Z',
              updated_at: '2026-02-01T00:00:00Z',
              tags: ['ai', 'work'],
            },
            error: null,
          }),
        }),
      });

      const result = await realPointsService.createPoint('AI will replace most jobs', 'In the next 10 years', ['ai', 'work']);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('point-1');
      expect(result?.statement).toBe('AI will replace most jobs');
      expect(result?.firstValidatorId).toBe('user-1');
      expect(result?.context).toBe('In the next 10 years');
    });

    it('returns null when not authenticated', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const result = await realPointsService.createPoint('Some statement');

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // READ - Points
  // ===========================================================================

  describe('getPoint', () => {
    it('returns point with creator info', async () => {
      const mockDbPoint = {
        id: 'point-1',
        statement: 'Test statement',
        context: null,
        first_validator_id: 'user-1',
        created_at: '2026-02-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
        tags: ['test'],
        creator: {
          id: 'user-1',
          name: 'Jane Doe',
          slug: 'jane-doe',
          avatar_color: '#10B981',
          avatar_url: null,
        },
      };

      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockDbPoint, error: null }),
        }),
      });

      const result = await realPointsService.getPoint('point-1');

      expect(result).not.toBeNull();
      expect(result?.creatorName).toBe('Jane Doe');
      expect(result?.creatorSlug).toBe('jane-doe');
      expect(result?.statement).toBe('Test statement');
    });

    it('returns null for non-existent point', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        }),
      });

      const result = await realPointsService.getPoint('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getPointsByValidator', () => {
    it('returns points created by user', async () => {
      const mockPoints = [
        {
          id: 'point-1',
          statement: 'Statement 1',
          context: null,
          first_validator_id: 'user-1',
          created_at: '2026-02-01T00:00:00Z',
          updated_at: '2026-02-01T00:00:00Z',
          tags: [],
          creator: { id: 'user-1', name: 'Creator', slug: 'creator', avatar_color: '#3B82F6', avatar_url: null },
        },
      ];

      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockPoints, error: null }),
        }),
      });

      const result = await realPointsService.getPointsByValidator('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].statement).toBe('Statement 1');
    });

    it('returns empty array on error', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
        }),
      });

      const result = await realPointsService.getPointsByValidator('user-1');

      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // READ - Positions
  // ===========================================================================

  describe('getPositionCounts', () => {
    it('returns correct counts per position type', async () => {
      const mockPositions = [
        { position: 'agree' },
        { position: 'agree' },
        { position: 'disagree' },
        { position: 'strongly_agree' },
      ];

      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: mockPositions, error: null }),
      });

      const result = await realPointsService.getPositionCounts('point-1');

      expect(result.agree).toBe(2);
      expect(result.disagree).toBe(1);
      expect(result.strongly_agree).toBe(1);
      expect(result.unsure).toBe(0);
      expect(result.strongly_disagree).toBe(0);
    });

    it('returns empty counts on error', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
      });

      const result = await realPointsService.getPositionCounts('point-1');

      expect(result.agree).toBe(0);
      expect(result.disagree).toBe(0);
    });
  });

  describe('getMyPosition', () => {
    it('returns user position on point', async () => {
      const mockPosition = {
        id: 'pos-1',
        point_id: 'point-1',
        user_id: 'user-1',
        position: 'agree',
        reasoning: 'I agree because...',
        created_at: '2026-02-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
      };

      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockPosition, error: null }),
          }),
        }),
      });

      const result = await realPointsService.getMyPosition('point-1', 'user-1');

      expect(result).not.toBeNull();
      expect(result?.position).toBe('agree');
      expect(result?.reasoning).toBe('I agree because...');
    });

    it('returns null when no position taken', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
          }),
        }),
      });

      const result = await realPointsService.getMyPosition('point-1', 'user-1');

      expect(result).toBeNull();
    });
  });

  describe('getPositionsForPoint', () => {
    it('returns positions with user profiles', async () => {
      const mockPositions = [
        {
          id: 'pos-1',
          point_id: 'point-1',
          user_id: 'user-1',
          position: 'agree',
          reasoning: null,
          created_at: '2026-02-01T00:00:00Z',
          updated_at: '2026-02-01T00:00:00Z',
          user: { id: 'user-1', name: 'User One', slug: 'user-one', avatar_color: '#3B82F6', avatar_url: null },
        },
      ];

      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockPositions, error: null }),
        }),
      });

      const result = await realPointsService.getPositionsForPoint('point-1');

      expect(result).toHaveLength(1);
      expect(result[0].userName).toBe('User One');
      expect(result[0].position).toBe('agree');
    });
  });

  describe('getPositionHistory', () => {
    it('returns history sorted by changed_at descending', async () => {
      const mockHistory = [
        {
          id: 'hist-2',
          point_id: 'point-1',
          user_id: 'user-1',
          position: 'strongly_agree',
          reasoning: null,
          session_id: null,
          changed_at: '2026-02-02T00:00:00Z',
        },
        {
          id: 'hist-1',
          point_id: 'point-1',
          user_id: 'user-1',
          position: 'agree',
          reasoning: 'Initially agreed',
          session_id: null,
          changed_at: '2026-02-01T00:00:00Z',
        },
      ];

      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: mockHistory, error: null }),
          }),
        }),
      });

      const result = await realPointsService.getPositionHistory('point-1', 'user-1');

      expect(result).toHaveLength(2);
      expect(result[0].position).toBe('strongly_agree');
      expect(result[1].position).toBe('agree');
    });
  });

  // ===========================================================================
  // MUTATIONS
  // ===========================================================================

  describe('setPosition', () => {
    it('upserts position successfully', async () => {
      // Mock UPDATE attempt (succeeds and finds rows)
      mockUpdate.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({
              data: [{ point_id: 'point-1', user_id: 'user-1', position: 'agree' }],
              error: null
            }),
          }),
        }),
      });

      const result = await realPointsService.setPosition('point-1', 'user-1', 'agree', 'I think so');

      expect(result).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith('point_positions');
    });

    it('returns false on error', async () => {
      // Mock UPDATE attempt (finds no rows) - will fall back to INSERT
      mockUpdate.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({
              data: [],
              error: null
            }),
          }),
        }),
      });

      // Mock INSERT attempt (also fails) - both must fail for setPosition to return false
      mockInsert.mockResolvedValue({ error: { message: 'RLS violation' } });

      const result = await realPointsService.setPosition('point-1', 'user-1', 'agree');

      expect(result).toBe(false);
    });
  });

  describe('removePosition', () => {
    it('deletes position successfully', async () => {
      mockDelete.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const result = await realPointsService.removePosition('point-1', 'user-1');

      expect(result).toBe(true);
    });

    it('returns false on error', async () => {
      mockDelete.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: { message: 'DB error' } }),
        }),
      });

      const result = await realPointsService.removePosition('point-1', 'user-1');

      expect(result).toBe(false);
    });
  });
});
