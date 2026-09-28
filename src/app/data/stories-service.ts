/**
 * @file stories-service.ts
 * @description P117: Switchable stories service (mock/real)
 */

import { mockStoriesService } from './stories-service-mock';
import { realStoriesService } from './stories-service-real';
import { withListReturnCacheInvalidation } from '@/lib/list-return-cache';

// Single feature flag for all p117 services (stories, points, calibration)
// Using separate flags risks mixed mock/real state causing join failures
const USE_REAL_API = import.meta.env.VITE_USE_REAL_API === 'true';

// P1364: every write that can change a /feed or /stake row clears the Back cache.
export const storiesService = withListReturnCacheInvalidation(
  USE_REAL_API ? realStoriesService : mockStoriesService,
  ['createStory', 'updateStory', 'deleteStory', 'linkPointToStory', 'unlinkPointFromStory'],
);

export type { StoriesService, CreateStoryInput, UpdateStoryInput } from './stories-service.interface';
