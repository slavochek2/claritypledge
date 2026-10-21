/**
 * @file p1534-portrait-real-cost.test.ts
 * @description P1534: a portrait is charged its calls at list price, not its whole worst-case reservation.
 * Before, every portrait cost $0.70 against a $6/day cap (about 8 a day) though a usual one costs ~$0.07.
 */
import { describe, expect, it } from 'vitest';
import {
  IMAGE_PRICE_MAX_USD, MAX_PORTRAIT_GENERATIONS, portraitRunUsd, reservePortraitUsd,
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

  it('about 85 usual portraits fit the $6 daily cap, not 8', () => {
    expect(Math.floor(6 / portraitRunUsd([IMAGE_MODEL_PRIMARY], 1))).toBeGreaterThanOrEqual(80);
    expect(Math.floor(6 / reservePortraitUsd())).toBeLessThan(10);
  });
});
