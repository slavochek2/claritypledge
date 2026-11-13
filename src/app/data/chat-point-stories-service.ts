/**
 * @file chat-point-stories-service.ts
 * @description P1631: "Add a story" on a point card published in a chat. One checked write (point_chat_add_story, migration 20261113200000): a NEW private story, bound to that
 * CARD (its message id), readable by exactly the people who can read that card while it is live. It is never an ordinary story link (the database refuses linking a bound story anywhere else).
 */
import { supabase } from '@/lib/supabase';
import { extractHashtags } from '@/lib/utils';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { throwDbError } from './db-error-logger';
import { storiesService } from './stories-service';

/**
 * The caller's OWN stories written on a shared point card, as a set of ids. Pickers that would copy a story's text to someone else (the live session's story picker) leave these out;
 * the database refuses them anyway (a clarity_sessions trigger), so a failed read returns an empty set instead of hiding the picker.
 */
export async function getMyChatBoundStoryIds(): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('my_chat_bound_story_ids');
  if (error || !Array.isArray(data)) return new Set();
  return new Set(data as string[]);
}

/** The live session's story picker: the person's own stories with their points, minus the ones written on a shared chat card (for that card's readers only). */
export async function getOwnStoriesForLiveSession(userId: string) {
  const [stories, bound] = await Promise.all([storiesService.getStoriesByAuthorWithPoints(userId, userId), getMyChatBoundStoryIds()]);
  return stories.filter((s) => !bound.has(s.id));
}

/** Writes the caller's story on a shared point card and returns its id; throws when the database refuses (not a reader of the card, empty text). */
export async function addChatPointStory(pointId: string, messageId: string, content: string): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('point_chat_add_story', { p_point: pointId, p_message: messageId, p_content: content, p_tags: extractHashtags(content) });
    const id = (data as { story_id?: string } | null)?.story_id;
    if (error || !id) throwDbError('chatPointStories.add', error, `Could not add your story: ${error?.message ?? 'no id'}`);
    return id as string;
  } finally {
    clearListReturnCache(); // an own write to a cached table: Back must not serve the pre-write list
  }
}
