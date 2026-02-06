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
    visibility?: StoryVisibility
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
   * Get stories feed (paginated, newest first)
   */
  getStoriesFeed(limit: number, offset: number): Promise<StoryWithAuthor[]>;

  // ============================================================================
  // UPDATE
  // ============================================================================

  /**
   * Update a story (creates new version if content changed)
   * Only author can update.
   */
  updateStory(
    storyId: string,
    updates: { content?: string; tags?: string[]; visibility?: StoryVisibility }
  ): Promise<Story | null>;

  /**
   * Link a point to a story
   * Only story author can link.
   */
  linkPointToStory(storyId: string, pointId: string): Promise<boolean>;

  /**
   * Unlink a point from a story
   * Only story author can unlink.
   */
  unlinkPointFromStory(storyId: string, pointId: string): Promise<boolean>;

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
