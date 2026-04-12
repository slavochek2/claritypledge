// Types and interface for badge service

export type BadgePosition = 'agree' | 'strongly_agree';

export interface BadgePoint {
  id: string;
  userId: string;
  pointId: string;
  storyId: string | null;
  verifiedBy: string;
  sessionId: string;
  position: BadgePosition;
  verifiedAt: string; // ISO timestamp
  createdAt: string;  // ISO timestamp
}

export interface BadgeService {
  /** Insert a badge point. Returns the inserted record, or null on conflict (UNIQUE violation = already earned). */
  insertBadgePoint(params: {
    userId: string;
    pointId: string;
    storyId: string | null;
    verifiedBy: string;
    sessionId: string;
    position: BadgePosition;
  }): Promise<BadgePoint | null>;

  /** Get all badge points for a user. Empty array if none. */
  getBadgePoints(userId: string): Promise<BadgePoint[]>;

  /** Get badge count for a user (number of distinct points verified). */
  getBadgeCount(userId: string): Promise<number>;
}
