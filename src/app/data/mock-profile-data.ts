/**
 * @file mock-profile-data.ts
 * @description Shared mock data generation for profiles, stories, and points.
 * Used by both profile pages and story/point detail pages to ensure consistent IDs.
 *
 * Story IDs follow pattern: st-{profileId}-{num}
 * Point IDs are shared: pt1, pt2
 */

import type { Story, Point } from '@/app/prototypes/shared/types';
import type { Profile } from '@/app/data/api';
import type { UserCalibration } from '@/app/components/profile/calibration-display';

// Mock user type for profile context
export interface MockUser {
  id: string;
  name: string;
  role?: string;
  company?: string;
  hasPledged: boolean;
}

// Full mock data structure for a profile
export interface ProfileMockData {
  user: MockUser;
  stories: Story[];
  points: Point[];
  calibration: UserCalibration;
  credibilityStats: { ear: number; mic: number };
}

/**
 * Generate consistent mock data for any profile.
 * The same profile ID will always generate the same data.
 */
export function getMockDataForProfile(profile: Profile): ProfileMockData {
  // Create a mock user from the production profile
  const user: MockUser = {
    id: profile.id,
    name: profile.name,
    role: profile.role || undefined,
    company: undefined,
    hasPledged: profile.hasPledged,
  };

  // Generate consistent mock data based on profile ID
  const seed = profile.id.charCodeAt(0) || 1;

  // Mock stories with full Story interface
  const mockStories: Story[] = [
    {
      id: `st-${profile.id}-1`,
      text: 'I started working remotely 2 years ago and my work-life balance has completely transformed. I can pick up my kids from school now without stressing about commute time.',
      authorId: profile.id,
      createdAt: '2026-01-07T09:00:00Z',
      visibility: 'public',
      linkedPointIds: ['pt1', 'pt2'],
      understoodCount: 2,
      crossDisagreementCount: 1,
    },
    {
      id: `st-${profile.id}-2`,
      text: 'Our team tried a "no meetings Wednesday" experiment. Productivity went through the roof - I finished a project that had been stalled for weeks.',
      authorId: profile.id,
      createdAt: '2026-01-08T14:00:00Z',
      visibility: 'shared',
      linkedPointIds: ['pt1', 'pt2'],
      understoodCount: 3,
      crossDisagreementCount: 0,
    },
  ];

  // Mock points with full Point interface
  const mockPoints: Point[] = [
    {
      id: 'pt1',
      text: 'Remote work is more productive than office work for knowledge workers',
      createdAt: '2026-01-01T10:00:00Z',
      positions: {
        [profile.id]: { position: 'agree', timestamp: '2026-01-07T08:30:00Z' },
        'user1': { position: 'strongly_agree', timestamp: '2026-01-03T10:00:00Z' },
        'user2': { position: 'disagree', timestamp: '2026-01-03T14:30:00Z' },
        'user3': { position: 'unsure', timestamp: '2026-01-05T11:00:00Z' },
      },
      linkedStoryIds: [`st-${profile.id}-1`, `st-${profile.id}-2`],
    },
    {
      id: 'pt2',
      text: 'Fewer meetings leads to better outcomes',
      createdAt: '2026-01-02T14:00:00Z',
      positions: {
        [profile.id]: { position: 'strongly_agree', timestamp: '2026-01-06T11:15:00Z' },
        'user1': { position: 'agree', timestamp: '2026-01-02T15:00:00Z' },
        'user3': { position: 'disagree', timestamp: '2026-01-03T10:30:00Z' },
      },
      linkedStoryIds: [`st-${profile.id}-2`],
    },
  ];

  // Mock calibration - always show for consistency
  const mockCalibration: UserCalibration = {
    listener: { avgGap: -0.5 + (seed % 20) / 10, state: 'calibrated', sessionCount: 8 + (seed % 5) },
    speaker: { avgGap: 0.2, state: 'calibrated', sessionCount: 8 + (seed % 5) },
  };

  return {
    user,
    stories: mockStories,
    points: mockPoints,
    calibration: mockCalibration,
    credibilityStats: { ear: 5 + (seed % 10), mic: 3 + (seed % 8) },
  };
}

/**
 * Extract profile ID from a story ID.
 * Story IDs follow pattern: st-{profileId}-{num}
 */
export function extractProfileIdFromStoryId(storyId: string): string | null {
  const match = storyId.match(/^st-(.+)-\d+$/);
  return match ? match[1] : null;
}

/**
 * Get a story by ID, using the profile's mock data.
 * Returns the story and the profile data it belongs to.
 */
export function getStoryWithContext(
  storyId: string,
  profile: Profile
): { story: Story; mockData: ProfileMockData } | null {
  const mockData = getMockDataForProfile(profile);
  const story = mockData.stories.find(s => s.id === storyId);
  if (!story) return null;
  return { story, mockData };
}

/**
 * Get a point by ID from mock data.
 * Points are shared across profiles, so we just need any profile to get the point structure.
 */
export function getPointFromMockData(
  pointId: string,
  profile: Profile
): { point: Point; mockData: ProfileMockData } | null {
  const mockData = getMockDataForProfile(profile);
  const point = mockData.points.find(p => p.id === pointId);
  if (!point) return null;
  return { point, mockData };
}

/**
 * Get points linked to a story.
 */
export function getPointsForStory(story: Story, mockData: ProfileMockData): Point[] {
  return mockData.points.filter(p => story.linkedPointIds.includes(p.id));
}

/**
 * Get stories linked to a point.
 */
export function getStoriesForPoint(point: Point, mockData: ProfileMockData): Story[] {
  return mockData.stories.filter(s => point.linkedStoryIds.includes(s.id));
}

/**
 * Format time ago helper
 */
export function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

/**
 * Get position counts for a Point (7-point Likert scale collapsed to 3 groups)
 */
export interface SevenPointCounts {
  strongly_agree: number;
  agree: number;
  somewhat_agree: number;
  unsure: number;
  somewhat_disagree: number;
  disagree: number;
  strongly_disagree: number;
}

export function getPointPositionCounts(point: Point): SevenPointCounts {
  const counts: SevenPointCounts = {
    strongly_agree: 0,
    agree: 0,
    somewhat_agree: 0,
    unsure: 0,
    somewhat_disagree: 0,
    disagree: 0,
    strongly_disagree: 0,
  };
  for (const entry of Object.values(point.positions)) {
    if (entry?.position && entry.position in counts) {
      counts[entry.position as keyof SevenPointCounts]++;
    }
  }
  return counts;
}
