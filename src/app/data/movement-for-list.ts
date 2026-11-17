/**
 * @file movement-for-list.ts
 * @description P1061: a list of stories and their "N moved" counts arrive together. A list read (the feed, /stake)
 * passes its stories through `withMovement` before handing the rows to the page: one request for the whole page,
 * each count attached to its own story. So no chip appears after the cards, and the counts travel inside the very
 * rows the Back cache and the offline cache already keep (a Back shows them with no second fetch).
 *
 * A failed count read (already reported by throwDbError) leaves the stories as they were: no chip, never a zero,
 * and the next fresh visit asks again.
 */
import type { StoryWithAuthor } from '@/app/types';
import type { StoryMovement } from '@/lib/position-movement';
import { getStoryMovements } from './movement-service';

/** A story that may carry its count. Only `withMovement` sets it; every other read leaves it out. */
export type CountedStory = StoryWithAuthor & { movement?: StoryMovement };

/** The count a story carries, or undefined (not read, failed, or nobody it verified: no chip in each case). */
export function movementOf(story: StoryWithAuthor): StoryMovement | undefined {
  return (story as CountedStory).movement;
}

/** The story page's one story, with its count: read with the story, so the chip and arrows appear with the page. */
export async function withStoryMovement<T extends StoryWithAuthor>(story: T | null): Promise<T | null> {
  return story ? ((await withMovement([story]))[0] as T) : story;
}

export async function withMovement<T extends StoryWithAuthor>(stories: T[]): Promise<T[]> {
  if (stories.length === 0) return stories;
  try {
    const byStory = await getStoryMovements(stories.map(s => s.id));
    return stories.map(s => {
      const movement = byStory.get(s.id);
      return movement ? { ...s, movement } : s;
    });
  } catch {
    return stories;
  }
}
