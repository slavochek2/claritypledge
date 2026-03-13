/**
 * @file position-helpers.ts
 * @description Position UI helpers — maps 7-point Likert scale to 3-button groups,
 * provides CTA copy, and controls story CTA visibility.
 *
 * Extracted from prototypes/shared/types.ts during P507.
 */

import type { PositionType, PositionButtonGroup } from '@/app/types';

export interface PositionCTACopy {
  symbol: string;
  label: string;
  ctaText: string;
  ariaLabel: string;
}

/** Map position type to its button group */
export function getPositionGroup(position: PositionType): PositionButtonGroup {
  switch (position) {
    case 'strongly_disagree':
    case 'disagree':
    case 'somewhat_disagree':
      return 'disagree';
    case 'unsure':
      return 'unsure';
    case 'somewhat_agree':
    case 'agree':
    case 'strongly_agree':
      return 'agree';
  }
}

/** Map position button group to story CTA copy (P456, unified in P487) */
export function getPositionCTACopy(group: PositionButtonGroup): PositionCTACopy {
  const symbols: Record<PositionButtonGroup, { symbol: string; label: string }> = {
    agree: { symbol: '\u2713', label: 'Agree' },
    disagree: { symbol: '\u2717', label: 'Disagree' },
    unsure: { symbol: '~', label: 'Unsure' },
  };
  return {
    ...symbols[group],
    ctaText: 'Add your story \u2192',
    ariaLabel: 'Add your story for this point',
  };
}

/**
 * Determines whether the "Tell your story" CTA should appear on a point.
 *
 * Rules:
 * - No position taken → hidden (nothing to attach a story to)
 * - Viewing your OWN story → hidden (you don't prompt yourself)
 * - Viewer already has a story for this point → hidden
 *
 * Usage: surfaces call this instead of reimplementing inline checks.
 * Fixes the bug class documented in P451/P456/P465/P487.
 */
export function shouldShowStoryCTA(params: {
  userPosition: PositionType | null;
  isOwnStory: boolean;
  viewerStoryCount?: number;
}): 'show' | 'hidden' {
  if (!params.userPosition) return 'hidden';
  if (params.isOwnStory) return 'hidden';
  if (params.viewerStoryCount !== undefined && params.viewerStoryCount > 0) return 'hidden';
  return 'show';
}
