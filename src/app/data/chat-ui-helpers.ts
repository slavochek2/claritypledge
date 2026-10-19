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

/** At most this many reply rows are read for the counts of one page of roots. */
const THREAD_STATS_ROW_CAP = 500;

export interface ThreadStat {
  count: number;
  /** Distinct repliers, in first-seen order, for the little faces next to "N replies". */
  authorIds: string[];
}

/** Reply counts for the given root messages (channels only). RLS limits it to what the reader can see. */
export async function getThreadStats(conversationId: string, rootIds: string[]): Promise<Map<string, ThreadStat>> {
  const out = new Map<string, ThreadStat>();
  if (rootIds.length === 0) return out;
  const { data, error } = await supabase
    .from('chat_messages')
    .select('thread_root_id, author_id')
    .eq('conversation_id', conversationId)
    .in('thread_root_id', rootIds)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(THREAD_STATS_ROW_CAP);
  if (error) throw new Error(`chat thread stats failed: ${error.message}`);
  for (const row of (data ?? []) as Array<{ thread_root_id: string | null; author_id: string | null }>) {
    if (!row.thread_root_id) continue;
    const stat = out.get(row.thread_root_id) ?? { count: 0, authorIds: [] };
    stat.count += 1;
    if (row.author_id && !stat.authorIds.includes(row.author_id)) stat.authorIds.push(row.author_id);
    out.set(row.thread_root_id, stat);
  }
  return out;
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
    ...sharablePoints.map((p): Shareable => ({ kind: 'point', id: p.id, title: p.statement, tags: p.tags ?? [], point: p })),
    ...sharableStories.map(
      (s): Shareable => ({ kind: 'story', id: s.id, title: storyTitle(s), tags: s.tags ?? [], story: s, linkedPoints: linked.get(s.id) }),
    ),
  ];
}

/** Filters the picker by words or #tags. */
export function filterShareables(items: Shareable[], query: string, kind: ChatAttachmentKind): Shareable[] {
  const q = query.trim().toLowerCase();
  return items.filter((s) => {
    if (s.kind !== kind) return false;
    if (!q) return true;
    return q.split(/\s+/).every((word) => {
      const w = word.replace(/^#/, '');
      return s.title.toLowerCase().includes(w) || s.tags.some((t) => t.toLowerCase().includes(w));
    });
  });
}

/**
 * The attachment as the reader may see it, or null ("Not available to you"). The services are the
 * normal reader-scoped ones: a private point or story the reader cannot select comes back empty.
 */
export async function loadAttachment(kind: ChatAttachmentKind, id: string, viewerId: string): Promise<Shareable | null> {
  if (kind === 'point') {
    const point = await pointsService.getPointWithUserPosition(id, viewerId);
    if (!point) return null;
    return { kind, id, title: point.statement, tags: point.tags ?? [], point };
  }
  const story = await storiesService.getStory(id);
  if (!story) return null;
  const linked = await storiesService.getPointsForStories([id], viewerId).catch(() => new Map<string, PointSummary[]>());
  return { kind, id, title: storyTitle(story), tags: story.tags ?? [], story, linkedPoints: linked.get(id) };
}
