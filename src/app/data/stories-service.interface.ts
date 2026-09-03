/**
 * @file stories-service.interface.ts
 * @description P117: Interface for stories service (mock/real switchable)
 */

import type {
  Story,
  StoryWithAuthor,
  StoryWithPoints,
  StoryVersion,
  StoryVisibility,
  PointSummary,
} from '@/app/types';

export interface StoriesService {
  // ============================================================================
  // CREATE
  // ============================================================================

  /**
   * Create a new story (no title — stories are just text).
   * Requires verified user. Version 1 is created automatically via trigger.
   */
  createStory(
    authorId: string,
    content: string,
    tags?: string[],
    visibility?: StoryVisibility,
    imageUrl?: string
  ): Promise<Story | null>;

  // ============================================================================
  // READ
  // ============================================================================

  /**
   * Get a single story by ID with author info
   */
  getStory(storyId: string): Promise<StoryWithAuthor | null>;

  /**
   * Get a story with its linked points
   */
  getStoryWithPoints(storyId: string): Promise<StoryWithPoints | null>;

  /**
   * Get a specific version of a story (for "view what was verified")
   */
  getStoryVersion(versionId: string): Promise<StoryVersion | null>;

  /**
   * Get all versions of a story
   */
  getStoryVersions(storyId: string): Promise<StoryVersion[]>;

  /**
   * Get stories by author
   */
  getStoriesByAuthor(authorId: string): Promise<StoryWithAuthor[]>;

  /**
   * Get stories by author with linked points
   */
  getStoriesByAuthorWithPoints(authorId: string, userId?: string): Promise<StoryWithPoints[]>;

  /**
   * Get stories feed (paginated, newest first)
   */
  getStoriesFeed(limit: number, offset: number): Promise<StoryWithAuthor[]>;

  /**
   * P491: Get public stories feed with optional tag filter.
   * Returns only stories with visibility='public', ordered by created_at desc.
   * Optionally filters by tag using Supabase .contains() on the tags TEXT[] column.
   */
  getPublicStoriesFeed(limit: number, offset: number, tag?: string, ascending?: boolean): Promise<StoryWithAuthor[]>;

  /**
   * Get public stories that contain any of the given points.
   * Returns a Map<pointId, StoryWithAuthor[]>.
   * @param excludeStoryId - Omit this story from results (e.g., the currently-viewed story)
   */
  getStoriesForPoints(
    pointIds: string[],
    excludeStoryId?: string
  ): Promise<Map<string, StoryWithAuthor[]>>;

  /**
   * P1212 §5 — the reverse of `getStoriesForPoints`, for the story->point expander.
   *
   * Returns a Map<storyId, PointSummary[]>. ONE query for the whole page: the feed
   * renders up to a page of story cards and a per-card fetch would be the N+1 this
   * repo's data-fetching rule exists to prevent.
   *
   * Does NOT select `points.context`. The column is optional on `PointSummary`, the
   * expander shows only the statement, and P1095 is retiring it — the test database has
   * already dropped it while main's other queries still ask for it and 400. Selecting the
   * minimum keeps this working on both schemas and through that retirement.
   */
  getPointsForStories(storyIds: string[]): Promise<Map<string, PointSummary[]>>;

  // ============================================================================
  // UPDATE
  // ============================================================================

  /**
   * Update a story (creates new version if content changed)
   * Only author can update.
   */
  updateStory(
    storyId: string,
    updates: { content?: string; tags?: string[]; bannerUrl?: string | null; imageUrl?: string | null }
  ): Promise<Story | null>;

  /**
   * Link a point to a story
   * Only story author can link.
   * @param authorId - The story author's user ID (stored as author_id in story_points for fast lookups)
   */
  linkPointToStory(storyId: string, pointId: string, authorId: string): Promise<boolean>;

  /**
   * Unlink a point from a story
   * Only story author can unlink.
   */
  unlinkPointFromStory(storyId: string, pointId: string): Promise<boolean>;

  /**
   * Get a story linked to a specific point by a specific user.
   * Used in /chat to detect edit mode: if user already has a story for this point,
   * open in edit mode instead of create mode.
   * Returns null if no story exists for (userId, pointId).
   */
  getStoryByUserAndPoint(userId: string, pointId: string): Promise<Story | null>;

  // ============================================================================
  // DELETE
  // ============================================================================

  /**
   * Delete a story (cascades to versions, verifications, story_points)
   * Only author can delete.
   */
  deleteStory(storyId: string): Promise<boolean>;
}

export interface CreateStoryInput {
  content: string;
  tags?: string[];
  visibility?: StoryVisibility;
}

export type UpdateStoryInput = Partial<CreateStoryInput>;
