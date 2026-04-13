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

/** BadgePoint enriched with point statement, st-group, and story content for display. */
export interface BadgePointDetail extends BadgePoint {
  pointStatement: string;
  stGroup: string;      // e.g. 'st1', 'st5' — extracted from system_tags
  pointVersion: number; // extracted from system_tags v-tag (e.g. 'v2' → 2), defaults to 1
  storyContent: string | null; // null if storyId is null or story not found
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

  /** Get badge points with point statement, st-group, and story content joined in. */
  getBadgePointsWithDetails(userId: string): Promise<BadgePointDetail[]>;

  /** Get badge count for a user (number of distinct points verified). */
  getBadgeCount(userId: string): Promise<number>;
}
