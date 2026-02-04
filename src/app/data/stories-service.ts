/**
 * @file stories-service.ts
 * @description P117: Switchable stories service (mock/real)
 */

import { mockStoriesService } from './stories-service-mock';
import { realStoriesService } from './stories-service-real';

// Feature flag controls which implementation is used
const USE_REAL_API = import.meta.env.VITE_USE_REAL_STORIES_API === 'true';

export const storiesService = USE_REAL_API ? realStoriesService : mockStoriesService;

export type { StoriesService, CreateStoryInput, UpdateStoryInput } from './stories-service.interface';
