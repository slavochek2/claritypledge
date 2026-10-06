import { describe, it, expect } from 'vitest';
import { pickTonightsEvent, dateInZone, tonightsEventHref } from '@/app/hooks/useTonightsEvent';

const BKK = 'Asia/Bangkok';
// 2026-09-29 10:00 in Bangkok
const now = new Date('2026-09-29T03:00:00Z');
const ev = (over: Partial<{ slug: string; title: string; datetime: string; timezone: string; status: string }>) => ({
  slug: 'night-2', title: 'Clarity Night #2', datetime: '2026-09-29T12:00:00Z', timezone: BKK, status: 'upcoming', ...over,
});

describe('P1351 pickTonightsEvent', () => {
  it('returns an event happening later today in its own timezone', () => {
    expect(pickTonightsEvent([ev({})], now)).toMatchObject({ slug: 'night-2', title: 'Clarity Night #2' });
  });

  it('ignores a cancelled event today', () => {
    expect(pickTonightsEvent([ev({ status: 'cancelled' })], now)).toBeNull();
  });

  it('ignores tomorrow in the event timezone even if it is within 24h', () => {
    // 2026-09-30 01:00 Bangkok = 2026-09-29T18:00Z
    expect(pickTonightsEvent([ev({ datetime: '2026-09-29T18:00:00Z' })], now)).toBeNull();
  });

  it('picks the earliest when two are today', () => {
    const r = pickTonightsEvent([ev({ slug: 'late', datetime: '2026-09-29T14:00:00Z' }), ev({ slug: 'early', datetime: '2026-09-29T08:00:00Z' })], now);
    expect(r?.slug).toBe('early');
  });

  it('returns null for no events', () => {
    expect(pickTonightsEvent([], now)).toBeNull();
  });

  it('dateInZone survives a bad timezone', () => {
    expect(dateInZone(now, 'Not/AZone')).toBe('2026-09-29');
  });
});

describe('P1428 tonightsEventHref — the room only while it is the place to be', () => {
  // Starts 2026-09-29 12:00Z, 120 minutes, preparation on (a Clarity Night).
  const night = { slug: 'night-2', title: 'N', datetime: '2026-09-29T12:00:00Z', durationMinutes: 120, preparationEnabled: true };
  const at = (iso: string) => new Date(iso);

  it('opens the room from an hour before the start', () => {
    expect(tonightsEventHref(night, at('2026-09-29T11:00:00Z'))).toBe('/events/night-2/room');
    expect(tonightsEventHref(night, at('2026-09-29T13:00:00Z'))).toBe('/events/night-2/room');
  });

  it('opens the event page earlier in the day', () => {
    expect(tonightsEventHref(night, at('2026-09-29T08:00:00Z'))).toBe('/events/night-2');
  });

  it('opens the event page once the event has ended', () => {
    expect(tonightsEventHref(night, at('2026-09-29T14:30:00Z'))).toBe('/events/night-2');
  });

  it('opens the event page for an event without a room flow (a hike), even mid-event', () => {
    expect(tonightsEventHref({ ...night, preparationEnabled: false }, at('2026-09-29T12:30:00Z'))).toBe('/events/night-2');
  });

  it('pickTonightsEvent carries what the rule needs from the row', () => {
    const r = pickTonightsEvent([{ ...ev({}), duration_minutes: 90, preparation_enabled: true }], now);
    expect(r).toMatchObject({ durationMinutes: 90, preparationEnabled: true, datetime: '2026-09-29T12:00:00Z' });
  });
});
