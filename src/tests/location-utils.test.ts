import { describe, it, expect } from 'vitest';
import { classifyLocation, getLocationDisplayLabel } from '@/app/prototypes/events/location-utils';

describe('classifyLocation', () => {
  describe('virtual meeting links', () => {
    it('detects Zoom links', () => {
      const result = classifyLocation('https://zoom.us/j/123456789');
      expect(result.type).toBe('virtual');
      expect(result.href).toBe('https://zoom.us/j/123456789');
    });

    it('detects Google Meet links', () => {
      const result = classifyLocation('https://meet.google.com/abc-defg-hij');
      expect(result.type).toBe('virtual');
      expect(result.href).toBe('https://meet.google.com/abc-defg-hij');
    });

    it('detects Microsoft Teams links', () => {
      const result = classifyLocation('https://teams.microsoft.com/l/meetup-join/123');
      expect(result.type).toBe('virtual');
      expect(result.href).toBe('https://teams.microsoft.com/l/meetup-join/123');
    });

    it('detects Webex links', () => {
      const result = classifyLocation('https://webex.com/meet/someroom');
      expect(result.type).toBe('virtual');
    });

    it('detects Whereby links', () => {
      const result = classifyLocation('https://whereby.com/myroom');
      expect(result.type).toBe('virtual');
    });
  });

  describe('Google Maps URLs', () => {
    it('detects google.com/maps URLs — uses directly, no double-wrap', () => {
      const result = classifyLocation('https://www.google.com/maps/place/Golden+Gate+Bridge');
      expect(result.type).toBe('maps');
      expect(result.href).toBe('https://www.google.com/maps/place/Golden+Gate+Bridge');
    });

    it('detects maps.google.com URLs', () => {
      const result = classifyLocation('https://maps.google.com/?q=37.8,-122.4');
      expect(result.type).toBe('maps');
      expect(result.href).toBe('https://maps.google.com/?q=37.8,-122.4');
    });

    it('detects goo.gl/maps short links', () => {
      const result = classifyLocation('https://goo.gl/maps/abc123def456');
      expect(result.type).toBe('maps');
      expect(result.href).toBe('https://goo.gl/maps/abc123def456');
    });

    it('does NOT double-wrap a Maps URL in another Maps search', () => {
      const result = classifyLocation('https://maps.app.goo.gl/someplace');
      expect(result.href).not.toContain('maps/search');
    });
  });

  describe('plain text addresses', () => {
    it('wraps plain text in a Google Maps PIN, not a route from the viewer', () => {
      // Changed 2026-08-24. This test previously asserted the
      // `/maps/dir/Current+Location/` form, encoding a real defect as the
      // spec: an attendee opening an event saw driving directions from
      // their own sofa rather than where the event is.
      const result = classifyLocation('Golden Gate Park, Main Entrance');
      expect(result.type).toBe('address');
      expect(result.href).toBe('https://www.google.com/maps/search/?api=1&query=Golden%20Gate%20Park%2C%20Main%20Entrance');
      expect(result.href).not.toContain('Current+Location');
    });

    it('never produces a directions URL for any plain-text location', () => {
      for (const raw of ['Golden Gate Park', 'San Francisco, CA', 'Hmong Doi Pui Family Coffee']) {
        expect(classifyLocation(raw).href).not.toContain('/maps/dir/');
      }
    });

    it('handles city names', () => {
      const result = classifyLocation('San Francisco, CA');
      expect(result.type).toBe('address');
      expect(result.href).toContain('maps/search/?api=1&query=');
    });
  });

  describe('form hints', () => {
    it('warns when URL is missing https:// (looks like zoom link)', () => {
      const result = classifyLocation('zoom.us/j/123456789');
      expect(result.hint?.level).toBe('warning');
      expect(result.hint?.text).toMatch(/https:\/\//);
    });

    it('warns when URL is missing https:// (looks like maps link)', () => {
      const result = classifyLocation('maps.google.com/?q=somewhere');
      expect(result.hint?.level).toBe('warning');
    });

    it('warns on malformed protocol', () => {
      const result = classifyLocation('htps://zoom.us/j/123');
      expect(result.hint?.level).toBe('warning');
      expect(result.hint?.text).toMatch(/malformed/i);
    });

    it('info hint for vague text: TBD', () => {
      const result = classifyLocation('TBD');
      expect(result.hint?.level).toBe('info');
    });

    it('info hint for vague text: online', () => {
      const result = classifyLocation('online');
      expect(result.hint?.level).toBe('info');
    });

    it('info hint for vague text: virtual', () => {
      const result = classifyLocation('virtual');
      expect(result.hint?.level).toBe('info');
    });

    it('info hint for vague text: to be announced', () => {
      const result = classifyLocation('to be announced');
      expect(result.hint?.level).toBe('info');
    });

    it('no hint for valid plain address', () => {
      const result = classifyLocation('123 Main St, San Francisco, CA');
      expect(result.hint).toBeUndefined();
    });

    it('no hint for valid https URL', () => {
      const result = classifyLocation('https://zoom.us/j/123456');
      expect(result.hint).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('trims whitespace before classifying', () => {
      const result = classifyLocation('  https://zoom.us/j/123  ');
      expect(result.type).toBe('virtual');
    });

    it('is case-insensitive for vague text detection', () => {
      const result = classifyLocation('TBD');
      expect(result.hint?.level).toBe('info');
    });
  });
});

describe('getLocationDisplayLabel', () => {
  it('maps type → "View on Maps"', () => {
    const c = classifyLocation('https://maps.app.goo.gl/xxx');
    expect(getLocationDisplayLabel(c, 'https://maps.app.goo.gl/xxx')).toBe('View on Maps');
  });

  it('virtual type (valid URL) → "Join online"', () => {
    const c = classifyLocation('https://zoom.us/j/12345');
    expect(getLocationDisplayLabel(c, 'https://zoom.us/j/12345')).toBe('Join online');
  });

  it('virtual type (subdomain Zoom) → "Join online" not raw hostname', () => {
    const c = classifyLocation('https://us02web.zoom.us/j/89012345678');
    expect(getLocationDisplayLabel(c, 'https://us02web.zoom.us/j/89012345678')).toBe('Join online');
  });

  it('virtual type (missing-protocol) → "Join online" and no crash', () => {
    const c = classifyLocation('zoom.us/j/12345');
    expect(getLocationDisplayLabel(c, 'zoom.us/j/12345')).toBe('Join online');
  });

  it('address plain text → returns raw unchanged', () => {
    const c = classifyLocation('1234 Main St, San Francisco');
    expect(getLocationDisplayLabel(c, '1234 Main St, San Francisco')).toBe('1234 Main St, San Francisco');
  });

  it('address arbitrary URL → "View venue"', () => {
    const c = classifyLocation('https://example.com/venue?ref=abc');
    expect(getLocationDisplayLabel(c, 'https://example.com/venue?ref=abc')).toBe('View venue');
  });
});
