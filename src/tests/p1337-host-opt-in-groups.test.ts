/**
 * P1337 walkthrough 9: on the event page the host sees the participants grouped like the room's
 * roster — Opted in / Opted out / Undecided (no answer, or no preparation) — with each number.
 */
import { describe, it, expect } from 'vitest';
import { groupByOptIn, optInsByProfile } from '@/app/prototypes/events/prep/PrepMarks';
import type { HostPrepRow } from '@/app/data/event-prep-service';

const row = (
  profileId: string,
  optedIn: boolean | null,
  principleRating: number | null = null,
  room: { optedIn: boolean | null; rating: number | null } = { optedIn: null, rating: null },
): HostPrepRow =>
  ({ profileId, optedIn, principleRating, roomOptedIn: room.optedIn, roomRating: room.rating, completedAt: null, researchState: null, micSetup: null } as unknown as HostPrepRow);

describe('host opt-in groups', () => {
  it('groups by the answer, keeps the number, and puts no answer or no row under Undecided', () => {
    const optIns = optInsByProfile([row('a', true, 8), row('b', false, 3), row('c', null)]);
    expect(optIns.get('a')).toEqual({ state: 'in', rating: 8 });
    const groups = groupByOptIn([{ profileId: 'a' }, { profileId: 'b' }, { profileId: 'c' }, { profileId: 'd' }], optIns);
    expect(groups.map(g => [g.title, g.people.map(p => p.profileId)])).toEqual([
      ['Opted in', ['a']],
      ['Opted out', ['b']],
      ['Undecided', ['c', 'd']],
    ]);
  });

  // P1429 A2: someone who answered only in the room has no preparation answer to read.
  it('takes the room answer and its number when there is one, over the preparation', () => {
    const optIns = optInsByProfile([row('roomOnly', null, null, { optedIn: true, rating: 7 }), row('changed', true, 9, { optedIn: false, rating: 2 }), row('prep', false, 4)]);
    expect(optIns.get('roomOnly')).toEqual({ state: 'in', rating: 7 });
    expect(optIns.get('changed')).toEqual({ state: 'out', rating: 2 });
    expect(optIns.get('prep')).toEqual({ state: 'out', rating: 4 });
  });
});
