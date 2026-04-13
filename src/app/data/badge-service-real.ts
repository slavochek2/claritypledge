import type { BadgeService, BadgePoint, BadgePosition } from './badge-service.interface';
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
