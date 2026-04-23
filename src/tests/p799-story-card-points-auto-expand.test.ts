/**
 * @file p799-story-card-points-auto-expand.test.ts
 * @description Canary: LiveStoryCardExpanded's useEffect that resets isExpanded
 * must depend ONLY on story.id — not on defaultExpanded, readOnly, or
 * defaultStoryExpanded. Those extra deps cause points to re-open on phase
 * transitions even when the user has manually collapsed them.
 *
 * FAILS before fix (extra deps present).
 * PASSES after fix (only story.id in the dep array).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC_PATH = resolve(__dirname, '../app/components/partners/live-story-card-expanded.tsx');
const src = readFileSync(SRC_PATH, 'utf-8');

describe('p799: LiveStoryCardExpanded points-expand useEffect must only depend on story.id', () => {
  it('useEffect that calls setIsExpanded does not depend on defaultExpanded', () => {
    // Find the useEffect that calls setIsExpanded and assert its dep array
    // is not [story.id, defaultExpanded, ...] — only [story.id] is acceptable.
    // Regex captures the dep array of the effect that resets expand states.
    const effectMatch = src.match(/setIsExpanded\(defaultExpanded\)[^\]]*\],\s*\[([^\]]+)\]/s);
    if (effectMatch) {
      const depArray = effectMatch[1];
      expect(depArray).not.toMatch(/defaultExpanded/);
      expect(depArray).not.toMatch(/readOnly/);
      expect(depArray).not.toMatch(/defaultStoryExpanded/);
    } else {
      // If the pattern above didn't match, look for the dep array near setIsExpanded
      const depsMatch = src.match(/\[story\.id,\s*defaultExpanded[^\]]*\]/);
      expect(depsMatch).toBeNull(); // dep array must NOT include extra deps
    }
  });

  it('the reset useEffect dep array contains story.id', () => {
    // After fix, the effect should only have [story.id] as dependency
    expect(src).toMatch(/setIsExpanded\(defaultExpanded\)/);
    // The dep array immediately following the effect body must contain story.id
    expect(src).toMatch(/\[story\.id\]/);
  });
});
