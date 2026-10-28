/**
 * @file use-compare-rows.ts
 * @description The compare page's rows read: both people's positions on one tag's statements.
 * P1586: `retry` re-runs the read when the section wait passes its deadline.
 */
import { useCallback, useEffect, useState } from 'react';
import { getPositionsFor, getTagStatements } from '@/app/data/compare-service';
import { buildCompareRows, type CompareRow, type PositionKey } from '@/lib/compare-positions';
import type { Profile } from '@/app/types';

export interface RowsResult {
  key: string;
  rows: CompareRow[];
  /** Statements only the other person answered (with their position), and how many only you did. */
  theirsOnly: { pointId: string; statement: string; position: PositionKey }[];
  mineOnlyCount: number;
  error: boolean;
}

export function useCompareRows(viewerId: string | undefined, person: Profile | null, activeTag: string | null) {
  const rowsKey = person && viewerId && activeTag ? `${viewerId}:${person.id}:${activeTag}` : null;
  const [rowsResult, setRowsResult] = useState<RowsResult | null>(null);
  // Bumped by Retry: the effect runs again, and the cleanup drops the stalled request's late answer.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!rowsKey || !person || !viewerId || !activeTag) return;
    let cancelled = false;
    (async () => {
      try {
        const statements = await getTagStatements(activeTag);
        const positions = await getPositionsFor(
          [viewerId, person.id],
          statements.map(s => s.id),
        );
        const mine = positions.get(viewerId) ?? new Map<string, PositionKey>();
        const theirs = positions.get(person.id) ?? new Map<string, PositionKey>();
        const rows = buildCompareRows(statements, mine, theirs);
        const theirsOnly = statements.flatMap(st => {
          const position = theirs.get(st.id);
          return position && !mine.has(st.id) ? [{ pointId: st.id, statement: st.statement, position }] : [];
        });
        const mineOnlyCount = statements.filter(st => mine.has(st.id) && !theirs.has(st.id)).length;
        if (!cancelled) setRowsResult({ key: rowsKey, rows, theirsOnly, mineOnlyCount, error: false });
      } catch {
        if (!cancelled) setRowsResult({ key: rowsKey, rows: [], theirsOnly: [], mineOnlyCount: 0, error: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rowsKey, person, viewerId, activeTag, attempt]);

  const retry = useCallback(() => setAttempt(n => n + 1), []);
  // A result carries the key it was fetched for, so a stale one reads as "loading".
  const rowsReady = rowsResult && rowsResult.key === rowsKey ? rowsResult : null;
  return { rowsReady, retry };
}
