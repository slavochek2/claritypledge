import type { BadgeService, BadgePoint, BadgePosition, BadgePointDetail } from './badge-service.interface';
import { supabase } from '@/lib/supabase';
import { logDbError } from './db-error-logger';

// ── DB row type ───────────────────────────────────────────────────────────────

interface DbBadgePointRow {
  id: string;
  user_id: string;
  point_id: string;
  story_id: string | null;
  verified_by: string;
  session_id: string;
  position: string;
  verified_at: string;
  created_at: string;
}

// ── Private mapper ────────────────────────────────────────────────────────────

function mapDbRow(row: DbBadgePointRow): BadgePoint {
  return {
    id: row.id,
    userId: row.user_id,
    pointId: row.point_id,
    storyId: row.story_id,
    verifiedBy: row.verified_by,
    sessionId: row.session_id,
    position: row.position as BadgePosition,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
  };
}

// ── Real implementation ───────────────────────────────────────────────────────

export class RealBadgeService implements BadgeService {
  async insertBadgePoint(params: {
    userId: string;
    pointId: string;
    storyId: string | null;
    verifiedBy: string;
    sessionId: string;
    position: BadgePosition;
  }): Promise<BadgePoint | null> {
    const { data, error } = await supabase
      .from('badge_points')
      .insert({
        user_id: params.userId,
        point_id: params.pointId,
        story_id: params.storyId,
        verified_by: params.verifiedBy,
        session_id: params.sessionId,
        position: params.position,
        verified_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (!data) {
      // UNIQUE conflict (23505) → not an error, just already earned
      if (error?.code !== '23505') {
        logDbError('insertBadgePoint', error);
      }
      return null;
    }

    return mapDbRow(data as DbBadgePointRow);
  }

  async getBadgePoints(userId: string): Promise<BadgePoint[]> {
    const { data, error } = await supabase
      .from('badge_points')
      .select('*')
      .eq('user_id', userId)
      .order('verified_at', { ascending: true });

    if (error) {
      logDbError('getBadgePoints', error);
    }

    return (data ?? []).map(row => mapDbRow(row as DbBadgePointRow));
  }

  async getBadgePointsWithDetails(userId: string): Promise<BadgePointDetail[]> {
    const badgePoints = await this.getBadgePoints(userId);
    if (badgePoints.length === 0) return [];

    // Batch-fetch point details (statement + system_tags)
    const pointIds = [...new Set(badgePoints.map(bp => bp.pointId))];
    const { data: pointRows, error: pointError } = await supabase
      .from('points')
      .select('id, statement, system_tags')
      .in('id', pointIds);
    if (pointError) logDbError('getBadgePointsWithDetails:points', pointError);

    const pointMap = new Map(
      (pointRows ?? []).map(p => [
        p.id as string,
        { statement: p.statement as string, system_tags: p.system_tags as string[] },
      ])
    );

    // Batch-fetch story content
    const storyIds = [...new Set(badgePoints.map(bp => bp.storyId).filter(Boolean))] as string[];
    const storyMap = new Map<string, string>();
    if (storyIds.length > 0) {
      const { data: storyRows, error: storyError } = await supabase
        .from('stories')
        .select('id, content')
        .in('id', storyIds);
      if (storyError) logDbError('getBadgePointsWithDetails:stories', storyError);
      for (const row of storyRows ?? []) {
        storyMap.set(row.id as string, row.content as string);
      }
    }

    return badgePoints.map(bp => {
      const point = pointMap.get(bp.pointId);
      const systemTags = point?.system_tags ?? [];
      const stGroup = systemTags.find(t => /^st\d+$/.test(t)) ?? 'st0';
      const versionTag = systemTags.find(t => /^v\d+$/.test(t));
      const pointVersion = versionTag ? parseInt(versionTag.slice(1), 10) : 1;
      return {
        ...bp,
        pointStatement: point?.statement ?? '',
        stGroup,
        pointVersion,
        storyContent: bp.storyId ? (storyMap.get(bp.storyId) ?? null) : null,
      };
    });
  }

  async getBadgeCount(userId: string): Promise<number> {
    // Count rows for the user — DB UNIQUE(user_id, point_id) ensures no dups
    const { count, error } = await supabase
      .from('badge_points')
      .select('point_id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      logDbError('getBadgeCount', error);
      return 0;
    }

    return count ?? 0;
  }
}
