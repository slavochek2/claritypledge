/**
 * @file letter-snapshot-mapper.ts
 * @description P673: Maps LetterStorySnapshot → StoryWithPoints for /live component reuse.
 *
 * SECURITY CONSTRAINTS (from architecture review):
 * 1. All data sourced from point_config only — no DB queries
 * 2. positionCounts set to empty objects — never expose community aggregate data
 * 3. Hidden points filtered from output
 */

import type { LetterStorySnapshot, StoryWithPoints, PointSummary, PositionType } from '@/app/types';
import type { Point, PositionEntry } from '@/app/components/shared/prototype-types';

interface PointConfigPoint {
  id: string;
  text: string;
  authorPosition: string | null;
  hidden?: boolean;
}

interface PointConfig {
  storyText?: string;
  storyTitle?: string;
  points?: PointConfigPoint[];
}

/**
 * Convert a PointSummary (from snapshotToStoryWithPoints output) into the
 * Point shape that PointCardWithLinks expects.
 *
 * @param point - The PointSummary to convert
 * @param receiverPosition - Optional position to inject for the '__receiver__' user
 */
export function pointSummaryToProtoPoint(
  point: PointSummary,
  receiverPosition?: PositionType | null
): Point {
  const positions: Record<string, PositionEntry | null> = {};
  if (receiverPosition) {
    positions['__receiver__'] = { position: receiverPosition, timestamp: '' };
  }
  return {
    id: point.id,
    text: point.statement,
    createdAt: '',
    positions,
    linkedStoryIds: [],
  };
}

/**
 * Convert a LetterStorySnapshot into the StoryWithPoints shape
 * that LiveStoryCardExpanded expects.
 *
 * Filters hidden points and zeros out positionCounts for security.
 */
export function snapshotToStoryWithPoints(
  snapshot: LetterStorySnapshot,
  senderName: string
): StoryWithPoints {
  const config = (snapshot.point_config ?? {}) as PointConfig;
  const rawPoints = Array.isArray(config.points) ? config.points : [];

  // Filter hidden points — they must not appear in the UI or count for anti-point lead
  const visiblePoints: PointSummary[] = rawPoints
    .filter((p) => !p.hidden)
    .map((p) => ({
      id: p.id ?? '',
      statement: p.text ?? '',
      tags: [],
      systemTags: [],
      positionCounts: {},       // SECURITY: never expose community counts
      userPosition: null,
      profileSubjectPosition: (p.authorPosition as PointSummary['profileSubjectPosition']) ?? null,
    }));

  return {
    id: snapshot.story_id,
    authorId: '',
    title: config.storyTitle,
    content: config.storyText ?? '',
    visibility: 'public',
    currentVersion: 1,
    understoodCount: 0,
    createdAt: '',
    updatedAt: '',
    tags: [],
    systemTags: [],
    authorName: senderName,
    authorSlug: '',
    authorEarsCount: 0,
    authorHasPledged: false,
    points: visiblePoints,
  };
}
