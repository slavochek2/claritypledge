/**
 * @file position-spread.ts
 * @description P1508: counts behind the spread (position-spread.tsx) — seven levels, and when a
 * point is "Contested".
 */
import type { PositionType } from '@/app/types';
import { POSITION_ORDER } from '@/lib/compare-positions';
import { getPositionGroup } from '@/app/utils/position-helpers';

export type LevelCounts = Record<PositionType, number>;

/** Seven-level counts from a list of positions. */
export function levelCounts(positions: readonly { position: PositionType }[]): LevelCounts {
  const counts = Object.fromEntries(POSITION_ORDER.map(p => [p, 0])) as LevelCounts;
  for (const { position } of positions) counts[position] = (counts[position] ?? 0) + 1;
  return counts;
}

/** Contested: at least two people agree and at least two disagree (any strength). */
export function isContested(counts: LevelCounts): boolean {
  let agree = 0;
  let disagree = 0;
  for (const level of POSITION_ORDER) {
    const group = getPositionGroup(level);
    if (group === 'agree') agree += counts[level] ?? 0;
    else if (group === 'disagree') disagree += counts[level] ?? 0;
  }
  return agree >= 2 && disagree >= 2;
}

export function totalPositions(counts: LevelCounts): number {
  return POSITION_ORDER.reduce((n, level) => n + (counts[level] ?? 0), 0);
}
