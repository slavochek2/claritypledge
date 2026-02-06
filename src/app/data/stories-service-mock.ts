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
    title: "When I finally admitted I didn't understand",
    content:
      'In a board meeting last week, I realized I had been nodding along without truly grasping the financial projections. For the first time, I said "I need you to walk me through this again." The room went quiet, then the CFO said "Thank you for asking - I think others had the same question."',
    visibility: 'public',
    currentVersion: 1,
    understoodCount: 3,
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:30:00Z',
    tags: ['vulnerability', 'leadership', 'meetings'],
  },
  {
    id: 'story-2',
    authorId: 'mock-user-1',
    authorName: 'Sarah Chen',
    authorSlug: 'sarah-chen',
    authorAvatarColor: '#3B82F6',
    title: 'The cost of pretending to listen',
    content:
      'I used to think multitasking during calls was efficient. Then I missed a critical deadline because I "heard" the date but never actually processed it. That mistake cost us a client. Now I close my laptop during calls - every time.',
    visibility: 'public',
    currentVersion: 1,
    understoodCount: 5,
    createdAt: '2024-01-10T14:00:00Z',
    updatedAt: '2024-01-10T14:00:00Z',
    tags: ['lessons', 'listening', 'attention'],
  },
];

// Mock story versions
const mockVersions: StoryVersion[] = [
  {
    id: 'version-1-1',
    storyId: 'story-1',
    versionNumber: 1,
    title: "When I finally admitted I didn't understand",
    content:
      'In a board meeting last week, I realized I had been nodding along without truly grasping the financial projections. For the first time, I said "I need you to walk me through this again." The room went quiet, then the CFO said "Thank you for asking - I think others had the same question."',
    createdAt: '2024-01-15T10:30:00Z',
  },
  {
    id: 'version-2-1',
    storyId: 'story-2',
    versionNumber: 1,
    title: 'The cost of pretending to listen',
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
      context: 'From my journey learning to say "I don\'t understand"',
      tags: ['vulnerability', 'leadership'],
    },
  ],
  'story-2': [],
};

export const mockStoriesService: StoriesService = {
  async createStory(
    authorId: string,
    content: string,
    tags: string[] = [],
    visibility: StoryVisibility = 'public'
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
      // Mock author info for getStory lookups
      authorName: 'You',
      authorSlug: 'me',
      authorAvatarColor: '#3B82F6',
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

  async getStoriesFeed(limit: number, offset: number): Promise<StoryWithAuthor[]> {
    return [...mockStories]
      .filter((s) => s.visibility === 'public')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(offset, offset + limit);
  },

  async updateStory(
    storyId: string,
    updates: { content?: string; tags?: string[]; visibility?: StoryVisibility }
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

  async linkPointToStory(_storyId: string, _pointId: string): Promise<boolean> {
    // Mock always succeeds
    return true;
  },

  async unlinkPointFromStory(_storyId: string, _pointId: string): Promise<boolean> {
    // Mock always succeeds
    return true;
  },

  async deleteStory(_storyId: string): Promise<boolean> {
    // Mock always succeeds
    return true;
  },
};

// Legacy exports for backward compatibility during migration
export type { Story, StoryWithAuthor } from '@/app/types';
export const storiesService = mockStoriesService;
