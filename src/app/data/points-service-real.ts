/**
 * @file points-service-real.ts
 * @description P117: Real Supabase points service implementation
 */

import type { PointsService } from './points-service.interface';
import type {
  Point,
  PointWithCreator,
  PointWithCounts,
  PointWithUserPosition,
  PointPosition,
  PointPositionWithUser,
  PointPositionHistory,
  PositionType,
  ContentVisibility,
} from '@/app/types';
import { supabase } from '@/lib/supabase';
import { isSystemTag } from '@/lib/feed-utils';
import { logDbError, throwDbError } from './db-error-logger';
import { earCountOf } from './ear-count';

// Debug logging - only in development
const DEBUG = import.meta.env.DEV;
// eslint-disable-next-line no-console -- gated by DEBUG (import.meta.env.DEV); dev-only diagnostic (P1200)
const log = (...args: unknown[]) => DEBUG && console.log('[points-service-real]', ...args);

// All position types for counting
const ALL_POSITIONS: PositionType[] = [
  'strongly_disagree',
  'disagree',
  'somewhat_disagree',
  'unsure',
  'somewhat_agree',
  'agree',
  'strongly_agree',
];

// Database row type with joined creator profile
interface DbPointWithCreator {
  id: string;
  statement: string;
  /**
   * DEPRECATED — do not write to this. Verified 2026-08-17: no production caller
   * ever sets it (`createPoint` is called from one place, which passes `undefined`),
   * and it renders on the feed card only — the point detail page never shows it.
   * Grounding/context for a point belongs in a linked Story, which renders on both
   * surfaces. Removal tracked in features/p1090_*.md.
   */
  context: string | null;
  first_validator_id: string;
  created_at: string;
  updated_at: string;
  tags: string[];
  system_tags: string[]; // P630
  banner_url?: string | null;
  visibility?: 'public' | 'private';
  superseded_by?: string | null; // P800
  creator: {
    id: string;
    name: string | null;
    slug: string | null;
    avatar_color: string | null;
    avatar_url: string | null;
  } | null;
}

// Database row type for positions with user profile
interface DbPositionWithUser {
  id: string;
  point_id: string;
  user_id: string;
  position: PositionType;
  reasoning: string | null;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    name: string | null;
    slug: string | null;
    avatar_color: string | null;
    avatar_url: string | null;
    ears_count: number | null;
    has_pledged: boolean | null;
  } | null;
}

// Database row type for position history
interface DbPositionHistoryRow {
  id: string;
  point_id: string;
  user_id: string;
  position: PositionType | null;
  reasoning: string | null;
  session_id: string | null;
  changed_at: string;
}

/**
 * Transform database row to PointWithCreator type
 */
function mapPointFromDb(row: DbPointWithCreator): PointWithCreator {
  return {
    id: row.id,
    statement: row.statement,
    context: row.context ?? undefined,
    firstValidatorId: row.first_validator_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags: row.tags || [],
    systemTags: row.system_tags || [],
    bannerUrl: row.banner_url ?? undefined,
    visibility: row.visibility ?? undefined,
    supersededBy: row.superseded_by ?? undefined, // P800
    // Creator info from joined profile
    creatorName: row.creator?.name ?? 'Unknown',
    creatorSlug: row.creator?.slug ?? '',
    creatorAvatarColor: row.creator?.avatar_color ?? '#3B82F6',
    creatorAvatarUrl: row.creator?.avatar_url ?? undefined,
  };
}

/**
 * Transform database row to PointPosition type
 */
function mapPositionFromDb(row: {
  id: string;
  point_id: string;
  user_id: string;
  position: PositionType;
  reasoning: string | null;
  created_at: string;
  updated_at: string;
}): PointPosition {
  return {
    id: row.id,
    pointId: row.point_id,
    userId: row.user_id,
    position: row.position,
    reasoning: row.reasoning ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Transform database row to PointPositionWithUser type
 */
function mapPositionWithUserFromDb(row: DbPositionWithUser): PointPositionWithUser {
  return {
    id: row.id,
    pointId: row.point_id,
    userId: row.user_id,
    position: row.position,
    reasoning: row.reasoning ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userName: row.user?.name ?? 'Unknown',
    userSlug: row.user?.slug ?? '',
    userAvatarColor: row.user?.avatar_color ?? '#3B82F6',
    userAvatarUrl: row.user?.avatar_url ?? undefined,
    earCount: earCountOf(row.user),
    userHasPledged: row.user?.has_pledged ?? false,
  };
}

/**
 * Transform database row to PointPositionHistory type
 */
function mapHistoryFromDb(row: DbPositionHistoryRow): PointPositionHistory {
  return {
    id: row.id,
    pointId: row.point_id,
    userId: row.user_id,
    position: row.position,
    reasoning: row.reasoning ?? undefined,
    sessionId: row.session_id ?? undefined,
    changedAt: row.changed_at,
  };
}

/**
 * Get empty position counts object
 */
function emptyPositionCounts(): Record<PositionType, number> {
  return ALL_POSITIONS.reduce(
    (acc, pos) => {
      acc[pos] = 0;
      return acc;
    },
    {} as Record<PositionType, number>
  );
}

export const realPointsService: PointsService = {
  // ============================================================================
  // CREATE
  // ============================================================================

  async createPoint(
    statement: string,
    context?: string,
    tags: string[] = [],
    visibility?: ContentVisibility
  ): Promise<Point | null> {
    log(' createPoint:', { statement });

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      log('ERROR: createPoint: No authenticated user');
      return null;
    }

    const { data, error } = await supabase
      .from('points')
      .insert({
        statement,
        context: context ?? null,
        first_validator_id: user.id,
        tags,
        system_tags: [], // P630: system tags set by migration/triggers, never by client
        ...(visibility ? { visibility } : {}),
      })
      .select('*')
      .single();

    if (error || !data) {
      logDbError('createPoint', error);
      return null;
    }

    const point: Point = {
      id: data.id,
      statement: data.statement,
      context: data.context ?? undefined,
      firstValidatorId: data.first_validator_id,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      tags: data.tags || [],
      systemTags: data.system_tags || [],
      bannerUrl: data.banner_url ?? undefined,
      visibility: data.visibility ?? undefined,
    };

    return point;
  },

  // ============================================================================
  // READ - Points
  // ============================================================================

  async getPoint(pointId: string): Promise<PointWithCreator | null> {
    log(' getPoint:', pointId);

    const { data, error } = await supabase
      .from('points')
      .select(
        `
        *,
        creator:profiles!points_first_validator_id_fkey (
          id,
          name,
          slug,
          avatar_color,
          avatar_url
        )
      `
      )
      .eq('id', pointId)
      .single();

    if (error || !data) {
      log(' getPoint not found:', pointId);
      return null;
    }

    return mapPointFromDb(data as DbPointWithCreator);
  },

  async getPointWithCounts(pointId: string): Promise<PointWithCounts | null> {
    log(' getPointWithCounts:', pointId);

    const point = await this.getPoint(pointId);
    if (!point) return null;

    const positionCounts = await this.getPositionCounts(pointId);
    const totalPositions = Object.values(positionCounts).reduce((sum, count) => sum + count, 0);

    return {
      ...point,
      positionCounts,
      totalPositions,
    };
  },

  async getPointWithUserPosition(
    pointId: string,
    userId: string
  ): Promise<PointWithUserPosition | null> {
    log(' getPointWithUserPosition:', { pointId, userId });

    const pointWithCounts = await this.getPointWithCounts(pointId);
    if (!pointWithCounts) return null;

    const userPosition = await this.getMyPosition(pointId, userId);

    return {
      ...pointWithCounts,
      userPosition: userPosition ?? undefined,
    };
  },

  async getPointsByValidator(validatorId: string): Promise<PointWithCreator[]> {
    log(' getPointsByValidator:', validatorId);

    const { data, error } = await supabase
      .from('points')
      .select(
        `
        *,
        creator:profiles!points_first_validator_id_fkey (
          id,
          name,
          slug,
          avatar_color,
          avatar_url
        )
      `
      )
      .eq('first_validator_id', validatorId)
      .eq('visibility', 'public')  // P634: never leak private points
      .order('created_at', { ascending: false });

    if (error || !data) {
      logDbError('getPointsByValidator', error);
      return [];
    }

    return (data as DbPointWithCreator[]).map(mapPointFromDb);
  },

  async getPointsFeed(limit: number, offset: number): Promise<PointWithCounts[]> {
    log(' getPointsFeed:', { limit, offset });

    const { data, error } = await supabase
      .from('points')
      .select(
        `
        *,
        creator:profiles!points_first_validator_id_fkey (
          id,
          name,
          slug,
          avatar_color,
          avatar_url
        )
      `
      )
      .eq('visibility', 'public')  // Defense-in-depth: feed never shows private points
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error || !data) {
      logDbError('getPointsFeed', error);
      return [];
    }

    const points = (data as DbPointWithCreator[]).map(mapPointFromDb);

    // Get position counts for all points in batch
    const pointIds = points.map((p) => p.id);
    const countsMap = new Map<string, Record<PositionType, number>>();

    if (pointIds.length > 0) {
      const { data: positions, error: posError } = await supabase
        .from('point_positions')
        .select('point_id, position')
        .in('point_id', pointIds);

      if (!posError && positions) {
        // Initialize counts for all points
        pointIds.forEach((id) => countsMap.set(id, emptyPositionCounts()));

        // Count positions
        positions.forEach((pos) => {
          const counts = countsMap.get(pos.point_id);
          if (counts && pos.position) {
            counts[pos.position as PositionType]++;
          }
        });
      }
    }

    return points
      .map((point) => {
        const positionCounts = countsMap.get(point.id) || emptyPositionCounts();
        const totalPositions = Object.values(positionCounts).reduce((sum, count) => sum + count, 0);
        return {
          ...point,
          positionCounts,
          totalPositions,
        };
      })
      .filter((point) => point.totalPositions > 0);  // P543: exclude zero-position points
  },

  async getPositionCounts(pointId: string): Promise<Record<PositionType, number>> {
    log(' getPositionCounts:', pointId);

    const { data, error } = await supabase
      .from('point_positions')
      .select('position')
      .eq('point_id', pointId);

    if (error || !data) {
      logDbError('getPositionCounts', error);
      return emptyPositionCounts();
    }

    const counts = emptyPositionCounts();
    data.forEach((row) => {
      if (row.position) {
        counts[row.position as PositionType]++;
      }
    });

    return counts;
  },

  // ============================================================================
  // READ - Positions
  // ============================================================================

  async getMyPosition(pointId: string, userId: string): Promise<PointPosition | null> {
    log(' getMyPosition:', { pointId, userId });

    const { data: rows, error } = await supabase
      .from('point_positions')
      .select('*')
      .eq('point_id', pointId)
      .eq('user_id', userId)
      .limit(1);

    if (error || !rows?.[0]) return null;

    return mapPositionFromDb(rows[0]);
  },

  async getPositionsForPoint(pointId: string): Promise<PointPositionWithUser[]> {
    log(' getPositionsForPoint:', pointId);

    const { data, error } = await supabase
      .from('point_positions')
      .select(
        `
        *,
        user:profiles!point_positions_user_id_fkey (
          id,
          name,
          slug,
          avatar_color,
          avatar_url,
          ears_count,
          has_pledged
        )
      `
      )
      .eq('point_id', pointId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      logDbError('getPositionsForPoint', error);
      return [];
    }

    return (data as DbPositionWithUser[]).map(mapPositionWithUserFromDb);
  },

  async getPositionHistory(
    pointId: string,
    userId?: string
  ): Promise<PointPositionHistory[]> {
    log(' getPositionHistory:', { pointId, userId });

    let query = supabase
      .from('point_position_history')
      .select('*')
      .eq('point_id', pointId)
      .order('changed_at', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error || !data) {
      logDbError('getPositionHistory', error);
      return [];
    }

    return (data as DbPositionHistoryRow[]).map(mapHistoryFromDb);
  },

  async getPointsWithUserPositions(userId: string): Promise<PointWithUserPosition[]> {
    log('⚡ getPointsWithUserPositions:', userId);

    // 1. Get all point_ids this user has positions on
    const { data: positionRows, error: posError } = await supabase
      .from('point_positions')
      .select('point_id')
      .eq('user_id', userId);

    if (posError || !positionRows || positionRows.length === 0) return [];

    const pointIds = positionRows.map(p => p.point_id);

    // 2. Fetch the point rows with creator profiles (single query, IN clause)
    const { data: pointRows, error: pointsError } = await supabase
      .from('points')
      .select(`
        *,
        creator:profiles!points_first_validator_id_fkey (
          id, name, slug, avatar_color, avatar_url
        )
      `)
      .in('id', pointIds)
      .eq('visibility', 'public')  // P634: never leak private points on public surfaces
      .order('created_at', { ascending: false });

    if (pointsError || !pointRows) {
      logDbError('getPointsWithUserPositions', pointsError);
      return [];
    }

    const points = (pointRows as DbPointWithCreator[]).map(mapPointFromDb);

    // 3. Batch fetch position counts and user's own positions (2 queries for N points)
    const [countsMap, userPositionsMap] = await Promise.all([
      this.getPositionCountsForPoints(pointIds),
      this.getMyPositionsForPoints(pointIds, userId),
    ]);

    // 4. Assemble PointWithUserPosition[]
    return points.map(point => {
      const positionCounts = countsMap.get(point.id) || emptyPositionCounts();
      const totalPositions = Object.values(positionCounts).reduce((sum, n) => sum + n, 0);
      return {
        ...point,
        positionCounts,
        totalPositions,
        userPosition: userPositionsMap.get(point.id),
      };
    });
  },

  /**
   * P132: Batch fetch position counts for multiple points
   * More efficient than N individual queries
   */
  async getPositionCountsForPoints(
    pointIds: string[]
  ): Promise<Map<string, Record<PositionType, number>>> {
    log('⚡ getPositionCountsForPoints:', { pointIds });

    if (pointIds.length === 0) {
      return new Map();
    }

    // Single query to get all positions for these points
    const { data: positions, error } = await supabase
      .from('point_positions')
      .select('point_id, position')
      .in('point_id', pointIds);

    if (error) {
      logDbError('getPositionCountsForPoints', error);
      return new Map();
    }

    // Group and count positions by point
    const countsMap = new Map<string, Record<PositionType, number>>();

    // Initialize all points with zero counts
    pointIds.forEach((pointId) => {
      const zeroCounts = Object.fromEntries(
        ALL_POSITIONS.map((pos) => [pos, 0])
      ) as Record<PositionType, number>;
      countsMap.set(pointId, zeroCounts);
    });

    // Aggregate counts
    positions?.forEach((row) => {
      const pointCounts = countsMap.get(row.point_id);
      if (pointCounts && row.position) {
        pointCounts[row.position]++;
      }
    });

    return countsMap;
  },

  /**
   * P132: Batch fetch user positions for multiple points
   * More efficient than N individual queries
   */
  async getMyPositionsForPoints(
    pointIds: string[],
    userId: string
  ): Promise<Map<string, PointPosition>> {
    log('⚡ getMyPositionsForPoints:', { pointIds, userId });

    if (pointIds.length === 0) {
      return new Map();
    }

    // Single query to get user's positions on these points
    const { data: positions, error } = await supabase
      .from('point_positions')
      .select('*')
      .in('point_id', pointIds)
      .eq('user_id', userId);

    if (error) {
      logDbError('getMyPositionsForPoints', error);
      return new Map();
    }

    // Map positions by point_id
    const positionsMap = new Map<string, PointPosition>();

    positions?.forEach((row) => {
      positionsMap.set(row.point_id, {
        id: row.id,
        pointId: row.point_id,
        userId: row.user_id,
        position: row.position,
        reasoning: row.reasoning ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    });

    return positionsMap;
  },

  // ============================================================================
  // P151: Display-Ready Point Loading (Efficient Batch Methods)
  // ============================================================================

  /**
   * P402: Get points a user has positions on, ready for profile display.
   * Fixes P402 bug: was querying by points *created*, now queries by positions *held*.
   * Encapsulates efficient batch loading pattern (4–5 queries regardless of N).
   */
  async getPointsForProfileDisplay(
    validatorId: string,
    viewerUserId?: string
  ): Promise<PointWithUserPosition[]> {
    log('⚡ getPointsForProfileDisplay:', { validatorId, viewerUserId });

    // FIX: query by positions held, not points created
    const { data: positionRows, error: posError } = await supabase
      .from('point_positions')
      .select('point_id')
      .eq('user_id', validatorId);

    if (posError || !positionRows || positionRows.length === 0) return [];

    const pointIds = positionRows.map(p => p.point_id);

    // P634: Always filter to public points on profile — even when viewer is the owner.
    // Private points should never appear in profile context.
    const { data: pointRows, error: pointsError } = await supabase
      .from('points')
      .select(`
        *,
        creator:profiles!points_first_validator_id_fkey (
          id, name, slug, avatar_color, avatar_url
        )
      `)
      .in('id', pointIds)
      .eq('visibility', 'public')
      .order('created_at', { ascending: false });

    if (pointsError || !pointRows) {
      logDbError('getPointsForProfileDisplay', pointsError);
      return [];
    }

    const points = (pointRows as DbPointWithCreator[]).map(mapPointFromDb);

    const viewerIsSubject = viewerUserId === validatorId;

    // Batch fetch: counts + viewer positions + subject positions (2-3 queries)
    const [countsMap, viewerPositionsMap, subjectPositionsMap] = await Promise.all([
      this.getPositionCountsForPoints(pointIds),
      !viewerIsSubject && viewerUserId
        ? this.getMyPositionsForPoints(pointIds, viewerUserId)
        : Promise.resolve(new Map<string, PointPosition>()),
      this.getMyPositionsForPoints(pointIds, validatorId),   // always fetch subject
    ]);

    return points
      .map(point => {
        const positionCounts = countsMap.get(point.id) || emptyPositionCounts();
        const totalPositions = Object.values(positionCounts).reduce((sum, n) => sum + n, 0);
        const profileSubjectPosition = subjectPositionsMap.get(point.id);
        const userPosition = viewerIsSubject
          ? profileSubjectPosition
          : viewerPositionsMap.get(point.id);

        return {
          ...point,
          positionCounts,
          totalPositions,
          userPosition,
          profileSubjectPosition,   // always the profile owner's position
        };
      })
      .filter(point => point.totalPositions > 0);  // P543: exclude zero-position points
  },

  /**
   * P151: Get points for feed/discovery, ready for display
   * Encapsulates efficient batch loading pattern
   */
  async getPointsForFeedDisplay(
    limit: number,
    offset: number,
    viewerUserId?: string
  ): Promise<PointWithUserPosition[]> {
    log('⚡ getPointsForFeedDisplay:', { limit, offset, viewerUserId });

    // Get points feed (already has counts)
    const points = await this.getPointsFeed(limit, offset);
    if (points.length === 0) return [];

    // If no viewer, return points with counts but no positions
    if (!viewerUserId) {
      return points.map(point => ({ ...point, userPosition: undefined }));
    }

    const pointIds = points.map(p => p.id);

    // Batch fetch viewer's positions (1 query for N points)
    const positionsMap = await this.getMyPositionsForPoints(pointIds, viewerUserId);

    // Combine into PointWithUserPosition[]
    return points.map(point => ({
      ...point,
      userPosition: positionsMap.get(point.id),
    }));
  },

  /**
   * P491: Get public points feed with optional tag filter.
   * Similar to getPointsForFeedDisplay but adds tag filtering.
   */
  async getPublicPointsFeed(
    limit: number,
    offset: number,
    tag?: string,
    viewerUserId?: string,
    ascending?: boolean
  ): Promise<PointWithUserPosition[]> {
    log('⚡ getPublicPointsFeed:', { limit, offset, tag, viewerUserId });

    let query = supabase
      .from('points')
      .select(`
        *,
        creator:profiles!points_first_validator_id_fkey (
          id,
          name,
          slug,
          avatar_color,
          avatar_url
        )
      `)
      .eq('visibility', 'public');  // P634: never leak private points into feed

    if (tag) {
      // P630: Route system tag filters to system_tags column, user tags to tags
      if (isSystemTag(tag)) {
        query = query.contains('system_tags', [tag]);
      } else {
        query = query.contains('tags', [tag]);
      }
    }

    const { data, error } = await query
      .order('created_at', { ascending: ascending ?? false })
      .range(offset, offset + limit - 1);

    if (error || !data) {
      logDbError('getPublicPointsFeed', error);
      return [];
    }

    const points = (data as DbPointWithCreator[]).map(mapPointFromDb);
    if (points.length === 0) return [];

    // Batch fetch position counts
    const pointIds = points.map(p => p.id);
    const countsMap = new Map<string, Record<PositionType, number>>();

    const { data: positions, error: posError } = await supabase
      .from('point_positions')
      .select('point_id, position')
      .in('point_id', pointIds);

    if (!posError && positions) {
      pointIds.forEach(id => countsMap.set(id, emptyPositionCounts()));
      positions.forEach(pos => {
        const counts = countsMap.get(pos.point_id);
        if (counts && pos.position) {
          counts[pos.position as PositionType]++;
        }
      });
    }

    // Optionally fetch viewer positions
    let viewerPositionsMap = new Map<string, PointPosition>();
    if (viewerUserId) {
      viewerPositionsMap = await this.getMyPositionsForPoints(pointIds, viewerUserId);
    }

    return points
      .map(point => {
        const positionCounts = countsMap.get(point.id) || emptyPositionCounts();
        const totalPositions = Object.values(positionCounts).reduce((sum, n) => sum + n, 0);
        return {
          ...point,
          positionCounts,
          totalPositions,
          userPosition: viewerPositionsMap.get(point.id),
        };
      })
      .filter(point => point.totalPositions > 0);  // P543: exclude zero-position points
  },

  // ============================================================================
  // MUTATIONS - Positions
  // ============================================================================

  async setPosition(
    pointId: string,
    userId: string,
    position: PositionType,
    reasoning?: string
  ): Promise<void> {
    log(' setPosition:', { pointId, userId, position });

    // Upsert: insert or update based on unique constraint
    const { error } = await supabase.from('point_positions').upsert(
      {
        point_id: pointId,
        user_id: userId,
        position,
        reasoning: reasoning ?? null,
      },
      {
        onConflict: 'point_id,user_id',
      }
    );

    if (error) {
      throwDbError('setPosition', error, `setPosition failed: ${error.message}`);
    }
  },

  async removePosition(pointId: string, userId: string): Promise<void> {
    log(' removePosition:', { pointId, userId });

    const { error } = await supabase
      .from('point_positions')
      .delete()
      .eq('point_id', pointId)
      .eq('user_id', userId);

    if (error) {
      throwDbError('removePosition', error, `removePosition failed: ${error.message}`);
    }
  },

  /**
   * P401: Count stories authored by userId that are linked to pointId.
   * Two-query approach (Supabase JS client doesn't support subqueries).
   */
  async getChainHead(startPointId: string): Promise<{ headId: string; hops: number } | null> {
    return getChainHead(startPointId, supabase);
  },

  async getVersionChain(pointId: string): Promise<Array<{ id: string; superseded_by: string | null }>> {
    return getVersionChain(pointId, supabase);
  },

  async checkLinkedStories(pointId: string, userId: string): Promise<number> {
    log(' checkLinkedStories:', { pointId, userId });

    // 1. Get story IDs authored by userId
    const { data: storyIds } = await supabase
      .from('stories')
      .select('id')
      .eq('author_id', userId);

    if (!storyIds || storyIds.length === 0) return 0;

    const ids = storyIds.map(s => s.id);

    // 2. Count story_points matching pointId + those story IDs
    const { count: linkedCount, error: countError } = await supabase
      .from('story_points')
      .select('story_id', { count: 'exact', head: true })
      .eq('point_id', pointId)
      .in('story_id', ids);

    if (countError) {
      logDbError('checkLinkedStories', countError);
      return 0;
    }

    return linkedCount ?? 0;
  },
};

// ── P800: Chain traversal helpers ────────────────────────────────────────────
// Exported for direct use in components and unit tests (accepts an optional
// Supabase client so tests can inject a mock without module-level mocking).

export type ChainPoint = { id: string; superseded_by: string | null; statement?: string; created_at?: string };

type ChainQueryBuilder = {
  eq(col: string, val: string): ChainQueryBuilder;
  limit(count: number): Promise<{ data: ChainPoint[] | null; error: unknown }>;
  maybeSingle(): Promise<{ data: ChainPoint | null; error: unknown }>;
};

type ChainClient = {
  from(table: string): {
    select(cols: string): ChainQueryBuilder;
  };
};

/**
 * Walk the superseded_by chain from startPointId to the current head.
 * Returns { headId, hops } where hops = 0 means startPointId is already the head.
 * Returns null if the point is not found or the chain exceeds 100 hops.
 */
export async function getChainHead(
  startPointId: string,
  client: ChainClient = supabase as ChainClient
): Promise<{ headId: string; hops: number } | null> {
  let currentId = startPointId;
  let hops = 0;
  const MAX_HOPS = 100;

  while (hops < MAX_HOPS) {
    const { data, error } = await client
      .from('points')
      .select('id, superseded_by')
      .eq('id', currentId)
      .maybeSingle();

    if (error || !data) return null;
    if (data.superseded_by === null) return { headId: currentId, hops };

    currentId = data.superseded_by;
    hops++;
  }

  return null; // exceeded hard cap — chain is pathological
}

/**
 * Return the full version chain ordered ancestor-to-head, starting from any
 * point in the chain. Walks backward (via reverse lookup on superseded_by) then
 * forward (via superseded_by pointer).
 */
export async function getVersionChain(
  pointId: string,
  client: ChainClient = supabase as ChainClient
): Promise<ChainPoint[]> {
  const MAX_HOPS = 100;
  const predecessors: ChainPoint[] = [];

  // Walk backward to root using limit(1) — avoids 406 when 0 rows match
  let searchId: string | null = pointId;
  let backHops = 0;
  while (searchId !== null && backHops < MAX_HOPS) {
    const { data: rows } = await client
      .from('points')
      .select('id, superseded_by, statement, created_at')
      .eq('superseded_by', searchId)
      .limit(1);
    const predecessor = rows?.[0] ?? null;
    if (!predecessor) break;
    predecessors.unshift(predecessor);
    searchId = predecessor.id;
    backHops++;
  }

  // Fetch current point
  const { data: currentRows } = await client
    .from('points')
    .select('id, superseded_by, statement, created_at')
    .eq('id', pointId)
    .limit(1);
  const current = currentRows?.[0] ?? null;
  if (!current) return [];

  const chain: ChainPoint[] = [...predecessors, current];

  // Walk forward to head
  let nextId = current.superseded_by;
  let fwdHops = 0;
  while (nextId !== null && fwdHops < MAX_HOPS) {
    const { data: nextRows } = await client
      .from('points')
      .select('id, superseded_by, statement, created_at')
      .eq('id', nextId)
      .limit(1);
    const next = nextRows?.[0] ?? null;
    if (!next) break;
    chain.push(next);
    nextId = next.superseded_by;
    fwdHops++;
  }

  return chain;
}

/**
 * Resolve a point slug (e.g. "st1", "st1-a") to a UUID.
 *
 * - "st1" → latest version of the main (non-misunderstanding) point tagged st1
 * - "st1-a" → latest version of the anti (misunderstanding) point tagged st1
 *
 * "Latest version" = highest vN tag among matching points.
 * Returns null if no matching point found.
 */
export async function resolvePointSlug(slug: string): Promise<string | null> {
  const match = slug.match(/^(st\d+)(-a)?$/);
  if (!match) return null;

  const stTag = match[1];
  const isAnti = !!match[2];

  // P630: Query system_tags instead of tags for st-group lookup
  const { data, error } = await supabase
    .from('points')
    .select('id, system_tags')
    .contains('system_tags', [stTag]);

  if (error || !data?.length) return null;

  // Filter: anti-points have 'misunderstanding' in system_tags, main points don't
  const filtered = data.filter((p: { system_tags: string[] }) =>
    isAnti
      ? p.system_tags.includes('misunderstanding')
      : !p.system_tags.includes('misunderstanding')
  );

  if (!filtered.length) return null;

  // Find highest version number from system_tags
  const withVersion = filtered.map((p: { id: string; system_tags: string[] }) => {
    const vTag = p.system_tags.find((t: string) => /^v\d+$/.test(t));
    return { id: p.id, version: vTag ? parseInt(vTag.slice(1), 10) : 0 };
  });

  withVersion.sort((a: { version: number }, b: { version: number }) => b.version - a.version);
  return withVersion[0].id;
}
