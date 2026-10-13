/**
 * P1476: the in-person event timezone label must show the offset the zone has
 * ON THE EVENT'S DATE, not a fixed standard-time offset.
 */
import { describe, it, expect } from 'vitest';
import { getTimezoneLabel } from '../app/prototypes/events/utils';

describe('P1476 getTimezoneLabel — offset follows the event date', () => {
  it('Los Angeles on 2026-10-11 (daylight time) is UTC-7', () => {
    expect(getTimezoneLabel('America/Los_Angeles', new Date('2026-10-11T18:00:00-07:00')))
      .toBe('UTC-7 Los Angeles');
  });

  it('Los Angeles on 2026-12-01 (standard time) is UTC-8', () => {
    expect(getTimezoneLabel('America/Los_Angeles', new Date('2026-12-01T18:00:00-08:00')))
      .toBe('UTC-8 Los Angeles');
  });

  it('flips exactly at the 2026-03-08 DST transition (02:00 local = 10:00Z)', () => {
    expect(getTimezoneLabel('America/Los_Angeles', new Date('2026-03-08T09:59:00Z')))
      .toBe('UTC-8 Los Angeles');
    expect(getTimezoneLabel('America/Los_Angeles', new Date('2026-03-08T10:00:00Z')))
      .toBe('UTC-7 Los Angeles');
  });

  it('southern hemisphere: Sydney is UTC+11 in December and UTC+10 in July', () => {
    expect(getTimezoneLabel('Australia/Sydney', new Date('2026-12-15T10:00:00+11:00')))
      .toBe('UTC+11 Sydney');
    expect(getTimezoneLabel('Australia/Sydney', new Date('2026-07-15T10:00:00+10:00')))
      .toBe('UTC+10 Sydney');
  });

  it('half-hour zone keeps its minutes: Kolkata is UTC+5:30 Mumbai', () => {
    expect(getTimezoneLabel('Asia/Kolkata', new Date('2026-07-15T10:00:00Z')))
      .toBe('UTC+5:30 Mumbai');
    expect(getTimezoneLabel('Asia/Kolkata', new Date('2026-12-15T10:00:00Z')))
      .toBe('UTC+5:30 Mumbai');
  });

  it('non-DST zone is the same all year: Tokyo is UTC+9', () => {
    expect(getTimezoneLabel('Asia/Tokyo', new Date('2026-07-15T10:00:00Z'))).toBe('UTC+9 Tokyo');
    expect(getTimezoneLabel('Asia/Tokyo', new Date('2026-12-15T10:00:00Z'))).toBe('UTC+9 Tokyo');
  });

  it('a zero offset reads UTC+0, not a bare GMT: London in winter vs summer', () => {
    expect(getTimezoneLabel('Europe/London', new Date('2026-12-15T10:00:00Z'))).toBe('UTC+0 London');
    expect(getTimezoneLabel('Europe/London', new Date('2026-07-15T10:00:00Z'))).toBe('UTC+1 London');
  });

  it('UTC stays plain "UTC"', () => {
    expect(getTimezoneLabel('UTC', new Date('2026-07-15T10:00:00Z'))).toBe('UTC');
  });

  it('an unknown zone returns the IANA string unchanged', () => {
    expect(getTimezoneLabel('Mars/Olympus_Mons', new Date('2026-07-15T10:00:00Z')))
      .toBe('Mars/Olympus_Mons');
    // Valid IANA zone that is not in the table: unchanged fallback too.
    expect(getTimezoneLabel('Europe/Berlin', new Date('2026-07-15T10:00:00Z')))
      .toBe('Europe/Berlin');
  });

  it('an invalid event date does not throw; it falls back to the IANA string', () => {
    expect(getTimezoneLabel('America/Los_Angeles', new Date('not a date')))
      .toBe('America/Los_Angeles');
  });

  it('every listed zone keeps the "UTC±H[:MM] City" format in both halves of the year', () => {
    const zones = [
      'Pacific/Midway', 'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles',
      'America/Denver', 'America/Chicago', 'America/New_York', 'America/Halifax',
      'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Helsinki', 'Europe/Moscow',
      'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Bangkok',
      'Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland',
    ];
    for (const at of [new Date('2026-01-15T12:00:00Z'), new Date('2026-07-15T12:00:00Z')]) {
      for (const zone of zones) {
        expect(getTimezoneLabel(zone, at)).toMatch(/^UTC[+-]\d{1,2}(:\d{2})? \S.*$/);
      }
    }
  });
});
