import { describe, it, expect } from 'vitest';
import { hasNewSenderProgress, newCountForDelivery } from './letter-new-activity';

const base = { status: 'in_progress', read_at: null, sender_seen_at: null, last_progress_at: '2026-10-26T10:00:00Z' };

describe('hasNewSenderProgress', () => {
  it('progress the sender never looked at is new', () => {
    expect(hasNewSenderProgress(base)).toBe(true);
    expect(hasNewSenderProgress({ ...base, status: 'completed' })).toBe(true);
  });

  it('progress later than the sender\'s last look is new; progress up to the look is not', () => {
    expect(hasNewSenderProgress({ ...base, sender_seen_at: '2026-10-26T09:00:00Z' })).toBe(true);
    expect(hasNewSenderProgress({ ...base, sender_seen_at: '2026-10-26T10:00:00Z' })).toBe(false);
    expect(hasNewSenderProgress({ ...base, sender_seen_at: '2026-10-26T11:00:00Z' })).toBe(false);
  });

  it('the recipient opening the letter (read_at) no longer hides their later progress', () => {
    expect(hasNewSenderProgress({ ...base, read_at: '2026-10-26T08:00:00Z' })).toBe(true);
  });

  it('a recipient who has not started has nothing new', () => {
    expect(hasNewSenderProgress({ ...base, status: 'sent' })).toBe(false);
    expect(hasNewSenderProgress({ ...base, status: 'opened' })).toBe(false);
  });

  it('with no progress time at all there is nothing new', () => {
    expect(hasNewSenderProgress({ ...base, last_progress_at: null })).toBe(false);
  });

  it('before the migration (no last_progress_at key) the old read_at rule stands in', () => {
    const { last_progress_at: _omit, ...old } = base;
    expect(hasNewSenderProgress({ ...old })).toBe(true);
    expect(hasNewSenderProgress({ ...old, read_at: '2026-10-26T08:00:00Z' })).toBe(false);
    expect(hasNewSenderProgress({ ...old, status: 'sent' })).toBe(false);
  });
});

describe('newCountForDelivery', () => {
  it('the larger of explain-backs and activity wins', () => {
    expect(newCountForDelivery(2, true)).toBe(2);
    expect(newCountForDelivery(0, true)).toBe(1);
    expect(newCountForDelivery(0, false)).toBe(0);
  });
});
