/**
 * @file stories-service-mock.ts
 * @description P113: Mock stories service for prototype promotion.
 * KISS pattern - simple mock file, no interface/switcher until backend exists.
 */

export interface Story {
  id: string;
  authorId: string;
  authorName: string;
  authorSlug: string;
  authorAvatarColor: string;
  title: string;
  content: string;
  createdAt: string;
  tags: string[];
}

// Mock stories data
const mockStories: Story[] = [
  {
    id: 'story-1',
    authorId: 'mock-user-1',
    authorName: 'Sarah Chen',
    authorSlug: 'sarah-chen',
    authorAvatarColor: '#3B82F6',
    title: 'When I finally admitted I didn\'t understand',
    content: 'In a board meeting last week, I realized I had been nodding along without truly grasping the financial projections. For the first time, I said "I need you to walk me through this again." The room went quiet, then the CFO said "Thank you for asking - I think others had the same question."',
    createdAt: '2024-01-15T10:30:00Z',
    tags: ['vulnerability', 'leadership', 'meetings'],
  },
  {
    id: 'story-2',
    authorId: 'mock-user-1',
    authorName: 'Sarah Chen',
    authorSlug: 'sarah-chen',
    authorAvatarColor: '#3B82F6',
    title: 'The cost of pretending to listen',
    content: 'I used to think multitasking during calls was efficient. Then I missed a critical deadline because I "heard" the date but never actually processed it. That mistake cost us a client. Now I close my laptop during calls - every time.',
    createdAt: '2024-01-10T14:00:00Z',
    tags: ['lessons', 'listening', 'attention'],
  },
];

export const storiesService = {
  /**
   * Get all stories for a specific user
   */
  getStoriesForUser(userId: string): Story[] {
    return mockStories.filter(s => s.authorId === userId);
  },

  /**
   * Get a single story by ID
   */
  getStoryById(storyId: string): Story | null {
    return mockStories.find(s => s.id === storyId) || null;
  },

  /**
   * Get all stories (for feed)
   */
  getAllStories(): Story[] {
    return [...mockStories].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },
};
