import { describe, expect, it } from 'vitest';
import { screenLayout } from './round-screen-layout';

// A 1080p projector and a laptop screen.
const HD = { w: 1920, h: 1080 };
const LAPTOP = { w: 1440, h: 900 };

describe('screenLayout', () => {
  it('every table fits on one screen, from 6 people to 40', () => {
    for (const people of [6, 10, 15, 24, 40]) {
      const tables = Math.ceil(people / 3);
      const l = screenLayout(tables, 3, HD.w, HD.h);
      expect(l.cols * l.rows).toBeGreaterThanOrEqual(tables);
    }
  });

  it('a small room reads large; a full room still reads across a room', () => {
    expect(screenLayout(2, 3, HD.w, HD.h).fontPx).toBe(44);
    // 40 people → 13 tables of three: still ≥ 20px type on a 1080p projector.
    expect(screenLayout(14, 3, HD.w, HD.h).fontPx).toBeGreaterThanOrEqual(20);
  });

  it('type shrinks as tables are added, never grows', () => {
    let last = Infinity;
    for (let tables = 1; tables <= 14; tables++) {
      const { fontPx } = screenLayout(tables, 3, LAPTOP.w, LAPTOP.h);
      expect(fontPx).toBeLessThanOrEqual(last);
      last = fontPx;
    }
  });

  it('a table with two observers is taller, so its type is no larger', () => {
    expect(screenLayout(5, 4, HD.w, HD.h).fontPx).toBeLessThanOrEqual(screenLayout(5, 3, HD.w, HD.h).fontPx);
  });
});
