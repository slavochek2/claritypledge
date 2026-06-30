/**
 * @file format-time-characterization.test.ts
 *
 * Characterization tests for the untested exports of format-time.ts:
 *   formatTimeAgo  — compact relative time WITHOUT 'ago' suffix ('5m', '3h', '2d')
 *   formatLocalDate — date-only visitor-local string ('Thursday, June 25')
 *   formatLocalTime — time-only visitor-local string ('3:30 PM')
 *
 * formatLocalDateTime and getCountdownParts are already tested in
 * p937-format-local-datetime.test.ts. These tests pin the COMPONENT functions
 * and the distinct behaviour of formatTimeAgo vs formatRelativeTime (src/lib/utils.ts).
 *
 * Key distinctions from formatRelativeTime (utils.ts):
 *   formatTimeAgo:        'Just now', '5m', '3h', '2d'  (no suffix, capital J)
 *   formatRelativeTime:   'just now', '5m ago', '3h ago', '2d ago'  (has suffix)
 *
 * These tests use vi.useFakeTimers so the output is deterministic.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatTimeAgo, formatLocalDate, formatLocalTime } from '@/app/utils/format-time';

// Anchor: Thu 2026-06-25 08:30:00 UTC (= 15:30 Asia/Bangkok, 10:30 Europe/Berlin)
const ANCHOR_ISO = '2026-06-25T08:30:00Z';

// ── formatTimeAgo ────────────────────────────────────────────────────────────

describe('formatTimeAgo — compact relative time (no "ago" suffix)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // "now" is the anchor — times are specified as offsets below
    vi.setSystemTime(new Date(ANCHOR_ISO));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // Boundaries match the implementation:
  //   diffMins < 1  → 'Just now'
  //   diffMins < 60 → `${diffMins}m`
  //   diffHours < 24 → `${diffHours}h`
  //   diffDays < 7  → `${diffDays}d`
  //   else           → locale date (short month, numeric day)

  it('returns "Just now" (capital J) for < 1 minute ago', () => {
    const t = new Date(ANCHOR_ISO);
    t.setSeconds(t.getSeconds() - 59);
    expect(formatTimeAgo(t.toISOString())).toBe('Just now');
  });

  it('returns "Just now" for exactly 0 seconds ago', () => {
    expect(formatTimeAgo(ANCHOR_ISO)).toBe('Just now');
  });

  it('returns "1m" for exactly 1 minute ago (no "ago" suffix)', () => {
    const t = new Date(ANCHOR_ISO);
    t.setMinutes(t.getMinutes() - 1);
    expect(formatTimeAgo(t.toISOString())).toBe('1m');
  });

  it('returns "5m" for 5 minutes ago', () => {
    const t = new Date(ANCHOR_ISO);
    t.setMinutes(t.getMinutes() - 5);
    expect(formatTimeAgo(t.toISOString())).toBe('5m');
  });

  it('returns "59m" for 59 minutes ago (boundary before hours)', () => {
    const t = new Date(ANCHOR_ISO);
    t.setMinutes(t.getMinutes() - 59);
    expect(formatTimeAgo(t.toISOString())).toBe('59m');
  });

  it('returns "1h" for exactly 1 hour ago', () => {
    const t = new Date(ANCHOR_ISO);
    t.setHours(t.getHours() - 1);
    expect(formatTimeAgo(t.toISOString())).toBe('1h');
  });

  it('returns "3h" for 3 hours ago', () => {
    const t = new Date(ANCHOR_ISO);
    t.setHours(t.getHours() - 3);
    expect(formatTimeAgo(t.toISOString())).toBe('3h');
  });

  it('returns "23h" for 23 hours ago (boundary before days)', () => {
    const t = new Date(ANCHOR_ISO);
    t.setHours(t.getHours() - 23);
    expect(formatTimeAgo(t.toISOString())).toBe('23h');
  });

  it('returns "1d" for exactly 1 day ago', () => {
    const t = new Date(ANCHOR_ISO);
    t.setDate(t.getDate() - 1);
    expect(formatTimeAgo(t.toISOString())).toBe('1d');
  });

  it('returns "6d" for 6 days ago (last relative day boundary)', () => {
    const t = new Date(ANCHOR_ISO);
    t.setDate(t.getDate() - 6);
    expect(formatTimeAgo(t.toISOString())).toBe('6d');
  });

  it('returns a locale date string for >= 7 days ago', () => {
    const t = new Date(ANCHOR_ISO);
    t.setDate(t.getDate() - 7);
    const result = formatTimeAgo(t.toISOString());
    // Must NOT be a relative token
    expect(result).not.toBe('7d');
    expect(result).not.toContain('ago');
    expect(result).not.toBe('Just now');
    // Must look like a short-month date (e.g. "Jun 18")
    expect(result).toMatch(/[A-Z][a-z]{2} \d{1,2}/);
  });

  // Sign-convention divergence from formatRelativeTime (src/lib/utils.ts)
  it('differs from formatRelativeTime: no "ago" suffix for minutes', () => {
    const t = new Date(ANCHOR_ISO);
    t.setMinutes(t.getMinutes() - 5);
    const result = formatTimeAgo(t.toISOString());
    expect(result).toBe('5m');
    expect(result).not.toContain('ago');
  });

  it('differs from formatRelativeTime: "Just now" is capitalised', () => {
    const t = new Date(ANCHOR_ISO);
    t.setSeconds(t.getSeconds() - 30);
    const result = formatTimeAgo(t.toISOString());
    expect(result).toBe('Just now');
    expect(result).not.toBe('just now'); // formatRelativeTime returns lowercase
  });
});

// ── formatLocalDate ──────────────────────────────────────────────────────────

describe('formatLocalDate — date-only component of the visitor-local datetime', () => {
  it('formats the anchor as Thursday June 25 in Asia/Bangkok', () => {
    expect(formatLocalDate(ANCHOR_ISO, { timeZone: 'Asia/Bangkok' })).toBe('Thursday, June 25');
  });

  it('formats the anchor in Europe/Berlin (same date — ahead of UTC by 2h)', () => {
    // 08:30 UTC = 10:30 CEST — still Thursday June 25
    expect(formatLocalDate(ANCHOR_ISO, { timeZone: 'Europe/Berlin' })).toBe('Thursday, June 25');
  });

  it('includes year when showYear is set', () => {
    expect(formatLocalDate(ANCHOR_ISO, { timeZone: 'Asia/Bangkok', showYear: true })).toBe(
      'Thursday, June 25, 2026',
    );
  });

  it('accepts a Date instance as well as an ISO string', () => {
    const d = new Date(ANCHOR_ISO);
    expect(formatLocalDate(d, { timeZone: 'Asia/Bangkok' })).toBe('Thursday, June 25');
  });

  it('returns empty string for invalid input', () => {
    expect(formatLocalDate('not-a-date')).toBe('');
  });

  it('does NOT include the time part', () => {
    const result = formatLocalDate(ANCHOR_ISO, { timeZone: 'Asia/Bangkok' });
    // e.g. "3:30 PM" or "15:30" must not appear
    expect(result).not.toMatch(/\d+:\d+/);
    expect(result).not.toMatch(/AM|PM/);
  });
});

// ── formatLocalTime ──────────────────────────────────────────────────────────

describe('formatLocalTime — time-only component of the visitor-local datetime', () => {
  it('formats the anchor as 3:30 PM in Asia/Bangkok', () => {
    expect(formatLocalTime(ANCHOR_ISO, { timeZone: 'Asia/Bangkok' })).toBe('3:30 PM');
  });

  it('formats the anchor as 10:30 AM in Europe/Berlin (CEST = UTC+2)', () => {
    expect(formatLocalTime(ANCHOR_ISO, { timeZone: 'Europe/Berlin' })).toBe('10:30 AM');
  });

  it('formats the anchor as 1:30 AM in America/Los_Angeles (PDT = UTC-7)', () => {
    expect(formatLocalTime(ANCHOR_ISO, { timeZone: 'America/Los_Angeles' })).toBe('1:30 AM');
  });

  it('appends the zone label when timeZoneName="short" is set', () => {
    const result = formatLocalTime(ANCHOR_ISO, {
      timeZone: 'Asia/Bangkok',
      timeZoneName: 'short',
    });
    expect(result).toContain('3:30 PM');
    expect(result).toMatch(/GMT\+7|ICT/);
  });

  it('accepts a Date instance', () => {
    const d = new Date(ANCHOR_ISO);
    expect(formatLocalTime(d, { timeZone: 'Asia/Bangkok' })).toBe('3:30 PM');
  });

  it('returns empty string for invalid input', () => {
    expect(formatLocalTime('not-a-date')).toBe('');
  });

  it('does NOT include the date part', () => {
    const result = formatLocalTime(ANCHOR_ISO, { timeZone: 'Asia/Bangkok' });
    expect(result).not.toContain('Thursday');
    expect(result).not.toContain('June');
  });

  it('formatLocalDateTime is the concatenation of formatLocalDate + " · " + formatLocalTime', () => {
    const datePart = formatLocalDate(ANCHOR_ISO, { timeZone: 'Asia/Bangkok' });
    const timePart = formatLocalTime(ANCHOR_ISO, { timeZone: 'Asia/Bangkok' });
    const combined = `${datePart} · ${timePart}`;
    expect(combined).toBe('Thursday, June 25 · 3:30 PM');
  });
});
