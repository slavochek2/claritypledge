/**
 * @file points-service-mock.ts
 * @description P117: Mock points service implementing PointsService interface
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
} from '@/app/types';

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

function emptyPositionCounts(): Record<PositionType, number> {
  return ALL_POSITIONS.reduce(
    (acc, pos) => {
      acc[pos] = 0;
      return acc;
    },
    {} as Record<PositionType, number>
  );
}

// Mock points data
const mockPoints: PointWithCreator[] = [
  {
    id: 'point-1',
    statement: 'Most workplace conflicts stem from misunderstanding, not malice',
    context: 'Reflecting on 15 years of team leadership',
    firstValidatorId: 'mock-user-2',
    createdAt: '2024-01-13T08:00:00Z',
    updatedAt: '2024-01-13T08:00:00Z',
    tags: ['workplace', 'conflict', 'communication'],
    creatorName: 'Marcus Johnson',
    creatorSlug: 'marcus-johnson',
    creatorAvatarColor: '#10B981',
  },
  {
    id: 'point-2',
    statement: "Admitting confusion is a sign of strength, not weakness",
    context: 'From my journey learning to say "I don\'t understand"',
    firstValidatorId: 'mock-user-1',
    createdAt: '2024-01-11T10:00:00Z',
    updatedAt: '2024-01-11T10:00:00Z',
    tags: ['vulnerability', 'leadership'],
    creatorName: 'Sarah Chen',
    creatorSlug: 'sarah-chen',
    creatorAvatarColor: '#3B82F6',
  },
];

// Mock positions
const mockPositions: PointPositionWithUser[] = [
  {
    id: 'pos-1',
    pointId: 'point-1',
    userId: 'mock-user-1',
    position: 'agree',
    reasoning: 'In my experience, taking time to understand intent usually resolves tension.',
    createdAt: '2024-01-14T09:00:00Z',
    updatedAt: '2024-01-14T09:00:00Z',
    userName: 'Sarah Chen',
    userSlug: 'sarah-chen',
    userAvatarColor: '#3B82F6',
  },
  {
    id: 'pos-2',
    pointId: 'point-1',
    userId: 'mock-user-3',
    position: 'disagree',
    reasoning: 'Some conflicts are genuinely about power dynamics or values clashes.',
    createdAt: '2024-01-14T11:00:00Z',
    updatedAt: '2024-01-14T11:00:00Z',
    userName: 'Alex Rivera',
    userSlug: 'alex-rivera',
    userAvatarColor: '#F59E0B',
  },
  {
    id: 'pos-3',
    pointId: 'point-2',
    userId: 'mock-user-2',
    position: 'strongly_agree',
    createdAt: '2024-01-12T15:00:00Z',
    updatedAt: '2024-01-12T15:00:00Z',
    userName: 'Marcus Johnson',
    userSlug: 'marcus-johnson',
    userAvatarColor: '#10B981',
  },
];

export const mockPointsService: PointsService = {
  async createPoint(
    statement: string,
    context?: string,
    tags: string[] = []
  ): Promise<Point | null> {
    const now = new Date().toISOString();
    return {
      id: `point-${Date.now()}`,
      statement,
      context,
      firstValidatorId: 'mock-user-1',
      createdAt: now,
      updatedAt: now,
      tags,
    };
  },

  async getPoint(pointId: string): Promise<PointWithCreator | null> {
    return mockPoints.find((p) => p.id === pointId) ?? null;
  },

  async getPointWithCounts(pointId: string): Promise<PointWithCounts | null> {
    const point = mockPoints.find((p) => p.id === pointId);
    if (!point) return null;

    const positionCounts = emptyPositionCounts();
    mockPositions
      .filter((pos) => pos.pointId === pointId)
      .forEach((pos) => {
        positionCounts[pos.position]++;
      });

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
    const pointWithCounts = await this.getPointWithCounts(pointId);
    if (!pointWithCounts) return null;

    const userPosition = mockPositions.find(
      (pos) => pos.pointId === pointId && pos.userId === userId
    );

    return {
      ...pointWithCounts,
      userPosition: userPosition
        ? {
            id: userPosition.id,
            pointId: userPosition.pointId,
            userId: userPosition.userId,
            position: userPosition.position,
            reasoning: userPosition.reasoning,
            createdAt: userPosition.createdAt,
            updatedAt: userPosition.updatedAt,
          }
        : undefined,
    };
  },

  async getPointsByValidator(validatorId: string): Promise<PointWithCreator[]> {
    return mockPoints
      .filter((p) => p.firstValidatorId === validatorId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async getPointsFeed(limit: number, offset: number): Promise<PointWithCounts[]> {
    const sorted = [...mockPoints].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const sliced = sorted.slice(offset, offset + limit);

    return Promise.all(
      sliced.map(async (point) => {
        const counts = await this.getPointWithCounts(point.id);
        return counts!;
      })
    );
  },

  async getPositionCounts(pointId: string): Promise<Record<PositionType, number>> {
    const counts = emptyPositionCounts();
    mockPositions
      .filter((pos) => pos.pointId === pointId)
      .forEach((pos) => {
        counts[pos.position]++;
      });
    return counts;
  },

  async getMyPosition(pointId: string, userId: string): Promise<PointPosition | null> {
    const pos = mockPositions.find((p) => p.pointId === pointId && p.userId === userId);
    if (!pos) return null;
    return {
      id: pos.id,
      pointId: pos.pointId,
      userId: pos.userId,
      position: pos.position,
      reasoning: pos.reasoning,
      createdAt: pos.createdAt,
      updatedAt: pos.updatedAt,
    };
  },

  async getPositionsForPoint(pointId: string): Promise<PointPositionWithUser[]> {
    return mockPositions
      .filter((pos) => pos.pointId === pointId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async getPositionHistory(
    _pointId: string,
    _userId?: string
  ): Promise<PointPositionHistory[]> {
    // Mock returns empty history
    return [];
  },

  async getPointsWithUserPositions(userId: string): Promise<PointWithUserPosition[]> {
    const userPositionPointIds = mockPositions
      .filter((pos) => pos.userId === userId)
      .map((pos) => pos.pointId);

    const points = await Promise.all(
      userPositionPointIds.map((id) => this.getPointWithUserPosition(id, userId))
    );

    return points.filter((p): p is PointWithUserPosition => p !== null);
  },

  async getPositionCountsForPoints(
    pointIds: string[]
  ): Promise<Map<string, Record<PositionType, number>>> {
    const countsMap = new Map<string, Record<PositionType, number>>();

    for (const pointId of pointIds) {
      const counts = await this.getPositionCounts(pointId);
      countsMap.set(pointId, counts);
    }

    return countsMap;
  },

  async getMyPositionsForPoints(
    pointIds: string[],
    userId: string
  ): Promise<Map<string, PointPosition>> {
    const positionsMap = new Map<string, PointPosition>();

    for (const pointId of pointIds) {
      const position = await this.getMyPosition(pointId, userId);
      if (position) {
        positionsMap.set(pointId, position);
      }
    }

    return positionsMap;
  },

  /**
   * P145: Get points created by a user, ready for profile display
   * Mock implementation
   */
  async getPointsForProfileDisplay(
    validatorId: string,
    viewerUserId?: string
  ): Promise<PointWithUserPosition[]> {
    // Get points created by this user
    const points = await this.getPointsByValidator(validatorId);
    if (points.length === 0) return [];

    const pointIds = points.map(p => p.id);

    // Batch fetch counts + positions
    const [countsMap, positionsMap] = await Promise.all([
      this.getPositionCountsForPoints(pointIds),
      viewerUserId
        ? this.getMyPositionsForPoints(pointIds, viewerUserId)
        : Promise.resolve(new Map()),
    ]);

    // Combine into PointWithUserPosition[]
    return points.map(point => {
      const positionCounts = countsMap.get(point.id) || emptyPositionCounts();
      const totalPositions = Object.values(positionCounts).reduce((sum, count) => sum + count, 0);
      const userPosition = positionsMap.get(point.id);

      return {
        ...point,
        positionCounts,
        totalPositions,
        userPosition,
      };
    });
  },

  /**
   * P145: Get points for feed/discovery, ready for display
   * Mock implementation
   */
  async getPointsForFeedDisplay(
    limit: number,
    offset: number,
    viewerUserId?: string
  ): Promise<PointWithUserPosition[]> {
    // Get points feed (already has counts)
    const points = await this.getPointsFeed(limit, offset);
    if (points.length === 0) return [];

    // If no viewer, return points with counts but no positions
    if (!viewerUserId) {
      return points.map(point => ({ ...point, userPosition: undefined }));
    }

    const pointIds = points.map(p => p.id);

    // Batch fetch viewer's positions
    const positionsMap = await this.getMyPositionsForPoints(pointIds, viewerUserId);

    // Combine into PointWithUserPosition[]
    return points.map(point => ({
      ...point,
      userPosition: positionsMap.get(point.id),
    }));
  },

  async setPosition(
    _pointId: string,
    _userId: string,
    _position: PositionType,
    _reasoning?: string
  ): Promise<boolean> {
    // Mock always succeeds
    return true;
  },

  async removePosition(_pointId: string, _userId: string): Promise<boolean> {
    // Mock always succeeds
    return true;
  },
};

// Legacy exports for backward compatibility during migration
export type { PositionType, PointPosition } from '@/app/types';
export const pointsService = mockPointsService;
