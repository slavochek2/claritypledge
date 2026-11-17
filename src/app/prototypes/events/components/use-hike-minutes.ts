/**
 * @file use-hike-minutes.ts
 * @description P1675: the hike introduction's computed length for someone who has done none of it yet, the number the
 * registration form prints ("I have N minutes"). It is the same computation the preparation's own time estimate uses
 * (buildPlan + minutesFor over the hike's steps and the real card counts, P1549 decision 7), never a literal. Null until the
 * points that set the card counts have loaded, and when a read fails (the form then shows no number rather than a wrong one).
 */
import { useEffect, useState } from 'react';
import type { EventWithHost } from '@/app/types';
import { buildPlan, minutesFor, type CardCounts } from '../prep/prep-plan';
import { prepareStepsFor, prepStatementTag } from '../prep/prep-timing';
import { CMP7_TAG } from '../prep/prep-plan';
import { loadTagPoints } from '../prep/use-prep-state';
import { recipeForEvent } from '../series-recipes';

/** Pure: the minutes of a person's whole plan, a new person who sees the principle intro. */
export function hikeIntroductionMinutes(event: EventWithHost, cards: CardCounts): number {
  const steps = prepareStepsFor(event);
  const plan = buildPlan({
    parts: [],
    startedAt: null,
    hasStatementTag: !!prepStatementTag(event),
    eventPointCount: cards.stake,
    steps,
    keepFinished: !!recipeForEvent(event).prepare.keepFinished,
  });
  return minutesFor(plan, cards, true);
}

export function useHikeMinutes(event: EventWithHost | null | undefined, enabled: boolean): number | null {
  const [read, setRead] = useState<{ key: string; minutes: number | null } | null>(null);
  const key = event?.id ?? null;
  useEffect(() => {
    if (!enabled || !event || !key) return;
    let cancelled = false;
    const tag = prepStatementTag(event);
    Promise.all([loadTagPoints(CMP7_TAG, undefined), tag ? loadTagPoints(tag, undefined) : Promise.resolve([])])
      .then(([cmp7, stake]) => {
        if (!cancelled) setRead({ key, minutes: hikeIntroductionMinutes(event, { cmp7: cmp7.length, stake: stake.length }) });
      })
      .catch(() => { if (!cancelled) setRead({ key, minutes: null }); });
    return () => { cancelled = true; };
    // The event object is re-created on reads; its id and the inputs that set the plan are what the number depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, event?.flow, event?.seriesSlug, event?.statementTag]);
  return read && read.key === key ? read.minutes : null;
}
