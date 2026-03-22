/**
 * @file position-helpers.ts
 * @description Position UI helpers — maps 7-point Likert scale to 3-button groups,
 * provides CTA copy, and controls story CTA visibility.
 *
 * Extracted from prototypes/shared/types.ts during P507.
 */

import type { PositionType, PositionButtonGroup } from '@/app/types';
import type { SevenPointCounts } from '@/app/components/shared/PositionButton';

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

/** Default zero-valued SevenPointCounts */
export const ZERO_COUNTS: SevenPointCounts = {
  strongly_agree: 0, agree: 0, somewhat_agree: 0,
  unsure: 0,
  somewhat_disagree: 0, disagree: 0, strongly_disagree: 0,
};

/** Normalize a partial Record to a full SevenPointCounts (missing keys → 0) */
export function toSevenPointCounts(counts?: Record<string, number>): SevenPointCounts {
  if (!counts) return { ...ZERO_COUNTS };
  return { ...ZERO_COUNTS, ...counts } as SevenPointCounts;
}

/**
 * Optimistic position count adjustment.
 * When a user changes position locally (before server confirms),
 * adjust the displayed counts: decrement old group, increment new group.
 */
export function adjustPositionCounts(
  baseCounts: SevenPointCounts,
  serverPosition: PositionType | null,
  effectivePosition: PositionType | null,
): SevenPointCounts {
  const adjusted: SevenPointCounts = { ...baseCounts };
  const serverGroup = serverPosition ? getPositionGroup(serverPosition) : null;
  const effectiveGroup = effectivePosition ? getPositionGroup(effectivePosition) : null;

  if (serverGroup !== effectiveGroup) {
    if (serverGroup === 'agree') adjusted.agree = Math.max(0, adjusted.agree - 1);
    else if (serverGroup === 'disagree') adjusted.disagree = Math.max(0, adjusted.disagree - 1);
    else if (serverGroup === 'unsure') adjusted.unsure = Math.max(0, adjusted.unsure - 1);

    if (effectiveGroup === 'agree') adjusted.agree++;
    else if (effectiveGroup === 'disagree') adjusted.disagree++;
    else if (effectiveGroup === 'unsure') adjusted.unsure++;
  }

  return adjusted;
}

/**
 * Determines whether the "Tell your story" CTA should appear on a point.
 *
 * Rules:
 * - P560: Position is no longer required — story filing works without one
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
  if (params.isOwnStory) return 'hidden';
  if (params.viewerStoryCount !== undefined && params.viewerStoryCount > 0) return 'hidden';
  return 'show';
}
