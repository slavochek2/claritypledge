/** P1529 UAT 2026-11-11 (items 1, 4, 5, 6): the pure rules behind the reading part, the positions list and seating anyway. */
import { describe, expect, it } from 'vitest';
import { changedPoints, observerLine, readingPoints, tapOf } from '@/app/prototypes/events/rounds/mastermind-round-helpers';
import { screenTimeLeft } from '@/app/prototypes/events/rounds/screen-time-left';
import { roundClock, roundTiming } from '@/lib/round-clock';
import { checkMastermindSeats } from '@/lib/mastermind-seating-check';

describe('observerLine', () => {
  it('has one line per part and none while finding the table or after the round', () => {
    expect(observerLine('seating', 'Erin', 'Haru')).toBeNull();
    expect(observerLine('over', 'Erin', 'Haru')).toBeNull();
    expect(observerLine('reading', 'Erin', 'Haru')).toBe('Silent reading. No talking yet.');
    expect(observerLine('first', 'Erin', 'Haru')).toBe(observerLine('second', 'Erin', 'Haru'));
    expect(observerLine('observer', 'Erin', 'Haru')).toBe('Your turn: what did you notice?');
  });
});

describe('changedPoints and readingPoints', () => {
  const now = [{ id: '1', statement: 'Same' }, { id: '2', statement: ' rewritten  point ' }];
  it('a point is changed when the previous version has no such statement (spacing and case do not count)', () => {
    expect(changedPoints(now, [{ statement: 'same' }, { statement: 'Rewritten point' }])).toEqual([]);
    expect(changedPoints(now, [{ statement: 'Same' }]).map(p => p.id)).toEqual(['2']);
  });
  it('a first version has nothing to differ from', () => {
    expect(changedPoints(now, null)).toEqual([]);
  });
  it('a reader lists every point; the owner only changed ones without their own position', () => {
    const prev = [{ statement: 'Same' }];
    expect(readingPoints({ isOwner: false, points: now, previous: prev, ownerPositionOf: () => null }).map(p => p.id)).toEqual(['1', '2']);
    expect(readingPoints({ isOwner: true, points: now, previous: prev, ownerPositionOf: () => null }).map(p => p.id)).toEqual(['2']);
    expect(readingPoints({ isOwner: true, points: now, previous: prev, ownerPositionOf: id => (id === '2' ? 'agree' : null) })).toEqual([]);
  });
});

describe('tapOf', () => {
  it('folds the seven levels to agree, unsure or disagree', () => {
    expect([tapOf('strongly_agree'), tapOf('somewhat_agree'), tapOf('unsure'), tapOf('somewhat_disagree'), tapOf('strongly_disagree'), tapOf(null)])
      .toEqual(['agree', 'agree', 'unsure', 'disagree', 'disagree', null]);
  });
});

describe('the projector\'s time left with a reading part', () => {
  const timing = roundTiming({ seatingS: 120, readingS: 180, firstS: 450, secondS: 450, splitSpeakers: false, observerS: 180 });
  const at = (s: number) => roundClock('2026-11-11T10:00:00Z', new Date('2026-11-11T10:00:00Z').getTime() + s * 1000, true, timing);
  it('says reading comes after finding the table, and the talk after reading', () => {
    expect(screenTimeLeft(at(30), timing, true)?.next).toBe('then 3 min reading');
    const reading = screenTimeLeft(at(130), timing, true);
    expect(reading?.left).toBe('2:50 left');
    expect(reading?.next).toBe('then 15 min to talk');
  });
  it('with no reading part finding the table leads straight to the talk', () => {
    const none = roundTiming({ seatingS: 120, readingS: 0, firstS: 450, secondS: 450, splitSpeakers: false, observerS: 180 });
    const clock = roundClock('2026-11-11T10:00:00Z', new Date('2026-11-11T10:00:00Z').getTime() + 30_000, true, none);
    expect(screenTimeLeft(clock, none, true)?.next).toBe('then 15 min to talk');
  });
});

describe('seating anyway: an owner without a canvas', () => {
  const seats = [{ id: 'a', table: 1, role: 'first' as const }, { id: 'b', table: 1, role: 'second' as const }];
  it('is not a problem below two canvases', () => {
    expect(checkMastermindSeats(seats, { holders: ['b'], observers: [], history: [] }).map(p => p.rule)).not.toContain('owner-without-canvas');
  });
  it('is still a problem once two canvases are shared (the server refuses it then too)', () => {
    expect(checkMastermindSeats(seats, { holders: ['b', 'c'], observers: [], history: [] }).map(p => p.rule)).toContain('owner-without-canvas');
  });
});
