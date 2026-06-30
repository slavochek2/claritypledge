/**
 * @file position-helpers-characterization.test.ts
 *
 * Characterization tests for the untested exports of position-helpers.ts:
 *   getPositionGroup   — maps 7 PositionTypes to 3 PositionButtonGroups
 *   adjustPositionCounts — optimistic group-count adjustment on local position change
 *   toSevenPointCounts — normalises a partial Record to a full SevenPointCounts
 *   explainWhyLabel    — "Explain why you agree" etc.
 *   explainPlaceholder — "Why do you agree?" etc.
 *   shouldShowStoryCTA — 'show' | 'hidden' visibility gate
 *
 * getPositionCTACopy is already tested in getPositionCTACopy.test.ts.
 *
 * These tests assert current behaviour. Any change that breaks them must be
 * deliberate and accompanied by a spec update.
 */

import { describe, it, expect } from 'vitest';
import {
  getPositionGroup,
  adjustPositionCounts,
  toSevenPointCounts,
  ZERO_COUNTS,
  explainWhyLabel,
  explainPlaceholder,
  shouldShowStoryCTA,
} from '@/app/utils/position-helpers';
import type { SevenPointCounts } from '@/app/components/shared/PositionButton';

// ── getPositionGroup ─────────────────────────────────────────────────────────

describe('getPositionGroup — maps 7 positions to 3 groups', () => {
  it('strongly_disagree → disagree', () => {
    expect(getPositionGroup('strongly_disagree')).toBe('disagree');
  });
  it('disagree → disagree', () => {
    expect(getPositionGroup('disagree')).toBe('disagree');
  });
  it('somewhat_disagree → disagree', () => {
    expect(getPositionGroup('somewhat_disagree')).toBe('disagree');
  });
  it('unsure → unsure', () => {
    expect(getPositionGroup('unsure')).toBe('unsure');
  });
  it('somewhat_agree → agree', () => {
    expect(getPositionGroup('somewhat_agree')).toBe('agree');
  });
  it('agree → agree', () => {
    expect(getPositionGroup('agree')).toBe('agree');
  });
  it('strongly_agree → agree', () => {
    expect(getPositionGroup('strongly_agree')).toBe('agree');
  });
});

// ── adjustPositionCounts ─────────────────────────────────────────────────────

const BASE: SevenPointCounts = {
  strongly_agree: 0, agree: 3, somewhat_agree: 0,
  unsure: 2,
  somewhat_disagree: 0, disagree: 1, strongly_disagree: 0,
};

describe('adjustPositionCounts — optimistic group-count adjustment', () => {
  it('no-op when server and effective position are both null', () => {
    expect(adjustPositionCounts(BASE, null, null)).toEqual(BASE);
  });

  it('no-op when server and effective position map to the same group', () => {
    // agree → strongly_agree: both map to "agree" group → no count change
    const result = adjustPositionCounts(BASE, 'agree', 'strongly_agree');
    expect(result).toEqual(BASE);
  });

  it('no-op when server and effective are the same position', () => {
    expect(adjustPositionCounts(BASE, 'agree', 'agree')).toEqual(BASE);
  });

  it('fresh position (server=null → effective=agree): increments agree', () => {
    const result = adjustPositionCounts(BASE, null, 'agree');
    expect(result.agree).toBe(4); // 3 + 1
    expect(result.disagree).toBe(1); // unchanged
    expect(result.unsure).toBe(2);   // unchanged
  });

  it('fresh position (server=null → effective=disagree): increments disagree', () => {
    const result = adjustPositionCounts(BASE, null, 'disagree');
    expect(result.disagree).toBe(2); // 1 + 1
    expect(result.agree).toBe(3);    // unchanged
  });

  it('clearing position (server=agree → effective=null): decrements agree', () => {
    const result = adjustPositionCounts(BASE, 'agree', null);
    expect(result.agree).toBe(2); // 3 - 1
    expect(result.disagree).toBe(1);
  });

  it('group switch agree→disagree: agree--, disagree++', () => {
    const result = adjustPositionCounts(BASE, 'agree', 'disagree');
    expect(result.agree).toBe(2);    // 3 - 1
    expect(result.disagree).toBe(2); // 1 + 1
    expect(result.unsure).toBe(2);   // unchanged
  });

  it('group switch disagree→unsure: disagree--, unsure++', () => {
    const result = adjustPositionCounts(BASE, 'disagree', 'unsure');
    expect(result.disagree).toBe(0); // 1 - 1
    expect(result.unsure).toBe(3);   // 2 + 1
  });

  it('decrement is clamped at 0 — count can never go negative', () => {
    const zeroCounts: SevenPointCounts = { ...ZERO_COUNTS };
    // agree count is 0; switching away from agree must not go to -1
    const result = adjustPositionCounts(zeroCounts, 'agree', 'disagree');
    expect(result.agree).toBe(0);    // clamped by Math.max(0, ...)
    expect(result.disagree).toBe(1); // new group incremented
  });

  it('does not modify non-group count fields (strongly_agree etc. are untouched)', () => {
    const withOthers: SevenPointCounts = {
      strongly_agree: 5, agree: 3, somewhat_agree: 7,
      unsure: 2,
      somewhat_disagree: 4, disagree: 1, strongly_disagree: 8,
    };
    const result = adjustPositionCounts(withOthers, 'agree', 'disagree');
    // Only the group totals (agree/disagree/unsure) are touched
    expect(result.strongly_agree).toBe(5);
    expect(result.somewhat_agree).toBe(7);
    expect(result.somewhat_disagree).toBe(4);
    expect(result.strongly_disagree).toBe(8);
    // Group fields change
    expect(result.agree).toBe(2);
    expect(result.disagree).toBe(2);
  });

  it('strongly_disagree is mapped to disagree group for decrement', () => {
    const result = adjustPositionCounts(BASE, 'strongly_disagree', 'agree');
    expect(result.disagree).toBe(0); // 1 - 1
    expect(result.agree).toBe(4);    // 3 + 1
  });
});

// ── toSevenPointCounts ───────────────────────────────────────────────────────

describe('toSevenPointCounts — normalises partial record to full SevenPointCounts', () => {
  it('undefined input → all zeros', () => {
    expect(toSevenPointCounts(undefined)).toEqual(ZERO_COUNTS);
  });

  it('empty object → all zeros', () => {
    expect(toSevenPointCounts({})).toEqual(ZERO_COUNTS);
  });

  it('partial object fills missing keys with 0', () => {
    const result = toSevenPointCounts({ agree: 3, unsure: 1 });
    expect(result.agree).toBe(3);
    expect(result.unsure).toBe(1);
    expect(result.disagree).toBe(0);
    expect(result.strongly_agree).toBe(0);
    expect(result.somewhat_agree).toBe(0);
    expect(result.somewhat_disagree).toBe(0);
    expect(result.strongly_disagree).toBe(0);
  });

  it('full object passes through without modification', () => {
    const full: Record<string, number> = {
      strongly_agree: 1, agree: 2, somewhat_agree: 3,
      unsure: 4,
      somewhat_disagree: 5, disagree: 6, strongly_disagree: 7,
    };
    expect(toSevenPointCounts(full)).toEqual(full);
  });

  it('returns a fresh copy — does not mutate the input', () => {
    const input = { agree: 5 };
    const result = toSevenPointCounts(input);
    result.agree = 99;
    expect(input.agree).toBe(5);
  });
});

// ── explainWhyLabel ──────────────────────────────────────────────────────────

describe('explainWhyLabel — "Explain why you …" for each position', () => {
  it('agree → "Explain why you agree"', () => {
    expect(explainWhyLabel('agree')).toBe('Explain why you agree');
  });
  it('strongly_agree → "Explain why you strongly agree"', () => {
    expect(explainWhyLabel('strongly_agree')).toBe('Explain why you strongly agree');
  });
  it('somewhat_agree → "Explain why you somewhat agree"', () => {
    expect(explainWhyLabel('somewhat_agree')).toBe('Explain why you somewhat agree');
  });
  it('unsure → special case "Explain why you\'re unsure"', () => {
    expect(explainWhyLabel('unsure')).toBe("Explain why you're unsure");
  });
  it('somewhat_disagree → "Explain why you somewhat disagree"', () => {
    expect(explainWhyLabel('somewhat_disagree')).toBe('Explain why you somewhat disagree');
  });
  it('disagree → "Explain why you disagree"', () => {
    expect(explainWhyLabel('disagree')).toBe('Explain why you disagree');
  });
  it('strongly_disagree → "Explain why you strongly disagree"', () => {
    expect(explainWhyLabel('strongly_disagree')).toBe('Explain why you strongly disagree');
  });
  it('label is always lowercase (POSITION_LABELS values are lowercased at runtime)', () => {
    // Pins that position labels from types/index.ts are lowercased before insertion
    const label = explainWhyLabel('agree');
    expect(label).not.toContain('Agree'); // POSITION_LABELS has 'Agree' but output must be lowercase
  });
});

// ── explainPlaceholder ───────────────────────────────────────────────────────

describe('explainPlaceholder — "Why do you …?" for each position', () => {
  it('agree → "Why do you agree?"', () => {
    expect(explainPlaceholder('agree')).toBe('Why do you agree?');
  });
  it('strongly_agree → "Why do you strongly agree?"', () => {
    expect(explainPlaceholder('strongly_agree')).toBe('Why do you strongly agree?');
  });
  it('somewhat_agree → "Why do you somewhat agree?"', () => {
    expect(explainPlaceholder('somewhat_agree')).toBe('Why do you somewhat agree?');
  });
  it('unsure → special case "Why are you unsure?"', () => {
    expect(explainPlaceholder('unsure')).toBe('Why are you unsure?');
  });
  it('somewhat_disagree → "Why do you somewhat disagree?"', () => {
    expect(explainPlaceholder('somewhat_disagree')).toBe('Why do you somewhat disagree?');
  });
  it('disagree → "Why do you disagree?"', () => {
    expect(explainPlaceholder('disagree')).toBe('Why do you disagree?');
  });
  it('strongly_disagree → "Why do you strongly disagree?"', () => {
    expect(explainPlaceholder('strongly_disagree')).toBe('Why do you strongly disagree?');
  });
  it('ends with "?" for every position', () => {
    const positions = ['agree', 'disagree', 'unsure', 'strongly_agree', 'somewhat_disagree'] as const;
    for (const pos of positions) {
      expect(explainPlaceholder(pos)).toMatch(/\?$/);
    }
  });
});

// ── shouldShowStoryCTA ───────────────────────────────────────────────────────

describe('shouldShowStoryCTA — \'show\' | \'hidden\' gate', () => {
  it('isOwnStory=true → hidden regardless of position or story count', () => {
    expect(shouldShowStoryCTA({ userPosition: 'agree', isOwnStory: true, viewerStoryCount: 0 })).toBe('hidden');
    expect(shouldShowStoryCTA({ userPosition: null, isOwnStory: true })).toBe('hidden');
    expect(shouldShowStoryCTA({ userPosition: 'disagree', isOwnStory: true, viewerStoryCount: 5 })).toBe('hidden');
  });

  it('viewer already has a story (viewerStoryCount > 0) → hidden', () => {
    expect(shouldShowStoryCTA({ userPosition: 'agree', isOwnStory: false, viewerStoryCount: 1 })).toBe('hidden');
    expect(shouldShowStoryCTA({ userPosition: null, isOwnStory: false, viewerStoryCount: 99 })).toBe('hidden');
  });

  it('viewerStoryCount = 0 → show (viewer has no story yet)', () => {
    expect(shouldShowStoryCTA({ userPosition: 'agree', isOwnStory: false, viewerStoryCount: 0 })).toBe('show');
  });

  it('viewerStoryCount absent (undefined) → show', () => {
    expect(shouldShowStoryCTA({ userPosition: 'agree', isOwnStory: false })).toBe('show');
    expect(shouldShowStoryCTA({ userPosition: null, isOwnStory: false })).toBe('show');
  });

  it('userPosition is not used in the gate logic (all values produce the same outcome)', () => {
    // P560: position is no longer required for story filing — the gate ignores it
    const base = { isOwnStory: false, viewerStoryCount: 0 };
    expect(shouldShowStoryCTA({ ...base, userPosition: 'agree' })).toBe('show');
    expect(shouldShowStoryCTA({ ...base, userPosition: 'disagree' })).toBe('show');
    expect(shouldShowStoryCTA({ ...base, userPosition: null })).toBe('show');
  });

  it('isOwnStory takes priority over viewerStoryCount=0', () => {
    expect(shouldShowStoryCTA({ userPosition: null, isOwnStory: true, viewerStoryCount: 0 })).toBe('hidden');
  });
});
