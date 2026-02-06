/**
 * @file points-service.ts
 * @description P117: Switchable points service (mock/real)
 */

import { mockPointsService } from './points-service-mock';
import { realPointsService } from './points-service-real';

// Single feature flag for all p117 services (stories, points, calibration)
// Using separate flags risks mixed mock/real state causing join failures
const USE_REAL_API = import.meta.env.VITE_USE_REAL_API === 'true';

export const pointsService = USE_REAL_API ? realPointsService : mockPointsService;

export type { PointsService, CreatePointInput } from './points-service.interface';
