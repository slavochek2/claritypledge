/**
 * @file use-hike-answers-for-host.ts
 * @description P1675 section 3b: the host's read of every registrant's hike answers, by profile id. One read on open and
 * when the participant list changes (answers are not editable after the seat, so no timer).
 */
import { useEffect, useState } from 'react';
import { getHikeAnswersForHost, type HikeAnswerRow } from '@/app/data/hike-answers-host';

export function useHikeAnswersForHost(
  eventId: string | undefined,
  enabled: boolean,
  refreshKey?: unknown,
): ReadonlyMap<string, HikeAnswerRow> {
  const [rows, setRows] = useState<ReadonlyMap<string, HikeAnswerRow>>(new Map());
  useEffect(() => {
    if (!eventId || !enabled) { setRows(new Map()); return; }
    let cancelled = false;
    void getHikeAnswersForHost(eventId).then((r) => {
      if (!cancelled) setRows(new Map(r.map((x) => [x.profileId, x])));
    });
    return () => { cancelled = true; };
  }, [eventId, enabled, refreshKey]);
  return rows;
}
