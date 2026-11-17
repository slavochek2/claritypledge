/**
 * @file hike-host-line.ts
 * @description P1675 section 3b: the host's one-line, plain-text summary of a registrant's hike answers, e.g.
 * "Later · Car, 2 free seats · Sweep" or "Now · Needs a ride · Other: dog food". Returns a string only; callers render it
 * as a React text node (the Other text is free text and is never HTML).
 */
import type { HikeAnswerRow } from '@/app/data/hike-answers-host';
import {
  HIKE_HELP_OPTIONS,
  HIKE_HOST_NEEDS_RIDE,
  HIKE_HOST_OTHER_PREFIX,
  HIKE_HOST_WHEN,
  HIKE_TRANSPORT_OPTIONS,
  hikeHostSeats,
} from './hike-copy';

export function hikeHostLine(a: HikeAnswerRow): string {
  const parts: string[] = [HIKE_HOST_WHEN[a.when]];
  if (a.transport === 'need_ride') {
    parts.push(HIKE_HOST_NEEDS_RIDE);
  } else {
    const label = HIKE_TRANSPORT_OPTIONS.find((o) => o.value === a.transport)?.label ?? a.transport;
    parts.push(a.freeSeats != null ? `${label}, ${hikeHostSeats(a.freeSeats)}` : label);
  }
  if (a.help === 'other') {
    parts.push(`${HIKE_HOST_OTHER_PREFIX}${a.helpOther ?? ''}`);
  } else if (a.help) {
    parts.push(HIKE_HELP_OPTIONS.find((o) => o.value === a.help)?.label ?? a.help);
  }
  return parts.join(' · ');
}
