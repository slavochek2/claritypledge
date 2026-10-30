/**
 * P1536: the INTENDED final canvas of a run, checked as a whole. Every accepted action is applied in action order with no limit or repeat check,
 * and then the result is made valid by refusing actions, one at a time and deterministically:
 *   - repeats: in a box, identical statements keep ONE copy. An untouched current point is kept first; with none, the earliest action wins. The
 *     rest are refused;
 *   - capacity: while a box holds more than `max`, the LATEST action that adds into it is refused (a new point before a move; a reword adds
 *     nothing, and an untouched current point is never shed);
 *   - a refusal is undone (`revert`): a refused move puts its point back in its box, a refused reword keeps the old words, a refused new point is gone.
 * After each refusal both checks run again (a point put back can make a repeat or fill its box). Every pass refuses one action, so it ends within
 * the number of actions. Pure: no Deno or esm.sh imports.
 */

export interface Elem {
  box: string;
  statement: string;
  /** base: a current point left as it is (or put back); the others come from one action. */
  origin: 'base' | 'reword' | 'move' | 'new';
  /** The current point a base, reword or move stands on. */
  baseId?: string;
  /** The action's position in the model's list (-1 for a current point nobody named). */
  idx: number;
}

export interface ShedInput {
  max: number;
  /** The comparison form of a statement (case, spacing and quote marks ignored). */
  key: (statement: string) => string;
  /** What a refused action leaves behind: its current point as it was, or nothing (null). */
  revert: (e: Elem) => Elem | null;
}

export interface ShedResult { elems: Elem[]; refusedRepeats: number; refusedCapacity: number; lost: number }

const latest = (list: Elem[]): Elem | undefined => list.reduce<Elem | undefined>((a, b) => (!a || b.idx > a.idx ? b : a), undefined);
const earliest = (list: Elem[]): Elem | undefined => list.reduce<Elem | undefined>((a, b) => (!a || b.idx < a.idx ? b : a), undefined);

/** An action that must give way because its words repeat another point's in the same box. */
function repeatVictim(i: ShedInput, elems: Elem[]): Elem | undefined {
  const groups = new Map<string, Elem[]>();
  for (const e of elems) {
    const k = `${e.box}\u0000${i.key(e.statement)}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  for (const group of groups.values()) {
    const acted = group.filter((e) => e.origin !== 'base');
    const spared = group.some((e) => e.origin === 'base') ? undefined : earliest(acted);
    const victim = latest(acted.filter((e) => e !== spared));
    if (group.length > 1 && victim) return victim;
  }
  return undefined;
}

/** The action that must give way because its box would hold more than `max`. */
function capacityVictim(i: ShedInput, elems: Elem[]): Elem | undefined {
  const counts = new Map<string, number>();
  for (const e of elems) counts.set(e.box, (counts.get(e.box) ?? 0) + 1);
  for (const [box, n] of counts) {
    if (n <= i.max) continue;
    const adders = elems.filter((e) => e.box === box);
    const victim = latest(adders.filter((e) => e.origin === 'new')) ?? latest(adders.filter((e) => e.origin === 'move'));
    if (victim) return victim;
  }
  return undefined;
}

export function shedToValid(elems: Elem[], i: ShedInput): ShedResult {
  let list = elems;
  const out: ShedResult = { elems, refusedRepeats: 0, refusedCapacity: 0, lost: 0 };
  for (let pass = 0; pass <= elems.length; pass++) {
    const repeat = repeatVictim(i, list);
    const victim = repeat ?? capacityVictim(i, list);
    if (!victim) break;
    if (repeat) out.refusedRepeats += 1; else out.refusedCapacity += 1;
    const back = i.revert(victim);
    if (!back) out.lost += 1;
    list = list.flatMap((e) => (e !== victim ? [e] : back ? [back] : []));
  }
  return { ...out, elems: list };
}
