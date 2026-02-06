/**
 * @file stories-service.ts
 * @description P117: Switchable stories service (mock/real)
 */

import { mockStoriesService } from './stories-service-mock';
import { realStoriesService } from './stories-service-real';

// Single feature flag for all p117 services (stories, points, calibration)
// Using separate flags risks mixed mock/real state causing join failures
const USE_REAL_API = import.meta.env.VITE_USE_REAL_API === 'true';

export const storiesService = USE_REAL_API ? realStoriesService : mockStoriesService;

export type { StoriesService, CreateStoryInput, UpdateStoryInput } from './stories-service.interface';
