/**
 * @file calibration-service.ts
 * @description P117: Switchable calibration service (mock/real)
 */

import { mockCalibrationService } from './calibration-service-mock';
import { realCalibrationService } from './calibration-service-real';

// Single feature flag for all p117 services (stories, points, calibration)
// Using separate flags risks mixed mock/real state causing join failures
const USE_REAL_API = import.meta.env.VITE_USE_REAL_API === 'true';

export const calibrationService = USE_REAL_API
  ? realCalibrationService
  : mockCalibrationService;

export type {
  CalibrationService,
  RecordVerificationInput,
} from './calibration-service.interface';
export { REQUIRED_SESSIONS } from './calibration-service.interface';
