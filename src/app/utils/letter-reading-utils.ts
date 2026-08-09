/**
 * @file letter-reading-utils.ts
 * @description P696: Pure utility functions for letter reading flow.
 * Extracted from letter-preview-page.tsx and letter-reading-page.tsx.
 */

import type { StoryPhase } from '@/app/hooks/useLetterReadingState';
import type { LetterStorySnapshot } from '@/app/types';

// ---------------------------------------------------------------------------
// clampLeadCount / getEffectiveLeadCount (P898)
// `lead_count` marks how many of the ordered VISIBLE points render before the
// story. Absent/malformed → 1 (the historical implicit single lead). Clamped
// to [0, visiblePointCount] so a malformed sealed snapshot can never break
// the reader walk. 0 is a VALID authorial value (story-first), not malformed.
// ---------------------------------------------------------------------------

export function clampLeadCount(raw: unknown, visiblePointCount: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return Math.min(1, visiblePointCount);
  }
  return Math.min(Math.max(Math.floor(raw), 0), visiblePointCount);
}

export function getEffectiveLeadCount(pointConfig: unknown, visiblePointCount: number): number {
  const cfg = (pointConfig ?? {}) as { lead_count?: unknown };
  return clampLeadCount(cfg.lead_count, visiblePointCount);
}

// ---------------------------------------------------------------------------
// isReverseStorySnapshot (P1030)
// A reverse story is one whose EXPERIENCE belongs to the reader while its TEXT
// was written by the sender. It changes two strings in the reading flow: the
// rating question, and the reveal line that describes the number afterwards.
//
// Strict `=== true` rather than truthiness: the value arrives from a JSONB blob
// that also feeds anonymous token readers, so a stray non-boolean must fall back
// to the ordinary letter rendering rather than silently reframe the question.
// ---------------------------------------------------------------------------

export function isReverseStorySnapshot(pointConfig: unknown): boolean {
  const cfg = (pointConfig ?? {}) as { reverseStory?: unknown };
  return cfg.reverseStory === true;
}

// ---------------------------------------------------------------------------
// calculateStoryProgress
// Extracted verbatim from letter-preview-page.tsx (lines 172-212) and
// letter-reading-page.tsx (lines 672-712) — identical in both files.
// P898: generalized to N leads. Total screens = 2N + 2 + 2(V−N) = 2V + 2,
// with the story pair after screen 2N. leadCount defaults to 1 (today's shape).
// ---------------------------------------------------------------------------

export function calculateStoryProgress(
  phase: StoryPhase,
  currentPointIndex: number,
  visiblePointCount: number,
  leadCount: number = 1
): number {
  if (visiblePointCount === 0) {
    // 0 visible points: story-rate(0) → story-revealed(0.5) → transition(1)
    switch (phase) {
      case 'story-rate':     return 0;
      case 'story-revealed': return 0.5;
      case 'transition':     return 1;
      default:               return 0;
    }
  }

  const lead = clampLeadCount(leadCount, visiblePointCount);

  if (visiblePointCount === 1 && lead >= 1) {
    // D36 legacy single-point walk: story first, point after (point-* phases)
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

  // Generalized N-lead walk (V >= 2, or V == 1 with an explicit lead_count of 0):
  // leads point-*(0..N-1) → story pair at 2N/2N+1 → remaining-*(N..V-1) → transition.
  // Indices are clamped into their phase's valid range so unreachable states
  // (e.g. point-engage with an index past the lead group) degrade to the nearest
  // valid screen instead of colliding with the story pair — this also preserves
  // the previous behavior where point-* screens ignored the index entirely.
  const total = 2 * visiblePointCount + 2;
  const leadIdx = Math.min(Math.max(currentPointIndex, 0), Math.max(lead - 1, 0));
  const remainingIdx = Math.min(Math.max(currentPointIndex, lead), visiblePointCount - 1);
  let screen: number;
  switch (phase) {
    case 'point-engage':             screen = 2 * leadIdx; break;
    case 'point-revealed':           screen = 2 * leadIdx + 1; break;
    case 'story-rate':               screen = 2 * lead; break;
    case 'story-revealed':           screen = 2 * lead + 1; break;
    case 'remaining-point-engage':   screen = 2 * remainingIdx + 2; break;
    case 'remaining-point-revealed': screen = 2 * remainingIdx + 3; break;
    case 'transition':               screen = total; break;
    default:                         screen = 0;
  }
  return Math.min(screen / total, 1);
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
