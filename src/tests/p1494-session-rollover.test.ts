import { describe, it, expect, vi, beforeEach } from 'vitest';

const track = vi.fn();
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: (...a: unknown[]) => track(...a) } }));

import { decideSessionIdChange, isStaleWrite, isSupersededPoll, mayFollowRolledOver, trackRollover } from '@/lib/session-rollover';

const participantRow = { id: 'new', createdAt: '2026-01-01T00:00:00Z' };
const preJoinRow = { id: 'new', createdAt: null };

describe('P1494 decideSessionIdChange', () => {
  it('same id: nothing to do', () => {
    expect(decideSessionIdChange('a', 'a', { id: 'a', createdAt: 'x' }, 'ABC234', 'ABC234', true, false)).toBe('same');
  });

  it('creator tab, same code, new id: follows', () => {
    expect(decideSessionIdChange('old', 'old', participantRow, 'ABC234', 'ABC234', true, false)).toBe('follow');
  });

  it('guest tab whose code now resolves to another row: seat lost, not silently ignored', () => {
    expect(decideSessionIdChange('old', 'old', preJoinRow, 'ABC234', 'ABC234', false, false)).toBe('seat-lost');
  });

  it('a guest whose own claim opened the new session (participant view) follows it instead of losing the seat', () => {
    expect(decideSessionIdChange('old', 'old', participantRow, 'ABC234', 'ABC234', false, false)).toBe('follow');
  });

  it('creator tab that is leaving or ended never follows', () => {
    expect(decideSessionIdChange('old', 'old', participantRow, 'ABC234', 'ABC234', true, true)).toBe('ignore');
  });

  it('a poll that outlived an exit (tab now holds another code or none) is ignored', () => {
    expect(decideSessionIdChange('old', 'old', participantRow, 'ABC234', 'ZZZ999', true, false)).toBe('ignore');
    expect(decideSessionIdChange('old', 'old', participantRow, 'ABC234', null, true, false)).toBe('ignore');
    expect(decideSessionIdChange(null, null, participantRow, 'ABC234', 'ABC234', true, false)).toBe('ignore');
    expect(decideSessionIdChange('old', 'old', preJoinRow, 'ABC234', 'ZZZ999', false, false)).toBe('ignore');
  });

  it('creator tab that cannot read the new row (pre-join view) does not follow', () => {
    expect(decideSessionIdChange('old', 'old', preJoinRow, 'ABC234', 'ABC234', true, false)).toBe('ignore');
  });
});

describe('P1494 trackRollover', () => {
  beforeEach(() => track.mockClear());

  it('records follow and seat-lost, nothing else', () => {
    trackRollover('follow', 'old', 'new', true);
    trackRollover('seat-lost', 'old', 'new', false);
    trackRollover('same', 'old', 'old', true);
    trackRollover('ignore', 'old', 'new', true);
    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenNthCalledWith(1, 'live_session_rolled_over', expect.objectContaining({ role: 'creator', outcome: 'followed' }));
    expect(track).toHaveBeenNthCalledWith(2, 'live_session_rolled_over', expect.objectContaining({ role: 'guest', outcome: 'seat_lost' }));
  });

  it('never throws when analytics does', () => {
    track.mockImplementationOnce(() => { throw new Error('boom'); });
    expect(() => trackRollover('follow', 'old', 'new', true)).not.toThrow();
  });
});

describe('P1494 isStaleWrite', () => {
  it('a write that began on the session the tab still holds is current', () => {
    expect(isStaleWrite('a', 'a')).toBe(false);
  });

  it('a write that outlived a rollover (the tab holds another session, or none) is stale', () => {
    expect(isStaleWrite('old', 'new')).toBe(true);
    expect(isStaleWrite('old', null)).toBe(true);
  });
});

describe('P1494 a delayed poll answer', () => {
  it('is ignored when the tab held another session when it asked: no following backwards to the finished row', () => {
    // asked while on the old row, answered after the tab followed to 'new': the answer names the old row
    expect(decideSessionIdChange('new', 'old', { id: 'old', createdAt: 'x' }, 'ABC234', 'ABC234', true, false)).toBe('ignore');
    expect(decideSessionIdChange('new', 'old', { id: 'new', createdAt: 'x' }, 'ABC234', 'ABC234', true, false)).toBe('ignore');
  });
});

describe('P1494 isSupersededPoll', () => {
  it('an answer for the session the tab still holds is current', () => {
    expect(isSupersededPoll('a', 'a')).toBe(false);
    expect(isSupersededPoll(null, null)).toBe(false);
  });

  it('an answer that arrives after the tab followed, exited or re-joined is superseded (no following backwards)', () => {
    expect(isSupersededPoll('old', 'new')).toBe(true);
    expect(isSupersededPoll('old', null)).toBe(true);
    expect(isSupersededPoll(null, 'new')).toBe(true);
  });
});

describe('P1494 mayFollowRolledOver (refused-write recovery)', () => {
  it('follows only while the tab holds the session the write began on and is not leaving or ended', () => {
    expect(mayFollowRolledOver('old', 'old', false)).toBe(true);
    expect(mayFollowRolledOver('old', 'new', false)).toBe(false);
    expect(mayFollowRolledOver('old', null, false)).toBe(false);
    expect(mayFollowRolledOver('old', 'old', true)).toBe(false);
  });
});
