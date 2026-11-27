// P1740: a hike with a short and a long option shows "9 or 14 km", not just the long distance.
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HikeStatsStrip } from '@/app/prototypes/events/hike/HikeSections';

const base = { distance_km: 14, elevation_gain_m: 563, walk_time_text: '3.5 or 5 h', route_type: 'Loop' };

describe('P1740: distance options', () => {
  it('shows both options joined with "or"', () => {
    const { container } = render(<HikeStatsStrip details={{ ...base, distance_options_km: [9, 14] }} />);
    expect(container.textContent).toContain('9 or 14km');
    expect(container.textContent).toContain('3.5 or 5h');
  });
  it('falls back to distance_km when options are absent or malformed', () => {
    for (const bad of [undefined, [], [9], ['9', 14], [9, -1]]) {
      const { container, unmount } = render(<HikeStatsStrip details={{ ...base, distance_options_km: bad }} />);
      expect(container.textContent).toContain('14km');
      expect(container.textContent).not.toContain(' or 14');
      unmount();
    }
  });
});
