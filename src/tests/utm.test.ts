/**
 * @file utm.test.ts
 * @description Unit tests for the withUtm channel-attribution helper (P1134)
 */
import { describe, it, expect } from 'vitest';
import { withUtm } from '@/lib/utm';

describe('withUtm', () => {
  it('appends utm_source, utm_medium, utm_campaign to a bare URL', () => {
    const result = withUtm('https://claritypledge.com/cm', {
      source: 'facebook',
      medium: 'community-group',
      campaign: 'chiang-mai-run',
    });
    const u = new URL(result);
    expect(u.searchParams.get('utm_source')).toBe('facebook');
    expect(u.searchParams.get('utm_medium')).toBe('community-group');
    expect(u.searchParams.get('utm_campaign')).toBe('chiang-mai-run');
  });

  it('preserves existing query params on the URL', () => {
    const result = withUtm('https://calendar.google.com/calendar/u/0?cid=abc123', {
      source: 'cm-page',
      medium: 'calendar-subscribe',
      campaign: 'chiang-mai-calendar',
    });
    const u = new URL(result);
    expect(u.searchParams.get('cid')).toBe('abc123');
    expect(u.searchParams.get('utm_source')).toBe('cm-page');
  });

  it('overwrites existing utm params rather than duplicating them', () => {
    const result = withUtm('https://claritypledge.com/cm?utm_source=old', {
      source: 'new',
      medium: 'email',
      campaign: 'test',
    });
    const u = new URL(result);
    expect(u.searchParams.getAll('utm_source')).toEqual(['new']);
  });
});
