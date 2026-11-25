/**
 * @file movement-scope.ts
 * @description P1061: helpers of the Changes filter that are not components: the day labels the graphs write,
 * the level counts of a set of readings, the toggling of a target and the one-line summary of a filter.
 */
import { positionOfLevel, isEveryone, hasDates, readingsOf, type MovementScope, type Reading } from '@/lib/position-movement';
import { POSITION_ORDER } from '@/lib/compare-positions';
import type { LevelCounts } from '@/lib/position-spread';
import type { PointMovementRows } from '@/app/data/movement-service';

/** Month names fixed here, so every browser writes the same ("13 Sep"). */
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** A moment as the graphs write it: day and short month, in the viewer's local time ("13 Sep"). */
export function dayLabelOf(at: string): string {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()] ?? ''}`;
}

/** An ISO day (YYYY-MM-DD) as "13 Sep". */
const shortIso = (iso: string) => {
  const [, month, day] = iso.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? ''}`;
};

/**
 * The one order of people on the point page, for the list and for the filter's preview: the largest change first,
 * then by name, so people who changed stay on top and the ones who kept their position follow alphabetically.
 */
export const byChangeThenName = (nameOf: (r: Reading) => string) => (a: Reading, b: Reading): number =>
  Math.abs(b.latest - b.first) - Math.abs(a.latest - a.first) || nameOf(a).localeCompare(nameOf(b));

/** Seven-level counts of a list of levels (-3 .. 3). */
export function countsOfLevels(levels: readonly number[]): LevelCounts {
  const counts = Object.fromEntries(POSITION_ORDER.map(p => [p, 0])) as LevelCounts;
  for (const level of levels) counts[positionOfLevel(level)] += 1;
  return counts;
}

export type TargetKind = 'person' | 'event' | 'group';

const KEY: Record<TargetKind, 'people' | 'events' | 'groups'> = { person: 'people', event: 'events', group: 'groups' };

/** Adds the target when it is not chosen yet, removes it when it is. */
export function toggleTarget(scope: MovementScope, kind: TargetKind, id: string): MovementScope {
  const key = KEY[kind];
  const chosen = scope[key];
  return { ...scope, [key]: chosen.includes(id) ? chosen.filter(x => x !== id) : [...chosen, id] };
}

export interface ChosenTarget { kind: TargetKind; id: string; label: string }

/** The chosen targets with their names: people first, then events, then groups. */
export function chosenTargets(scope: MovementScope, data: PointMovementRows): ChosenTarget[] {
  return [
    ...scope.people.map(id => ({ kind: 'person' as const, id, label: data.people.get(id)?.name ?? 'Someone' })),
    ...scope.events.map(id => ({ kind: 'event' as const, id, label: data.events.find(e => e.id === id)?.title ?? id })),
    ...scope.groups.map(id => ({ kind: 'group' as const, id, label: data.groups.find(g => g.id === id)?.name ?? id })),
  ];
}

const NAMED_IN_SUMMARY = 3;

/** The filter in a few words: who and when. Names joined by " + ", up to three, the rest a number. */
export function describeScope(scope: MovementScope, data: PointMovementRows): string {
  if (isEveryone(scope)) return 'Everyone';
  const targets = chosenTargets(scope, data);
  const named = targets.slice(0, NAMED_IN_SUMMARY).map(t => t.label);
  const rest = targets.length - named.length;
  const who = targets.length === 0 ? 'Everyone' : [...named, ...(rest > 0 ? [`${rest} more`] : [])].join(' + ');
  const when = !hasDates(scope) ? ''
    : scope.from !== '' && scope.to !== '' ? `${shortIso(scope.from)} to ${shortIso(scope.to)}`
    : scope.from !== '' ? `from ${shortIso(scope.from)}` : `until ${shortIso(scope.to)}`;
  return [who, when].filter(part => part !== '').join(' · ');
}

/**
 * Whether the Filter pill is offered: while the point has someone to list, and always while a filter is on (so it
 * can be undone). A point with no holder has nothing to filter.
 */
export function offersFilter(data: PointMovementRows, scope: MovementScope): boolean {
  return !isEveryone(scope) || readingsOf(data.history, data.current, data.agentIds).length > 0;
}
