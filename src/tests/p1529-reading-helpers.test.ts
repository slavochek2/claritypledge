/** P1529 UAT 2026-11-11 (items 1, 4, 5, 6): the pure rules behind the reading part, the positions list and seating anyway. */
import { describe, expect, it } from 'vitest';
import { canvasOffer, changedPoints, instructionLine, readingPoints, tapOf } from '@/app/prototypes/events/rounds/mastermind-round-helpers';
import { screenTimeLeft } from '@/app/prototypes/events/rounds/screen-time-left';
import { roundClock, roundTiming } from '@/lib/round-clock';
import { checkMastermindSeats } from '@/lib/mastermind-seating-check';

describe('instructionLine (the steps for my role in the current part)', () => {
  const n = { owner: 'Haru', partner: 'Erin' };
  const Q = (what: string) => `\u201CHow well do you think you understand my ${what}, from 0 to 10?\u201D`;
  it('nothing while finding the table (the header says it) and nothing once the time is up', () => {
    for (const role of ['owner', 'partner', 'observer'] as const) {
      expect(instructionLine(role, 'seating', n)).toBeNull();
      expect(instructionLine(role, 'over', n)).toBeNull();
    }
  });
  it('reading: the owner checks their canvas; everyone else reads the owner\u2019s', () => {
    expect(instructionLine('owner', 'reading', n)).toEqual(['Check your canvas: set your position on every point if not already.']);
    const read = ['Read Haru\u2019s canvas quietly. Set your position on each point, especially where you disagree.'];
    expect(instructionLine('partner', 'reading', n)).toEqual(read);
    expect(instructionLine('observer', 'reading', n)).toEqual(read);
  });
  it('talk: the owner and the partner get two numbered steps, the observer one line; both talk phases read the same', () => {
    expect(instructionLine('owner', 'first', n)).toEqual([
      `Erin explains your canvas back. Then ask: ${Q('canvas')}`,
      `At 8 or more, Erin challenges your canvas. They ask you: ${Q('challenge')}`,
    ]);
    expect(instructionLine('partner', 'second', n)).toEqual([
      'Explain Haru\u2019s canvas back in your own words. Then answer: how well you think you understand their canvas, from 0 to 10.',
      `At 8 or more, challenge their canvas: explain where and why you disagree with their points. Then ask Haru: ${Q('challenge')}`,
    ]);
    expect(instructionLine('observer', 'first', n)).toEqual(['Make sure the listener stays in their role: no disagreeing, no own point of view yet. Keep talking time balanced: no more than 1 minute per person. Ring the bell to remind people of their roles and the time.']);
    for (const role of ['owner', 'partner', 'observer'] as const) expect(instructionLine(role, 'first', n)).toEqual(instructionLine(role, 'second', n));
  });
  it('observer part: only the observer has an instruction; the owner and the partner have none', () => {
    expect(instructionLine('observer', 'observer', n)).toEqual(['Say what they can do better. If you like, say how well you think you understood the canvas, from 0 to 10, and what was unclear.']);
    expect(instructionLine('owner', 'observer', n)).toBeNull();
    expect(instructionLine('partner', 'observer', n)).toBeNull();
  });
  it('never uses an em dash', () => {
    for (const role of ['owner', 'partner', 'observer'] as const) for (const ph of ['seating', 'reading', 'first', 'observer'] as const) {
      expect((instructionLine(role, ph, n) ?? []).join(' ')).not.toMatch(/\u2014/);
    }
  });
});

describe('canvasOffer', () => {
  it('always the primary button, except for the observer in their own part', () => {
    expect(canvasOffer('owner', 'reading')).toBe('primary');
    expect(canvasOffer('partner', 'first')).toBe('primary');
    expect(canvasOffer('owner', 'observer')).toBe('primary');
    expect(canvasOffer('observer', 'observer')).toBe('none');
    expect(canvasOffer('observer', 'first')).toBe('primary');
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
  // UAT 2026-11-12 (founder): the owner sets a position on EVERY point not yet set, changed or not (supersedes decision (d)).
  it('a reader lists every point; the owner every point without their own position', () => {
    const prev = [{ statement: 'Same' }];
    expect(readingPoints({ isOwner: false, points: now, previous: prev, ownerPositionOf: () => null }).map(p => p.id)).toEqual(['1', '2']);
    expect(readingPoints({ isOwner: true, points: now, previous: prev, ownerPositionOf: () => null }).map(p => p.id)).toEqual(['1', '2']);
    expect(readingPoints({ isOwner: true, points: now, previous: prev, ownerPositionOf: id => (id === '2' ? 'agree' : null) }).map(p => p.id)).toEqual(['1']);
    expect(readingPoints({ isOwner: true, points: now, previous: null, ownerPositionOf: () => 'agree' })).toEqual([]);
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
  it('is still a problem once two canvases are shared (the seating check warns the host; the server no longer refuses it)', () => {
    expect(checkMastermindSeats(seats, { holders: ['b', 'c'], observers: [], history: [] }).map(p => p.rule)).toContain('owner-without-canvas');
  });
});
