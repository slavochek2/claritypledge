/**
 * @file calibration-service-real.ts
 * @description P117: Real Supabase calibration service implementation
 */

import type {
  CalibrationService,
  RecordVerificationInput,
} from './calibration-service.interface';
import type {
  CalibrationStats,
  CalibrationResult,
  StoryVerification,
  StoryVerificationWithProfiles,
} from '@/app/types';
import { supabase } from '@/lib/supabase';
import { logDbError } from './db-error-logger';
import { earCountOf } from './ear-count';

// Re-export constant
export { REQUIRED_SESSIONS } from './calibration-service.interface';

// Debug logging - only in development
const DEBUG = import.meta.env.DEV;
const log = (...args: unknown[]) =>
  // eslint-disable-next-line no-console -- gated by DEBUG (import.meta.env.DEV); dev-only diagnostic (P1200)
  DEBUG && console.log('[calibration-service-real]', ...args);

// Database row type for verifications with joined profiles
interface DbVerificationWithProfiles {
  id: string;
  story_id: string | null;
  version_id: string | null;
  session_id: string | null;
  speaker_id: string;
  listener_id: string;
  speaker_rating: number;
  listener_rating: number;
  accuracy_achieved: boolean;
  created_at: string;
  speaker: {
    name: string | null;
    slug: string | null;
  } | null;
  listener: {
    name: string | null;
    slug: string | null;
  } | null;
}

/**
 * Transform database row to StoryVerification type
 */
function mapVerificationFromDb(row: {
  id: string;
  story_id: string | null;
  version_id: string | null;
  session_id: string | null;
  speaker_id: string;
  listener_id: string;
  speaker_rating: number;
  listener_rating: number;
  accuracy_achieved: boolean;
  created_at: string;
  source?: string | null;
  verified?: boolean | null;
  sort_order?: number | null;
}): StoryVerification {
  return {
    id: row.id,
    storyId: row.story_id ?? undefined,
    versionId: row.version_id ?? undefined,
    sessionId: row.session_id ?? undefined,
    speakerId: row.speaker_id,
    listenerId: row.listener_id,
    speakerRating: row.speaker_rating,
    listenerRating: row.listener_rating,
    accuracyAchieved: row.accuracy_achieved,
    createdAt: row.created_at,
    source: row.source ?? 'live',
    verified: row.verified ?? true,
    sortOrder: row.sort_order ?? null,
  };
}

/**
 * Transform database row to StoryVerificationWithProfiles type
 */
function mapVerificationWithProfilesFromDb(
  row: DbVerificationWithProfiles
): StoryVerificationWithProfiles {
  return {
    id: row.id,
    storyId: row.story_id,
    versionId: row.version_id,
    sessionId: row.session_id ?? undefined,
    speakerId: row.speaker_id,
    listenerId: row.listener_id,
    speakerRating: row.speaker_rating,
    listenerRating: row.listener_rating,
    accuracyAchieved: row.accuracy_achieved,
    createdAt: row.created_at,
    speakerName: row.speaker?.name ?? 'Unknown',
    speakerSlug: row.speaker?.slug ?? '',
    listenerName: row.listener?.name ?? 'Unknown',
    listenerSlug: row.listener?.slug ?? '',
  };
}

const SESSIONS_THRESHOLD = 5; // Match REQUIRED_SESSIONS

export const realCalibrationService: CalibrationService = {
  // ============================================================================
  // CALIBRATION STATS
  // ============================================================================

  async getCalibration(userId: string): Promise<CalibrationResult> {
    log(' getCalibration:', userId);

    // Get profile with cached counts
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('ears_count, verification_session_count')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      logDbError('getCalibration', profileError);
      return {
        status: 'insufficient',
        sessionsCompleted: 0,
        sessionsRequired: SESSIONS_THRESHOLD,
      };
    }

    // Compute calibration averages on-read using SQL AVG() (per spec decision)
    // Use direct aggregate queries — the RPC helpers (get_listener_calibration_avgs,
    // get_speaker_calibration_avgs) are not available on all environments and would
    // produce browser-level 404 errors when missing.
    let listenerCalibrationAvg: number | null = null;
    let listenerSelfRatingAvg: number | null = null;
    let calibrationGap: number | null = null;
    let speakerCalibrationAvg: number | null = null;
    let speakerListenerSelfRatingAvg: number | null = null;

    const [listenerAgg, speakerAgg] = await Promise.all([
      supabase
        .from('story_verifications')
        .select('speaker_rating, listener_rating')
        .eq('listener_id', userId)
        // eligibility: matches get_my_listener_calibration_diffs WHERE clause
        .not('speaker_rating', 'is', null)
        .not('listener_rating', 'is', null),
      supabase
        .from('story_verifications')
        .select('speaker_rating, listener_rating')
        .eq('speaker_id', userId),
    ]);

    if (listenerAgg.error) logDbError('getCalibration.listenerAgg', listenerAgg.error);
    if (speakerAgg.error) logDbError('getCalibration.speakerAgg', speakerAgg.error);

    // Gate on listener-specific count — verification_session_count counts both roles
    const listenerCount = listenerAgg.data?.length ?? 0;
    if (listenerCount < SESSIONS_THRESHOLD) {
      return {
        status: 'insufficient',
        sessionsCompleted: listenerCount,
        sessionsRequired: SESSIONS_THRESHOLD,
      };
    }

    if (listenerAgg.data && listenerAgg.data.length > 0) {
      listenerCalibrationAvg =
        listenerAgg.data.reduce((sum, v) => sum + v.speaker_rating, 0) / listenerAgg.data.length;
      listenerSelfRatingAvg =
        listenerAgg.data.reduce((sum, v) => sum + v.listener_rating, 0) / listenerAgg.data.length;
      calibrationGap = listenerSelfRatingAvg - listenerCalibrationAvg;
    }

    if (speakerAgg.data && speakerAgg.data.length > 0) {
      speakerCalibrationAvg =
        speakerAgg.data.reduce((sum, v) => sum + v.speaker_rating, 0) / speakerAgg.data.length;
      speakerListenerSelfRatingAvg =
        speakerAgg.data.reduce((sum, v) => sum + v.listener_rating, 0) / speakerAgg.data.length;
    }

    const calibration: CalibrationStats = {
      earsCount: earCountOf(profile),
      listenerSessionCount: listenerCount,
      speakerSessionCount: speakerAgg.data?.length ?? 0,
      listenerCalibrationAvg,
      listenerSelfRatingAvg,
      speakerCalibrationAvg,
      speakerListenerSelfRatingAvg,
      calibrationGap,
    };

    return {
      status: 'sufficient',
      sessionsCompleted: listenerCount,
      sessionsRequired: SESSIONS_THRESHOLD,
      calibration,
    };
  },

  async getEarsCount(userId: string): Promise<number> {
    log(' getEarsCount:', userId);

    const { data, error } = await supabase
      .from('profiles')
      .select('ears_count')
      .eq('id', userId)
      .single();

    if (error || !data) {
      logDbError('getEarsCount', error);
      return 0;
    }

    return earCountOf(data);
  },

  async getSessionCount(userId: string): Promise<number> {
    log(' getSessionCount:', userId);

    const { data, error } = await supabase
      .from('profiles')
      .select('verification_session_count')
      .eq('id', userId)
      .single();

    if (error || !data) {
      logDbError('getSessionCount', error);
      return 0;
    }

    return data.verification_session_count ?? 0;
  },

  // ============================================================================
  // VERIFICATIONS
  // ============================================================================

  async recordVerification(
    input: RecordVerificationInput
  ): Promise<StoryVerification | null> {
    log(' recordVerification:', input);

    const { data, error } = await supabase
      .from('story_verifications')
      .insert({
        story_id: input.storyId ?? null,
        version_id: input.versionId ?? null,
        session_id: input.sessionId ?? null,
        speaker_id: input.speakerId,
        listener_id: input.listenerId,
        speaker_rating: input.speakerRating,
        listener_rating: input.listenerRating,
      })
      .select('*')
      .single();

    if (error || !data) {
      logDbError('recordVerification', error);
      return null;
    }

    return mapVerificationFromDb(data);
  },

  async getStoryVerifications(storyId: string): Promise<StoryVerificationWithProfiles[]> {
    log(' getStoryVerifications:', storyId);

    const { data, error } = await supabase
      .from('story_verifications')
      .select(
        `
        *,
        speaker:profiles!story_verifications_speaker_id_fkey (
          name,
          slug
        ),
        listener:profiles!story_verifications_listener_id_fkey (
          name,
          slug
        )
      `
      )
      .eq('story_id', storyId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      logDbError('getStoryVerifications', error);
      return [];
    }

    return (data as DbVerificationWithProfiles[]).map(mapVerificationWithProfilesFromDb);
  },

  async getListenerVerificationHistory(
    userId: string
  ): Promise<StoryVerificationWithProfiles[]> {
    log(' getListenerVerificationHistory:', userId);

    const { data, error } = await supabase
      .from('story_verifications')
      .select(
        `
        *,
        speaker:profiles!story_verifications_speaker_id_fkey (
          name,
          slug
        ),
        listener:profiles!story_verifications_listener_id_fkey (
          name,
          slug
        )
      `
      )
      .eq('listener_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      logDbError('getListenerVerificationHistory', error);
      return [];
    }

    return (data as DbVerificationWithProfiles[]).map(mapVerificationWithProfilesFromDb);
  },

  async getSpeakerVerificationHistory(
    userId: string
  ): Promise<StoryVerificationWithProfiles[]> {
    log(' getSpeakerVerificationHistory:', userId);

    const { data, error } = await supabase
      .from('story_verifications')
      .select(
        `
        *,
        speaker:profiles!story_verifications_speaker_id_fkey (
          name,
          slug
        ),
        listener:profiles!story_verifications_listener_id_fkey (
          name,
          slug
        )
      `
      )
      .eq('speaker_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      logDbError('getSpeakerVerificationHistory', error);
      return [];
    }

    return (data as DbVerificationWithProfiles[]).map(mapVerificationWithProfilesFromDb);
  },
};
