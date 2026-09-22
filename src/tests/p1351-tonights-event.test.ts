import { describe, it, expect } from 'vitest';
import { pickTonightsEvent, dateInZone } from '@/app/hooks/useTonightsEvent';

const BKK = 'Asia/Bangkok';
// 2026-09-29 10:00 in Bangkok
const now = new Date('2026-09-29T03:00:00Z');
const ev = (over: Partial<{ slug: string; title: string; datetime: string; timezone: string; status: string }>) => ({
  slug: 'night-2', title: 'Clarity Night #2', datetime: '2026-09-29T12:00:00Z', timezone: BKK, status: 'upcoming', ...over,
});

describe('P1351 pickTonightsEvent', () => {
  it('returns an event happening later today in its own timezone', () => {
    expect(pickTonightsEvent([ev({})], now)).toEqual({ slug: 'night-2', title: 'Clarity Night #2' });
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
