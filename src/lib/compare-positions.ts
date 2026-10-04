/**
 * @file compare-positions.ts
 * @description P1337: pure helpers for the compare view — which statements two people both
 * hold a position on, ordered by how far apart those positions are.
 */
import type { PositionType } from '@/app/types';

/** The seven DB enum values (point_positions.position). */
export type PositionKey = PositionType;

/** Most-disagreeing to most-agreeing; the index is the distance scale. */
export const POSITION_ORDER: PositionKey[] = [
  'strongly_disagree',
  'disagree',
  'somewhat_disagree',
  'unsure',
  'somewhat_agree',
  'agree',
  'strongly_agree',
];

/** Third person, the letters' wording (letter-reveal-ordinal.tsx) — the column describes someone. */
export const POSITION_FULL_LABELS: Record<PositionKey, string> = {
  strongly_agree: 'Strongly agrees',
  agree: 'Agrees',
  somewhat_agree: 'Somewhat agrees',
  unsure: 'Unsure',
  somewhat_disagree: 'Somewhat disagrees',
  disagree: 'Disagrees',
  strongly_disagree: 'Strongly disagrees',
};

/** First person for the viewer's own column — "You strongly agrees" reads wrong. */
export const POSITION_FIRST_PERSON: Record<PositionKey, string> = {
  strongly_agree: 'Strongly agree',
  agree: 'Agree',
  somewhat_agree: 'Somewhat agree',
  unsure: 'Unsure',
  somewhat_disagree: 'Somewhat disagree',
  disagree: 'Disagree',
  strongly_disagree: 'Strongly disagree',
};

export function positionGap(a: PositionKey, b: PositionKey): number {
  return Math.abs(POSITION_ORDER.indexOf(a) - POSITION_ORDER.indexOf(b));
}

export interface CompareRow {
  pointId: string;
  statement: string;
  mine: PositionKey;
  theirs: PositionKey;
  gap: number;
}

/**
 * Statements BOTH people hold a position on, largest gap first. Ties keep the input order
 * (Array.prototype.sort is stable), so agreements (gap 0) come last but stay present: that is
 * where a false agreement hides.
 */
export function buildCompareRows(
  statements: { id: string; statement: string }[],
  mine: Map<string, PositionKey>,
  theirs: Map<string, PositionKey>,
): CompareRow[] {
  const rows: CompareRow[] = [];
  for (const s of statements) {
    const m = mine.get(s.id);
    const t = theirs.get(s.id);
    if (!m || !t) continue;
    rows.push({ pointId: s.id, statement: s.statement, mine: m, theirs: t, gap: positionGap(m, t) });
  }
  return rows.sort((a, b) => b.gap - a.gap);
}

/** The statement the pair is furthest apart on, or null when they agree on everything. */
export function furthestApart(rows: CompareRow[]): CompareRow | null {
  const first = rows[0];
  return first && first.gap > 0 ? first : null;
}
