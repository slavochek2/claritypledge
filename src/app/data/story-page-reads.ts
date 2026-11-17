/**
 * @file story-page-reads.ts
 * @description The story page's two reads of the story itself: its stN slug, and the story with its points and
 * (P1061) its "N moved" count, read together so the chip and the point arrows appear with the page.
 */
import { storiesService } from './stories-service';
import { withStoryMovement } from './movement-for-list';
import type { StoryWithPoints } from '@/app/types';

export { resolveStorySlug } from './stories-service-real';

export async function getStoryPageStory(storyId: string): Promise<StoryWithPoints | null> {
  return withStoryMovement(await storiesService.getStoryWithPoints(storyId));
}
