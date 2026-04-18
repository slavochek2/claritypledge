/**
 * @file letter-snapshot-mapper.ts
 * @description P673: Maps LetterStorySnapshot → StoryWithPoints for /live component reuse.
 *
 * SECURITY CONSTRAINTS (from architecture review):
 * 1. All data sourced from point_config only — no DB queries
 * 2. positionCounts set to empty objects — never expose community aggregate data
 * 3. Hidden points filtered from output
 */

import type { LetterStorySnapshot, StoryWithPoints, PointSummary, PositionType, ContentVisibility, StoryVisibility } from '@/app/types';
import type { Point, PositionEntry } from '@/app/components/shared/prototype-types';

interface PointConfigPoint {
  id: string;
  text: string;
  authorPosition: string | null;
  hidden?: boolean;
  visibility?: string;
}

interface PointConfig {
  storyText?: string;
  storyTitle?: string;
  imageUrl?: string;
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
    visibility: point.visibility,
  };
}

interface AuthorProfile {
  name: string;
  avatarUrl?: string;
  avatarColor?: string;
  role?: string;
  earsCount?: number;
  hasPledged?: boolean;
}

/**
 * P705: Post-process a StoryWithPoints to inject the viewer's own live positions
 * from point_positions into userPosition on each point.
 *
 * The base snapshotToStoryWithPoints() hardcodes userPosition: null.
 * This injector overwrites it with live data from a Map<pointId, PositionType>.
 * Creates a new StoryWithPoints (no in-place mutation).
 */
export function injectUserPositions(
  story: StoryWithPoints,
  positionMap: Map<string, PositionType>
): StoryWithPoints {
  return {
    ...story,
    points: story.points.map(point => ({
      ...point,
      userPosition: positionMap.get(point.id) ?? null,
    })),
  };
}

/**
 * P699: Post-process a StoryWithPoints to inject the other party's positions
 * into profileSubjectPosition on each point.
 *
 * snapshotToStoryWithPoints() maps authorPosition → profileSubjectPosition.
 * For sender perspective in the story walk, we want receiver positions there instead.
 * Creates a new StoryWithPoints (no in-place mutation).
 */
export function injectReceiverPositions(
  story: StoryWithPoints,
  positionMap: Map<string, PositionType>
): StoryWithPoints {
  return {
    ...story,
    points: story.points.map(point => ({
      ...point,
      profileSubjectPosition: positionMap.get(point.id) ?? null,
      // P705: userPosition intentionally not touched — injectUserPositions owns that field.
      // Nulling it here would create call-order dependency with injectUserPositions.
    })),
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
  author: AuthorProfile | string
): StoryWithPoints {
  // Support legacy string callers
  const authorProfile: AuthorProfile = typeof author === 'string' ? { name: author } : author;
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
      visibility: ((p.visibility || snapshot.visibility || 'public') as ContentVisibility),
    }));

  return {
    id: snapshot.story_id,
    authorId: '',
    content: config.storyText ?? '',
    imageUrl: config.imageUrl || undefined,
    visibility: (snapshot.visibility === 'private' ? 'private' : 'public') as StoryVisibility,
    currentVersion: 1,
    understoodCount: 0,
    createdAt: '',
    updatedAt: '',
    tags: [],
    systemTags: [],
    authorName: authorProfile.name,
    authorSlug: '',
    authorAvatarUrl: authorProfile.avatarUrl,
    authorAvatarColor: authorProfile.avatarColor,
    authorRole: authorProfile.role,
    authorEarsCount: authorProfile.earsCount ?? 0,
    authorHasPledged: authorProfile.hasPledged ?? false,
    points: visiblePoints,
  };
}
