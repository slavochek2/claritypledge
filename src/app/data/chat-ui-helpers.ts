/**
 * P1512: reads the chat UI needs that chat-service.ts does not carry — message authors in one
 * query, thread reply counts, and the points / stories a person can attach.
 *
 * Everything here goes through the signed-in user's own access (RLS or the reader-scoped services),
 * so a row the reader may not see simply does not come back. No writes.
 */

import { supabase } from '@/lib/supabase';
import { pointsService } from '@/app/data/points-service';
import { storiesService } from '@/app/data/stories-service';
import { filterByTags } from '@/lib/feed-utils';
import type { ChatAttachmentKind } from './chat-mappers';
import type { PointSummary, PointWithUserPosition, StoryWithAuthor } from '@/app/types';

/** What a message row needs to show who wrote it. */
export interface ChatAuthor {
  id: string;
  name: string;
  slug: string | null;
  avatarUrl: string | null;
  avatarColor: string | null;
  hasPledged: boolean;
}

interface AuthorRow {
  id: string;
  name: string | null;
  slug: string | null;
  avatar_url: string | null;
  avatar_color: string | null;
  has_pledged: boolean | null;
}

/** One select for many authors (the same public columns the agreements list reads for avatars). */
export async function getChatAuthors(ids: string[]): Promise<ChatAuthor[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, slug, avatar_color, avatar_url, has_pledged')
    .in('id', unique);
  if (error) throw new Error(`chat authors failed: ${error.message}`);
  return ((data ?? []) as AuthorRow[]).map((r) => ({
    id: r.id,
    name: r.name ?? 'Unknown',
    slug: r.slug,
    avatarUrl: r.avatar_url,
    avatarColor: r.avatar_color,
    hasPledged: r.has_pledged === true,
  }));
}

// ---------------------------------------------------------------------------
// Attachments: a point or story, rendered through the reader's own access
// ---------------------------------------------------------------------------

export interface Shareable {
  kind: ChatAttachmentKind;
  id: string;
  /** One line for search and aria labels. */
  title: string;
  tags: string[];
  /** System tags (st-group, version): searchable like the feed's tag filter, never shown. */
  systemTags?: string[];
  point?: PointWithUserPosition;
  story?: StoryWithAuthor;
  linkedPoints?: PointSummary[];
}

const STORY_TITLE_MAX = 80;
const storyTitle = (s: StoryWithAuthor) =>
  s.content.length > STORY_TITLE_MAX ? `${s.content.slice(0, STORY_TITLE_MAX).trimEnd()}…` : s.content;

/** The points a person holds and the stories they wrote, minus anything private (never offered for sharing). */
export async function loadMyShareables(profileId: string): Promise<Shareable[]> {
  const [points, stories] = await Promise.all([
    pointsService.getPointsForProfileDisplay(profileId, profileId),
    storiesService.getStoriesByAuthor(profileId),
  ]);
  const sharablePoints = points.filter((p) => p.visibility !== 'private');
  const sharableStories = stories.filter((s) => s.visibility !== 'private');
  const linked = sharableStories.length
    ? await storiesService
        .getPointsForStories(
          sharableStories.map((s) => s.id),
          profileId,
        )
        .catch(() => new Map<string, PointSummary[]>())
    : new Map<string, PointSummary[]>();
  return [
    ...sharablePoints.map((p): Shareable => ({ kind: 'point', id: p.id, title: p.statement, tags: p.tags ?? [], systemTags: p.systemTags ?? [], point: p })),
    ...sharableStories.map(
      (s): Shareable => ({ kind: 'story', id: s.id, title: storyTitle(s), tags: s.tags ?? [], systemTags: s.systemTags ?? [], story: s, linkedPoints: linked.get(s.id) }),
    ),
  ];
}

/**
 * Filters the picker by words or #tags. Tags match the way the feed's tag filter does
 * (`filterByTags`: user and system tags, any of several), so "#st1 #st2" finds both groups;
 * a bare word narrows by text, or by a tag it equals ("st1").
 */
export function filterShareables(items: Shareable[], query: string, kind: ChatAttachmentKind): Shareable[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const tagWords = words.filter((w) => w.startsWith('#')).map((w) => w.slice(1)).filter(Boolean);
  const textWords = words.filter((w) => !w.startsWith('#'));
  const hasTag = (s: Shareable, w: string) => [...s.tags, ...(s.systemTags ?? [])].some((t) => t.toLowerCase() === w);
  return items.filter((s) => {
    if (s.kind !== kind) return false;
    if (tagWords.length) {
      const lowered = { tags: s.tags.map((t) => t.toLowerCase()), systemTags: (s.systemTags ?? []).map((t) => t.toLowerCase()) };
      if (filterByTags([lowered], tagWords).length === 0) return false;
    }
    return textWords.every((w) => s.title.toLowerCase().includes(w) || hasTag(s, w));
  });
}

/**
 * The attachment as the reader may see it, or null ("Not available to you"). The services are the
 * normal reader-scoped ones: a private point or story the reader cannot select comes back empty.
 */
export async function loadAttachment(kind: ChatAttachmentKind, id: string, viewerId: string): Promise<Shareable | null> {
  if (kind === 'point') {
    const point = await pointsService.getPointWithUserPosition(id, viewerId);
    if (!point) return confirmHidden('points', id);
    return { kind, id, title: point.statement, tags: point.tags ?? [], point };
  }
  const story = await storiesService.getStory(id);
  if (!story) return confirmHidden('stories', id);
  const linked = await storiesService.getPointsForStories([id], viewerId).catch(() => new Map<string, PointSummary[]>());
  return { kind, id, title: storyTitle(story), tags: story.tags ?? [], story, linkedPoints: linked.get(id) };
}

/**
 * The services answer "nothing" for a failed read as well as for a row the reader may not see. Telling
 * someone "Not available to you" because their connection dropped is wrong, so before accepting null ask
 * once more, plainly: an error (or a row that is visible after all) is a failure to retry; only a clean
 * "no such row for you" is access.
 */
async function confirmHidden(table: 'points' | 'stories', id: string): Promise<null> {
  const { data, error } = await supabase.from(table).select('id').eq('id', id).maybeSingle();
  if (error) throw error;
  if (data) throw new Error(`Could not read ${table} ${id}`);
  return null;
}
