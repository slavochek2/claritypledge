/**
 * @file points-service.interface.ts
 * @description P117: Interface for points service (mock/real switchable)
 */

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

export interface PointsService {
  // ============================================================================
  // CREATE
  // ============================================================================

  /**
   * Create a new point (statement)
   * Requires verified user. Points are immutable after creation.
   */
  createPoint(
    statement: string,
    tags?: string[],
    visibility?: ContentVisibility
  ): Promise<Point | null>;

  // ============================================================================
  // READ - Points
  // ============================================================================

  /**
   * Get a single point by ID with creator info
   */
  getPoint(pointId: string): Promise<PointWithCreator | null>;

  /**
   * Get a point with position counts
   */
  getPointWithCounts(pointId: string): Promise<PointWithCounts | null>;

  /**
   * Get a point with current user's position (if any)
   */
  getPointWithUserPosition(
    pointId: string,
    userId: string
  ): Promise<PointWithUserPosition | null>;

  /**
   * Get points created by a user (first validator)
   *
   * @deprecated Use getPointsForProfileDisplay instead for UI display.
   * This method does not load position counts or user positions.
   * Only use this for internal data processing, not UI display.
   */
  getPointsByValidator(validatorId: string): Promise<PointWithCreator[]>;

  /**
   * Get points feed (paginated, newest first)
   *
   * @deprecated Use getPointsForFeedDisplay instead for UI display.
   * This method does not load user positions.
   * Only use this for internal data processing, not UI display.
   */
  getPointsFeed(limit: number, offset: number): Promise<PointWithCounts[]>;

  /**
   * Get position counts for a point
   */
  getPositionCounts(pointId: string): Promise<Record<PositionType, number>>;

  /**
   * P132: Batch fetch position counts for multiple points
   * Returns map of pointId -> position counts
   * More efficient than calling getPositionCounts for each point (avoids N+1)
   */
  getPositionCountsForPoints(
    pointIds: string[]
  ): Promise<Map<string, Record<PositionType, number>>>;

  // ============================================================================
  // READ - Positions
  // ============================================================================

  /**
   * Get current user's position on a point
   */
  getMyPosition(pointId: string, userId: string): Promise<PointPosition | null>;

  /**
   * Get all positions on a point with user profiles
   */
  getPositionsForPoint(pointId: string): Promise<PointPositionWithUser[]>;

  /**
   * Get position history for a point (optionally filtered by user)
   */
  getPositionHistory(
    pointId: string,
    userId?: string
  ): Promise<PointPositionHistory[]>;

  /**
   * Get all points a user has taken positions on
   */
  getPointsWithUserPositions(userId: string): Promise<PointWithUserPosition[]>;

  /**
   * P132: Batch fetch user positions for multiple points
   * Returns map of pointId -> position
   * More efficient than calling getMyPosition for each point (avoids N+1)
   */
  getMyPositionsForPoints(
    pointIds: string[],
    userId: string
  ): Promise<Map<string, PointPosition>>;

  // ============================================================================
  // P151: Display-Ready Point Loading (Efficient Batch Methods)
  // ============================================================================

  /**
   * Get points created by a user, ready for profile display
   * Includes position counts + viewer's positions (if authenticated)
   *
   * This method encapsulates the efficient batch loading pattern:
   * - Fetches points by validator
   * - Batch loads position counts (1 query)
   * - Batch loads viewer positions (1 query)
   * - Merges into PointWithUserPosition format
   *
   * Use this instead of getPointsByValidator for display purposes.
   *
   * @param validatorId - User who created/validated the points
   * @param viewerUserId - Current viewer (for loading their positions)
   * @returns Points with complete display data (counts + positions)
   *
   * @example
   * // Profile page - show points user created
   * const points = await pointsService.getPointsForProfileDisplay(
   *   profileUser.id,
   *   currentUser?.id
   * );
   */
  getPointsForProfileDisplay(
    validatorId: string,
    viewerUserId?: string
  ): Promise<PointWithUserPosition[]>;

  /**
   * Get points for feed/discovery, ready for display
   * Includes position counts + viewer's positions (if authenticated)
   *
   * This method encapsulates the efficient batch loading pattern:
   * - Fetches points feed (already has counts)
   * - Batch loads viewer positions (1 query)
   * - Merges into PointWithUserPosition format
   *
   * Use this instead of getPointsFeed for display purposes.
   *
   * @param limit - Number of points to fetch
   * @param offset - Pagination offset
   * @param viewerUserId - Current viewer (for loading their positions)
   * @returns Points with complete display data (counts + positions)
   *
   * @example
   * // Feed page - discover new points
   * const points = await pointsService.getPointsForFeedDisplay(
   *   20,
   *   page * 20,
   *   currentUser?.id
   * );
   */
  getPointsForFeedDisplay(
    limit: number,
    offset: number,
    viewerUserId?: string
  ): Promise<PointWithUserPosition[]>;

  /**
   * P491: Get public points feed with optional tag filter.
   * Returns points ordered by created_at desc with position counts and viewer positions.
   * Optionally filters by tag using Supabase .contains() on the tags TEXT[] column.
   */
  getPublicPointsFeed(
    limit: number,
    offset: number,
    tag?: string,
    viewerUserId?: string,
    ascending?: boolean
  ): Promise<PointWithUserPosition[]>;

  // ============================================================================
  // MUTATIONS - Positions
  // ============================================================================

  /**
   * Set or update user's position on a point
   * Creates history entry via trigger.
   * Throws on DB error (e.g. RLS rejection) — callers must handle via try/catch.
   */
  setPosition(
    pointId: string,
    userId: string,
    position: PositionType,
    reasoning?: string
  ): Promise<void>;

  /**
   * Remove user's position from a point
   * Creates history entry with null position via trigger.
   * Throws on DB error — callers must handle via try/catch.
   */
  removePosition(pointId: string, userId: string): Promise<void>;

  /**
   * P401: Count stories authored by userId that are linked to pointId.
   * Used before removePosition to decide whether to show warning dialog.
   * Returns count (0 = no warning needed).
   */
  checkLinkedStories(pointId: string, userId: string): Promise<number>;

  // ── P800: Chain traversal ─────────────────────────────────────────────────

  /**
   * Walk superseded_by chain from startPointId to the current head.
   * Returns { headId, hops } — hops=0 means startPointId is the head.
   * Returns null if point not found or chain exceeds 100 hops.
   */
  getChainHead(startPointId: string): Promise<{ headId: string; hops: number } | null>;

  /**
   * Return the full version chain ordered ancestor-to-head.
   * Starts from any point in the chain; walks both backward and forward.
   * Each entry includes id, superseded_by, statement, and created_at.
   */
  getVersionChain(pointId: string): Promise<Array<{ id: string; superseded_by: string | null; statement?: string; created_at?: string }>>;
}

export interface CreatePointInput {
  statement: string;
  tags?: string[];
  visibility?: ContentVisibility;
}
