/**
 * @file getPositionCTACopy.test.ts
 * @description Unit tests for the `getPositionCTACopy` utility function (P456).
 *
 * The function maps a PositionButtonGroup ('agree' | 'disagree' | 'unsure') to
 * the adaptive copy fields used by the story CTA footer:
 *   { symbol, label, ctaText, ariaLabel }
 *
 * These tests are written against the contract defined in the spec's
 * Technical Analysis §Decision 2 and UX Requirements §Copy Variants.
 *
 * NOTE: The function lives in `src/app/prototypes/shared/types.ts`
 * (alongside `getPositionGroup`). Update this import path if it is moved
 * during implementation.
 */

import { describe, it, expect } from 'vitest';

// ─── Type & function under test ───────────────────────────────────────────────
import { getPositionCTACopy, type PositionButtonGroup } from '../app/prototypes/shared/types';
// ─────────────────────────────────────────────────────────────────────────────

describe('getPositionCTACopy — copy variants', () => {
  // ── agree group ─────────────────────────────────────────────────────────────

  describe("group: 'agree'", () => {
    it('returns the checkmark symbol', () => {
      const copy = getPositionCTACopy('agree');
      expect(copy.symbol).toBe('✓');
    });

    it("returns label 'Agree'", () => {
      const copy = getPositionCTACopy('agree');
      expect(copy.label).toBe('Agree');
    });

    it("returns ctaText 'Why do you agree? →'", () => {
      const copy = getPositionCTACopy('agree');
      expect(copy.ctaText).toBe('Why do you agree? →');
    });

    it('returns aria-label that mentions agreement (screen reader)', () => {
      const copy = getPositionCTACopy('agree');
      expect(copy.ariaLabel).toBe('Tell your story about your agreement');
    });
  });

  // ── disagree group ──────────────────────────────────────────────────────────

  describe("group: 'disagree'", () => {
    it('returns the cross symbol', () => {
      const copy = getPositionCTACopy('disagree');
      expect(copy.symbol).toBe('✗');
    });

    it("returns label 'Disagree'", () => {
      const copy = getPositionCTACopy('disagree');
      expect(copy.label).toBe('Disagree');
    });

    it("returns ctaText 'Why do you disagree? →'", () => {
      const copy = getPositionCTACopy('disagree');
      expect(copy.ctaText).toBe('Why do you disagree? →');
    });

    it('returns aria-label that mentions disagreement (screen reader)', () => {
      const copy = getPositionCTACopy('disagree');
      expect(copy.ariaLabel).toBe('Tell your story about your disagreement');
    });
  });

  // ── unsure group ─────────────────────────────────────────────────────────────

  describe("group: 'unsure'", () => {
    it('returns the tilde symbol', () => {
      const copy = getPositionCTACopy('unsure');
      expect(copy.symbol).toBe('~');
    });

    it("returns label 'Unsure'", () => {
      const copy = getPositionCTACopy('unsure');
      expect(copy.label).toBe('Unsure');
    });

    it("returns ctaText 'Why are you unsure? →'", () => {
      const copy = getPositionCTACopy('unsure');
      expect(copy.ctaText).toBe('Why are you unsure? →');
    });

    it('returns aria-label that mentions being unsure (screen reader)', () => {
      const copy = getPositionCTACopy('unsure');
      expect(copy.ariaLabel).toBe('Tell your story about being unsure');
    });
  });

  // ── return shape contract ─────────────────────────────────────────────────

  describe('return shape', () => {
    it('returns an object with all 4 required fields', () => {
      for (const group of ['agree', 'disagree', 'unsure'] as PositionButtonGroup[]) {
        const copy = getPositionCTACopy(group);
        expect(copy).toHaveProperty('symbol');
        expect(copy).toHaveProperty('label');
        expect(copy).toHaveProperty('ctaText');
        expect(copy).toHaveProperty('ariaLabel');
      }
    });

    it('all three variants return non-empty strings for every field', () => {
      for (const group of ['agree', 'disagree', 'unsure'] as PositionButtonGroup[]) {
        const copy = getPositionCTACopy(group);
        expect(copy.symbol.length).toBeGreaterThan(0);
        expect(copy.label.length).toBeGreaterThan(0);
        expect(copy.ctaText.length).toBeGreaterThan(0);
        expect(copy.ariaLabel.length).toBeGreaterThan(0);
      }
    });

    it('all ctaText variants end with the rightwards arrow →', () => {
      for (const group of ['agree', 'disagree', 'unsure'] as PositionButtonGroup[]) {
        const { ctaText } = getPositionCTACopy(group);
        expect(ctaText).toMatch(/→$/);
      }
    });

    it('all three variants have distinct ctaText (not the same copy)', () => {
      const texts = (['agree', 'disagree', 'unsure'] as PositionButtonGroup[])
        .map(g => getPositionCTACopy(g).ctaText);
      const unique = new Set(texts);
      expect(unique.size).toBe(3);
    });

    it('ctaText does not contain the generic "Tell your story" fallback copy', () => {
      // The generic P451 copy should not appear in any P456 adaptive variant
      for (const group of ['agree', 'disagree', 'unsure'] as PositionButtonGroup[]) {
        const { ctaText } = getPositionCTACopy(group);
        expect(ctaText.toLowerCase()).not.toContain('tell your story');
      }
    });

    it('ariaLabel values include enough context to distinguish positions (screen reader)', () => {
      const agreeLabel = getPositionCTACopy('agree').ariaLabel.toLowerCase();
      const disagreeLabel = getPositionCTACopy('disagree').ariaLabel.toLowerCase();
      const unsureLabel = getPositionCTACopy('unsure').ariaLabel.toLowerCase();

      expect(agreeLabel).not.toBe(disagreeLabel);
      expect(agreeLabel).not.toBe(unsureLabel);
      expect(disagreeLabel).not.toBe(unsureLabel);
    });
  });

  // ── footer label line contract ────────────────────────────────────────────
  //
  // The rendered footer line is: "{symbol} {label} · {ctaText}"
  // e.g. "✓ Agree · Why do you agree? →"
  // These tests verify that symbol + label together form the spec's
  // "✓ Agree" / "✗ Disagree" / "~ Unsure" position badge.

  describe('footer label line construction', () => {
    it("agree: '{symbol} {label}' forms '✓ Agree'", () => {
      const { symbol, label } = getPositionCTACopy('agree');
      expect(`${symbol} ${label}`).toBe('✓ Agree');
    });

    it("disagree: '{symbol} {label}' forms '✗ Disagree'", () => {
      const { symbol, label } = getPositionCTACopy('disagree');
      expect(`${symbol} ${label}`).toBe('✗ Disagree');
    });

    it("unsure: '{symbol} {label}' forms '~ Unsure'", () => {
      const { symbol, label } = getPositionCTACopy('unsure');
      expect(`${symbol} ${label}`).toBe('~ Unsure');
    });
  });
});
