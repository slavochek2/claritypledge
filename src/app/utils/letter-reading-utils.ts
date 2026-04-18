/**
 * @file letter-reading-utils.ts
 * @description P696: Pure utility functions for letter reading flow.
 * Extracted from letter-preview-page.tsx and letter-reading-page.tsx.
 */

import type { StoryPhase } from '@/app/hooks/useLetterReadingState';
import type { LetterStorySnapshot } from '@/app/types';

// ---------------------------------------------------------------------------
// calculateStoryProgress
// Extracted verbatim from letter-preview-page.tsx (lines 172-212) and
// letter-reading-page.tsx (lines 672-712) — identical in both files.
// ---------------------------------------------------------------------------

export function calculateStoryProgress(
  phase: StoryPhase,
  currentPointIndex: number,
  visiblePointCount: number
): number {
  if (visiblePointCount >= 2) {
    const total = 4 + 2 * (visiblePointCount - 1);
    let screen: number;
    switch (phase) {
      case 'point-engage':             screen = 0; break;
      case 'point-revealed':           screen = 1; break;
      case 'story-rate':               screen = 2; break;
      case 'story-revealed':           screen = 3; break;
      case 'remaining-point-engage':   screen = 4 + (currentPointIndex - 1) * 2; break;
      case 'remaining-point-revealed': screen = 5 + (currentPointIndex - 1) * 2; break;
      case 'transition':               screen = total; break;
      default:                         screen = 0;
    }
    return Math.min(screen / total, 1);
  }
  if (visiblePointCount === 1) {
    const total = 4;
    let screen: number;
    switch (phase) {
      case 'story-rate':     screen = 0; break;
      case 'story-revealed': screen = 1; break;
      case 'point-engage':   screen = 2; break;
      case 'point-revealed': screen = 3; break;
      case 'transition':     screen = total; break;
      default:               screen = 0;
    }
    return Math.min(screen / total, 1);
  }
  // 0 visible points: story-rate(0) → story-revealed(0.5) → transition(1)
  switch (phase) {
    case 'story-rate':     return 0;
    case 'story-revealed': return 0.5;
    case 'transition':     return 1;
    default:               return 0;
  }
}

// ---------------------------------------------------------------------------
// estimateReadingMinutes
// New formula (P696): Math.max(1, Math.ceil(totalPoints + storyCount))
// Replaces old formula: Math.ceil(storyCount * 2)
// ---------------------------------------------------------------------------

export function estimateReadingMinutes(storyCount: number, totalPointCount: number): number {
  return Math.max(1, Math.ceil(totalPointCount + storyCount));
}

// ---------------------------------------------------------------------------
// countTotalPoints
// Counts all visible points across a set of LetterStorySnapshot objects.
// ---------------------------------------------------------------------------

interface PointConfigPoint {
  id?: string;
  hidden?: boolean;
}

interface PointConfig {
  points?: PointConfigPoint[];
  hidden?: string[];
}

export function countTotalPoints(snapshots: LetterStorySnapshot[]): number {
  return snapshots.reduce((total, snapshot) => {
    const config = (snapshot.point_config ?? {}) as PointConfig;
    const points = Array.isArray(config.points) ? config.points : [];
    const topLevelHidden = Array.isArray(config.hidden) ? new Set(config.hidden) : null;
    const visibleCount = points.filter(
      (p) => !p.hidden && !(topLevelHidden && p.id && topLevelHidden.has(p.id))
    ).length;
    return total + visibleCount;
  }, 0);
}
