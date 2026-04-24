import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StoriesService } from '@/app/data/stories-service.interface';

/**
 * Unit tests for realStoriesService.getStoryByUserAndPoint
 *
 * Tests the new method added in P465 that enables edit-mode detection in /chat.
 * Queries story_points by (author_id, point_id) to find the viewer's existing story.
 */

// Mock Supabase client — chain mirrors: .from().select().eq().eq().limit()
const mockLimit = vi.fn();
const mockEqPointId = vi.fn(() => ({ limit: mockLimit }));
const mockEqAuthorId = vi.fn(() => ({ eq: mockEqPointId }));
const mockSelect = vi.fn(() => ({ eq: mockEqAuthorId }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}));

describe('realStoriesService.getStoryByUserAndPoint', () => {
  let realStoriesService: StoriesService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('@/app/data/stories-service-real');
    realStoriesService = module.realStoriesService;
  });

  it('returns the Story when a matching story_point exists', async () => {
    const mockDbRow = {
      story_id: 'story-1',
      stories: {
        id: 'story-1',
        author_id: 'user-1',
        title: 'My Story',
        content: 'Story content here',
        current_version: 1,
        understood_count: 0,
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
        tags: ['test'],
        author: {
          id: 'user-1',
          name: 'Alice',
          slug: 'alice',
          avatar_color: '#3B82F6',
          avatar_url: null,
        },
      },
    };

    mockLimit.mockResolvedValue({ data: [mockDbRow], error: null });

    const result = await realStoriesService.getStoryByUserAndPoint('user-1', 'point-1');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('story-1');
    expect(result?.content).toBe('Story content here');
  });

  it('returns null when no story_point exists', async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });

    const result = await realStoriesService.getStoryByUserAndPoint('user-2', 'point-1');

    expect(result).toBeNull();
  });

  it('queries story_points with correct userId and pointId', async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });

    await realStoriesService.getStoryByUserAndPoint('user-2', 'point-99');

    expect(mockFrom).toHaveBeenCalledWith('story_points');
    expect(mockEqAuthorId).toHaveBeenCalledWith('author_id', 'user-2');
    expect(mockEqPointId).toHaveBeenCalledWith('point_id', 'point-99');
  });

  it('returns null on unexpected DB error', async () => {
    mockLimit.mockResolvedValue({
      data: null,
      error: { code: '42P01', message: 'relation does not exist' },
    });

    const result = await realStoriesService.getStoryByUserAndPoint('user-1', 'point-1');

    expect(result).toBeNull();
  });
});
