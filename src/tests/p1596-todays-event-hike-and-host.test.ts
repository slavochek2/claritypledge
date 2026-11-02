/**
 * P1596 (review): "Today's event" for a registered person opens the room only for an event that runs a room flow.
 * A hike (series recipe: no rounds) stays on the event page, where the time and place are, unless preparation is on.
 * A host who has no RSVP is offered the event too, and the room is where they go.
 */
import { describe, it, expect } from 'vitest';
import { pickHostedEvent, pickTonightsEvent, tonightsEventHref } from '@/app/hooks/useTonightsEvent';

const mid = new Date('2026-11-02T12:30:00Z');
const base = { slug: 'x', title: 'X', datetime: '2026-11-02T12:00:00Z', durationMinutes: 60, preparationEnabled: false, registered: true };

describe('registered, window on', () => {
  it('a Clarity Night (no series, preparation off) opens the room', () => {
    expect(tonightsEventHref({ ...base, seriesSlug: null }, mid)).toBe('/events/x/room');
  });
  it('a hike with preparation off stays on the event page (time and place)', () => {
    expect(tonightsEventHref({ ...base, seriesSlug: 'social-hike' }, mid)).toBe('/events/x');
  });
  it('a hike with preparation on keeps opening the room, as before', () => {
    expect(tonightsEventHref({ ...base, seriesSlug: 'social-hike', preparationEnabled: true }, mid)).toBe('/events/x/room');
  });
});

describe('the host', () => {
  const row = { slug: 'h', title: 'H', datetime: '2026-11-02T12:00:00Z', timezone: 'UTC', status: 'published', duration_minutes: 60, preparation_enabled: false, series_slug: null };
  it('is offered the event they host, marked as someone who can enter', () => {
    const picked = pickHostedEvent([row], mid);
    expect(picked).toMatchObject({ slug: 'h', registered: true, seriesSlug: null });
    expect(tonightsEventHref(picked!, mid)).toBe('/events/h/room');
  });
  it('a hosted hike stays on the event page', () => {
    const picked = pickHostedEvent([{ ...row, series_slug: 'social-hike' }], mid);
    expect(tonightsEventHref(picked!, mid)).toBe('/events/h');
  });
  it('a cancelled or other-day event is not offered', () => {
    expect(pickHostedEvent([{ ...row, status: 'cancelled' }], mid)).toBeNull();
    expect(pickHostedEvent([{ ...row, datetime: '2026-11-05T12:00:00Z' }], mid)).toBeNull();
  });
  it('the series key travels from the row to the pick', () => {
    expect(pickTonightsEvent([{ ...row, series_slug: 'social-hike' }], mid)?.seriesSlug).toBe('social-hike');
  });
});
