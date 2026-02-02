/**
 * @file calibration-service-mock.ts
 * @description P113: Mock calibration service for prototype promotion.
 * KISS pattern - simple mock file, no interface/switcher until backend exists.
 *
 * Calibration logic:
 * - < 5 sessions: insufficient data, show "Complete X more sessions"
 * - >= 5 sessions: show calibration scores
 */

export interface CalibrationScore {
  overall: number; // 0-100
  asListener: number; // 0-100
  asSpeaker: number; // 0-100
}

export interface CalibrationResult {
  status: 'sufficient' | 'insufficient';
  sessionsCompleted: number;
  sessionsRequired: number;
  calibration?: CalibrationScore;
}

// Mock session counts per user
const mockSessionCounts: Record<string, number> = {
  'mock-user-1': 8, // Has enough sessions
  'mock-user-2': 3, // Not enough sessions
  'mock-user-3': 12, // Has enough sessions
};

// Mock calibration data for users with sufficient sessions
const mockCalibrations: Record<string, CalibrationScore> = {
  'mock-user-1': {
    overall: 72,
    asListener: 68,
    asSpeaker: 76,
  },
  'mock-user-3': {
    overall: 85,
    asListener: 88,
    asSpeaker: 82,
  },
};

const REQUIRED_SESSIONS = 5;

export const calibrationService = {
  /**
   * Get calibration data for a user
   * Returns insufficient status if < 5 sessions, otherwise returns calibration scores
   */
  getCalibration(userId: string): CalibrationResult {
    const sessionsCompleted = mockSessionCounts[userId] || 0;

    if (sessionsCompleted < REQUIRED_SESSIONS) {
      return {
        status: 'insufficient',
        sessionsCompleted,
        sessionsRequired: REQUIRED_SESSIONS,
      };
    }

    return {
      status: 'sufficient',
      sessionsCompleted,
      sessionsRequired: REQUIRED_SESSIONS,
      calibration: mockCalibrations[userId] || {
        overall: 70, // Default calibration for users without specific mock data
        asListener: 70,
        asSpeaker: 70,
      },
    };
  },

  /**
   * Get the number of sessions completed by a user
   */
  getSessionCount(userId: string): number {
    return mockSessionCounts[userId] || 0;
  },

  /**
   * Get the threshold for calibration to be shown
   */
  getRequiredSessions(): number {
    return REQUIRED_SESSIONS;
  },
};
