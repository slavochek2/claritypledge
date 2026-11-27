// P1740: a hike with a short and a long option shows "9 or 14 km", not just the long distance.
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HikeStatsStrip } from '@/app/prototypes/events/hike/HikeSections';
import { parseHikeDetails } from '@/app/prototypes/events/hike/hike-utils';

const base = { distance_km: 14, elevation_gain_m: 563, walk_time_text: '3.5 or 5 h', route_type: 'Loop' };
const text = (details: unknown) => {
  const { container, unmount } = render(<HikeStatsStrip details={details} />);
  const t = container.textContent ?? '';
  unmount();
  return t;
};

describe('P1740: distance options', () => {
  it('shows short and long joined with "or"', () => {
    const t = text({ ...base, distance_options_km: [9, 14] });
    expect(t).toMatch(/9\s*or\s*14\s*km/);
    expect(t).toMatch(/3\.5 or 5\s*h/);
  });

  it('works without distance_km', () => {
    expect(parseHikeDetails({ distance_options_km: [9, 14] })?.distanceOptionsKm).toEqual([9, 14]);
    expect(text({ distance_options_km: [9, 14] })).toMatch(/9\s*or\s*14\s*km/);
  });

  it.each([
    ['absent', undefined],
    ['empty', []],
    ['single', [9]],
    ['three', [6, 9, 14]],
    ['string', ['9', 14]],
    ['negative', [9, -1]],
    ['zero', [0, 14]],
    ['duplicate', [14, 14]],
    ['long first', [14, 9]],
  ])('falls back to distance_km when options are %s', (_label, bad) => {
    const t = text({ ...base, distance_options_km: bad });
    expect(t).toMatch(/14\s*km/);
    expect(t).not.toMatch(/\d\s*or\s*\d+\s*km/);
  });
});
