/**
 * @file p943-reproduce.test.ts
 *
 * Canary for P943: webinar series seeded with constant UTC → wrong Berlin wall-clock
 * after DST ends (2026-10-25). Winter occurrences render 09:30 Berlin instead of 10:30.
 *
 * The fix creates a DST-aware `wallClockToUTC` in event-seed-utils.ts.
 *
 * Before fix: naive stub uses fixed UTC-2 (CEST) for all dates → winter assertions fail.
 *   They are guarded with `it.fails` so the suite stays GREEN while the bug is open.
 * After fix: `wallClockToUTC` computes per-occurrence DST-aware UTC → inner assertions
 *   PASS → `it.fails` flips RED → remove `.fails` to lock in corrected behavior.
 *   (P835/P895/P927 pattern.)
 */

import { describe, it, expect } from 'vitest';
import { wallClockToUTC } from '../app/utils/event-seed-utils';

describe('P943: DST-aware UTC for webinar series seeding', () => {
  const BERLIN = 'Europe/Berlin';

  // GREEN anchor — summer (CEST=UTC+2): constant 08:30Z is correct
  it('summer (2026-06-26, CEST): 10:30 Berlin → 08:30:00Z', () => {
    expect(wallClockToUTC(BERLIN, 2026, 6, 26, 10, 30)).toBe('2026-06-26T08:30:00.000Z');
  });

  // Winter (CET=UTC+1): 10:30 Berlin → 09:30:00Z
  it('winter (2026-10-29, CET): 10:30 Berlin → 09:30:00Z (not 08:30:00Z)', () => {
    expect(wallClockToUTC(BERLIN, 2026, 10, 29, 10, 30)).toBe('2026-10-29T09:30:00.000Z');
  });

  // DST boundary day: clocks go back at 03:00 on 2026-10-25; 10:30 is already CET
  it('DST boundary day (2026-10-25): 10:30 Berlin → 09:30:00Z', () => {
    expect(wallClockToUTC(BERLIN, 2026, 10, 25, 10, 30)).toBe('2026-10-25T09:30:00.000Z');
  });
});
