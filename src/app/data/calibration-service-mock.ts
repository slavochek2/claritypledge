/**
 * @file calibration-service-mock.ts
 * @description P117: Mock calibration service implementing CalibrationService interface
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

export { REQUIRED_SESSIONS } from './calibration-service.interface';

const SESSIONS_THRESHOLD = 5;

// Mock session counts per user
const mockSessionCounts: Record<string, number> = {
  'mock-user-1': 8, // Has enough sessions
  'mock-user-2': 3, // Not enough sessions
  'mock-user-3': 12, // Has enough sessions
};

// Mock ears counts per user
const mockEarsCounts: Record<string, number> = {
  'mock-user-1': 6,
  'mock-user-2': 2,
  'mock-user-3': 10,
};

// Mock calibration data for users with sufficient sessions
const mockCalibrations: Record<string, CalibrationStats> = {
  'mock-user-1': {
    earsCount: 6,
    sessionCount: 8,
    listenerCalibrationAvg: 7.2,
    listenerSelfRatingAvg: 7.8,
    speakerCalibrationAvg: 7.5,
    speakerListenerSelfRatingAvg: 7.0,
    calibrationGap: 0.6, // slightly overconfident
  },
  'mock-user-3': {
    earsCount: 10,
    sessionCount: 12,
    listenerCalibrationAvg: 8.5,
    listenerSelfRatingAvg: 8.2,
    speakerCalibrationAvg: 8.0,
    speakerListenerSelfRatingAvg: 7.8,
    calibrationGap: -0.3, // slightly underconfident
  },
};

// Mock verifications
const mockVerifications: StoryVerificationWithProfiles[] = [
  {
    id: 'verification-1',
    storyId: 'story-1',
    versionId: 'version-1-1',
    sessionId: 'session-1',
    speakerId: 'mock-user-1',
    listenerId: 'mock-user-2',
    speakerRating: 8,
    listenerRating: 7,
    accuracyAchieved: true,
    createdAt: '2024-01-16T10:00:00Z',
    speakerName: 'Sarah Chen',
    speakerSlug: 'sarah-chen',
    listenerName: 'Marcus Johnson',
    listenerSlug: 'marcus-johnson',
  },
  {
    id: 'verification-2',
    storyId: 'story-1',
    versionId: 'version-1-1',
    sessionId: 'session-2',
    speakerId: 'mock-user-1',
    listenerId: 'mock-user-3',
    speakerRating: 9,
    listenerRating: 8,
    accuracyAchieved: true,
    createdAt: '2024-01-17T14:00:00Z',
    speakerName: 'Sarah Chen',
    speakerSlug: 'sarah-chen',
    listenerName: 'Alex Rivera',
    listenerSlug: 'alex-rivera',
  },
];

export const mockCalibrationService: CalibrationService = {
  async getCalibration(userId: string): Promise<CalibrationResult> {
    const sessionsCompleted = mockSessionCounts[userId] || 0;

    if (sessionsCompleted < SESSIONS_THRESHOLD) {
      return {
        status: 'insufficient',
        sessionsCompleted,
        sessionsRequired: SESSIONS_THRESHOLD,
      };
    }

    return {
      status: 'sufficient',
      sessionsCompleted,
      sessionsRequired: SESSIONS_THRESHOLD,
      calibration: mockCalibrations[userId] || {
        earsCount: 5,
        sessionCount: sessionsCompleted,
        listenerCalibrationAvg: 7.0,
        listenerSelfRatingAvg: 7.0,
        speakerCalibrationAvg: 7.0,
        speakerListenerSelfRatingAvg: 7.0,
        calibrationGap: 0,
      },
    };
  },

  async getEarsCount(userId: string): Promise<number> {
    return mockEarsCounts[userId] || 0;
  },

  async getSessionCount(userId: string): Promise<number> {
    return mockSessionCounts[userId] || 0;
  },

  async recordVerification(
    input: RecordVerificationInput
  ): Promise<StoryVerification | null> {
    const now = new Date().toISOString();
    return {
      id: `verification-${Date.now()}`,
      storyId: input.storyId,
      versionId: input.versionId,
      sessionId: input.sessionId,
      speakerId: input.speakerId,
      listenerId: input.listenerId,
      speakerRating: input.speakerRating,
      listenerRating: input.listenerRating,
      accuracyAchieved: input.speakerRating >= 8,
      createdAt: now,
    };
  },

  async getStoryVerifications(storyId: string): Promise<StoryVerificationWithProfiles[]> {
    return mockVerifications
      .filter((v) => v.storyId === storyId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async getListenerVerificationHistory(
    userId: string
  ): Promise<StoryVerificationWithProfiles[]> {
    return mockVerifications
      .filter((v) => v.listenerId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async getSpeakerVerificationHistory(
    userId: string
  ): Promise<StoryVerificationWithProfiles[]> {
    return mockVerifications
      .filter((v) => v.speakerId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
};

