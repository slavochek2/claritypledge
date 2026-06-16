/**
 * P937 — formatLocalDateTime: the shared visitor-local date/time primitive.
 *
 * The webinar anchor is Thu Jun 25 2026 15:30 in Chiang Mai (ICT, UTC+7).
 * The same instant must render in each visitor's OWN timezone — these tests pin
 * the timeZone so the conversion is deterministic on CI (which runs in UTC).
 */
import { describe, it, expect } from 'vitest';
import { formatLocalDateTime, getCountdownParts } from '@/app/utils/format-time';

const WEBINAR_ANCHOR = '2026-06-25T15:30:00+07:00'; // 08:30 UTC

describe('formatLocalDateTime', () => {
  it('renders the anchor in Chiang Mai local time (UTC+7)', () => {
    expect(formatLocalDateTime(WEBINAR_ANCHOR, { timeZone: 'Asia/Bangkok' })).toBe(
      'Thursday, June 25 · 3:30 PM',
    );
  });

  it('converts the same instant to Berlin local time (CEST, UTC+2)', () => {
    expect(formatLocalDateTime(WEBINAR_ANCHOR, { timeZone: 'Europe/Berlin' })).toBe(
      'Thursday, June 25 · 10:30 AM',
    );
  });

  it('converts the same instant to US Pacific local time (PDT, UTC-7)', () => {
    expect(formatLocalDateTime(WEBINAR_ANCHOR, { timeZone: 'America/Los_Angeles' })).toBe(
      'Thursday, June 25 · 1:30 AM',
    );
  });

  it('appends the year when showYear is set', () => {
    expect(
      formatLocalDateTime(WEBINAR_ANCHOR, { timeZone: 'Asia/Bangkok', showYear: true }),
    ).toBe('Thursday, June 25, 2026 · 3:30 PM');
  });

  it('accepts a Date instance as well as an ISO string', () => {
    const d = new Date(WEBINAR_ANCHOR);
    expect(formatLocalDateTime(d, { timeZone: 'Asia/Bangkok' })).toBe(
      'Thursday, June 25 · 3:30 PM',
    );
  });

  it('returns empty string for invalid input', () => {
    expect(formatLocalDateTime('not-a-date')).toBe('');
  });

  it('appends the visitor zone label when timeZoneName is set', () => {
    // The label lets a visitor verify which zone the conversion landed in. The exact
    // abbreviation is locale/zone-specific (e.g. "GMT+7" for Bangkok), so assert the
    // base time is intact and a zone token is present, not the precise abbreviation.
    const out = formatLocalDateTime(WEBINAR_ANCHOR, {
      timeZone: 'Asia/Bangkok',
      timeZoneName: 'short',
    });
    expect(out).toContain('Thursday, June 25 · 3:30 PM');
    expect(out).toMatch(/GMT\+7|ICT/);
  });
});

describe('getCountdownParts', () => {
  const DAY = 86_400_000;

  it('breaks a future remaining duration into d/h/m/s', () => {
    const now = 0;
    const target = 2 * DAY + 3 * 3_600_000 + 4 * 60_000 + 5 * 1_000;
    expect(getCountdownParts(target, now)).toEqual({
      expired: false,
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
    });
  });

  it('reports expired (all zeros) when the deadline has passed', () => {
    expect(getCountdownParts(1_000, 5_000)).toEqual({
      expired: true,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
  });

  it('treats the exact deadline instant as expired (no negative numbers)', () => {
    expect(getCountdownParts(1_000, 1_000).expired).toBe(true);
  });
});
