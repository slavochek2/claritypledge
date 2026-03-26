/**
 * @file docs-service.interface.ts
 * @description P551: Interface for Clarity Docs service
 */

import type {
  ClarityDoc,
  DocStory,
  DocPointConfig,
  ContentVisibility,
  StoryWithAuthor,
} from '@/app/types';

export interface DocsService {
  // ============================================================================
  // CREATE
  // ============================================================================

  /**
   * Create a new doc with default title "Untitled Doc" and private visibility.
   * Requires authenticated user.
   */
  createDoc(visibility?: ContentVisibility): Promise<ClarityDoc>;

  // ============================================================================
  // READ
  // ============================================================================

  /**
   * Get a single doc by ID with linked stories (resolved with author data).
   * Stories ordered by position ascending.
   */
  getDoc(docId: string): Promise<{ doc: ClarityDoc; stories: DocStory[] } | null>;

  /**
   * Get all docs for a user, ordered by updated_at desc.
   */
  getDocsByUser(userId: string): Promise<ClarityDoc[]>;

  /**
   * Get user's own stories that are compatible with the doc's visibility,
   * excluding stories already linked to this doc.
   * Optionally filtered by search query (matches story content).
   */
  getCompatibleStories(docId: string, searchQuery?: string): Promise<StoryWithAuthor[]>;

  // ============================================================================
  // UPDATE
  // ============================================================================

  /**
   * Update doc title and/or visibility.
   */
  updateDoc(
    docId: string,
    updates: { title?: string; visibility?: ContentVisibility }
  ): Promise<ClarityDoc>;

  /**
   * Add a story to a doc at the next position.
   */
  addStoryToDoc(docId: string, storyId: string): Promise<DocStory>;

  /**
   * Remove a story from a doc (deletes junction row).
   */
  removeStoryFromDoc(docId: string, storyId: string): Promise<void>;

  /**
   * Reorder stories in a doc. Array index = new position.
   */
  reorderStories(docId: string, orderedStoryIds: string[]): Promise<void>;

  /**
   * Update point display config for a story within a doc.
   */
  updatePointConfig(
    docId: string,
    storyId: string,
    config: DocPointConfig
  ): Promise<void>;

  // ============================================================================
  // DELETE
  // ============================================================================

  /**
   * Hard delete a doc (cascade removes doc_stories).
   */
  deleteDoc(docId: string): Promise<void>;
}
