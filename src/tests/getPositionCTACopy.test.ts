/**
 * @file getPositionCTACopy.test.ts
 * @description Unit tests for the `getPositionCTACopy` utility function.
 *
 * P456: introduced position-aware CTA copy.
 * P487: unified ctaText to "+ Add your story" across all positions.
 *
 * The function maps a PositionButtonGroup ('agree' | 'disagree' | 'unsure') to:
 *   { symbol, label, ctaText, ariaLabel }
 *
 * Symbol and label remain position-specific (for the position indicator prefix).
 * ctaText and ariaLabel are now unified across all positions.
 */

import { describe, it, expect } from 'vitest';

// ─── Type & function under test ───────────────────────────────────────────────
import { getPositionCTACopy } from '../app/utils/position-helpers';
import type { PositionButtonGroup } from '../app/types';
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

    it("returns unified ctaText '+ Add your story'", () => {
      const copy = getPositionCTACopy('agree');
      expect(copy.ctaText).toBe('+ Add your story');
    });

    it('returns generic aria-label for screen readers', () => {
      const copy = getPositionCTACopy('agree');
      expect(copy.ariaLabel).toBe('Add your story for this point');
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

    it("returns unified ctaText '+ Add your story'", () => {
      const copy = getPositionCTACopy('disagree');
      expect(copy.ctaText).toBe('+ Add your story');
    });

    it('returns generic aria-label for screen readers', () => {
      const copy = getPositionCTACopy('disagree');
      expect(copy.ariaLabel).toBe('Add your story for this point');
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

    it("returns unified ctaText '+ Add your story'", () => {
      const copy = getPositionCTACopy('unsure');
      expect(copy.ctaText).toBe('+ Add your story');
    });

    it('returns generic aria-label for screen readers', () => {
      const copy = getPositionCTACopy('unsure');
      expect(copy.ariaLabel).toBe('Add your story for this point');
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

    it('all ctaText variants start with + prefix', () => {
      for (const group of ['agree', 'disagree', 'unsure'] as PositionButtonGroup[]) {
        const { ctaText } = getPositionCTACopy(group);
        expect(ctaText).toMatch(/^\+ /);
      }
    });

    it('P487: all three variants have the same unified ctaText', () => {
      const texts = (['agree', 'disagree', 'unsure'] as PositionButtonGroup[])
        .map(g => getPositionCTACopy(g).ctaText);
      const unique = new Set(texts);
      expect(unique.size).toBe(1);
      expect(texts[0]).toBe('+ Add your story');
    });

    it('symbols remain position-specific (distinct across groups)', () => {
      const symbols = (['agree', 'disagree', 'unsure'] as PositionButtonGroup[])
        .map(g => getPositionCTACopy(g).symbol);
      expect(new Set(symbols).size).toBe(3);
    });

    it('labels remain position-specific (distinct across groups)', () => {
      const labels = (['agree', 'disagree', 'unsure'] as PositionButtonGroup[])
        .map(g => getPositionCTACopy(g).label);
      expect(new Set(labels).size).toBe(3);
    });
  });

  // ── footer label line contract ────────────────────────────────────────────
  //
  // The rendered footer line is: "{symbol} {label} · {ctaText}"
  // e.g. "✓ Agree · + Add your story"

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
