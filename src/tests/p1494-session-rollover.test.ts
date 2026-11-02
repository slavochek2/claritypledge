import { describe, it, expect, vi, beforeEach } from 'vitest';

const track = vi.fn();
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: (...a: unknown[]) => track(...a) } }));

import { decideSessionIdChange, trackRollover } from '@/lib/session-rollover';

const participantRow = { id: 'new', createdAt: '2026-01-01T00:00:00Z' };
const preJoinRow = { id: 'new', createdAt: null };

describe('P1494 decideSessionIdChange', () => {
  it('same id: nothing to do', () => {
    expect(decideSessionIdChange('a', { id: 'a', createdAt: 'x' }, 'ABC234', 'ABC234', true, false)).toBe('same');
  });

  it('creator tab, same code, new id: follows', () => {
    expect(decideSessionIdChange('old', participantRow, 'ABC234', 'ABC234', true, false)).toBe('follow');
  });

  it('guest tab whose code now resolves to another row: seat lost, not silently ignored', () => {
    expect(decideSessionIdChange('old', preJoinRow, 'ABC234', 'ABC234', false, false)).toBe('seat-lost');
  });

  it('creator tab that is leaving or ended never follows', () => {
    expect(decideSessionIdChange('old', participantRow, 'ABC234', 'ABC234', true, true)).toBe('ignore');
  });

  it('a poll that outlived an exit (tab now holds another code or none) is ignored', () => {
    expect(decideSessionIdChange('old', participantRow, 'ABC234', 'ZZZ999', true, false)).toBe('ignore');
    expect(decideSessionIdChange('old', participantRow, 'ABC234', null, true, false)).toBe('ignore');
    expect(decideSessionIdChange(null, participantRow, 'ABC234', 'ABC234', true, false)).toBe('ignore');
    expect(decideSessionIdChange('old', preJoinRow, 'ABC234', 'ZZZ999', false, false)).toBe('ignore');
  });

  it('creator tab that cannot read the new row (pre-join view) does not follow', () => {
    expect(decideSessionIdChange('old', preJoinRow, 'ABC234', 'ABC234', true, false)).toBe('ignore');
  });
});

describe('P1494 trackRollover', () => {
  beforeEach(() => track.mockClear());

  it('records follow and seat-lost, nothing else', () => {
    trackRollover('follow', 'old', 'new');
    trackRollover('seat-lost', 'old', 'new');
    trackRollover('same', 'old', 'old');
    trackRollover('ignore', 'old', 'new');
    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenNthCalledWith(1, 'live_session_rolled_over', expect.objectContaining({ role: 'creator', outcome: 'followed' }));
    expect(track).toHaveBeenNthCalledWith(2, 'live_session_rolled_over', expect.objectContaining({ role: 'guest', outcome: 'seat_lost' }));
  });

  it('never throws when analytics does', () => {
    track.mockImplementationOnce(() => { throw new Error('boom'); });
    expect(() => trackRollover('follow', 'old', 'new')).not.toThrow();
  });
});
