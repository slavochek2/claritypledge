import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMING, formatClock, liveRole, roundClock, roundTiming, SEATING_MS, SPEAKER_MS, OBSERVER_MS } from './round-clock';

const START = '2026-10-06T11:30:00.000Z';
const at = (ms: number) => new Date(START).getTime() + ms;

describe('roundClock', () => {
  it('starts with 60 seconds to find tables', () => {
    const c = roundClock(START, at(10_000), true);
    expect(c.phase).toBe('seating');
    expect(c.phaseRemainingMs).toBe(50_000);
    expect(c.talkRemainingMs).toBe(2 * SPEAKER_MS + OBSERVER_MS);
  });

  it('runs first, second, observer in order', () => {
    expect(roundClock(START, at(SEATING_MS + 1), true).phase).toBe('first');
    expect(roundClock(START, at(SEATING_MS + SPEAKER_MS + 1), true).phase).toBe('second');
    expect(roundClock(START, at(SEATING_MS + 2 * SPEAKER_MS + 1), true).phase).toBe('observer');
  });

  it('keeps counting past the end', () => {
    const c = roundClock(START, at(SEATING_MS + 2 * SPEAKER_MS + OBSERVER_MS + 150_000), true);
    expect(c.phase).toBe('over');
    expect(c.overByMs).toBe(150_000);
    expect(formatClock(c.overByMs)).toBe('2:30');
  });

  it('has no observer part in a round of pairs', () => {
    const c = roundClock(START, at(SEATING_MS + 2 * SPEAKER_MS + 1000), false);
    expect(c.phase).toBe('over');
    expect(c.overByMs).toBe(1000);
  });

  it('formats without a 0:00 while live', () => {
    expect(formatClock(400)).toBe('0:01');
    expect(formatClock(SPEAKER_MS)).toBe('6:00');
  });
});

describe('liveRole', () => {
  it('starts as speaker and listener, and the pair swap for the second six minutes', () => {
    expect(liveRole('first', 'seating')).toBe('speaker');
    expect(liveRole('second', 'seating')).toBe('listener');
    expect(liveRole('first', 'first')).toBe('speaker');
    expect(liveRole('first', 'second')).toBe('listener');
    expect(liveRole('second', 'second')).toBe('speaker');
    expect(liveRole('observer', 'second')).toBe('observer');
  });
});

describe('round minutes (stored with each round)', () => {
  it('reads a round row\'s seconds, and falls back to 1 / 6 / 6 / 3 for rounds without them', () => {
    expect(roundTiming({ seatingS: 120, firstS: 300, secondS: 300, observerS: 0 })).toEqual({
      seatingMs: 120_000, firstMs: 300_000, secondMs: 300_000, observerMs: 0, split: true,
    });
    expect(roundTiming({})).toEqual(DEFAULT_TIMING);
  });

  it('runs on the round\'s own minutes', () => {
    const timing = roundTiming({ seatingS: 120, firstS: 300, secondS: 300, observerS: 120 });
    expect(roundClock(START, at(119_000), true, timing).phase).toBe('seating');
    const c = roundClock(START, at(120_000 + 300_000 + 5_000), true, timing);
    expect(c.phase).toBe('second');
    expect(c.phaseElapsedMs).toBe(5_000);
  });

  it('"+1 min" on the second speaker never moves the first speaker\'s end back', () => {
    const now = at(SEATING_MS + SPEAKER_MS + 30_000); // 30s into the second speaker
    const before = roundClock(START, now, true, DEFAULT_TIMING);
    const after = roundClock(START, now, true, { ...DEFAULT_TIMING, secondMs: SPEAKER_MS + 60_000 });
    expect(before.phase).toBe('second');
    expect(after.phase).toBe('second');
    expect(after.phaseRemainingMs - before.phaseRemainingMs).toBe(60_000);
    expect(after.talkRemainingMs - before.talkRemainingMs).toBe(60_000);
  });
});

describe('swap at half time turned off', () => {
  const timing = roundTiming({ seatingS: 60, firstS: 360, secondS: 360, observerS: 180, splitSpeakers: false });

  it('runs the two speakers\' time as one twelve-minute part', () => {
    expect(timing).toMatchObject({ firstMs: 720_000, secondMs: 0, split: false });
    expect(roundClock(START, at(SEATING_MS + 7 * 60_000), true, timing).phase).toBe('first');
    expect(roundClock(START, at(SEATING_MS + 12 * 60_000 + 1000), true, timing).phase).toBe('observer');
  });

  it('never reaches the second speaker, so nobody\'s role flips mid-talk', () => {
    for (let m = 0; m < 16; m++) expect(roundClock(START, at(m * 60_000), true, timing).phase).not.toBe('second');
    expect(liveRole('first', 'first')).toBe('speaker');
  });
});
