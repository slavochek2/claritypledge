/** P1529 UAT 2026-11-13 (b): the pure rules behind the role steps, the two-part timing and seating anyway. */
import { describe, expect, it } from 'vitest';
import { canvasOffer, roleSteps } from '@/app/prototypes/events/rounds/mastermind-round-helpers';
import { screenTimeLeft } from '@/app/prototypes/events/rounds/screen-time-left';
import { roundClock, roundTiming } from '@/lib/round-clock';
import { checkMastermindSeats } from '@/lib/mastermind-seating-check';

describe('roleSteps (every step of my role, always visible; the current part highlighted)', () => {
  const n = { owner: 'Haru', partner: 'Erin' };
  const Q = (what: string) => `\u201CHow well do you think you understand my ${what}, from 0 to 10?\u201D`;
  const texts = (role: 'owner' | 'partner' | 'observer', phase: Parameters<typeof roleSteps>[1], noCanvas = false) => roleSteps(role, phase, n, noCanvas).map(st => st.text);
  const current = (role: 'owner' | 'partner' | 'observer', phase: Parameters<typeof roleSteps>[1], noCanvas = false) => roleSteps(role, phase, n, noCanvas).map(st => st.current);
  it('owner: three steps, the peer named', () => {
    expect(texts('owner', 'first')).toEqual([
      'Open your canvas so you see what Erin sees.',
      `Erin explains your canvas back. Then ask: ${Q('canvas')}`,
      `At 8 or more, Erin challenges your canvas. They ask you: ${Q('challenge')}`,
    ]);
  });
  it('peer: three steps, the owner named', () => {
    expect(texts('partner', 'first')).toEqual([
      'Open Haru\u2019s canvas and go through it point by point. Set your position, especially where you disagree. Out loud is fine.',
      'Explain Haru\u2019s canvas back in your own words. Then answer: how well you think you understand their canvas, from 0 to 10.',
      `At 8 or more, challenge their canvas: explain where and why you disagree with their points. Then ask Haru: ${Q('challenge')}`,
    ]);
  });
  it('observer: three steps, the last is the observer part', () => {
    expect(texts('observer', 'first')).toEqual([
      'Open Haru\u2019s canvas.',
      'Make sure the listener stays in their role: no disagreeing, no own point of view yet. Keep talking time balanced: no more than 1 minute per person. Ring the bell to remind people of their roles and the time.',
      'Observer part: say what they can do better. If you like, say how well you think you understood the canvas, from 0 to 10, and what was unclear.',
    ]);
  });
  it('the same list in both parts; Talk highlights owner/peer steps 1 to 3 and the observer\u2019s 1 and 2', () => {
    for (const role of ['owner', 'partner', 'observer'] as const) expect(texts(role, 'first')).toEqual(texts(role, 'observer'));
    expect(current('owner', 'first')).toEqual([true, true, true]);
    expect(current('partner', 'first')).toEqual([true, true, true]);
    expect(current('observer', 'first')).toEqual([true, true, false]);
  });
  it('Observer part: only the observer\u2019s last step is highlighted; the owner and the peer have none', () => {
    expect(current('observer', 'observer')).toEqual([false, false, true]);
    expect(current('owner', 'observer')).toEqual([false, false, false]);
    expect(current('partner', 'observer')).toEqual([false, false, false]);
  });
  it('a table with no canvas keeps the no-canvas line and the steps that do not name a canvas', () => {
    expect(texts('owner', 'first', true)).toEqual(['No Clarity Canvas yet: talk about your business idea']);
    expect(texts('partner', 'first', true)).toEqual(['Talk it through: no canvas']);
    const obs = texts('observer', 'first', true);
    expect(obs[0]).toBe('Talk it through: no canvas');
    expect(obs.join(' ')).not.toMatch(/Open Haru/);
    expect(obs.some(t => /^Make sure the listener/.test(t))).toBe(true);
  });
  it('no canvas: the observer keeps their Observer-part step, about the idea, highlighted in the Observer part', () => {
    const last = 'Observer part: say what they can do better. If you like, say how well you think you understood the idea, from 0 to 10, and what was unclear.';
    expect(texts('observer', 'observer', true).at(-1)).toBe(last);
    expect(current('observer', 'observer', true)).toEqual([false, false, true]);
    expect(current('observer', 'first', true)).toEqual([true, true, false]);
  });
  it('never uses an em dash', () => {
    for (const role of ['owner', 'partner', 'observer'] as const) for (const ph of ['first', 'observer'] as const) expect(texts(role, ph).join(' ')).not.toMatch(/\u2014/);
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

describe('the projector\'s time left in a two-part mastermind round', () => {
  const timing = roundTiming({ seatingS: 0, readingS: 0, firstS: 450, secondS: 450, splitSpeakers: false, observerS: 180 });
  const at = (s: number) => roundClock('2026-11-11T10:00:00Z', new Date('2026-11-11T10:00:00Z').getTime() + s * 1000, true, timing);
  it('Talk names the observer as the next real part, with no seating or reading wording', () => {
    const talk = screenTimeLeft(at(30), timing, true);
    expect(at(30).phase).toBe('first');
    expect(talk?.left).toBe('14:30 left');
    expect(talk?.next).toBe('then 3 min observer');
  });
  it('Observer ends the round', () => {
    expect(screenTimeLeft(at(15 * 60 + 40), timing, true)?.next).toBe('then the round ends');
  });
  it('a round that still has a reading part keeps naming it (rounds saved earlier)', () => {
    const old = roundTiming({ seatingS: 120, readingS: 180, firstS: 450, secondS: 450, splitSpeakers: false, observerS: 180 });
    const clock = roundClock('2026-11-11T10:00:00Z', new Date('2026-11-11T10:00:00Z').getTime() + 30_000, true, old);
    expect(screenTimeLeft(clock, old, true)?.next).toBe('then 3 min reading');
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
