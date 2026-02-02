/**
 * @file points-service-mock.ts
 * @description P113: Mock points service for prototype promotion.
 * KISS pattern - simple mock file, no interface/switcher until backend exists.
 */

export type PointPosition = 'agree' | 'disagree' | 'abstain';

export interface PointPositionEntry {
  userId: string;
  position: PointPosition;
  reasoning?: string;
  createdAt: string;
}

export interface Point {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorSlug: string;
  statement: string;
  context?: string;
  positions: Record<string, PointPositionEntry>;
  createdAt: string;
  tags: string[];
}

// Mock points data
const mockPoints: Point[] = [
  {
    id: 'point-1',
    creatorId: 'mock-user-2',
    creatorName: 'Marcus Johnson',
    creatorSlug: 'marcus-johnson',
    statement: 'Most workplace conflicts stem from misunderstanding, not malice',
    context: 'Reflecting on 15 years of team leadership',
    positions: {
      'mock-user-1': {
        userId: 'mock-user-1',
        position: 'agree',
        reasoning: 'In my experience, taking time to understand intent usually resolves tension.',
        createdAt: '2024-01-14T09:00:00Z',
      },
      'mock-user-3': {
        userId: 'mock-user-3',
        position: 'disagree',
        reasoning: 'Some conflicts are genuinely about power dynamics or values clashes.',
        createdAt: '2024-01-14T11:00:00Z',
      },
    },
    createdAt: '2024-01-13T08:00:00Z',
    tags: ['workplace', 'conflict', 'communication'],
  },
  {
    id: 'point-2',
    creatorId: 'mock-user-1',
    creatorName: 'Sarah Chen',
    creatorSlug: 'sarah-chen',
    statement: 'Admitting confusion is a sign of strength, not weakness',
    context: 'From my journey learning to say "I don\'t understand"',
    positions: {
      'mock-user-2': {
        userId: 'mock-user-2',
        position: 'agree',
        createdAt: '2024-01-12T15:00:00Z',
      },
    },
    createdAt: '2024-01-11T10:00:00Z',
    tags: ['vulnerability', 'leadership'],
  },
];

export const pointsService = {
  /**
   * Get all points where a user has taken a position
   */
  getPointsForUser(userId: string): Point[] {
    return mockPoints.filter(p => p.positions[userId] != null);
  },

  /**
   * Get all points created by a user
   */
  getPointsCreatedByUser(userId: string): Point[] {
    return mockPoints.filter(p => p.creatorId === userId);
  },

  /**
   * Get a single point by ID
   */
  getPointById(pointId: string): Point | null {
    return mockPoints.find(p => p.id === pointId) || null;
  },

  /**
   * Get user's position on a point
   */
  getUserPosition(pointId: string, userId: string): PointPositionEntry | null {
    const point = mockPoints.find(p => p.id === pointId);
    if (!point) return null;
    return point.positions[userId] || null;
  },

  /**
   * Get all points (for feed)
   */
  getAllPoints(): Point[] {
    return [...mockPoints].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },
};
