/**
 * @file sessions-service.ts
 * @description P405: Fetches completed session history for a user.
 */
import { supabase } from '@/lib/supabase';
import type { SessionHistoryItem } from '@/app/types';

export interface SessionSummary {
  id: string;
  partnerName: string;
  roundCount: number;
  date: string;
  sessionHistory: SessionHistoryItem[];
}

interface SessionRow {
  id: string;
  creator_profile_id: string | null;
  joiner_profile_id: string | null;
  creator_name: string | null;
  joiner_name: string | null;
  created_at: string;
  live_state: {
    sessionHistory?: Array<{ skipped?: boolean; [key: string]: unknown }>;
  } | null;
}

function mapSessionFromDb(row: SessionRow, profileId: string): SessionSummary {
  const isCreator = row.creator_profile_id === profileId;
  const partnerName = isCreator
    ? (row.joiner_name ?? row.creator_name ?? 'Unknown')
    : (row.creator_name ?? 'Unknown');
  const history = row.live_state?.sessionHistory ?? [];
  const roundCount = history.filter((r) => !r.skipped).length;

  return {
    id: row.id,
    partnerName,
    roundCount,
    date: row.created_at,
    sessionHistory: history as SessionHistoryItem[],
  };
}

export async function getUserSessions(profileId: string): Promise<SessionSummary[]> {
  const { data, error } = await supabase
    .from('clarity_sessions')
    .select('id, creator_profile_id, joiner_profile_id, creator_name, joiner_name, created_at, live_state')
    .or(`creator_profile_id.eq.${profileId},joiner_profile_id.eq.${profileId}`)
    .order('created_at', { ascending: false });

  if (error || !data) {
    if (error) console.error('[sessions-service] Failed to fetch sessions:', error);
    return [];
  }

  return (data as SessionRow[])
    .map((row) => mapSessionFromDb(row, profileId))
    .filter((s) => s.roundCount > 0);
}
