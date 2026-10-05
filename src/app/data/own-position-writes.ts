/**
 * @file own-position-writes.ts
 * @description P1420: keep the offline read cache in step with the viewer's own position writes.
 *
 * `/feed` and `/stake` rows carry the viewer's `userPosition` and the counts that include it. Before
 * P1420 an own write cleared only the in-memory Back cache, so a slow read (served from IndexedDB
 * after its 4s deadline) or a read already in flight when the write landed brought the old position
 * back — a removed position lit up again on the next remount.
 *
 * Every patch here is idempotent: it moves the viewer's position from whatever the row says to the
 * confirmed value, so a row that already reflects the write is returned unchanged.
 */
import type { PointWithUserPosition, PositionType } from '@/app/types';
import { recordOwnWrite } from '@/lib/offline-read-cache';

/** The point with the viewer's position set to `position` (null: none), counts moved to match. */
export function withViewerPosition(
  point: PointWithUserPosition,
  userId: string,
  position: PositionType | null,
): PointWithUserPosition {
  const current = point.userPosition?.position ?? null;
  if (current === position) return point;
  const counts = { ...point.positionCounts };
  let total = point.totalPositions;
  if (current) {
    counts[current] = Math.max(0, (counts[current] || 0) - 1);
    total = Math.max(0, total - 1);
  }
  if (position) {
    counts[position] = (counts[position] || 0) + 1;
    total += 1;
  }
  const now = new Date().toISOString();
  return {
    ...point,
    positionCounts: counts,
    totalPositions: total,
    userPosition: position
      ? {
          id: point.userPosition?.id ?? `own:${point.id}`,
          pointId: point.id,
          userId,
          position,
          createdAt: point.userPosition?.createdAt ?? now,
          updatedAt: now,
        }
      : undefined,
  };
}

/**
 * Apply to a list of points. `dropEmpty`: a point left with no positions leaves the list (the feed's
 * P543 rule — its fetch hides such points). /stake keeps them, as its own fetch may.
 */
export function patchPointList(
  points: PointWithUserPosition[] | undefined,
  pointId: string,
  userId: string,
  position: PositionType | null,
  dropEmpty: boolean,
): PointWithUserPosition[] | undefined {
  if (!Array.isArray(points) || !points.some((p) => p.id === pointId)) return points;
  return points
    .map((p) => (p.id === pointId ? withViewerPosition(p, userId, position) : p))
    .filter((p) => !(dropEmpty && p.id === pointId && p.totalPositions === 0));
}

type Rows = Record<string, unknown> & { points?: PointWithUserPosition[]; cloudPoints?: PointWithUserPosition[] };

function patchRows(data: unknown, pointId: string, userId: string, position: PositionType | null, dropEmpty: boolean): unknown {
  if (!data || typeof data !== 'object') return data;
  const rows = data as Rows;
  const points = patchPointList(rows.points, pointId, userId, position, dropEmpty);
  const cloudPoints = patchPointList(rows.cloudPoints, pointId, userId, position, dropEmpty);
  if (points === rows.points && cloudPoints === rows.cloudPoints) return data;
  return { ...rows, ...(points ? { points } : {}), ...(cloudPoints ? { cloudPoints } : {}) };
}

/**
 * The server confirmed the viewer's position on `pointId` is now `position` (null: removed), by a
 * write made at `generation` (position-write-generation.ts).
 * Patches the cached `/feed` and `/stake` copies and any of their reads still in flight.
 */
export async function recordOwnPosition(
  pointId: string,
  userId: string,
  position: PositionType | null,
  generation: number,
): Promise<void> {
  if (!userId) return;
  // Ordered by when the write was MADE (its generation), not when its answer arrived.
  const order = { scope: `position|${userId}|${pointId}`, generation };
  await Promise.all([
    recordOwnWrite('feed', userId, (d) => patchRows(d, pointId, userId, position, true), order),
    recordOwnWrite('stake', userId, (d) => patchRows(d, pointId, userId, position, false), order),
  ]);
}
