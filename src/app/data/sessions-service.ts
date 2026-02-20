/**
 * @file sessions-service.ts
 * @description P405: Fetches completed session history for a user.
 */
import { supabase } from '@/lib/supabase';

export interface SessionSummary {
  id: string;
  code: string;
  partnerName: string | null;
  roundCount: number;
  date: string;
}

interface SessionRow {
  id: string;
  code: string;
  creator_profile_id: string;
  joiner_profile_id: string | null;
  creator_name: string;
  joiner_name: string | null;
  created_at: string;
  live_state: {
    sessionHistory?: Array<{ skipped: boolean; title?: string }>;
  } | null;
}

function mapSessionFromDb(row: SessionRow, profileId: string): SessionSummary {
  const isCreator = row.creator_profile_id === profileId;
  const partnerName = isCreator ? row.joiner_name : row.creator_name;
  const history = row.live_state?.sessionHistory ?? [];
  const roundCount = history.filter((r) => !r.skipped).length;

  return {
    id: row.id,
    code: row.code,
    partnerName,
    roundCount,
    date: row.created_at,
  };
}

export async function getUserSessions(profileId: string): Promise<SessionSummary[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('id, code, creator_profile_id, joiner_profile_id, creator_name, joiner_name, created_at, live_state')
    .or(`creator_profile_id.eq.${profileId},joiner_profile_id.eq.${profileId}`)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return (data as SessionRow[])
    .map((row) => mapSessionFromDb(row, profileId))
    .filter((s) => s.roundCount > 0);
}
