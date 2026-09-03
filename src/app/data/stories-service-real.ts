/**
 * @file stories-service-real.ts
 * @description P117: Real Supabase stories service implementation
 */

import { normalizeVideoQuotes } from '@/lib/video';
import * as Sentry from '@sentry/react';
import type { StoriesService } from './stories-service.interface';
import { logDbError } from './db-error-logger';
import { earCountOf } from './ear-count';
import type {
  Story,
  StoryWithAuthor,
  StoryWithPoints,
  StoryVersion,
  StoryVisibility,
  PointSummary,
  PositionType,
} from '@/app/types';
import { supabase } from '@/lib/supabase';
import { isSystemTag } from '@/lib/feed-utils';
import { pointsService } from './points-service';
import { generateAIBanner } from '@/app/prototypes/events/banner-utils';

// Debug logging - only in development
const DEBUG = import.meta.env.DEV;
// eslint-disable-next-line no-console -- gated by DEBUG (import.meta.env.DEV); dev-only diagnostic (P1200)
const log = (...args: unknown[]) => DEBUG && console.log('[stories-service-real]', ...args);

// Database row type with joined author profile
interface DbStoryWithAuthor {
  id: string;
  author_id: string;
  content: string;
  visibility: StoryVisibility;
  current_version: number;
  understood_count: number;
  created_at: string;
  updated_at: string;
  tags: string[];
  system_tags: string[]; // P630
  banner_url?: string | null;
  image_url?: string | null;
  video_url?: string | null; // P1141
  video_quotes?: unknown; // P1141 — normalized via normalizeVideoQuotes()
  author: {
    id: string;
    name: string | null;
    slug: string | null;
    role: string | null;
    avatar_color: string | null;
    avatar_url: string | null;
    ears_count: number | null;
    has_pledged: boolean | null;
  } | null;
}

// Database row type for story versions
interface DbStoryVersionRow {
  id: string;
  story_id: string;
  version_number: number;
  content: string;
  created_at: string;
}

// Database row type for story_points with joined point
interface DbStoryPointWithPoint {
  point_id: string;
  point: {
    id: string;
    statement: string;
    tags: string[];
    visibility?: string;
  } | null;
}

// Database row type for story_points with joined story (for getStoriesForPoints)
interface DbStoryPointWithStory {
  point_id: string;
  story_id: string;
  story: DbStoryWithAuthor | null;
}

/**
 * Transform database row to Story type
 */
function mapStoryFromDb(row: DbStoryWithAuthor): StoryWithAuthor {
  return {
    id: row.id,
    authorId: row.author_id,
    content: row.content,
    visibility: row.visibility ?? 'private',
    currentVersion: row.current_version,
    understoodCount: row.understood_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags: [...(row.tags || []), ...(row.system_tags || [])],
    systemTags: row.system_tags || [],
    bannerUrl: row.banner_url ?? undefined,
    imageUrl: row.image_url ?? undefined,
    // P1141: the one stored video field, plus its quotes + timecodes.
    videoUrl: row.video_url ?? undefined,
    videoQuotes: normalizeVideoQuotes(row.video_quotes),
    // Author info from joined profile
    authorName: row.author?.name ?? 'Unknown',
    authorSlug: row.author?.slug ?? '',
    authorRole: row.author?.role ?? undefined,
    authorAvatarColor: row.author?.avatar_color ?? '#3B82F6',
    authorAvatarUrl: row.author?.avatar_url ?? undefined,
    authorEarsCount: earCountOf(row.author),
    authorHasPledged: row.author?.has_pledged ?? false,
  };
}

/**
 * Transform database row to StoryVersion type
 */
function mapVersionFromDb(row: DbStoryVersionRow): StoryVersion {
  return {
    id: row.id,
    storyId: row.story_id,
    versionNumber: row.version_number,
    content: row.content,
    createdAt: row.created_at,
  };
}

/**
 * Transform story_points join to PointSummary
 */
function mapPointSummaryFromDb(row: DbStoryPointWithPoint): PointSummary | null {
  if (!row.point) return null;
  return {
    id: row.point.id,
    statement: row.point.statement,
    tags: [...(row.point.tags || []), ...((row.point as { system_tags?: string[] }).system_tags || [])],
    systemTags: (row.point as { system_tags?: string[] }).system_tags || [],
    visibility: row.point.visibility ?? 'public',
    supersededBy: (row.point as { superseded_by?: string | null }).superseded_by ?? undefined,
  };
}

export const realStoriesService: StoriesService = {
  // ============================================================================
  // CREATE
  // ============================================================================

  async createStory(
    _authorId: string,
    content: string,
    tags: string[] = [],
    visibility: StoryVisibility = 'public',
    imageUrl?: string
  ): Promise<Story | null> {
    // Use authenticated user, not caller-supplied authorId — belt to RLS's suspenders
    // (author_id = auth.uid() is enforced by the stories INSERT policy, P1032)
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      log('ERROR: createStory - not authenticated');
      Sentry.captureMessage('createStory: not authenticated', {
        level: 'error',
        extra: { authError: authError?.message },
      });
      return null;
    }

    log(' createStory:', { authorId: user.id, visibility });

    const insertData: Record<string, unknown> = {
      author_id: user.id,
      content,
      tags,
      system_tags: [], // P630: system tags set by migration/triggers, never by client
      visibility,
    };
    if (imageUrl !== undefined) insertData.image_url = imageUrl;

    const { data, error } = await supabase
      .from('stories')
      .insert(insertData)
      .select('*')
      .single();

    if (error || !data) {
      log('ERROR: createStory error:', error);
      Sentry.captureException(new Error(`createStory failed: ${error?.message}`), {
        extra: { code: error?.code, details: error?.details, hint: error?.hint, authorId: user.id },
      });
      return null;
    }

    const story: Story = {
      id: data.id,
      authorId: data.author_id,
      content: data.content,
      visibility: data.visibility ?? 'private',
      currentVersion: data.current_version,
      understoodCount: data.understood_count,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      tags: [...(data.tags || []), ...(data.system_tags || [])],
      systemTags: data.system_tags || [],
      bannerUrl: data.banner_url ?? undefined,
      imageUrl: data.image_url ?? undefined,
      videoUrl: data.video_url ?? undefined,
      videoQuotes: normalizeVideoQuotes(data.video_quotes),
    };

    // P504: Fire-and-forget banner generation after successful insert
    supabase.auth.getSession().then(({ data: sessionData }) => {
      const token = sessionData.session?.access_token;
      if (token) {
        generateAIBanner('story', story.id, token).catch(() => {
          // Silently fail — banner is non-critical
          log('WARN: fire-and-forget banner generation failed for story', story.id);
        });
      }
    });

    return story;
  },

  // ============================================================================
  // READ
  // ============================================================================

  async getStory(storyId: string): Promise<StoryWithAuthor | null> {
    log(' getStory:', storyId);

    const { data, error } = await supabase
      .from('stories')
      .select(`
        *,
        author:profiles!stories_author_id_fkey (
          id,
          name,
          slug,
          role,
          avatar_color,
          avatar_url,
          ears_count,
          has_pledged
        )
      `)
      .eq('id', storyId)
      .single();

    if (error || !data) {
      log(' getStory not found:', storyId);
      return null;
    }

    return mapStoryFromDb(data as DbStoryWithAuthor);
  },

  async getStoryWithPoints(storyId: string): Promise<StoryWithPoints | null> {
    log(' getStoryWithPoints:', storyId);

    // Get story with author
    const story = await this.getStory(storyId);
    if (!story) return null;

    // Get linked points
    const { data: storyPoints, error: pointsError } = await supabase
      .from('story_points')
      .select(`
        point_id,
        point:points!story_points_point_id_fkey (
          id,
          statement,
          tags,
          system_tags,
          created_at,
          visibility,
          superseded_by
        )
      `)
      .eq('story_id', storyId);

    if (pointsError) {
      logDbError('getStoryWithPoints', pointsError);
    }

    const points: PointSummary[] = (storyPoints || [])
      // P800: exclude superseded points — show only current heads
      .filter(sp => !(sp.point as { superseded_by?: string | null } | null)?.superseded_by)
      .sort((a, b) => {
        const aDate = (a as { point?: { created_at?: string } }).point?.created_at ?? '';
        const bDate = (b as { point?: { created_at?: string } }).point?.created_at ?? '';
        return bDate.localeCompare(aDate); // newest first
      })
      .map(sp => mapPointSummaryFromDb(sp as DbStoryPointWithPoint))
      .filter((p): p is PointSummary => p !== null);

    return {
      ...story,
      points,
    };
  },

  async getStoryVersion(versionId: string): Promise<StoryVersion | null> {
    log(' getStoryVersion:', versionId);

    const { data, error } = await supabase
      .from('story_versions')
      .select('*')
      .eq('id', versionId)
      .single();

    if (error || !data) {
      log(' getStoryVersion not found:', versionId);
      return null;
    }

    return mapVersionFromDb(data as DbStoryVersionRow);
  },

  async getStoryVersions(storyId: string): Promise<StoryVersion[]> {
    log(' getStoryVersions:', storyId);

    const { data, error } = await supabase
      .from('story_versions')
      .select('*')
      .eq('story_id', storyId)
      .order('version_number', { ascending: false });

    if (error || !data) {
      logDbError('getStoryVersions', error);
      return [];
    }

    return data.map(row => mapVersionFromDb(row as DbStoryVersionRow));
  },

  async getStoriesByAuthor(authorId: string): Promise<StoryWithAuthor[]> {
    log(' getStoriesByAuthor:', authorId);

    const { data, error } = await supabase
      .from('stories')
      .select(`
        *,
        author:profiles!stories_author_id_fkey (
          id,
          name,
          slug,
          role,
          avatar_color,
          avatar_url,
          ears_count,
          has_pledged
        )
      `)
      .eq('author_id', authorId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      logDbError('getStoriesByAuthor', error);
      return [];
    }

    return (data as DbStoryWithAuthor[]).map(mapStoryFromDb);
  },

  async getStoriesByAuthorWithPoints(authorId: string, userId?: string): Promise<StoryWithPoints[]> {
    log(' getStoriesByAuthorWithPoints:', authorId);

    // Get stories by author — defense-in-depth: hide private stories from non-owners
    let query = supabase
      .from('stories')
      .select(`
        *,
        author:profiles!stories_author_id_fkey (
          id,
          name,
          slug,
          role,
          avatar_color,
          avatar_url,
          ears_count,
          has_pledged
        )
      `)
      .eq('author_id', authorId);

    // P586: Profile is a public surface — always filter to public stories only.
    // Private stories belong in docs/letters context, never on profile pages.
    query = query.eq('visibility', 'public');

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error || !data) {
      logDbError('getStoriesByAuthorWithPoints', error);
      return [];
    }

    const stories = (data as DbStoryWithAuthor[]).map(mapStoryFromDb);
    if (stories.length === 0) return [];

    // Get all points for these stories in one query
    const storyIds = stories.map(s => s.id);
    const { data: storyPoints, error: pointsError } = await supabase
      .from('story_points')
      .select(`
        story_id,
        point_id,
        point:points!story_points_point_id_fkey (
          id,
          statement,
          tags,
          system_tags,
          created_at,
          visibility,
          superseded_by
        )
      `)
      .in('story_id', storyIds);

    if (pointsError) {
      logDbError('getStoriesByAuthorWithPoints.points', pointsError);
    }

    // Sort by point creation date (newest first) before grouping — ensures
    // consistent ordering regardless of when story_points links were created
    const sortedStoryPoints = [...(storyPoints || [])].sort((a, b) => {
      const aDate = (a as { point?: { created_at?: string } }).point?.created_at ?? '';
      const bDate = (b as { point?: { created_at?: string } }).point?.created_at ?? '';
      return bDate.localeCompare(aDate);
    });

    // Group points by story ID
    const pointsByStory = new Map<string, PointSummary[]>();
    const allPointIds: string[] = [];

    sortedStoryPoints.forEach(sp => {
      // Check if point exists before attempting to map (guards against orphaned story_points)
      if (!sp.point) {
        log('WARN: getStoriesByAuthorWithPoints found orphaned story_point (missing point):', sp);
        return;
      }
      // P800: exclude superseded points — show only current heads
      if ((sp.point as { superseded_by?: string | null }).superseded_by) return;
      const mapped = mapPointSummaryFromDb(sp as DbStoryPointWithPoint);
      if (mapped) {
        const storyId = (sp as { story_id: string }).story_id;
        if (!pointsByStory.has(storyId)) {
          pointsByStory.set(storyId, []);
        }
        pointsByStory.get(storyId)?.push(mapped);
        allPointIds.push(mapped.id);
      }
    });

    // Batch-fetch position counts, viewer positions, and author (subject) positions
    const [countsMap, userPositionsMap, subjectPositionsMap] = await Promise.all([
      allPointIds.length > 0
        ? pointsService.getPositionCountsForPoints(allPointIds)
        : Promise.resolve(new Map<string, Record<string, number>>()),
      allPointIds.length > 0 && userId
        ? pointsService.getMyPositionsForPoints(allPointIds, userId)
        : Promise.resolve(new Map<string, { position: string }>()),
      allPointIds.length > 0
        ? pointsService.getMyPositionsForPoints(allPointIds, authorId)
        : Promise.resolve(new Map<string, { position: string }>()),
    ]);

    // Enrich each PointSummary with counts, user position, and author's position
    pointsByStory.forEach((points, storyId) => {
      pointsByStory.set(storyId, points.map(p => ({
        ...p,
        positionCounts: countsMap.get(p.id),
        userPosition: (userPositionsMap.get(p.id) as { position: string } | undefined)?.position as PositionType | null ?? null,
        profileSubjectPosition: (subjectPositionsMap.get(p.id) as { position: string } | undefined)?.position as PositionType | null ?? null,
      })));
    });

    // Combine stories with their points
    return stories.map(story => ({
      ...story,
      points: pointsByStory.get(story.id) || [],
    }));
  },

  async getStoriesFeed(limit: number, offset: number): Promise<StoryWithAuthor[]> {
    log(' getStoriesFeed:', { limit, offset });

    const { data, error } = await supabase
      .from('stories')
      .select(`
        *,
        author:profiles!stories_author_id_fkey (
          id,
          name,
          slug,
          role,
          avatar_color,
          avatar_url,
          ears_count,
          has_pledged
        )
      `)
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error || !data) {
      logDbError('getStoriesFeed', error);
      return [];
    }

    return (data as DbStoryWithAuthor[]).map(mapStoryFromDb);
  },

  async getPublicStoriesFeed(limit: number, offset: number, tag?: string, ascending?: boolean): Promise<StoryWithAuthor[]> {
    log(' getPublicStoriesFeed:', { limit, offset, tag });

    let query = supabase
      .from('stories')
      .select(`
        *,
        author:profiles!stories_author_id_fkey (
          id,
          name,
          slug,
          role,
          avatar_color,
          avatar_url,
          ears_count,
          has_pledged
        )
      `)
      .eq('visibility', 'public');

    if (tag) {
      // P630: Route system tag filters to system_tags column, user tags to tags
      if (isSystemTag(tag)) {
        query = query.contains('system_tags', [tag]);
      } else {
        query = query.contains('tags', [tag]);
      }
    }

    const { data, error } = await query
      .order('created_at', { ascending: ascending ?? false })
      .range(offset, offset + limit - 1);

    if (error || !data) {
      logDbError('getPublicStoriesFeed', error);
      return [];
    }

    return (data as DbStoryWithAuthor[]).map(mapStoryFromDb);
  },

  // ============================================================================
  // UPDATE
  // ============================================================================

  async updateStory(
    storyId: string,
    updates: { content?: string; tags?: string[]; bannerUrl?: string | null; imageUrl?: string | null }
  ): Promise<Story | null> {
    log(' updateStory:', { storyId, updates });

    const updateData: Record<string, unknown> = {};
    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.tags !== undefined) updateData.tags = updates.tags;
    if (updates.bannerUrl !== undefined) updateData.banner_url = updates.bannerUrl;
    if (updates.imageUrl !== undefined) updateData.image_url = updates.imageUrl;

    const { data, error } = await supabase
      .from('stories')
      .update(updateData)
      .eq('id', storyId)
      .select('*')
      .single();

    if (error || !data) {
      logDbError('updateStory', error);
      return null;
    }

    return {
      id: data.id,
      authorId: data.author_id,
      content: data.content,
      visibility: data.visibility ?? 'private',
      currentVersion: data.current_version,
      understoodCount: data.understood_count,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      tags: [...(data.tags || []), ...(data.system_tags || [])],
      systemTags: data.system_tags || [],
      bannerUrl: data.banner_url ?? undefined,
      imageUrl: data.image_url ?? undefined,
      videoUrl: data.video_url ?? undefined,
      videoQuotes: normalizeVideoQuotes(data.video_quotes),
    };
  },

  async linkPointToStory(storyId: string, pointId: string, authorId: string): Promise<boolean> {
    log(' linkPointToStory:', { storyId, pointId, authorId });

    const { error } = await supabase
      .from('story_points')
      .insert({
        story_id: storyId,
        point_id: pointId,
        author_id: authorId,
      });

    if (error) {
      if (error.code === '23505') return true; // already linked — idempotent success
      logDbError('linkPointToStory', error);
      return false;
    }

    return true;
  },

  async unlinkPointFromStory(storyId: string, pointId: string): Promise<boolean> {
    log(' unlinkPointFromStory:', { storyId, pointId });

    const { error } = await supabase
      .from('story_points')
      .delete()
      .eq('story_id', storyId)
      .eq('point_id', pointId);

    if (error) {
      logDbError('unlinkPointFromStory', error);
      return false;
    }

    return true;
  },

  // ============================================================================
  // P465: EDIT-MODE DETECTION
  // ============================================================================

  async getStoryByUserAndPoint(userId: string, pointId: string): Promise<Story | null> {
    log(' getStoryByUserAndPoint:', { userId, pointId });

    const { data: rows, error } = await supabase
      .from('story_points')
      .select('story_id, stories(id, author_id, content, visibility, current_version, understood_count, created_at, updated_at, tags)')
      .eq('author_id', userId)
      .eq('point_id', pointId)
      .limit(1);

    if (error) {
      log('ERROR: getStoryByUserAndPoint error:', error);
      Sentry.captureException(error, { extra: { userId, pointId } });
      return null;
    }

    const data = rows?.[0] ?? null;
    if (!data?.stories) return null;

    const s = data.stories as {
      id: string; author_id: string; content: string;
      visibility: StoryVisibility; current_version: number; understood_count: number;
      created_at: string; updated_at: string; tags: string[]; banner_url?: string | null;
    };

    return {
      id: s.id,
      authorId: s.author_id,
      content: s.content,
      visibility: s.visibility ?? 'private',
      currentVersion: s.current_version ?? 1,
      understoodCount: s.understood_count ?? 0,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      tags: [...(s.tags ?? []), ...((s as { system_tags?: string[] }).system_tags ?? [])],
      systemTags: (s as { system_tags?: string[] }).system_tags ?? [],
      bannerUrl: s.banner_url ?? undefined,
      imageUrl: (s as { image_url?: string | null }).image_url ?? undefined,
      videoUrl: (s as { video_url?: string | null }).video_url ?? undefined,
      videoQuotes: normalizeVideoQuotes((s as { video_quotes?: unknown }).video_quotes),
    };
  },

  // ============================================================================
  // DELETE
  // ============================================================================

  async deleteStory(storyId: string): Promise<boolean> {
    log(' deleteStory:', storyId);

    const { error } = await supabase
      .from('stories')
      .delete()
      .eq('id', storyId);

    if (error) {
      logDbError('deleteStory', error);
      return false;
    }

    return true;
  },

  async getStoriesForPoints(
    pointIds: string[],
    excludeStoryId?: string
  ): Promise<Map<string, StoryWithAuthor[]>> {
    log(' getStoriesForPoints:', { pointIds, excludeStoryId });

    if (pointIds.length === 0) return new Map();

    let query = supabase
      .from('story_points')
      .select(`
        point_id,
        story_id,
        story:stories!story_points_story_id_fkey (
          id,
          author_id,
          content,
          visibility,
          current_version,
          understood_count,
          created_at,
          updated_at,
          tags,
          author:profiles!stories_author_id_fkey (
            id,
            name,
            slug,
            role,
            avatar_color,
            avatar_url,
            ears_count,
            has_pledged
          )
        )
      `)
      .in('point_id', pointIds);

    if (excludeStoryId) {
      query = query.neq('story_id', excludeStoryId);
    }

    const { data, error } = await query;

    if (error || !data) {
      logDbError('getStoriesForPoints', error);
      return new Map();
    }

    const result = new Map<string, StoryWithAuthor[]>();
    for (const row of data as unknown as DbStoryPointWithStory[]) {
      const storyRow = row.story;
      if (!storyRow) continue;
      const story = mapStoryFromDb(storyRow);
      const existing = result.get(row.point_id) ?? [];
      result.set(row.point_id, [...existing, story]);
    }
    // Sort each point's stories newest first
    result.forEach((stories, pointId) => {
      stories.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      result.set(pointId, stories);
    });
    return result;
  },
};

/**
 * Resolve a story slug (e.g. "st1", "st7") to a UUID.
 *
 * Matches the stN tag in system_tags, resolves highest vN version.
 * Returns null if no matching story found.
 */
export async function resolveStorySlug(slug: string): Promise<string | null> {
  const match = slug.match(/^st\d+$/);
  if (!match) return null;

  const stTag = match[0];

  const { data, error } = await supabase
    .from('stories')
    .select('id, system_tags')
    .contains('system_tags', [stTag]);

  if (error || !data?.length) return null;

  // Find highest version number from system_tags
  const withVersion = data.map((s: { id: string; system_tags: string[] }) => {
    const vTag = s.system_tags.find((t: string) => /^v\d+$/.test(t));
    return { id: s.id, version: vTag ? parseInt(vTag.slice(1), 10) : 0 };
  });

  withVersion.sort((a: { version: number }, b: { version: number }) => b.version - a.version);
  return withVersion[0].id;
}
