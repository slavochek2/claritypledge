/**
 * @file calibration-service.interface.ts
 * @description P117: Interface for calibration service (mock/real switchable)
 */

import type {
  CalibrationResult,
  StoryVerification,
  StoryVerificationWithProfiles,
} from '@/app/types';

/** Minimum sessions required to show calibration stats */
export const REQUIRED_SESSIONS = 5;

export interface CalibrationService {
  // ============================================================================
  // CALIBRATION STATS
  // ============================================================================

  /**
   * Get calibration data for a user
   * Returns insufficient status if < REQUIRED_SESSIONS sessions, otherwise returns calibration scores.
   * Calibration averages are computed on-read via queries.
   */
  getCalibration(userId: string): Promise<CalibrationResult>;

  /**
   * Get just the ears count (successful listener verifications ≥8/10)
   */
  getEarsCount(userId: string): Promise<number>;

  /**
   * Get session count for a user
   */
  getSessionCount(userId: string): Promise<number>;

  // ============================================================================
  // VERIFICATIONS
  // ============================================================================

  /**
   * Record a verification from a /live session
   * Called whenever both participants complete a paraphrase exchange (both submit ratings).
   * storyId/versionId are optional — loose exchanges without a formal story are counted.
   * Triggers will update ears_count and verification_session_count.
   */
  recordVerification(input: RecordVerificationInput): Promise<StoryVerification | null>;

  /**
   * Get verifications for a story
   */
  getStoryVerifications(storyId: string): Promise<StoryVerificationWithProfiles[]>;

  /**
   * Get verification history for a user (as listener)
   */
  getListenerVerificationHistory(userId: string): Promise<StoryVerificationWithProfiles[]>;

  /**
   * Get verification history for a user (as speaker)
   */
  getSpeakerVerificationHistory(userId: string): Promise<StoryVerificationWithProfiles[]>;
}

export interface RecordVerificationInput {
  storyId?: string;
  versionId?: string;
  sessionId?: string;
  speakerId: string;
  listenerId: string;
  speakerRating: number; // 0-10
  listenerRating: number; // 0-10
}
