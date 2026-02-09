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
    context?: string,
    tags?: string[]
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
   */
  getPointsByValidator(validatorId: string): Promise<PointWithCreator[]>;

  /**
   * Get points feed (paginated, newest first)
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
  // MUTATIONS - Positions
  // ============================================================================

  /**
   * Set or update user's position on a point
   * Creates history entry via trigger.
   */
  setPosition(
    pointId: string,
    userId: string,
    position: PositionType,
    reasoning?: string
  ): Promise<boolean>;

  /**
   * Remove user's position from a point
   * Creates history entry with null position via trigger.
   */
  removePosition(pointId: string, userId: string): Promise<boolean>;
}

export interface CreatePointInput {
  statement: string;
  context?: string;
  tags?: string[];
}
