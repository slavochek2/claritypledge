/**
 * @file docs-service.ts
 * @description P551: Clarity Docs service — real Supabase implementation.
 * No mock service needed; docs are a new feature with no legacy mock layer.
 */

import * as Sentry from '@sentry/react';
import type { DocsService } from './docs-service.interface';
import { logDbError, throwDbError } from './db-error-logger';
import { earCountOf } from './ear-count';
import type {
  ClarityDoc,
  DocStory,
  DbClarityDoc,
  DbDocStory,
  DocPointConfig,
  ContentVisibility,
  StoryWithAuthor,
  PointSummary,
} from '@/app/types';
import { supabase } from '@/lib/supabase';

// Debug logging - only in development
const DEBUG = import.meta.env.DEV;
const log = (...args: unknown[]) => DEBUG && console.log('[docs-service]', ...args);

// Database row type for doc_stories with joined story + author + points
interface DbDocStoryWithStory extends DbDocStory {
  story: {
    id: string;
    author_id: string;
    content: string;
    visibility: string;
    current_version: number;
    understood_count: number;
    created_at: string;
    updated_at: string;
    tags: string[];
    banner_url?: string | null;
    image_url?: string | null;
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
    story_points: Array<{
      point_id: string;
      point: {
        id: string;
        statement: string;
        context: string | null;
        tags: string[];
        visibility: string | null;
      } | null;
    }>;
  };
}

// Database row type for stories with joined author (for getCompatibleStories)
interface DbStoryWithAuthor {
  id: string;
  author_id: string;
  content: string;
  visibility: string;
  current_version: number;
  understood_count: number;
  created_at: string;
  updated_at: string;
  tags: string[];
  banner_url?: string | null;
  image_url?: string | null;
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

/**
 * Transform DB doc row to ClarityDoc. story_count comes from a computed column
 * or must be set by the caller. has_sent_letters defaults to false; caller
 * overwrites after the clarity_letters check in getDocsByUser.
 */
function mapDocFromDb(row: DbClarityDoc & { story_count?: number }): ClarityDoc {
  return {
    id: row.id,
    owner_id: row.owner_id,
    title: row.title,
    visibility: row.visibility,
    created_at: row.created_at,
    updated_at: row.updated_at,
    story_count: row.story_count ?? 0,
    point_count: 0,
    has_sent_letters: false,
  };
}

/**
 * Transform DB story row to StoryWithAuthor (same pattern as stories-service-real)
 */
function mapStoryWithAuthorFromDb(row: DbStoryWithAuthor): StoryWithAuthor {
  return {
    id: row.id,
    authorId: row.author_id,
    content: row.content,
    visibility: (row.visibility as 'public' | 'private') ?? 'private',
    currentVersion: row.current_version,
    understoodCount: row.understood_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags: [...(row.tags || []), ...((row as { system_tags?: string[] }).system_tags || [])],
    systemTags: (row as { system_tags?: string[] }).system_tags || [],
    bannerUrl: row.banner_url ?? undefined,
    authorName: row.author?.name ?? 'Unknown',
    authorSlug: row.author?.slug ?? '',
    authorRole: row.author?.role ?? undefined,
    authorAvatarColor: row.author?.avatar_color ?? '#3B82F6',
    authorAvatarUrl: row.author?.avatar_url ?? undefined,
    authorEarsCount: earCountOf(row.author),
    authorHasPledged: row.author?.has_pledged ?? false,
    imageUrl: row.image_url ?? undefined,
  };
}

/**
 * Transform story_points join rows to PointSummary[]
 */
function mapPointSummaries(
  storyPoints: DbDocStoryWithStory['story']['story_points']
): PointSummary[] {
  if (!storyPoints) return [];
  return storyPoints
    .filter((sp): sp is typeof sp & { point: NonNullable<typeof sp.point> } => sp.point != null)
    // P800: exclude superseded points — show only current heads
    .filter(sp => !(sp.point as { superseded_by?: string | null }).superseded_by)
    .map((sp) => ({
      id: sp.point.id,
      statement: sp.point.statement,
      context: sp.point.context ?? undefined,
      tags: [...(sp.point.tags || []), ...((sp.point as { system_tags?: string[] }).system_tags || [])],
      systemTags: (sp.point as { system_tags?: string[] }).system_tags || [],
      visibility: (sp.point.visibility ?? 'public') as ContentVisibility,
    }));
}

/**
 * Transform DB doc_story join row to DocStory (with points)
 */
function mapDocStoryFromDb(row: DbDocStoryWithStory): DocStory {
  const storyWithAuthor = mapStoryWithAuthorFromDb(row.story);
  const points = mapPointSummaries(row.story.story_points);
  return {
    doc_id: row.doc_id,
    story_id: row.story_id,
    position: row.position,
    point_config: row.point_config,
    created_at: row.created_at,
    story: { ...storyWithAuthor, points },
  };
}

/**
 * Get the authenticated user or throw.
 */
async function requireAuth(): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    Sentry.captureMessage('docs-service: not authenticated', {
      level: 'error',
      extra: { authError: error?.message },
    });
    throw new Error('Not authenticated');
  }
  return user.id;
}

// Select string for stories with author join (reused across methods — no points)
const STORY_WITH_AUTHOR_SELECT = `
  id,
  author_id,
  content,
  visibility,
  current_version,
  understood_count,
  created_at,
  updated_at,
  tags,
  system_tags,
  banner_url,
  image_url,
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
`;

// Select string for stories with author + linked points (for doc detail)
const STORY_WITH_AUTHOR_AND_POINTS_SELECT = `
  id,
  author_id,
  content,
  visibility,
  current_version,
  understood_count,
  created_at,
  updated_at,
  tags,
  system_tags,
  banner_url,
  image_url,
  author:profiles!stories_author_id_fkey (
    id,
    name,
    slug,
    role,
    avatar_color,
    avatar_url,
    ears_count,
    has_pledged
  ),
  story_points (
    point_id,
    point:points!story_points_point_id_fkey (
      id,
      statement,
      context,
      tags,
      system_tags,
      visibility,
      superseded_by
    )
  )
`;

export const docsService: DocsService = {
  // ============================================================================
  // CREATE
  // ============================================================================

  async createDoc(visibility: ContentVisibility = 'private'): Promise<ClarityDoc> {
    const userId = await requireAuth();
    log('createDoc:', { userId, visibility });

    const { data, error } = await supabase
      .from('clarity_docs')
      .insert({
        owner_id: userId,
        title: 'Untitled Doc',
        visibility,
      })
      .select('*')
      .single();

    if (error || !data) {
      throwDbError('createDoc', error, `Failed to create doc: ${error?.message}`);
    }

    return mapDocFromDb(data as DbClarityDoc);
  },

  // ============================================================================
  // READ
  // ============================================================================

  async getDoc(docId: string): Promise<{ doc: ClarityDoc; stories: DocStory[] } | null> {
    log('getDoc:', docId);

    // Fetch doc
    const { data: docData, error: docError } = await supabase
      .from('clarity_docs')
      .select('*')
      .eq('id', docId)
      .single();

    if (docError || !docData) {
      log('getDoc not found:', docId);
      return null;
    }

    // Fetch linked stories with author + points data, ordered by position
    const { data: storiesData, error: storiesError } = await supabase
      .from('doc_stories')
      .select(`
        doc_id,
        story_id,
        position,
        point_config,
        created_at,
        story:stories!doc_stories_story_id_fkey (
          ${STORY_WITH_AUTHOR_AND_POINTS_SELECT}
        )
      `)
      .eq('doc_id', docId)
      .order('position', { ascending: true });

    if (storiesError) {
      logDbError('getDoc.stories', storiesError);
      // Return doc without stories rather than failing entirely
      return {
        doc: mapDocFromDb({ ...(docData as DbClarityDoc), story_count: 0 }),
        stories: [],
      };
    }

    const stories = (storiesData ?? [])
      .filter((row: unknown) => (row as DbDocStoryWithStory).story != null)
      .map((row: unknown) => mapDocStoryFromDb(row as DbDocStoryWithStory));

    return {
      doc: mapDocFromDb({ ...(docData as DbClarityDoc), story_count: stories.length }),
      stories,
    };
  },

  async getDocsByUser(userId: string): Promise<ClarityDoc[]> {
    log('getDocsByUser:', userId);

    const { data, error } = await supabase
      .from('clarity_docs')
      .select('*')
      .eq('owner_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      logDbError('getDocsByUser', error);
      return [];
    }

    // Count stories per doc separately to avoid nested select issues
    const docs = (data ?? []).map((row: unknown) => mapDocFromDb(row as DbClarityDoc));

    if (docs.length > 0) {
      const docIds = docs.map((d) => d.id);

      const [countResult, pointResult, sentResult] = await Promise.all([
        supabase.from('doc_stories').select('doc_id').in('doc_id', docIds),
        supabase
          .from('doc_stories')
          .select('doc_id, story:stories!inner(story_points(point_id))')
          .in('doc_id', docIds),
        supabase
          .from('clarity_letters')
          .select('source_doc_id')
          .in('source_doc_id', docIds)
          .neq('status', 'draft'),
      ]);

      if (!countResult.error && countResult.data) {
        const counts: Record<string, number> = {};
        for (const row of countResult.data) {
          counts[row.doc_id] = (counts[row.doc_id] || 0) + 1;
        }
        for (const doc of docs) {
          doc.story_count = counts[doc.id] || 0;
        }
      }

      if (!pointResult.error && pointResult.data) {
        // Flatten to unique point IDs per doc
        const pointCounts: Record<string, Set<string>> = {};
        for (const row of pointResult.data as Array<{
          doc_id: string;
          story: { story_points: Array<{ point_id: string }> } | null;
        }>) {
          if (!pointCounts[row.doc_id]) pointCounts[row.doc_id] = new Set();
          const storyPoints = row.story?.story_points ?? [];
          for (const sp of storyPoints) {
            pointCounts[row.doc_id].add(sp.point_id);
          }
        }
        for (const doc of docs) {
          doc.point_count = pointCounts[doc.id]?.size ?? 0;
        }
      }

      if (sentResult.error) {
        // Query failed — default conservatively: block deletion on all docs
        // to prevent the UI guard from being bypassed. Server-side check in
        // deleteDoc() is the defense-in-depth layer.
        logDbError('getDocsByUser:sentLetters', sentResult.error);
        for (const doc of docs) {
          doc.has_sent_letters = true;
        }
      } else if (sentResult.data) {
        const sentDocIds = new Set(sentResult.data.map((l) => l.source_doc_id));
        for (const doc of docs) {
          doc.has_sent_letters = sentDocIds.has(doc.id);
        }
      }
    }

    return docs;
  },

  async getCompatibleStories(
    docId: string,
    searchQuery?: string
  ): Promise<StoryWithAuthor[]> {
    const userId = await requireAuth();
    log('getCompatibleStories:', { docId, searchQuery });

    // Get doc visibility to determine compatibility filter
    const { data: docData, error: docError } = await supabase
      .from('clarity_docs')
      .select('visibility')
      .eq('id', docId)
      .single();

    if (docError || !docData) {
      logDbError('getCompatibleStories.doc', docError);
      return [];
    }

    // Get story IDs already in this doc
    const { data: linkedData } = await supabase
      .from('doc_stories')
      .select('story_id')
      .eq('doc_id', docId);

    const linkedStoryIds = (linkedData ?? []).map((row: { story_id: string }) => row.story_id);

    // Query user's stories with author data
    let query = supabase
      .from('stories')
      .select(STORY_WITH_AUTHOR_SELECT)
      .eq('author_id', userId);

    // Public docs can only include public stories
    if (docData.visibility === 'public') {
      query = query.eq('visibility', 'public');
    }

    // Apply search filter
    if (searchQuery && searchQuery.trim()) {
      query = query.ilike('content', `%${searchQuery.trim()}%`);
    }

    query = query.order('updated_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      logDbError('getCompatibleStories', error);
      return [];
    }

    // Filter out stories already linked
    const stories = (data ?? [])
      .filter((row: unknown) => !linkedStoryIds.includes((row as DbStoryWithAuthor).id))
      .map((row: unknown) => mapStoryWithAuthorFromDb(row as DbStoryWithAuthor));

    return stories;
  },

  // ============================================================================
  // UPDATE
  // ============================================================================

  async updateDoc(
    docId: string,
    updates: { title?: string; visibility?: ContentVisibility }
  ): Promise<ClarityDoc> {
    await requireAuth();
    log('updateDoc:', { docId, updates });

    const dbUpdates: Record<string, unknown> = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.visibility !== undefined) dbUpdates.visibility = updates.visibility;

    const { data, error } = await supabase
      .from('clarity_docs')
      .update(dbUpdates)
      .eq('id', docId)
      .select('*')
      .single();

    if (error || !data) {
      throwDbError('updateDoc', error, `Failed to update doc: ${error?.message}`);
    }

    return mapDocFromDb(data as DbClarityDoc);
  },

  async addStoryToDoc(docId: string, storyId: string): Promise<DocStory> {
    await requireAuth();
    log('addStoryToDoc:', { docId, storyId });

    // Get the max position to calculate next position
    const { data: maxData } = await supabase
      .from('doc_stories')
      .select('position')
      .eq('doc_id', docId)
      .order('position', { ascending: false })
      .limit(1);

    const nextPosition = maxData && maxData.length > 0 ? maxData[0].position + 1 : 0;

    const { data, error } = await supabase
      .from('doc_stories')
      .insert({
        doc_id: docId,
        story_id: storyId,
        position: nextPosition,
        point_config: {},
      })
      .select(`
        doc_id,
        story_id,
        position,
        point_config,
        created_at,
        story:stories!doc_stories_story_id_fkey (
          ${STORY_WITH_AUTHOR_AND_POINTS_SELECT}
        )
      `)
      .single();

    if (error || !data) {
      throwDbError('addStoryToDoc', error, `Failed to add story to doc: ${error?.message}`);
    }

    return mapDocStoryFromDb(data as unknown as DbDocStoryWithStory);
  },

  async removeStoryFromDoc(docId: string, storyId: string): Promise<void> {
    await requireAuth();
    log('removeStoryFromDoc:', { docId, storyId });

    const { error } = await supabase
      .from('doc_stories')
      .delete()
      .eq('doc_id', docId)
      .eq('story_id', storyId);

    if (error) {
      throwDbError('removeStoryFromDoc', error, `Failed to remove story from doc: ${error?.message}`);
    }
  },

  async reorderStories(docId: string, orderedStoryIds: string[]): Promise<void> {
    await requireAuth();
    log('reorderStories:', { docId, orderedStoryIds });

    // Update all positions — index in array = new position
    const updates = orderedStoryIds.map((storyId, index) =>
      supabase
        .from('doc_stories')
        .update({ position: index })
        .eq('doc_id', docId)
        .eq('story_id', storyId)
    );

    const results = await Promise.all(updates);

    for (const result of results) {
      if (result.error) {
        throwDbError('reorderStories', result.error, `Failed to reorder stories: ${result.error.message}`);
      }
    }
  },

  async updatePointConfig(
    docId: string,
    storyId: string,
    config: DocPointConfig
  ): Promise<void> {
    await requireAuth();
    log('updatePointConfig:', { docId, storyId, config });

    const { error } = await supabase
      .from('doc_stories')
      .update({ point_config: config })
      .eq('doc_id', docId)
      .eq('story_id', storyId);

    if (error) {
      throwDbError('updatePointConfig', error, `Failed to update point config: ${error?.message}`);
    }
  },

  // ============================================================================
  // DELETE
  // ============================================================================

  async deleteDoc(docId: string): Promise<void> {
    await requireAuth();
    log('deleteDoc:', docId);

    // 1. Block if any non-draft letters (sealed or expired) exist for this doc
    const { data: sealedLetters, error: checkError } = await supabase
      .from('clarity_letters')
      .select('id')
      .eq('source_doc_id', docId)
      .neq('status', 'draft')
      .limit(1);

    if (checkError) {
      throwDbError('deleteDoc:checkSealed', checkError, 'Failed to check letter status');
    }

    if (sealedLetters && sealedLetters.length > 0) {
      throw new Error('SEALED_LETTERS_EXIST');
    }

    // 2. Delete draft letters first (FK would block doc delete)
    const { data: deletedDrafts, error: draftDeleteError } = await supabase
      .from('clarity_letters')
      .delete()
      .eq('source_doc_id', docId)
      .eq('status', 'draft')
      .select('id');

    if (draftDeleteError) {
      throwDbError('deleteDoc:deleteDraftLetters', draftDeleteError, 'Failed to clean up draft letters');
    }

    log('deleteDoc: deleted draft letters:', deletedDrafts?.length ?? 0);

    // 3. Delete the doc (doc_stories cascade automatically)
    const { error } = await supabase
      .from('clarity_docs')
      .delete()
      .eq('id', docId);

    if (error) {
      throwDbError('deleteDoc', error, `Failed to delete doc: ${error?.message}`);
    }
  },
};
