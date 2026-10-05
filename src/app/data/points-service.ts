/**
 * @file points-service.ts
 * @description P117: Switchable points service (mock/real)
 */

import { mockPointsService } from './points-service-mock';
import { realPointsService } from './points-service-real';
import { withListReturnCacheInvalidation } from '@/lib/list-return-cache';
import { recordOwnPosition } from './own-position-writes';
import { takeCallerGeneration } from './position-write-generation';
import type { PointsService as PointsServiceType } from './points-service.interface';
import type { PositionType } from '@/app/types';

// Single feature flag for all p117 services (stories, points, calibration)
// Using separate flags risks mixed mock/real state causing join failures
const USE_REAL_API = import.meta.env.VITE_USE_REAL_API === 'true';

// P1364: every write that can change a /feed or /stake row clears the Back cache.
const baseService = withListReturnCacheInvalidation(
  USE_REAL_API ? realPointsService : mockPointsService,
  ['createPoint', 'setPosition', 'removePosition'],
);

/**
 * P1420: a position write the server confirmed is written through to the offline read cache
 * (/feed, /stake), so no cached or in-flight copy brings the old position back.
 */
export const pointsService: PointsServiceType = {
  ...baseService,
  // Every write is recorded under the generation it was MADE with (position-write-generation.ts):
  // an answer arriving after a newer write's never overwrites it in the cache.
  async setPosition(pointId: string, userId: string, position: PositionType, reasoning?: string) {
    const generation = takeCallerGeneration(); // read before the first await
    await baseService.setPosition(pointId, userId, position, reasoning);
    void recordOwnPosition(pointId, userId, position, generation);
  },
  async removePosition(pointId: string, userId: string) {
    const generation = takeCallerGeneration(); // read before the first await
    await baseService.removePosition(pointId, userId);
    void recordOwnPosition(pointId, userId, null, generation);
  },
};

export type { PointsService, CreatePointInput } from './points-service.interface';
