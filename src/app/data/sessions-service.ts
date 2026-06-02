/**
 * @file sessions-service.ts
 * @description P405: Fetches session history for a user.
 * P495: Adds transcription job status and is_private via LEFT JOIN.
 * P813: Returns ALL sessions (no completed-round filter). Session History is a
 * journal of "what happened", not a curated list of "what counted" — abandoned
 * sessions are rendered de-emphasized in the UI rather than hidden.
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
  transcription_jobs: Array<{ status: string; created_at: string }> | null;
}

function mapSessionFromDb(row: SessionRow, profileId: string): SessionSummary {
  const isCreator = row.creator_profile_id === profileId;
  const partnerName = isCreator
    ? (row.joiner_name ?? row.creator_name ?? 'Unknown')
    : (row.creator_name ?? 'Unknown');
  const history = row.live_state?.sessionHistory ?? [];
  const roundCount = history.filter((r) => !r.skipped).length;

  // P813: pick the genuinely latest job by created_at. PostgREST does not
  // guarantee embedded-resource ordering, and a retry inserts an additional job
  // row — so an unordered jobs[0] is arbitrary and can flip the abandoned-vs-
  // substantive styling between loads.
  const jobs = (row.transcription_jobs ?? []).slice().sort(
    (a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''),
  );
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
    .select('id, creator_profile_id, joiner_profile_id, creator_name, joiner_name, created_at, is_private, live_state, transcription_jobs(status, created_at)')
    .or(`creator_profile_id.eq.${profileId},joiner_profile_id.eq.${profileId}`)
    .order('created_at', { ascending: false });

  // P813: surface fetch failures instead of returning []. With the filter gone,
  // an empty array means "this user has no sessions" — masking an error as []
  // would render the onboarding empty state on a failed load (a journal that
  // lies). Throw so the page shows its ErrorState + retry instead.
  if (error) {
    console.error('[sessions-service] Failed to fetch sessions:', error);
    throw new Error(`Failed to fetch sessions: ${error.message}`);
  }
  if (!data) {
    throw new Error('[sessions-service] No data returned for getUserSessions');
  }

  // P813: no filter — every session the user participated in is returned.
  // Abandoned sessions (0 completed rounds AND no completed transcript) are
  // rendered de-emphasized in the UI rather than hidden, so the history reads
  // as a journal of what happened, not a curated highlight reel.
  return (data as unknown as SessionRow[])
    .map((row) => mapSessionFromDb(row, profileId));
}
