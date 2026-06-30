/**
 * @file calibration-verdict-labels.test.ts
 * @description Characterization tests for the calibration VERDICT LABEL logic —
 * the product's core user-facing output ("overconfident" ↔ "underconfident").
 *
 * These functions had ZERO unit coverage despite being the literal verdict every
 * user reads. They are pure and deterministic, so a silent threshold/sign change
 * was previously invisible. This file pins every threshold boundary so any future
 * edit must be deliberate.
 *
 * CRITICAL — two OPPOSITE sign conventions live in the codebase:
 *
 *   getCalibrationLabel (profile card / /live results)
 *     gap = actual − self  →  NEGATIVE = overconfident   (scale ≈ ±3, thresholds 0.5/1/2)
 *
 *   verdictBarLabel (listening-calibration breakdown footer)
 *     gap = self − actual  →  POSITIVE = overconfident    (scale ≈ ±7, thresholds 1/3/5)
 *
 * They are NOT interchangeable and must never be fed each other's gap. The
 * "Sign-convention divergence" block below locks this in: if a refactor ever makes
 * the two agree for the same numeric input, that test breaks loudly and forces a
 * conscious decision about a single source of truth (a [FOUNDER DECISION], not a
 * silent normalization).
 */

import { describe, it, expect } from 'vitest';
import {
  getCalibrationLabel,
  getCalibrationTooltip,
  gapToPosition,
} from '@/app/components/profile/calibration-display';
import {
  verdictBarLabel,
  verdictBarMeaning,
} from '@/app/pages/calibration-breakdown-page';

describe('getCalibrationLabel — gap = actual − self (negative = overconfident, ±~3 scale)', () => {
  // Asymmetric operators: `<` on the overconfident side, `<=` on the underconfident side.
  const cases: [number, string][] = [
    [-2.01, 'Very overconfident'],
    [-2.0, 'Overconfident'], // boundary: −2 < −2 is false → falls through
    [-1.5, 'Overconfident'],
    [-1.0, 'Somewhat overconfident'], // −1 < −1 false → falls through
    [-0.75, 'Somewhat overconfident'],
    [-0.5, 'Well calibrated'], // −0.5 < −0.5 false → −0.5 <= 0.5 true
    [0, 'Well calibrated'],
    [0.5, 'Well calibrated'], // 0.5 <= 0.5 true
    [0.5001, 'Somewhat underconfident'],
    [1.0, 'Somewhat underconfident'], // 1 <= 1 true
    [1.5, 'Underconfident'],
    [2.0, 'Underconfident'], // 2 <= 2 true
    [2.01, 'Very underconfident'],
  ];
  it.each(cases)('gap=%s → %s', (gap, label) => {
    expect(getCalibrationLabel(gap)).toBe(label);
  });
});

describe('getCalibrationTooltip — same sign convention and boundaries as getCalibrationLabel', () => {
  const cases: [number, string][] = [
    [-2.01, 'Confidence much higher than verified understanding.'],
    [-2.0, 'Confidence higher than verified understanding.'],
    [-1.0, 'Confidence slightly higher than verified understanding.'],
    [-0.5, 'Confidence matches verified understanding.'],
    [0, 'Confidence matches verified understanding.'],
    [0.5, 'Confidence matches verified understanding.'],
    [1.0, 'Confidence slightly lower than verified understanding.'],
    [2.0, 'Confidence lower than verified understanding.'],
    [2.01, 'Confidence much lower than verified understanding.'],
  ];
  it.each(cases)('gap=%s → tooltip', (gap, text) => {
    expect(getCalibrationTooltip(gap)).toBe(text);
  });
});

describe('verdictBarLabel — gap = self − actual (positive = overconfident, ±~7 scale)', () => {
  const cases: [number, string][] = [
    [5, 'Very overconfident'],
    [4.99, 'Overconfident'],
    [3, 'Overconfident'],
    [2.99, 'Somewhat overconfident'],
    [1, 'Somewhat overconfident'],
    [0.99, 'Well calibrated'],
    [0, 'Well calibrated'],
    [-0.99, 'Well calibrated'],
    [-1, 'Somewhat underconfident'], // −1 > −1 false → falls through
    [-2.99, 'Somewhat underconfident'],
    [-3, 'Underconfident'], // −3 > −3 false → falls through
    [-4.99, 'Underconfident'],
    [-5, 'Very underconfident'], // −5 > −5 false → falls through
    [-6, 'Very underconfident'],
  ];
  it.each(cases)('gap=%s → %s', (gap, label) => {
    expect(verdictBarLabel(gap)).toBe(label);
  });
});

describe('verdictBarMeaning — directional sentence (positive = rated self higher)', () => {
  it('gap >= 1 → rated higher', () => {
    expect(verdictBarMeaning(1)).toMatch(/higher than your partners/);
  });
  it('gap <= -1 → rated lower', () => {
    expect(verdictBarMeaning(-1)).toMatch(/lower than your partners/);
  });
  it('between → matches closely', () => {
    expect(verdictBarMeaning(0)).toMatch(/match your partners/);
  });
});

describe('gapToPosition — clamp ±3, map to 0–100% (gap = actual − self; left = underconfident)', () => {
  const cases: [number, number][] = [
    [0, 50],
    [3, 0], // fully underconfident edge → leftmost (0%)
    [-3, 100], // fully overconfident edge → rightmost (100%)
    [3.5, 0], // clamped to 3
    [-3.5, 100], // clamped to −3
    [1.5, 25],
    [-0.75, 62.5],
  ];
  it.each(cases)('gap=%s → %s%', (gap, pct) => {
    expect(gapToPosition(gap)).toBeCloseTo(pct, 5);
  });
});

describe('Sign-convention divergence — locks the two label functions to OPPOSITE conventions', () => {
  // Same numeric input, opposite verdict — by design. The profile card reads
  // gap = actual − self (positive = underconfident); the breakdown footer reads
  // gap = self − actual (positive = overconfident). If these ever AGREE for the
  // same input, someone unified the conventions without updating call sites —
  // a [FOUNDER DECISION], not a silent change. Fail loudly so it gets noticed.
  it('+2 means underconfident on the profile card but overconfident on the breakdown footer', () => {
    expect(getCalibrationLabel(2)).toBe('Underconfident');
    expect(verdictBarLabel(2)).toBe('Somewhat overconfident');
    expect(getCalibrationLabel(2)).not.toBe(verdictBarLabel(2));
  });
  it('−2 means overconfident on the profile card but underconfident on the breakdown footer', () => {
    expect(getCalibrationLabel(-2)).toBe('Overconfident');
    expect(verdictBarLabel(-2)).toBe('Somewhat underconfident');
    expect(getCalibrationLabel(-2)).not.toBe(verdictBarLabel(-2));
  });
});
