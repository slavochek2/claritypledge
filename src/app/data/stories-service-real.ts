/**
 * @file stories-service-real.ts
 * @description P117: Real Supabase stories service implementation
 */

import type { StoriesService } from './stories-service.interface';
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
import { pointsService } from './points-service';

// Debug logging - only in development
const DEBUG = import.meta.env.DEV;
const log = (...args: unknown[]) => DEBUG && console.log('[stories-service-real]', ...args);

// Database row type with joined author profile
interface DbStoryWithAuthor {
  id: string;
  author_id: string;
  title?: string;
  content: string;
  visibility: StoryVisibility;
  current_version: number;
  understood_count: number;
  created_at: string;
  updated_at: string;
  tags: string[];
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
  title: string;
  content: string;
  created_at: string;
}

// Database row type for story_points with joined point
interface DbStoryPointWithPoint {
  point_id: string;
  point: {
    id: string;
    statement: string;
    context: string | null;
    tags: string[];
  } | null;
}

/**
 * Transform database row to Story type
 */
function mapStoryFromDb(row: DbStoryWithAuthor): StoryWithAuthor {
  return {
    id: row.id,
    authorId: row.author_id,
    content: row.content,
    visibility: row.visibility ?? 'public',
    currentVersion: row.current_version,
    understoodCount: row.understood_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags: row.tags || [],
    // Author info from joined profile
    authorName: row.author?.name ?? 'Unknown',
    authorSlug: row.author?.slug ?? '',
    authorRole: row.author?.role ?? undefined,
    authorAvatarColor: row.author?.avatar_color ?? '#3B82F6',
    authorAvatarUrl: row.author?.avatar_url ?? undefined,
    authorEarsCount: row.author?.ears_count ?? 0,
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
    context: row.point.context ?? undefined,
    tags: row.point.tags || [],
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
    visibility: StoryVisibility = 'public'
  ): Promise<Story | null> {
    // Use authenticated user, not caller-supplied authorId (RLS requires auth.uid() match)
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      log('ERROR: createStory - not authenticated');
      return null;
    }

    log(' createStory:', { authorId: user.id, visibility });

    const { data, error } = await supabase
      .from('stories')
      .insert({
        author_id: user.id,
        content,
        tags,
        visibility,
      })
      .select('*')
      .single();

    if (error || !data) {
      log('ERROR: createStory error:', error);
      return null;
    }

    return {
      id: data.id,
      authorId: data.author_id,
      content: data.content,
      visibility: data.visibility ?? 'public',
      currentVersion: data.current_version,
      understoodCount: data.understood_count,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      tags: data.tags || [],
    };
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
          context,
          tags
        )
      `)
      .eq('story_id', storyId);

    if (pointsError) {
      log('ERROR: getStoryWithPoints points error:', pointsError);
    }

    const points: PointSummary[] = (storyPoints || [])
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
      log('ERROR: getStoryVersions error:', error);
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
      log('ERROR: getStoriesByAuthor error:', error);
      return [];
    }

    return (data as DbStoryWithAuthor[]).map(mapStoryFromDb);
  },

  async getStoriesByAuthorWithPoints(authorId: string, userId?: string): Promise<StoryWithPoints[]> {
    log(' getStoriesByAuthorWithPoints:', authorId);

    // Get all stories by author first
    const stories = await this.getStoriesByAuthor(authorId);
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
          context,
          tags
        )
      `)
      .in('story_id', storyIds);

    if (pointsError) {
      log('ERROR: getStoriesByAuthorWithPoints points error:', pointsError);
    }

    // Group points by story ID
    const pointsByStory = new Map<string, PointSummary[]>();
    const allPointIds: string[] = [];

    (storyPoints || []).forEach(sp => {
      // Check if point exists before attempting to map (guards against orphaned story_points)
      if (!sp.point) {
        log('WARN: getStoriesByAuthorWithPoints found orphaned story_point (missing point):', sp);
        return;
      }
      const mapped = mapPointSummaryFromDb(sp as DbStoryPointWithPoint);
      if (mapped) {
        const storyId = (sp as { story_id: string }).story_id;
        if (!pointsByStory.has(storyId)) {
          pointsByStory.set(storyId, []);
        }
        pointsByStory.get(storyId)!.push(mapped);
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
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error || !data) {
      log('ERROR: getStoriesFeed error:', error);
      return [];
    }

    return (data as DbStoryWithAuthor[]).map(mapStoryFromDb);
  },

  // ============================================================================
  // UPDATE
  // ============================================================================

  async updateStory(
    storyId: string,
    updates: { content?: string; tags?: string[]; visibility?: StoryVisibility }
  ): Promise<Story | null> {
    log(' updateStory:', { storyId, updates });

    const updateData: Record<string, unknown> = {};
    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.tags !== undefined) updateData.tags = updates.tags;
    if (updates.visibility !== undefined) updateData.visibility = updates.visibility;

    const { data, error } = await supabase
      .from('stories')
      .update(updateData)
      .eq('id', storyId)
      .select('*')
      .single();

    if (error || !data) {
      log('ERROR: updateStory error:', error);
      return null;
    }

    return {
      id: data.id,
      authorId: data.author_id,
      content: data.content,
      visibility: data.visibility ?? 'public',
      currentVersion: data.current_version,
      understoodCount: data.understood_count,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      tags: data.tags || [],
    };
  },

  async linkPointToStory(storyId: string, pointId: string): Promise<boolean> {
    log(' linkPointToStory:', { storyId, pointId });

    const { error } = await supabase
      .from('story_points')
      .insert({
        story_id: storyId,
        point_id: pointId,
      });

    if (error) {
      if (error.code === '23505') return true; // already linked — idempotent success
      log('ERROR: linkPointToStory error:', error);
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
      log('ERROR: unlinkPointFromStory error:', error);
      return false;
    }

    return true;
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
      log('ERROR: deleteStory error:', error);
      return false;
    }

    return true;
  },
};
