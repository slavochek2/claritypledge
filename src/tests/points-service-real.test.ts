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
              first_validator_id: 'user-1',
              created_at: '2026-02-01T00:00:00Z',
              updated_at: '2026-02-01T00:00:00Z',
              tags: ['ai', 'work'],
            },
            error: null,
          }),
        }),
      });

      // P1095: createPoint no longer takes a context argument — tags moved to position 2.
      const result = await realPointsService.createPoint('AI will replace most jobs', ['ai', 'work']);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('point-1');
      expect(result?.statement).toBe('AI will replace most jobs');
      expect(result?.firstValidatorId).toBe('user-1');
      expect(result?.tags).toEqual(['ai', 'work']);
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
          first_validator_id: 'user-1',
          created_at: '2026-02-01T00:00:00Z',
          updated_at: '2026-02-01T00:00:00Z',
          tags: [],
          creator: { id: 'user-1', name: 'Creator', slug: 'creator', avatar_color: '#3B82F6', avatar_url: null },
        },
      ];

      // P634: chain is now .eq('first_validator_id').eq('visibility','public').order()
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockPoints, error: null }),
          }),
        }),
      });

      const result = await realPointsService.getPointsByValidator('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].statement).toBe('Statement 1');
    });

    it('returns empty array on error', async () => {
      // P634: chain is now .eq('first_validator_id').eq('visibility','public').order()
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
          }),
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
            limit: vi.fn().mockResolvedValue({ data: [mockPosition], error: null }),
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
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
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
      // Mock upsert (succeeds)
      mockUpsert.mockResolvedValue({
        data: { point_id: 'point-1', user_id: 'user-1', position: 'agree' },
        error: null
      });

      await realPointsService.setPosition('point-1', 'user-1', 'agree', 'I think so');

      expect(mockFrom).toHaveBeenCalledWith('point_positions');
      expect(mockUpsert).toHaveBeenCalledWith(
        {
          point_id: 'point-1',
          user_id: 'user-1',
          position: 'agree',
          reasoning: 'I think so',
        },
        {
          onConflict: 'point_id,user_id',
        }
      );
    });

    it('throws on error (e.g. RLS violation)', async () => {
      // Mock upsert (fails with RLS violation)
      mockUpsert.mockResolvedValue({
        data: null,
        error: { message: 'RLS violation' }
      });

      await expect(
        realPointsService.setPosition('point-1', 'user-1', 'agree')
      ).rejects.toThrow('setPosition failed: RLS violation');
    });
  });

  describe('removePosition', () => {
    it('deletes position successfully', async () => {
      mockDelete.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      await realPointsService.removePosition('point-1', 'user-1');
    });

    it('throws on error', async () => {
      mockDelete.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: { message: 'DB error' } }),
        }),
      });

      await expect(
        realPointsService.removePosition('point-1', 'user-1')
      ).rejects.toThrow('removePosition failed: DB error');
    });
  });

  // ===========================================================================
  // P402: Points tab wrong query — getPointsForProfileDisplay & getPointsWithUserPositions
  // ===========================================================================

  describe('getPointsForProfileDisplay — P402 correctness', () => {
    /**
     * Core invariant: the profile Points tab must show points the user has POSITIONS on,
     * not points they CREATED. Before P402 fix, getPointsForProfileDisplay called
     * getPointsByValidator (first_validator_id filter) instead of querying point_positions.
     */

    it('returns points where user HAS a position, not just points they created', async () => {
      const CREATOR_ID = 'creator-user';
      const POSITIONER_ID = 'positioner-user';

      // point_positions: positioner has a position on point-99 (created by someone else)
      const mockPositionRows = [{ point_id: 'point-99' }];

      // points: the actual point row (created by creator-user)
      const mockPointRows = [
        {
          id: 'point-99',
          statement: 'Point created by someone else',
          first_validator_id: CREATOR_ID,
          created_at: '2026-02-01T00:00:00Z',
          updated_at: '2026-02-01T00:00:00Z',
          tags: [],
          creator: {
            id: CREATOR_ID,
            name: 'Creator',
            slug: 'creator',
            avatar_color: '#3B82F6',
            avatar_url: null,
          },
        },
      ];

      // Call 1: point_positions WHERE user_id = positioner
      mockSelect
        .mockReturnValueOnce({
          eq: vi.fn().mockResolvedValue({ data: mockPositionRows, error: null }),
        })
        // Call 2: points IN (point-ids) with creator join + visibility filter (no viewer)
        .mockReturnValueOnce({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockPointRows, error: null }),
            }),
          }),
        })
        // Call 3: getPositionCountsForPoints — point_positions WHERE point_id IN (...)
        .mockReturnValueOnce({
          in: vi.fn().mockResolvedValue({ data: [{ point_id: 'point-99', position: 'agree' }], error: null }),
        })
        // Call 4: getMyPositionsForPoints for viewer/subject — same point_positions query
        .mockReturnValueOnce({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'pos-1',
                  point_id: 'point-99',
                  user_id: POSITIONER_ID,
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

      const result = await realPointsService.getPointsForProfileDisplay(POSITIONER_ID);

      // The point created by CREATOR_ID must appear in POSITIONER_ID's tab
      // because POSITIONER_ID holds a position on it
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('point-99');
      expect(result[0].statement).toBe('Point created by someone else');
      // firstValidatorId is the creator — NOT the positioner
      expect(result[0].firstValidatorId).toBe(CREATOR_ID);
    });

    it('returns empty when user has no positions even if they created points', async () => {
      const USER_ID = 'creator-only-user';

      // point_positions: no rows — user has no positions
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      });

      const result = await realPointsService.getPointsForProfileDisplay(USER_ID);

      // Must return empty — user created points but has no positions on any
      expect(result).toEqual([]);
      // Only one query should be made (the point_positions check — early return)
      expect(mockSelect).toHaveBeenCalledTimes(1);
    });

    it('populates profileSubjectPosition from the profile owner\'s position', async () => {
      const SUBJECT_ID = 'profile-subject';
      const VIEWER_ID = 'another-viewer';

      const mockPositionRows = [{ point_id: 'point-A' }];
      const mockPointRows = [
        {
          id: 'point-A',
          statement: 'Subject took a position on this',
          first_validator_id: 'some-creator',
          created_at: '2026-02-01T00:00:00Z',
          updated_at: '2026-02-01T00:00:00Z',
          tags: [],
          creator: {
            id: 'some-creator',
            name: 'Some Creator',
            slug: 'some-creator',
            avatar_color: '#3B82F6',
            avatar_url: null,
          },
        },
      ];

      // Call 1: point_positions for subject
      mockSelect
        .mockReturnValueOnce({
          eq: vi.fn().mockResolvedValue({ data: mockPositionRows, error: null }),
        })
        // Call 2: points fetch + visibility filter (viewer !== subject)
        .mockReturnValueOnce({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockPointRows, error: null }),
            }),
          }),
        })
        // Call 3: getPositionCountsForPoints
        .mockReturnValueOnce({
          in: vi.fn().mockResolvedValue({
            data: [{ point_id: 'point-A', position: 'disagree' }],
            error: null,
          }),
        })
        // Call 4: getMyPositionsForPoints for viewer (viewerIsSubject=false)
        .mockReturnValueOnce({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        })
        // Call 5: getMyPositionsForPoints for subject (always fetch)
        .mockReturnValueOnce({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'pos-subject',
                  point_id: 'point-A',
                  user_id: SUBJECT_ID,
                  position: 'disagree',
                  reasoning: null,
                  created_at: '2026-02-01T00:00:00Z',
                  updated_at: '2026-02-01T00:00:00Z',
                },
              ],
              error: null,
            }),
          }),
        });

      const result = await realPointsService.getPointsForProfileDisplay(SUBJECT_ID, VIEWER_ID);

      expect(result).toHaveLength(1);
      // profileSubjectPosition must reflect the profile owner's actual position
      expect(result[0].profileSubjectPosition).toBeDefined();
      expect(result[0].profileSubjectPosition?.position).toBe('disagree');
      // Viewer has no position — userPosition should be undefined
      expect(result[0].userPosition).toBeUndefined();
    });

    it('sets userPosition = profileSubjectPosition when viewer is the profile subject (self-view)', async () => {
      const USER_ID = 'self-viewing-user';

      const mockPositionRows = [{ point_id: 'point-B' }];
      const mockPointRows = [
        {
          id: 'point-B',
          statement: 'My position on this',
          first_validator_id: 'other-creator',
          created_at: '2026-02-01T00:00:00Z',
          updated_at: '2026-02-01T00:00:00Z',
          tags: [],
          creator: {
            id: 'other-creator',
            name: 'Other Creator',
            slug: 'other-creator',
            avatar_color: '#10B981',
            avatar_url: null,
          },
        },
      ];

      const myPositionData = [
        {
          id: 'pos-self',
          point_id: 'point-B',
          user_id: USER_ID,
          position: 'strongly_agree',
          reasoning: 'Very confident',
          created_at: '2026-02-01T00:00:00Z',
          updated_at: '2026-02-01T00:00:00Z',
        },
      ];

      // Call 1: point_positions for user
      mockSelect
        .mockReturnValueOnce({
          eq: vi.fn().mockResolvedValue({ data: mockPositionRows, error: null }),
        })
        // Call 2: points fetch — P634: always includes .eq('visibility','public') even for self-view
        .mockReturnValueOnce({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockPointRows, error: null }),
            }),
          }),
        })
        // Call 3: getPositionCountsForPoints
        .mockReturnValueOnce({
          in: vi.fn().mockResolvedValue({
            data: [{ point_id: 'point-B', position: 'strongly_agree' }],
            error: null,
          }),
        })
        // Call 4: getMyPositionsForPoints for subject (viewerIsSubject=true, no viewer query)
        .mockReturnValueOnce({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: myPositionData, error: null }),
          }),
        });

      // Self-view: viewerUserId === validatorId
      const result = await realPointsService.getPointsForProfileDisplay(USER_ID, USER_ID);

      expect(result).toHaveLength(1);
      expect(result[0].profileSubjectPosition?.position).toBe('strongly_agree');
      // Self-view: userPosition should equal profileSubjectPosition
      expect(result[0].userPosition?.position).toBe('strongly_agree');
      expect(result[0].userPosition?.id).toBe('pos-self');
    });
  });

  describe('getPointsWithUserPositions — P402 batch query correctness', () => {
    /**
     * Before P402, getPointsWithUserPositions used Promise.all(pointIds.map(...))
     * — one DB round-trip per point (N+1). The fix replaces this with batch queries
     * (same pattern as getPositionCountsForPoints). These tests verify correct results
     * regardless of implementation, and confirm no N+1 by checking mockFrom call count.
     */

    it('returns points created by others that user has positioned on', async () => {
      const USER_ID = 'user-with-positions';

      // point_positions: user positioned on two points they didn't create
      mockSelect
        .mockReturnValueOnce({
          eq: vi.fn().mockResolvedValue({
            data: [{ point_id: 'point-X' }, { point_id: 'point-Y' }],
            error: null,
          }),
        })
        // points fetch for those IDs (P634: in → eq(visibility) → order)
        .mockReturnValueOnce({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'point-X',
                    statement: 'Another user created this X',
                    first_validator_id: 'other-user-1',
                    created_at: '2026-02-01T00:00:00Z',
                    updated_at: '2026-02-01T00:00:00Z',
                    tags: [],
                    creator: {
                      id: 'other-user-1',
                      name: 'Other User 1',
                      slug: 'other-user-1',
                      avatar_color: '#3B82F6',
                      avatar_url: null,
                    },
                  },
                  {
                    id: 'point-Y',
                    statement: 'Another user created this Y',
                    first_validator_id: 'other-user-2',
                    created_at: '2026-02-01T00:00:00Z',
                    updated_at: '2026-02-01T00:00:00Z',
                    tags: [],
                    creator: {
                      id: 'other-user-2',
                      name: 'Other User 2',
                      slug: 'other-user-2',
                      avatar_color: '#10B981',
                      avatar_url: null,
                    },
                  },
                ],
                error: null,
              }),
            }),
          }),
        })
        // getPositionCountsForPoints — all positions for these points
        .mockReturnValueOnce({
          in: vi.fn().mockResolvedValue({
            data: [
              { point_id: 'point-X', position: 'agree' },
              { point_id: 'point-X', position: 'agree' },
              { point_id: 'point-Y', position: 'disagree' },
            ],
            error: null,
          }),
        })
        // getMyPositionsForPoints — user's own positions
        .mockReturnValueOnce({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'pos-X',
                  point_id: 'point-X',
                  user_id: USER_ID,
                  position: 'agree',
                  reasoning: null,
                  created_at: '2026-02-01T00:00:00Z',
                  updated_at: '2026-02-01T00:00:00Z',
                },
                {
                  id: 'pos-Y',
                  point_id: 'point-Y',
                  user_id: USER_ID,
                  position: 'disagree',
                  reasoning: null,
                  created_at: '2026-02-01T00:00:00Z',
                  updated_at: '2026-02-01T00:00:00Z',
                },
              ],
              error: null,
            }),
          }),
        });

      const result = await realPointsService.getPointsWithUserPositions(USER_ID);

      expect(result).toHaveLength(2);
      const pointX = result.find(p => p.id === 'point-X');
      const pointY = result.find(p => p.id === 'point-Y');

      expect(pointX).toBeDefined();
      expect(pointX?.statement).toBe('Another user created this X');
      expect(pointX?.userPosition?.position).toBe('agree');
      expect(pointX?.positionCounts.agree).toBe(2);

      expect(pointY).toBeDefined();
      expect(pointY?.statement).toBe('Another user created this Y');
      expect(pointY?.userPosition?.position).toBe('disagree');
      expect(pointY?.positionCounts.disagree).toBe(1);
    });

    it('returns empty array when user has no positions', async () => {
      const USER_ID = 'user-no-positions';

      // point_positions: no rows
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      });

      const result = await realPointsService.getPointsWithUserPositions(USER_ID);

      expect(result).toEqual([]);
      // Only 1 query should run — no further queries after early return
      expect(mockSelect).toHaveBeenCalledTimes(1);
    });

    it('uses batch queries — mockFrom is not called more than 4 times for N points', async () => {
      /**
       * N+1 detection: with batch queries, total DB round-trips is fixed at 4 regardless
       * of how many points the user has positions on:
       *   1. point_positions WHERE user_id = X  (get pointIds)
       *   2. points WHERE id IN (pointIds)        (fetch point rows)
       *   3. point_positions WHERE point_id IN (...) (counts)
       *   4. point_positions WHERE point_id IN (...) AND user_id = X  (user positions)
       *
       * Before fix: count would be 1 + N×3 (one getPointWithUserPosition per point).
       * After fix: always 4 queries, regardless of N.
       */
      const USER_ID = 'batch-test-user';

      // Simulate 5 positions — N+1 would call mockFrom 1 + 5×3 = 16 times
      const positionRows = Array.from({ length: 5 }, (_, i) => ({ point_id: `point-${i}` }));
      const pointRows = positionRows.map((p, i) => ({
        id: p.point_id,
        statement: `Point ${i}`,
        first_validator_id: 'other-creator',
        created_at: '2026-02-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
        tags: [],
        creator: {
          id: 'other-creator',
          name: 'Creator',
          slug: 'creator',
          avatar_color: '#3B82F6',
          avatar_url: null,
        },
      }));

      mockSelect
        .mockReturnValueOnce({
          eq: vi.fn().mockResolvedValue({ data: positionRows, error: null }),
        })
        .mockReturnValueOnce({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: pointRows, error: null }),
            }),
          }),
        })
        .mockReturnValueOnce({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        })
        .mockReturnValueOnce({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        });

      await realPointsService.getPointsWithUserPositions(USER_ID);

      // With batch queries: mockFrom called at most 4 times (one per query)
      // With N+1 (old code): mockFrom would be called 1 + 5×3 = 16 times
      expect(mockFrom).toHaveBeenCalledTimes(4);
    });
  });

});
