/**
 * @file p1534-portrait-real-cost.test.ts
 * @description P1534: a portrait is charged its calls at list price, not its whole worst-case reservation.
 * Before, every portrait cost $0.70 against a $6/day cap (about 8 a day) though a usual one costs ~$0.07.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  IMAGE_PRICE_MAX_USD, MAX_PORTRAIT_GENERATIONS, portraitRunUsd, portraitSettleUsd, reservePortraitUsd,
} from '../../supabase/functions/_shared/mirror-agent';
import { IMAGE_MODEL_FALLBACK, IMAGE_MODEL_PRIMARY } from '../../supabase/functions/_shared/artist-banner-run';

describe('P1534 portrait cost', () => {
  it('a usual portrait (one flash image, one check) costs about seven cents', () => {
    expect(portraitRunUsd([IMAGE_MODEL_PRIMARY], 1)).toBeCloseTo(0.069, 6);
  });

  it('the fallback model is charged its own, higher price', () => {
    expect(portraitRunUsd([IMAGE_MODEL_FALLBACK], 1)).toBeCloseTo(IMAGE_PRICE_MAX_USD + 0.002, 6);
  });

  it('a model with no listed price is charged the maximum (safe side)', () => {
    expect(portraitRunUsd(['some-new-image-model'], 0)).toBe(IMAGE_PRICE_MAX_USD);
  });

  it('the worst case still fits inside the reservation', () => {
    const worst = portraitRunUsd(Array(MAX_PORTRAIT_GENERATIONS * 2).fill(IMAGE_MODEL_FALLBACK), MAX_PORTRAIT_GENERATIONS);
    expect(worst).toBeLessThanOrEqual(reservePortraitUsd());
  });

  it('about 77 usual portraits fit the $6 daily cap (each must first reserve the worst case), not 8', () => {
    // The database admits a run only while its reservation (portrait_max_usd, read from the migration so
    // the two never drift) still fits under the global daily cap, then settles it at its real cost.
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261020213000_p1520_mirror_v2.sql'), 'utf8');
    const reserve = Number(sql.match(/'portrait_max_usd',\s*([\d.]+)/)?.[1]);
    const cap = Number(sql.match(/'global_portrait_daily_usd',\s*([\d.]+)/)?.[1]);
    expect(reserve).toBeGreaterThanOrEqual(reservePortraitUsd());
    const admitted = (charge: number) => {
      let spent = 0;
      let runs = 0;
      while (spent + reserve <= cap + 1e-9) { spent += charge; runs++; }
      return runs;
    };
    expect(admitted(portraitRunUsd([IMAGE_MODEL_PRIMARY], 1))).toBe(77);
    expect(admitted(reserve)).toBe(8);
  });

  it('settles: a run never started releases its reservation', () => {
    expect(portraitSettleUsd(reservePortraitUsd(), false, [], 0)).toBeNull();
  });

  it('settles: a started run whose calls were all refused keeps its whole reservation (bounded by the global cap)', () => {
    expect(portraitSettleUsd(reservePortraitUsd(), true, [], 0)).toBe(reservePortraitUsd());
  });

  it('settles: never above the reservation', () => {
    expect(portraitSettleUsd(0.05, true, [IMAGE_MODEL_PRIMARY], 1)).toBe(0.05);
  });

  it('the function settles every outcome through portraitSettleUsd, with the counted calls', () => {
    const src = readFileSync(resolve(process.cwd(), 'supabase/functions/mirror-portrait/index.ts'), 'utf8');
    expect(src).toContain('portraitSettleUsd(b.reserved_usd ?? reservePortraitUsd(), generations > 0, billed, visionCalls)');
    expect(src.match(/p_actual_usd: cost/g)?.length).toBe(3);
    expect(src).not.toMatch(/generations > 0 \?/);
  });
});
