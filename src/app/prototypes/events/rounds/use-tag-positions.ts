/**
 * @file use-tag-positions.ts
 * @description P1337 — the night's statements (events.statement_tag) and the positions a set of
 * people hold on them. The host loads it for the whole room (the grouping's gap signal); an
 * attendee loads it for their table (the statement they are furthest apart on).
 *
 * Re-reads when the set of people changes — a newcomer may have staked in the room. A failed
 * read keeps what is loaded: someone without positions simply groups without a gap signal
 * (spec Risks: ACCEPT), which is also what an empty result means.
 */
import { useEffect, useState } from 'react';
import { getPositionsFor, getTagStatements } from '@/app/data/compare-service';
import { POSITION_ORDER, type PositionKey } from '@/lib/compare-positions';

export interface TagPositions {
  statements: { id: string; statement: string }[];
  /** profileId → pointId → position */
  byProfile: Map<string, Map<string, PositionKey>>;
}

const EMPTY: TagPositions = { statements: [], byProfile: new Map() };

export function useTagPositions(tag: string | null | undefined, profileIds: string[]): TagPositions {
  const [data, setData] = useState<TagPositions>(EMPTY);
  const key = [...profileIds].sort().join(',');

  useEffect(() => {
    if (!tag || !key) {
      setData(EMPTY);
      return;
    }
    let cancelled = false;
    const ids = key.split(',');
    (async () => {
      try {
        const statements = await getTagStatements(tag);
        const byProfile = await getPositionsFor(ids, statements.map(s => s.id));
        if (!cancelled) setData({ statements, byProfile });
      } catch {
        /* keep what is loaded */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tag, key]);

  return data;
}

/** -3 … +3, the numeric form the grouping's gap uses. */
export function numericPositions(positions: Map<string, PositionKey> | undefined): Map<string, number> | undefined {
  if (!positions) return undefined;
  return new Map([...positions].map(([pointId, p]) => [pointId, POSITION_ORDER.indexOf(p) - 3]));
}
