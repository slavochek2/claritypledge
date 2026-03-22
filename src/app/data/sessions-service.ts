/**
 * @file sessions-service.ts
 * @description P405: Fetches completed session history for a user.
 * P495: Adds transcription job status and is_private via LEFT JOIN.
 */
import { supabase } from '@/lib/supabase';
import type { SessionHistoryItem, TranscriptionJobStatus } from '@/app/types';

export interface SessionSummary {
  id: string;
  partnerName: string;
  roundCount: number;
  date: string;
  sessionHistory: SessionHistoryItem[];
  isPrivate: boolean;
  transcriptStatus: TranscriptionJobStatus;
}

interface SessionRow {
  id: string;
  creator_profile_id: string | null;
  joiner_profile_id: string | null;
  creator_name: string | null;
  joiner_name: string | null;
  created_at: string;
  is_private: boolean | null;
  live_state: {
    sessionHistory?: Array<{ skipped?: boolean; [key: string]: unknown }>;
  } | null;
  transcription_jobs: Array<{ status: string }> | null;
}

function mapSessionFromDb(row: SessionRow, profileId: string): SessionSummary {
  const isCreator = row.creator_profile_id === profileId;
  const partnerName = isCreator
    ? (row.joiner_name ?? row.creator_name ?? 'Unknown')
    : (row.creator_name ?? 'Unknown');
  const history = row.live_state?.sessionHistory ?? [];
  const roundCount = history.filter((r) => !r.skipped).length;

  // Pick the most recent job status (array comes from LEFT JOIN)
  const jobs = row.transcription_jobs ?? [];
  const latestJobStatus = (jobs.length > 0 ? jobs[0].status : null) as TranscriptionJobStatus;

  return {
    id: row.id,
    partnerName,
    roundCount,
    date: row.created_at,
    sessionHistory: history as SessionHistoryItem[],
    isPrivate: row.is_private ?? false,
    transcriptStatus: latestJobStatus,
  };
}

export async function getUserSessions(profileId: string): Promise<SessionSummary[]> {
  const { data, error } = await supabase
    .from('clarity_sessions')
    .select('id, creator_profile_id, joiner_profile_id, creator_name, joiner_name, created_at, is_private, live_state, transcription_jobs(status)')
    .or(`creator_profile_id.eq.${profileId},joiner_profile_id.eq.${profileId}`)
    .order('created_at', { ascending: false });

  if (error || !data) {
    if (error) console.error('[sessions-service] Failed to fetch sessions:', error);
    return [];
  }

  return (data as unknown as SessionRow[])
    .map((row) => mapSessionFromDb(row, profileId))
    .filter((s) => s.roundCount > 0 || s.transcriptStatus === 'completed');
}
