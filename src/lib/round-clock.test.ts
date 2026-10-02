import { describe, expect, it } from 'vitest';
import { formatClock, roundClock, SEATING_MS, SPEAKER_MS, OBSERVER_MS } from './round-clock';

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
