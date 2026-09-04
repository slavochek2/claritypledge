/**
 * @file stories-service-mock.ts
 * @description P117: Mock stories service implementing StoriesService interface
 */

import type { StoriesService } from './stories-service.interface';
import type {
  Story,
  StoryWithAuthor,
  StoryWithPoints,
  StoryVersion,
  StoryVisibility,
  PointSummary,
} from '@/app/types';

// Mock stories data — mutable so createStory can add to it
const mockStories: StoryWithAuthor[] = [
  {
    id: 'story-1',
    authorId: 'mock-user-1',
    authorName: 'Sarah Chen',
    authorSlug: 'sarah-chen',
    authorAvatarColor: '#3B82F6',
    authorEarsCount: 3,
    content:
      'In a board meeting last week, I realized I had been nodding along without truly grasping the financial projections. For the first time, I said "I need you to walk me through this again." The room went quiet, then the CFO said "Thank you for asking - I think others had the same question."',
    visibility: 'public',
    currentVersion: 1,
    understoodCount: 3,
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:30:00Z',
    tags: ['vulnerability', 'leadership', 'meetings'],
    systemTags: [],
  },
  {
    id: 'story-2',
    authorId: 'mock-user-1',
    authorName: 'Sarah Chen',
    authorSlug: 'sarah-chen',
    authorAvatarColor: '#3B82F6',
    authorEarsCount: 3,
    content:
      'I used to think multitasking during calls was efficient. Then I missed a critical deadline because I "heard" the date but never actually processed it. That mistake cost us a client. Now I close my laptop during calls - every time.',
    visibility: 'public',
    currentVersion: 1,
    understoodCount: 5,
    createdAt: '2024-01-10T14:00:00Z',
    updatedAt: '2024-01-10T14:00:00Z',
    tags: ['lessons', 'listening', 'attention'],
    systemTags: [],
  },
];

// Mock story versions
const mockVersions: StoryVersion[] = [
  {
    id: 'version-1-1',
    storyId: 'story-1',
    versionNumber: 1,
    content:
      'In a board meeting last week, I realized I had been nodding along without truly grasping the financial projections. For the first time, I said "I need you to walk me through this again." The room went quiet, then the CFO said "Thank you for asking - I think others had the same question."',
    createdAt: '2024-01-15T10:30:00Z',
  },
  {
    id: 'version-2-1',
    storyId: 'story-2',
    versionNumber: 1,
    content:
      'I used to think multitasking during calls was efficient. Then I missed a critical deadline because I "heard" the date but never actually processed it. That mistake cost us a client. Now I close my laptop during calls - every time.',
    createdAt: '2024-01-10T14:00:00Z',
  },
];

// Mock linked points
const mockStoryPoints: Record<string, PointSummary[]> = {
  'story-1': [
    {
      id: 'point-2',
      statement: "Admitting confusion is a sign of strength, not weakness",
      tags: ['vulnerability', 'leadership'],
      systemTags: [],
      visibility: 'public',
    },
  ],
  'story-2': [],
};

export const mockStoriesService: StoriesService = {
  async createStory(
    authorId: string,
    content: string,
    tags: string[] = [],
    visibility: StoryVisibility = 'public',
    imageUrl?: string
  ): Promise<Story | null> {
    const now = new Date().toISOString();
    const newStory: StoryWithAuthor = {
      id: `story-${Date.now()}`,
      authorId,
      content,
      visibility,
      currentVersion: 1,
      understoodCount: 0,
      createdAt: now,
      updatedAt: now,
      tags,
      systemTags: [],
      imageUrl,
      // Mock author info for getStory lookups
      authorName: 'You',
      authorSlug: 'me',
      authorAvatarColor: '#3B82F6',
      authorEarsCount: 0,
    };
    // Add to mock store so getStory can find it after redirect
    mockStories.unshift(newStory);
    return newStory;
  },

  async getStory(storyId: string): Promise<StoryWithAuthor | null> {
    return mockStories.find((s) => s.id === storyId) ?? null;
  },

  async getStoryWithPoints(storyId: string): Promise<StoryWithPoints | null> {
    const story = mockStories.find((s) => s.id === storyId);
    if (!story) return null;
    return {
      ...story,
      points: mockStoryPoints[storyId] || [],
    };
  },

  async getStoryVersion(versionId: string): Promise<StoryVersion | null> {
    return mockVersions.find((v) => v.id === versionId) ?? null;
  },

  async getStoryVersions(storyId: string): Promise<StoryVersion[]> {
    return mockVersions
      .filter((v) => v.storyId === storyId)
      .sort((a, b) => b.versionNumber - a.versionNumber);
  },

  async getStoriesByAuthor(authorId: string): Promise<StoryWithAuthor[]> {
    return mockStories
      .filter((s) => s.authorId === authorId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async getStoriesByAuthorWithPoints(_authorId: string, _userId?: string): Promise<StoryWithPoints[]> {
    const stories = await this.getStoriesByAuthor(_authorId);
    return stories.map(story => ({
      ...story,
      points: (mockStoryPoints[story.id] || []).map(p => ({
        ...p,
        profileSubjectPosition: null,
        userPosition: p.userPosition ?? null,
      })),
    }));
  },

  async getStoriesFeed(limit: number, offset: number): Promise<StoryWithAuthor[]> {
    return [...mockStories]
      .filter((s) => s.visibility === 'public')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(offset, offset + limit);
  },

  async getPublicStoriesFeed(limit: number, offset: number, tag?: string, ascending?: boolean): Promise<StoryWithAuthor[]> {
    let filtered = [...mockStories].filter((s) => s.visibility === 'public');
    if (tag) {
      filtered = filtered.filter((s) => s.tags.includes(tag));
    }
    return filtered
      .sort((a, b) => {
        const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        return ascending ? diff : -diff;
      })
      .slice(offset, offset + limit);
  },

  async updateStory(
    storyId: string,
    updates: { content?: string; tags?: string[]; bannerUrl?: string | null; imageUrl?: string | null }
  ): Promise<Story | null> {
    const story = mockStories.find((s) => s.id === storyId);
    if (!story) return null;
    // In mock, just return the story with updates applied
    return {
      ...story,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
  },

  async linkPointToStory(storyId: string, pointId: string, _authorId: string): Promise<boolean> {
    // Check if already linked (prevent duplicates)
    const existing = mockStoryPoints[storyId]?.find(p => p.id === pointId);
    if (existing) {
      console.warn('Point already linked to story');
      return false;
    }

    // Create mock point (in real app, would fetch from points table)
    const newPoint: PointSummary = {
      id: pointId,
      statement: `Mock point ${pointId}`,
      tags: ['mock'],
      systemTags: [],
      visibility: 'public',
    };

    // Add to story's points
    if (!mockStoryPoints[storyId]) {
      mockStoryPoints[storyId] = [];
    }
    mockStoryPoints[storyId].push(newPoint);
    return true;
  },

  async unlinkPointFromStory(storyId: string, pointId: string): Promise<boolean> {
    if (!mockStoryPoints[storyId]) {
      return false;
    }

    const index = mockStoryPoints[storyId].findIndex(p => p.id === pointId);
    if (index === -1) {
      return false;
    }

    mockStoryPoints[storyId].splice(index, 1);
    return true;
  },

  async getStoryByUserAndPoint(_userId: string, _pointId: string): Promise<Story | null> {
    return null;
  },

  async deleteStory(_storyId: string): Promise<boolean> {
    // Mock always succeeds
    return true;
  },

  async getStoriesForPoints(
    _pointIds: string[],
    _excludeStoryId?: string
  ): Promise<Map<string, StoryWithAuthor[]>> {
    return new Map();
  },

  async getPointsForStories(storyIds: string[], _viewerId?: string): Promise<Map<string, PointSummary[]>> {
    // Backed by the same `mockStoryPoints` fixture the single-story getters use, so a
    // mock-mode feed shows the same links a mock-mode story detail page does. An empty
    // Map here would make the expander untestable against the mock service.
    const result = new Map<string, PointSummary[]>();
    for (const id of storyIds) {
      const points = mockStoryPoints[id];
      if (points && points.length > 0) result.set(id, points);
    }
    return result;
  },
};

export type { Story, StoryWithAuthor } from '@/app/types';
