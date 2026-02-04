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

// Re-export constant
export { REQUIRED_SESSIONS } from './calibration-service.interface';

// Debug logging - only in development
const DEBUG = import.meta.env.DEV;
const log = (...args: unknown[]) =>
  DEBUG && console.log('[calibration-service-real]', ...args);

// Database row type for verifications with joined profiles
interface DbVerificationWithProfiles {
  id: string;
  story_id: string;
  version_id: string;
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
  story_id: string;
  version_id: string;
  session_id: string | null;
  speaker_id: string;
  listener_id: string;
  speaker_rating: number;
  listener_rating: number;
  accuracy_achieved: boolean;
  created_at: string;
}): StoryVerification {
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
      log('ERROR: getCalibration profile error:', profileError);
      return {
        status: 'insufficient',
        sessionsCompleted: 0,
        sessionsRequired: SESSIONS_THRESHOLD,
      };
    }

    const sessionsCompleted = profile.verification_session_count ?? 0;

    if (sessionsCompleted < SESSIONS_THRESHOLD) {
      return {
        status: 'insufficient',
        sessionsCompleted,
        sessionsRequired: SESSIONS_THRESHOLD,
      };
    }

    // Compute calibration averages on-read
    // Get all verifications where user was listener
    const { data: listenerVerifications, error: listenerError } = await supabase
      .from('story_verifications')
      .select('speaker_rating, listener_rating')
      .eq('listener_id', userId);

    if (listenerError) {
      log('ERROR: getCalibration listener verifications error:', listenerError);
    }

    // Get all verifications where user was speaker
    const { data: speakerVerifications, error: speakerError } = await supabase
      .from('story_verifications')
      .select('speaker_rating, listener_rating')
      .eq('speaker_id', userId);

    if (speakerError) {
      log('ERROR: getCalibration speaker verifications error:', speakerError);
    }

    // Compute averages
    let listenerCalibrationAvg: number | null = null;
    let listenerSelfRatingAvg: number | null = null;
    let calibrationGap: number | null = null;

    if (listenerVerifications && listenerVerifications.length > 0) {
      const speakerRatings = listenerVerifications.map((v) => v.speaker_rating);
      const listenerSelfRatings = listenerVerifications.map((v) => v.listener_rating);

      listenerCalibrationAvg =
        speakerRatings.reduce((sum, r) => sum + r, 0) / speakerRatings.length;
      listenerSelfRatingAvg =
        listenerSelfRatings.reduce((sum, r) => sum + r, 0) / listenerSelfRatings.length;
      calibrationGap = listenerSelfRatingAvg - listenerCalibrationAvg;
    }

    let speakerCalibrationAvg: number | null = null;
    let speakerListenerSelfRatingAvg: number | null = null;

    if (speakerVerifications && speakerVerifications.length > 0) {
      const speakerGivenRatings = speakerVerifications.map((v) => v.speaker_rating);
      const listenerSelfRatings = speakerVerifications.map((v) => v.listener_rating);

      speakerCalibrationAvg =
        speakerGivenRatings.reduce((sum, r) => sum + r, 0) / speakerGivenRatings.length;
      speakerListenerSelfRatingAvg =
        listenerSelfRatings.reduce((sum, r) => sum + r, 0) / listenerSelfRatings.length;
    }

    const calibration: CalibrationStats = {
      earsCount: profile.ears_count ?? 0,
      sessionCount: sessionsCompleted,
      listenerCalibrationAvg,
      listenerSelfRatingAvg,
      speakerCalibrationAvg,
      speakerListenerSelfRatingAvg,
      calibrationGap,
    };

    return {
      status: 'sufficient',
      sessionsCompleted,
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
      log('ERROR: getEarsCount error:', error);
      return 0;
    }

    return data.ears_count ?? 0;
  },

  async getSessionCount(userId: string): Promise<number> {
    log(' getSessionCount:', userId);

    const { data, error } = await supabase
      .from('profiles')
      .select('verification_session_count')
      .eq('id', userId)
      .single();

    if (error || !data) {
      log('ERROR: getSessionCount error:', error);
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
        story_id: input.storyId,
        version_id: input.versionId,
        session_id: input.sessionId ?? null,
        speaker_id: input.speakerId,
        listener_id: input.listenerId,
        speaker_rating: input.speakerRating,
        listener_rating: input.listenerRating,
      })
      .select('*')
      .single();

    if (error || !data) {
      log('ERROR: recordVerification error:', error);
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
      log('ERROR: getStoryVerifications error:', error);
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
      log('ERROR: getListenerVerificationHistory error:', error);
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
      log('ERROR: getSpeakerVerificationHistory error:', error);
      return [];
    }

    return (data as DbVerificationWithProfiles[]).map(mapVerificationWithProfilesFromDb);
  },
};
