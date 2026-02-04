/**
 * @file points-service.ts
 * @description P117: Switchable points service (mock/real)
 */

import { mockPointsService } from './points-service-mock';
import { realPointsService } from './points-service-real';

// Feature flag controls which implementation is used
const USE_REAL_API = import.meta.env.VITE_USE_REAL_POINTS_API === 'true';

export const pointsService = USE_REAL_API ? realPointsService : mockPointsService;

export type { PointsService, CreatePointInput } from './points-service.interface';
