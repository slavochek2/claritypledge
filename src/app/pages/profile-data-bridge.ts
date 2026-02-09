/**
 * @file profile-data-bridge.ts
 * @description Bridge between production data and prototype mock data functions
 *
 * The prototype StoryCard/PointCard components call mock data functions like
 * getPointById() and getStoryById(). This module provides a registry and
 * override mechanism so those functions can access real production data.
 */

import type { Story, Point } from '@/app/prototypes/shared/types';

/**
 * Global data registry for profile page
 * Stores adapted stories and points so prototype components can access them
 */
class ProfileDataRegistry {
  private stories = new Map<string, Story>();
  private points = new Map<string, Point>();

  registerStory(story: Story) {
    this.stories.set(story.id, story);
  }

  registerPoint(point: Point) {
    this.points.set(point.id, point);
  }

  getStory(id: string): Story | undefined {
    return this.stories.get(id);
  }

  getPoint(id: string): Point | undefined {
    return this.points.get(id);
  }

  // Get points linked to a story
  getPointsForStory(storyId: string): Point[] {
    const story = this.getStory(storyId);
    if (!story) return [];

    return story.linkedPointIds
      .map(id => this.getPoint(id))
      .filter((p): p is Point => p !== undefined);
  }

  // Get stories linked to a point
  getStoriesForPoint(pointId: string): Story[] {
    const point = this.getPoint(pointId);
    if (!point) return [];

    return point.linkedStoryIds
      .map(id => this.getStory(id))
      .filter((s): s is Story => s !== undefined);
  }

  clear() {
    this.stories.clear();
    this.points.clear();
  }

  // Register multiple items at once
  registerAll(stories: Story[], points: Point[]) {
    stories.forEach(s => this.registerStory(s));
    points.forEach(p => this.registerPoint(p));
  }
}

export const profileDataRegistry = new ProfileDataRegistry();

// Expose globally so prototype mock data can use it as fallback
if (typeof window !== 'undefined') {
  (window as Window & { __profileDataRegistry?: ProfileDataRegistry }).__profileDataRegistry = profileDataRegistry;
}
