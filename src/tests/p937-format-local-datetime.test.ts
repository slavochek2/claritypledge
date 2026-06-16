/**
 * P937 — formatLocalDateTime: the shared visitor-local date/time primitive.
 *
 * The webinar anchor is Thu Jun 25 2026 15:30 in Chiang Mai (ICT, UTC+7).
 * The same instant must render in each visitor's OWN timezone — these tests pin
 * the timeZone so the conversion is deterministic on CI (which runs in UTC).
 */
import { describe, it, expect } from 'vitest';
import { formatLocalDateTime } from '@/app/utils/format-time';

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
});
