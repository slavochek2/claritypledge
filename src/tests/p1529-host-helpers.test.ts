/**
 * P1529 host screen: the pure parts. Every rule the plan or a swap can break has a sentence with names; the check of a
 * given seating; the silent-table rule; the server's seat refusal; the no-split minutes add up.
 */
import { describe, expect, it } from 'vitest';
import {
  MASTERMIND_MINUTES,
  canvasLine,
  describeProblem,
  flowRefusedLine,
  isObserver,
  observerRefusal,
  seatGuardRefusal,
  silentTables,
  SILENT_TABLE_GRACE_MS,
} from '@/app/prototypes/events/rounds/mastermind-host-helpers';
import { checkMastermindSeats } from '@/lib/mastermind-seating-check';
import { roundClock, roundTiming } from '@/lib/round-clock';
import type { Seat } from '@/lib/round-grouping';
import type { MastermindPerson } from '@/app/data/event-mastermind-service';
import type { SeatingProblem } from '@/lib/mastermind-seating-check';

const name = (id: string) => `Name-${id}`;
const seat = (id: string, table: number, role: Seat['role']): Seat => ({ id, table, role });
const holders = (n: number) => Array.from({ length: n }, (_, i) => `h${i + 1}`);

describe('describeProblem names every rule with the people involved', () => {
  const all: SeatingProblem[] = [
    { rule: 'repeat-partner', people: ['x', 'y'] },
    { rule: 'owns-once', person: 'x', part: 'first' },
    { rule: 'owns-once', person: 'x', part: 'second' },
    { rule: 'owns-twice', person: 'x', part: 'first' },
    { rule: 'observes-twice', person: 'x' },
    { rule: 'previous-session-partner', people: ['x', 'y'] },
    { rule: 'unseated', person: 'x' },
    { rule: 'owner-without-canvas', person: 'x' },
    { rule: 'too-few-canvases', canvases: 1 },
    { rule: 'too-few-canvases', canvases: 3 },
  ];
  it.each(all.map((p, i) => [i, p] as const))('%i: %j', (_i, p) => {
    const text = describeProblem(p, name);
    if ('people' in p) { expect(text).toContain('Name-x'); expect(text).toContain('Name-y'); }
    else if ('person' in p) expect(text).toContain('Name-x');
    else expect(text).toMatch(/Clarity Canvas/);
  });
  it('says which half of the evening an owner is missing from', () => {
    expect(describeProblem({ rule: 'owns-once', person: 'x', part: 'first' }, name)).toContain('rounds 1-2');
    expect(describeProblem({ rule: 'owns-once', person: 'x', part: 'second' }, name)).toContain('rounds 3-4');
  });
  it('never uses a bare "owner" or "reader"', () => {
    const text = all.map(p => describeProblem(p, name)).join(' ');
    expect(text.replace(/Clarity Canvas owner/g, '')).not.toMatch(/\bowner\b/i);
    expect(text).not.toMatch(/\breader\b/i);
  });
});

describe('checkMastermindSeats: what a given seating of one round breaks', () => {
  const base = { holders: holders(4), observers: ['o1'], history: [] as Seat[][] };
  const good = [seat('h1', 1, 'first'), seat('h2', 1, 'second'), seat('h3', 2, 'first'), seat('h4', 2, 'second'), seat('o1', 1, 'observer')];
  const rules = (seats: Seat[], over: Partial<typeof base & { previousPartners: [string, string][] }> = {}) =>
    checkMastermindSeats(seats, { ...base, ...over }).map(p => p.rule);

  it('a clean seating of four canvases breaks only the too-few-canvases advice', () => {
    expect(rules(good)).toEqual(['too-few-canvases']);
  });
  it('names an owner without a canvas', () => {
    expect(checkMastermindSeats([seat('o1', 1, 'first'), seat('h2', 1, 'second'), seat('h1', 2, 'observer'), seat('h3', 3, 'first'), seat('h4', 3, 'second')], base))
      .toContainEqual({ rule: 'owner-without-canvas', person: 'o1' });
  });
  it('names a partner repeated from a counted round, whichever side owns', () => {
    const history = [[seat('h2', 1, 'first'), seat('h1', 1, 'second')]];
    expect(rules(good, { history })).toContain('repeat-partner');
  });
  it('names a partner from the previous session', () => {
    expect(rules(good, { previousPartners: [['h2', 'h1']] })).toContain('previous-session-partner');
  });
  it('names a canvas holder who observes a second time, not one observing for the first time', () => {
    const seats = [seat('h1', 1, 'first'), seat('h2', 1, 'second'), seat('h3', 1, 'observer'), seat('h4', 2, 'first'), seat('o1', 2, 'second')];
    expect(rules(seats)).not.toContain('observes-twice');
    const history = [[seat('h3', 1, 'observer'), seat('h1', 1, 'first'), seat('h2', 1, 'second')]];
    expect(rules(seats, { history })).toContain('observes-twice');
  });
  it('names anyone with no seat', () => {
    expect(checkMastermindSeats(good.slice(0, 4), base)).toContainEqual({ rule: 'unseated', person: 'o1' });
  });
  it('names an owner who owns again in the same part, and only in rounds 1-4', () => {
    const history = [[seat('h1', 1, 'first'), seat('h2', 1, 'second'), seat('h3', 2, 'first'), seat('h4', 2, 'second')]];
    const round2 = [seat('h1', 1, 'first'), seat('h2', 1, 'second'), seat('h4', 2, 'first'), seat('h3', 2, 'second')];
    expect(checkMastermindSeats(round2, { ...base, history })).toContainEqual({ rule: 'owns-twice', person: 'h1', part: 'first' });
    expect(checkMastermindSeats(round2, { ...base, history: [] }).some(p => p.rule === 'owns-twice')).toBe(false);
    const six = Array.from({ length: 6 }, () => history[0] as Seat[]);
    expect(checkMastermindSeats(round2, { ...base, history: six }).some(p => p.rule === 'owns-twice')).toBe(false);
  });
  it('names who cannot own once in a part when its last round (2 or 4) is seated without them', () => {
    const history = [[seat('h1', 1, 'first'), seat('h2', 1, 'second'), seat('h3', 2, 'first'), seat('h4', 2, 'second')]];
    // Round 2: h1 owns again, so h2 and h4 (who never owned in rounds 1-2, h3 owned) ... h2 and h4 are not owning now.
    const round2 = [seat('h1', 1, 'first'), seat('h2', 1, 'second'), seat('h3', 2, 'first'), seat('h4', 2, 'second')];
    const out = checkMastermindSeats(round2, { ...base, history });
    expect(out.filter(p => p.rule === 'owns-once').map(p => (p as { person: string }).person).sort()).toEqual(['h2', 'h4']);
    // Round 1 cannot say it yet: that is the plan's forward-looking list, not this check's.
    expect(rules(round2.slice(0, 4))).not.toContain('owns-once');
  });
});

describe('the host marks', () => {
  const p = (over: Partial<MastermindPerson>): MastermindPerson => ({
    profileId: 'p', canvasName: null, canvasShared: false, observerOverride: null, participation: null, observerPrep: null, registered: true, phone: null, recordingOn: false, lastWordsAt: null, ...over,
  });
  it('is an observer without a shared canvas or when the host says so', () => {
    expect(isObserver(undefined)).toBe(true);
    expect(isObserver(p({}))).toBe(true);
    expect(isObserver(p({ canvasShared: true }))).toBe(false);
    expect(isObserver(p({ canvasShared: true, observerOverride: true }))).toBe(true);
  });
  it('says what is missing: no canvas, or one chosen but not shared', () => {
    expect(observerRefusal(p({}), 'Eva F.')).toMatch(/Eva F\. has no Clarity Canvas shared/);
    expect(observerRefusal(p({ canvasName: 'plan' }), 'Eva F.')).toMatch(/chose a Clarity Canvas but has not published and shared it/);
    expect(canvasLine(p({ canvasShared: true, canvasName: 'plan' }))).toBe('Clarity Canvas shared: plan');
  });
});

describe('silentTables', () => {
  const seats = [seat('a', 1, 'first'), seat('b', 1, 'second'), seat('c', 2, 'first'), seat('d', 2, 'second')];
  const start = 1_000_000;
  it('flags nothing during the grace after the talk starts', () => {
    expect(silentTables(seats, () => false, start, start + SILENT_TABLE_GRACE_MS - 1)).toEqual([]);
  });
  it('flags every table with nobody\'s words, sorted, after it', () => {
    expect(silentTables(seats, id => id === 'a', start, start + SILENT_TABLE_GRACE_MS)).toEqual([2]);
    expect(silentTables(seats, () => false, start, start + SILENT_TABLE_GRACE_MS)).toEqual([1, 2]);
    expect(silentTables(seats, id => id === 'a' || id === 'd', start, start + SILENT_TABLE_GRACE_MS)).toEqual([]);
  });
});

describe('the server\'s seat refusal', () => {
  it('shows the server\'s message with the person it names in DETAIL', () => {
    const e = { message: 'a Clarity Canvas owner needs a canvas shared with this event', details: 'Eva F.' };
    expect(seatGuardRefusal(e)).toContain('a Clarity Canvas owner needs a canvas shared with this event');
    expect(seatGuardRefusal(e)).toContain('Eva F.');
  });
  it('shows the refusal of a person who is not registered (D24) with their name', () => {
    const e = { message: 'A person who is not registered for this event cannot be seated', details: 'Eva F.' };
    expect(seatGuardRefusal(e)).toContain('not registered for this event');
    expect(seatGuardRefusal(e)).toContain('Eva F.');
  });
  it('is silent for every other refusal, so Clarity Night keeps its own message', () => {
    expect(seatGuardRefusal({ message: 'round 3 is not next (last started: 3)' })).toBeNull();
    expect(seatGuardRefusal(null)).toBeNull();
    expect(seatGuardRefusal(new Error('deadline'))).toBeNull();
  });
});

describe('the mastermind round\'s minutes', () => {
  // host_start_round stores speakerS in BOTH first_s and second_s; a round with no swap adds the two into one talk.
  const row = { seatingS: MASTERMIND_MINUTES.seatingS, firstS: MASTERMIND_MINUTES.speakerS, secondS: MASTERMIND_MINUTES.speakerS, observerS: MASTERMIND_MINUTES.observerS, splitSpeakers: false };
  it('sum to one 22-minute talk and a 24-minute round after the two minutes to find the table', () => {
    const t = roundTiming(row);
    expect(t.split).toBe(false);
    expect(t.secondMs).toBe(0);
    expect(t.firstMs).toBe(22 * 60_000);
    expect(t.firstMs + t.secondMs + t.observerMs).toBe(24 * 60_000);
    expect(t.seatingMs).toBe(2 * 60_000);
  });
  it('run seating, talk, observer feedback, and never a second part', () => {
    const start = new Date(0).toISOString();
    const phaseAt = (min: number) => roundClock(start, min * 60_000, true, roundTiming(row)).phase;
    expect([1, 3, 20, 25, 27].map(phaseAt)).toEqual(['seating', 'first', 'first', 'observer', 'over']);
  });
});

describe('flowRefusedLine', () => {
  it('keeps the server\'s message and only fixes the singular', () => {
    expect(flowRefusedLine('1 registered people have not answered')).toBe('The event flow was not changed: 1 registered person has not answered');
    expect(flowRefusedLine('3 registered people have not answered')).toBe('The event flow was not changed: 3 registered people have not answered');
    expect(flowRefusedLine('only the host can change the event flow')).toBe('The event flow was not changed: only the host can change the event flow');
  });
});
