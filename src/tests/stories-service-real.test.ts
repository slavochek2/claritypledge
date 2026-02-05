import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StoriesService } from '@/app/data/stories-service.interface';

// Mock Supabase client
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockGetUser = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    auth: {
      getUser: () => mockGetUser(),
    },
  },
}));

describe('realStoriesService', () => {
  let realStoriesService: StoriesService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('@/app/data/stories-service-real');
    realStoriesService = module.realStoriesService;
  });

  // ===========================================================================
  // CREATE
  // ===========================================================================

  describe('createStory', () => {
    it('creates story using authenticated user', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'story-1',
              author_id: 'user-1',
              title: 'My Story',
              content: 'Story content',
              current_version: 1,
              understood_count: 0,
              created_at: '2026-02-01T00:00:00Z',
              updated_at: '2026-02-01T00:00:00Z',
              tags: ['test'],
            },
            error: null,
          }),
        }),
      });

      const result = await realStoriesService.createStory('user-1', 'My Story', 'Story content', ['test']);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('story-1');
      expect(result?.title).toBe('My Story');
      expect(result?.authorId).toBe('user-1');
      expect(result?.currentVersion).toBe(1);
      expect(result?.tags).toEqual(['test']);
    });

    it('returns null when not authenticated', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const result = await realStoriesService.createStory('user-1', 'My Story', 'Content');

      expect(result).toBeNull();
    });

    it('returns null on insert error', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
        }),
      });

      const result = await realStoriesService.createStory('user-1', 'My Story', 'Content');

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // READ
  // ===========================================================================

  describe('getStory', () => {
    it('returns story with author info', async () => {
      const mockDbStory = {
        id: 'story-1',
        author_id: 'user-1',
        title: 'Test Story',
        content: 'Content here',
        current_version: 2,
        understood_count: 3,
        created_at: '2026-01-15T00:00:00Z',
        updated_at: '2026-01-16T00:00:00Z',
        tags: ['leadership'],
        author: {
          id: 'user-1',
          name: 'Sarah Chen',
          slug: 'sarah-chen',
          avatar_color: '#3B82F6',
          avatar_url: null,
        },
      };

      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockDbStory, error: null }),
        }),
      });

      const result = await realStoriesService.getStory('story-1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('story-1');
      expect(result?.authorName).toBe('Sarah Chen');
      expect(result?.authorSlug).toBe('sarah-chen');
      expect(result?.currentVersion).toBe(2);
      expect(result?.understoodCount).toBe(3);
    });

    it('returns null for non-existent story', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        }),
      });

      const result = await realStoriesService.getStory('non-existent');

      expect(result).toBeNull();
    });

    it('handles missing author gracefully', async () => {
      const mockDbStory = {
        id: 'story-1',
        author_id: 'user-1',
        title: 'Orphan Story',
        content: 'Content',
        current_version: 1,
        understood_count: 0,
        created_at: '2026-01-15T00:00:00Z',
        updated_at: '2026-01-15T00:00:00Z',
        tags: [],
        author: null,
      };

      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockDbStory, error: null }),
        }),
      });

      const result = await realStoriesService.getStory('story-1');

      expect(result).not.toBeNull();
      expect(result?.authorName).toBe('Unknown');
      expect(result?.authorSlug).toBe('');
    });
  });

  describe('getStoryVersion', () => {
    it('returns version by ID', async () => {
      const mockVersion = {
        id: 'ver-1',
        story_id: 'story-1',
        version_number: 1,
        title: 'Original Title',
        content: 'Original Content',
        created_at: '2026-01-15T00:00:00Z',
      };

      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockVersion, error: null }),
        }),
      });

      const result = await realStoriesService.getStoryVersion('ver-1');

      expect(result).not.toBeNull();
      expect(result?.versionNumber).toBe(1);
      expect(result?.storyId).toBe('story-1');
    });

    it('returns null for non-existent version', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        }),
      });

      const result = await realStoriesService.getStoryVersion('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getStoryVersions', () => {
    it('returns versions sorted descending', async () => {
      const mockVersions = [
        { id: 'ver-2', story_id: 'story-1', version_number: 2, title: 'Updated', content: 'New', created_at: '2026-01-16T00:00:00Z' },
        { id: 'ver-1', story_id: 'story-1', version_number: 1, title: 'Original', content: 'Old', created_at: '2026-01-15T00:00:00Z' },
      ];

      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockVersions, error: null }),
        }),
      });

      const result = await realStoriesService.getStoryVersions('story-1');

      expect(result).toHaveLength(2);
      expect(result[0].versionNumber).toBe(2);
      expect(result[1].versionNumber).toBe(1);
    });

    it('returns empty array on error', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
        }),
      });

      const result = await realStoriesService.getStoryVersions('story-1');

      expect(result).toEqual([]);
    });
  });

  describe('getStoriesByAuthor', () => {
    it('returns stories for author', async () => {
      const mockStories = [
        {
          id: 'story-1',
          author_id: 'user-1',
          title: 'Story One',
          content: 'Content',
          current_version: 1,
          understood_count: 0,
          created_at: '2026-01-15T00:00:00Z',
          updated_at: '2026-01-15T00:00:00Z',
          tags: [],
          author: { id: 'user-1', name: 'Author', slug: 'author', avatar_color: '#3B82F6', avatar_url: null },
        },
      ];

      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockStories, error: null }),
        }),
      });

      const result = await realStoriesService.getStoriesByAuthor('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].authorName).toBe('Author');
    });
  });

  describe('getStoriesFeed', () => {
    it('returns paginated stories', async () => {
      mockSelect.mockReturnValue({
        order: vi.fn().mockReturnValue({
          range: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });

      const result = await realStoriesService.getStoriesFeed(10, 0);

      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ===========================================================================
  // UPDATE
  // ===========================================================================

  describe('updateStory', () => {
    it('updates story and returns result', async () => {
      mockUpdate.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'story-1',
                author_id: 'user-1',
                title: 'Updated Title',
                content: 'Updated Content',
                current_version: 2,
                understood_count: 0,
                created_at: '2026-01-15T00:00:00Z',
                updated_at: '2026-01-16T00:00:00Z',
                tags: [],
              },
              error: null,
            }),
          }),
        }),
      });

      const result = await realStoriesService.updateStory('story-1', { title: 'Updated Title' });

      expect(result).not.toBeNull();
      expect(result?.title).toBe('Updated Title');
      expect(result?.currentVersion).toBe(2);
    });

    it('returns null on error', async () => {
      mockUpdate.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not author' } }),
          }),
        }),
      });

      const result = await realStoriesService.updateStory('story-1', { title: 'New' });

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // LINK/UNLINK POINTS
  // ===========================================================================

  describe('linkPointToStory', () => {
    it('returns true on success', async () => {
      mockInsert.mockResolvedValue({ error: null });

      const result = await realStoriesService.linkPointToStory('story-1', 'point-1');

      expect(result).toBe(true);
    });

    it('returns false on duplicate link', async () => {
      mockInsert.mockResolvedValue({ error: { code: '23505' } });

      const result = await realStoriesService.linkPointToStory('story-1', 'point-1');

      expect(result).toBe(false);
    });
  });

  describe('unlinkPointFromStory', () => {
    it('returns true on success', async () => {
      mockDelete.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const result = await realStoriesService.unlinkPointFromStory('story-1', 'point-1');

      expect(result).toBe(true);
    });
  });

  // ===========================================================================
  // DELETE
  // ===========================================================================

  describe('deleteStory', () => {
    it('returns true on success', async () => {
      mockDelete.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const result = await realStoriesService.deleteStory('story-1');

      expect(result).toBe(true);
    });

    it('returns false on error', async () => {
      mockDelete.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: { message: 'RLS violation' } }),
      });

      const result = await realStoriesService.deleteStory('story-1');

      expect(result).toBe(false);
    });
  });
});
