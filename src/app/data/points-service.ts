/**
 * @file points-service.ts
 * @description P117: Switchable points service (mock/real)
 */

import { mockPointsService } from './points-service-mock';
import { realPointsService } from './points-service-real';
import { withListReturnCacheInvalidation } from '@/lib/list-return-cache';

// Single feature flag for all p117 services (stories, points, calibration)
// Using separate flags risks mixed mock/real state causing join failures
const USE_REAL_API = import.meta.env.VITE_USE_REAL_API === 'true';

// P1364: every write that can change a /feed or /stake row clears the Back cache.
export const pointsService = withListReturnCacheInvalidation(
  USE_REAL_API ? realPointsService : mockPointsService,
  ['createPoint', 'setPosition', 'removePosition'],
);

export type { PointsService, CreatePointInput } from './points-service.interface';
